"""Escenarios: el próximo cliente, para mostrarlo antes de llamar."""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.sessions import get_manager
from app.models.sessions import ScenarioPublic
from app.scenarios.catalog import Direction, ScenarioNotFound
from app.sessions.manager import SessionManager

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.get("/next")
def next_scenario(
    response: Response,
    direction: Direction = Direction.OUTBOUND,
    manager: SessionManager = Depends(get_manager),
) -> ScenarioPublic:
    """Elige al azar el próximo cliente (salientes: el caso a devolver), sin repetir el anterior.

    Para llamarlo, se pasa su `id` como `scenario_id` al crear la sesión.
    """
    response.headers["Cache-Control"] = "no-store"
    try:
        return ScenarioPublic.from_scenario(manager.next_scenario(direction))
    except ScenarioNotFound as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None
