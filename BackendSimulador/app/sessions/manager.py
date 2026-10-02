"""Ciclo de vida de las sesiones de llamada.

MVP: registro en memoria, un solo proceso. Si el backend se reinicia se pierde
el registro, pero las llamadas en curso no se cortan porque el audio no pasa
por acá. Con varias instancias, esto pasa a Redis.
"""

import logging
import time
import uuid
from datetime import timedelta

from app.ai.persona import load_default_persona
from app.ai.session_config import build_gemini_config, build_openai_session
from app.config import Settings, VoiceEngine
from app.providers.errors import ProviderError
from app.providers.gemini_live import GeminiLiveClient, GeminiLiveToken
from app.providers.openai_live import OpenAILiveClient
from app.sessions.session import CallSession, SessionStatus, utcnow

logger = logging.getLogger(__name__)


class SessionNotFound(Exception):
    pass


class InvalidSessionState(Exception):
    pass


class EngineUnavailable(Exception):
    pass


class SessionManager:
    def __init__(
        self,
        settings: Settings,
        openai_client: OpenAILiveClient | None,
        gemini_client: GeminiLiveClient | None,
    ) -> None:
        self._settings = settings
        self._openai = openai_client
        self._gemini = gemini_client
        self._sessions: dict[str, CallSession] = {}

    def create(self, engine: VoiceEngine | None = None) -> CallSession:
        engine = engine or self._settings.voice_engine
        if engine not in self._settings.available_engines:
            raise EngineUnavailable(f"El motor '{engine}' no está configurado (falta su API key).")
        session = CallSession(id=f"call_{uuid.uuid4().hex}", engine=engine, persona=load_default_persona())
        self._sessions[session.id] = session
        logger.info("Sesión %s creada (motor: %s, persona: %s)", session.id, engine, session.persona.name)
        return session

    def get(self, session_id: str) -> CallSession:
        try:
            return self._sessions[session_id]
        except KeyError:
            raise SessionNotFound(session_id) from None

    async def connect_openai(self, session_id: str, sdp_offer: str) -> str:
        """Crea la sesión WebRTC en OpenAI con la oferta SDP del navegador y devuelve la respuesta SDP."""
        session = self._begin_connect(session_id, VoiceEngine.OPENAI)
        started = time.perf_counter()
        try:
            webrtc = await self._openai.create_webrtc_session(
                build_openai_session(self._settings, session.persona), sdp_offer
            )
        except ProviderError as exc:
            self._fail(session, exc)
            raise
        self._mark_connected(session, started, webrtc.provider_session_id)
        return webrtc.sdp_answer

    async def connect_gemini(self, session_id: str) -> GeminiLiveToken:
        """Emite un token efímero con la persona bloqueada para que el navegador se conecte a Gemini."""
        session = self._begin_connect(session_id, VoiceEngine.GEMINI)
        started = time.perf_counter()
        try:
            token = await self._gemini.create_ephemeral_token(
                self._settings.gemini_model,
                build_gemini_config(self._settings, session.persona),
                timedelta(minutes=self._settings.max_call_minutes),
            )
        except ProviderError as exc:
            self._fail(session, exc)
            raise
        self._mark_connected(session, started, None)
        return token

    def end(self, session_id: str) -> CallSession:
        session = self.get(session_id)
        if session.status in (SessionStatus.CREATED, SessionStatus.CONNECTING, SessionStatus.CONNECTED):
            session.status = SessionStatus.ENDED
            session.ended_at = utcnow()
            logger.info("Sesión %s finalizada", session.id)
        return session

    def _begin_connect(self, session_id: str, engine: VoiceEngine) -> CallSession:
        session = self.get(session_id)
        if session.engine is not engine:
            raise InvalidSessionState(f"La sesión usa el motor '{session.engine}', no '{engine}'.")
        if session.status is not SessionStatus.CREATED:
            raise InvalidSessionState(f"La sesión está en estado '{session.status}', no se puede conectar.")
        session.status = SessionStatus.CONNECTING
        return session

    def _mark_connected(self, session: CallSession, started: float, provider_session_id: str | None) -> None:
        if session.status is not SessionStatus.CONNECTING:
            # Cortaron mientras esperábamos al proveedor. Sin la respuesta, el
            # navegador nunca se conecta y el proveedor descarta la sesión.
            raise InvalidSessionState("La llamada se cortó mientras se conectaba.")
        session.provider_session_id = provider_session_id
        session.status = SessionStatus.CONNECTED
        session.connected_at = utcnow()
        logger.info(
            "Sesión %s lista en %s en %.0f ms", session.id, session.engine, (time.perf_counter() - started) * 1000
        )

    def _fail(self, session: CallSession, exc: ProviderError) -> None:
        session.status = SessionStatus.FAILED
        session.error = exc.message
        session.ended_at = utcnow()
