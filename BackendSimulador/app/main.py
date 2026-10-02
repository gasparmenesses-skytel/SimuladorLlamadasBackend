import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import health, media, scenarios, sessions
from app.config import get_settings
from app.evaluation.evaluator import Evaluator
from app.providers.gemini_live import GeminiLiveClient
from app.providers.openai_live import OpenAILiveClient
from app.sessions.manager import SessionManager

DEV_CLIENT = Path(__file__).resolve().parent.parent / "dev_client" / "index.html"

settings = get_settings()
logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    timeout = settings.provider_timeout_seconds
    openai_client = (
        OpenAILiveClient(settings.openai_api_key.get_secret_value(), timeout) if settings.openai_api_key else None
    )
    gemini_client = (
        GeminiLiveClient(settings.gemini_api_key.get_secret_value(), settings.gemini_api_version, timeout)
        if settings.gemini_api_key
        else None
    )
    evaluator = Evaluator(settings)
    app.state.session_manager = SessionManager(settings, openai_client, gemini_client, evaluator)
    logging.getLogger(__name__).info(
        "Motores disponibles: %s (por defecto: %s)",
        ", ".join(settings.available_engines),
        settings.voice_engine,
    )
    yield
    for client in (openai_client, gemini_client, evaluator):
        if client:
            await client.aclose()


app = FastAPI(title="Backend Simulador de Llamadas", lifespan=lifespan)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
    )

app.include_router(health.router)
app.include_router(sessions.router)
app.include_router(scenarios.router)
app.include_router(media.router)

if media.MEDIA_DIR.is_dir():
    app.mount(media.MEDIA_URL, StaticFiles(directory=media.MEDIA_DIR), name="media")

if settings.enable_dev_client:

    @app.get("/dev", include_in_schema=False)
    def dev_client() -> FileResponse:
        return FileResponse(DEV_CLIENT, headers={"Cache-Control": "no-store"})
