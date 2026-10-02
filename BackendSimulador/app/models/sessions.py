"""Schemas de la API REST de sesiones."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.config import VoiceEngine
from app.scenarios.catalog import Direction, Scenario
from app.sessions.session import CallSession, SessionStatus


class SessionCreate(BaseModel):
    # Vacío: se usa el motor por defecto (VOICE_ENGINE).
    engine: VoiceEngine | None = None
    direction: Direction = Direction.INBOUND
    # Llamadas salientes: el número que marcó el operador (cualquiera sirve).
    dialed_number: str | None = Field(default=None, max_length=32)
    # Cliente a llamar (el caso que el operador ya leyó, de GET /api/scenarios/next). Vacío: uno al azar.
    scenario_id: str | None = Field(default=None, max_length=100)


class CustomerPublic(BaseModel):
    name: str
    age: int
    phone: str


class CallbackCasePublic(BaseModel):
    number: str
    opened: str
    reason: str
    resolution: str
    guidance: list[str]


class ScenarioPublic(BaseModel):
    """Lo que el operador puede ver del escenario. Nunca incluye el prompt de la persona."""

    id: str
    direction: Direction
    difficulty: str
    customer: CustomerPublic
    # Entrantes: el motivo se oculta hasta el informe (el operador lo tiene que descubrir).
    title: str | None
    # Salientes: el caso que el operador tiene que devolver.
    case: CallbackCasePublic | None

    @classmethod
    def from_scenario(cls, scenario: Scenario, reveal: bool = False) -> "ScenarioPublic":
        case = scenario.case
        return cls(
            id=scenario.id,
            direction=scenario.direction,
            difficulty=scenario.difficulty,
            customer=CustomerPublic(
                name=scenario.customer.name, age=scenario.customer.age, phone=scenario.customer.phone
            ),
            title=scenario.title if reveal or scenario.direction is Direction.OUTBOUND else None,
            case=CallbackCasePublic(
                number=case.number,
                opened=case.opened,
                reason=case.reason,
                resolution=case.resolution,
                guidance=case.guidance,
            )
            if case
            else None,
        )


class SessionInfo(BaseModel):
    session_id: str
    engine: VoiceEngine
    direction: Direction
    status: SessionStatus
    scenario: ScenarioPublic
    dialed_number: str | None
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
            direction=session.scenario.direction,
            status=session.status,
            scenario=ScenarioPublic.from_scenario(session.scenario),
            dialed_number=session.dialed_number,
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
