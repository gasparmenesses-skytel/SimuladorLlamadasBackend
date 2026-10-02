from typing import Any

from fastapi import APIRouter, Depends

from app.config import Settings, VoiceEngine, get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    details = {
        VoiceEngine.OPENAI: {"model": settings.openai_model, "voice": settings.openai_voice},
        VoiceEngine.GEMINI: {"model": settings.gemini_model, "voice": settings.gemini_voice},
    }
    return {
        "status": "ok",
        "default_engine": settings.voice_engine,
        "engines": {engine: details[engine] for engine in settings.available_engines},
    }
