"""Configuración de arranque de la sesión de voz, por proveedor."""

from typing import Any

from google.genai import types

from app.scenarios.catalog import Scenario
from app.config import Settings

# OpenAI: el navegador del operador es un cliente no confiable. Solo puede cortar
# la llamada o silenciar su micrófono; no puede alterar las instrucciones de la
# persona desde la consola del navegador.
OPENAI_FRONTEND_ALLOWED_CLIENT_EVENTS = [
    "session.close",
    "session.input_audio.mute",
    "session.input_audio.unmute",
]


def build_openai_session(settings: Settings, scenario: Scenario) -> dict[str, Any]:
    return {
        "model": settings.openai_model,
        "instructions": scenario.instructions,
        "audio": {"output": {"voice": scenario.openai_voice or settings.openai_voice}},
        "client": {
            "data_channel": {
                "allowed_client_events": OPENAI_FRONTEND_ALLOWED_CLIENT_EVENTS,
                "allowed_server_events": "all",
            }
        },
    }


def build_gemini_config(settings: Settings, scenario: Scenario) -> types.LiveConnectConfig:
    # Toda esta configuración queda bloqueada dentro del token efímero.
    return types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=scenario.instructions,
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=scenario.gemini_voice or settings.gemini_voice
                )
            )
        ),
        # Transcripciones de ambos lados, para mostrar y (más adelante) evaluar.
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )


def gemini_client_setup(settings: Settings) -> dict[str, Any]:
    """Primer mensaje que envía el navegador por el WebSocket. Lo demás viene del token."""
    return {"setup": {"model": f"models/{settings.gemini_model}"}}
