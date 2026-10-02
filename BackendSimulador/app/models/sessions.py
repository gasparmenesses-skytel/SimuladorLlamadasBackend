"""Schemas de la API REST de sesiones."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.config import VoiceEngine
from app.sessions.session import CallSession, SessionStatus


class SessionCreate(BaseModel):
    # Vacío: se usa el motor por defecto (VOICE_ENGINE).
    engine: VoiceEngine | None = None


class SessionInfo(BaseModel):
    session_id: str
    engine: VoiceEngine
    status: SessionStatus
    persona: str
    provider_session_id: str | None
    created_at: datetime
    connected_at: datetime | None
    ended_at: datetime | None
    error: str | None

    @classmethod
    def from_session(cls, session: CallSession) -> "SessionInfo":
        return cls(
            session_id=session.id,
            engine=session.engine,
            status=session.status,
            persona=session.persona.name,
            provider_session_id=session.provider_session_id,
            created_at=session.created_at,
            connected_at=session.connected_at,
            ended_at=session.ended_at,
            error=session.error,
        )


class GeminiConnectInfo(BaseModel):
    """Lo que necesita el navegador para conectarse directo al WebSocket de Gemini."""

    ws_url: str
    # Token efímero de un solo uso; va como query param `access_token`.
    token: str
    # Primer mensaje a enviar al abrir el WebSocket.
    setup: dict[str, Any]
    expires_at: datetime
