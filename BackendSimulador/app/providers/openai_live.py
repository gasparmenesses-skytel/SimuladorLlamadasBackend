"""OpenAI GPT-Live por WebRTC.

El backend recibe la oferta SDP del navegador, crea la sesión en OpenAI con su
API key y devuelve la respuesta SDP. Después el audio va directo navegador <-> OpenAI.
"""

import logging
from dataclasses import dataclass
from typing import Any

import openai
from openai import AsyncOpenAI

from app.providers.errors import ProviderError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OpenAIWebRTCSession:
    provider_session_id: str
    sdp_answer: str


class OpenAILiveClient:
    def __init__(self, api_key: str, timeout_seconds: float) -> None:
        # Un reintento alcanza: el operador está esperando que la llamada conecte.
        self._client = AsyncOpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=1)

    async def create_webrtc_session(self, session_config: dict[str, Any], sdp_offer: str) -> OpenAIWebRTCSession:
        try:
            response = await self._client.live.create(
                session=session_config,
                transport={"type": "webrtc", "sdp": sdp_offer},
            )
        except openai.APIStatusError as exc:
            logger.warning("OpenAI rechazó la sesión Live (HTTP %s): %s", exc.status_code, exc.message)
            raise _translate_status_error(exc) from exc
        except (openai.APIConnectionError, openai.APITimeoutError) as exc:
            logger.warning("No se pudo contactar a OpenAI: %s", exc)
            raise ProviderError(504, "No se pudo contactar a OpenAI. Reintentá en unos segundos.") from exc

        return OpenAIWebRTCSession(provider_session_id=response.session.id, sdp_answer=response.transport.sdp)

    async def aclose(self) -> None:
        await self._client.close()


def _translate_status_error(exc: openai.APIStatusError) -> ProviderError:
    if exc.status_code == 401:
        return ProviderError(
            502,
            "OpenAI no reconoce la API key (401). Las keys de OpenAI empiezan con 'sk-proj-' y se crean "
            "en platform.openai.com/api-keys. Revisá OPENAI_API_KEY en el archivo .env.",
        )
    if exc.status_code in (403, 404):
        return ProviderError(502, f"El proyecto de la API key no tiene acceso al modelo de voz (HTTP {exc.status_code}).")
    if exc.status_code == 429:
        return ProviderError(503, "OpenAI: se alcanzó el límite de sesiones simultáneas o de uso.")
    if exc.status_code == 400:
        return ProviderError(502, f"OpenAI rechazó la configuración de la sesión: {exc.message}")
    return ProviderError(502, f"Error de OpenAI (HTTP {exc.status_code}).")
