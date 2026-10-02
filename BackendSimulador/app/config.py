"""Configuración del backend, leída de variables de entorno (o del archivo .env)."""

from enum import StrEnum
from functools import lru_cache
from typing import Annotated

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class VoiceEngine(StrEnum):
    OPENAI = "openai"  # GPT-Live (full-duplex, WebRTC)
    GEMINI = "gemini"  # Gemini Live (por turnos, WebSocket)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Motor por defecto si la llamada no elige uno. Vacío: el primero que tenga API key.
    voice_engine: VoiceEngine | None = None

    # Las API keys nunca se loguean ni se envían al navegador. Hace falta al menos una.
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-live-1"
    openai_voice: str = "marin"

    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.8-live"
    gemini_voice: str = "Gacrux"
    # Los tokens efímeros de la Live API están en v1alpha.
    gemini_api_version: str = "v1alpha"

    # Timeout (segundos) para crear la sesión en el proveedor.
    provider_timeout_seconds: float = 15.0
    # Duración máxima de una llamada (Gemini: vida del token efímero).
    max_call_minutes: int = 15

    # Sirve el cliente de prueba en /dev. Desactivar en producción.
    enable_dev_client: bool = True
    # Orígenes permitidos para el futuro frontend React, separados por coma.
    cors_origins: Annotated[list[str], NoDecode] = []

    log_level: str = "INFO"

    @field_validator("openai_api_key", "gemini_api_key", "voice_engine", mode="before")
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _resolve_default_engine(self) -> "Settings":
        available = self.available_engines
        if not available:
            raise ValueError("No hay ninguna API key: completá OPENAI_API_KEY y/o GEMINI_API_KEY en el archivo .env")
        if self.voice_engine is None:
            self.voice_engine = available[0]
        elif self.voice_engine not in available:
            raise ValueError(f"VOICE_ENGINE={self.voice_engine} pero falta su API key en el archivo .env")
        return self

    @property
    def available_engines(self) -> list[VoiceEngine]:
        engines = []
        if self.openai_api_key:
            engines.append(VoiceEngine.OPENAI)
        if self.gemini_api_key:
            engines.append(VoiceEngine.GEMINI)
        return engines


@lru_cache
def get_settings() -> Settings:
    return Settings()
