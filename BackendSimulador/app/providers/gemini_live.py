"""Google Gemini Live por WebSocket con token efímero.

El backend crea un token de un solo uso que deja BLOQUEADA toda la configuración
(modelo, voz, instrucciones de la persona). El navegador se conecta directo al
WebSocket de Google con ese token: no ve la API key, no ve el prompt y no puede
cambiarlo. El audio va directo navegador <-> Google.
"""

import logging
import warnings
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.providers.errors import ProviderError

logger = logging.getLogger(__name__)

# El SDK marca los tokens efímeros como experimentales y lo avisa en cada llamada.
warnings.filterwarnings("ignore", message=".*ephemeral token.*|.*token creation.*")

WS_URL_TEMPLATE = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.{version}.GenerativeService.BidiGenerateContentConstrained"
)
# Ventana para que el navegador abra el WebSocket una vez emitido el token.
CONNECT_WINDOW = timedelta(minutes=1)


@dataclass(frozen=True)
class GeminiLiveToken:
    token: str
    ws_url: str
    expires_at: datetime


class GeminiLiveClient:
    def __init__(self, api_key: str, api_version: str, timeout_seconds: float) -> None:
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(api_version=api_version, timeout=int(timeout_seconds * 1000)),
        )
        self._ws_url = WS_URL_TEMPLATE.format(version=api_version)

    async def create_ephemeral_token(
        self, model: str, config: types.LiveConnectConfig, max_call: timedelta
    ) -> GeminiLiveToken:
        now = datetime.now(timezone.utc)
        expires_at = now + max_call
        try:
            token = await self._client.aio.auth_tokens.create(
                config=types.CreateAuthTokenConfig(
                    uses=1,
                    expire_time=expires_at,
                    new_session_expire_time=now + CONNECT_WINDOW,
                    # Sin lock_additional_fields, TODA la configuración queda bloqueada.
                    live_connect_constraints=types.LiveConnectConstraints(model=model, config=config),
                )
            )
        except genai_errors.APIError as exc:
            logger.warning("Gemini rechazó el token (HTTP %s %s): %s", exc.code, exc.status, exc.message)
            raise _translate_api_error(exc) from exc
        except httpx.HTTPError as exc:
            logger.warning("No se pudo contactar a Gemini: %s", exc)
            raise ProviderError(504, "No se pudo contactar a Gemini. Reintentá en unos segundos.") from exc

        return GeminiLiveToken(token=token.name, ws_url=self._ws_url, expires_at=expires_at)

    async def aclose(self) -> None:
        await self._client.aio.aclose()


def _translate_api_error(exc: genai_errors.APIError) -> ProviderError:
    message = exc.message or ""
    # Google responde 400 (no 401) cuando la API key es inválida.
    if exc.code in (400, 401) and "api key" in message.lower():
        return ProviderError(
            502,
            "Gemini no reconoce la API key. Las keys de Gemini empiezan con 'AQ.' y se crean gratis "
            "en aistudio.google.com/apikey. Revisá GEMINI_API_KEY en el archivo .env.",
        )
    if exc.code == 403:
        return ProviderError(502, "La API key de Gemini no tiene permiso para la Live API (403).")
    if exc.code == 429:
        return ProviderError(503, "Gemini: se alcanzó la cuota o el límite de uso.")
    if exc.code == 400:
        return ProviderError(502, f"Gemini rechazó la configuración de la sesión: {message}")
    return ProviderError(502, f"Error de Gemini (HTTP {exc.code}).")
