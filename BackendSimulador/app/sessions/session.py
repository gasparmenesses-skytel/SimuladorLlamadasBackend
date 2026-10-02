from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import TYPE_CHECKING

from app.config import VoiceEngine
from app.scenarios.catalog import Scenario

if TYPE_CHECKING:
    from app.models.reports import CallReport


class SessionStatus(StrEnum):
    CREATED = "created"  # sesión creada, todavía sin conexión de audio
    CONNECTING = "connecting"  # esperando al proveedor (SDP de OpenAI o token de Gemini)
    CONNECTED = "connected"  # el navegador ya puede hablar directo con el proveedor
    ENDED = "ended"
    FAILED = "failed"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class CallSession:
    id: str
    engine: VoiceEngine
    scenario: Scenario
    # Llamadas salientes: el número que marcó el operador (solo informativo).
    dialed_number: str | None = None
    status: SessionStatus = SessionStatus.CREATED
    provider_session_id: str | None = None
    created_at: datetime = field(default_factory=utcnow)
    connected_at: datetime | None = None
    ended_at: datetime | None = None
    error: str | None = None
    report: "CallReport | None" = None
