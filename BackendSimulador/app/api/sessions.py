"""API REST de sesiones de llamada.

Flujo:
1. POST /api/sessions                    -> crea la sesión (motor + persona)
2. Conexión, según el motor de la sesión:
   - openai: POST /api/sessions/{id}/connect -> body: oferta SDP; respuesta: SDP de OpenAI (WebRTC)
   - gemini: POST /api/sessions/{id}/token   -> token efímero + URL del WebSocket de Gemini
   A partir de acá el audio va directo navegador <-> proveedor.
3. DELETE /api/sessions/{id}             -> marca la llamada como finalizada
"""

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.ai.session_config import gemini_client_setup
from app.config import Settings, get_settings
from app.models.sessions import GeminiConnectInfo, SessionCreate, SessionInfo
from app.providers.errors import ProviderError
from app.sessions.manager import EngineUnavailable, InvalidSessionState, SessionManager, SessionNotFound

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

MAX_SDP_BYTES = 64 * 1024


def get_manager(request: Request) -> SessionManager:
    return request.app.state.session_manager


@router.post("", status_code=status.HTTP_201_CREATED)
def create_session(body: SessionCreate | None = None, manager: SessionManager = Depends(get_manager)) -> SessionInfo:
    try:
        return SessionInfo.from_session(manager.create(body.engine if body else None))
    except EngineUnavailable as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None


@router.get("/{session_id}")
def get_session(session_id: str, manager: SessionManager = Depends(get_manager)) -> SessionInfo:
    with _translate_errors():
        return SessionInfo.from_session(manager.get(session_id))


@router.post(
    "/{session_id}/connect",
    response_class=Response,
    responses={200: {"content": {"application/sdp": {}}, "description": "Respuesta SDP de OpenAI"}},
)
async def connect_openai(session_id: str, request: Request, manager: SessionManager = Depends(get_manager)) -> Response:
    """Motor openai: intercambio SDP para la conexión WebRTC directa con OpenAI."""
    body = await request.body()
    if len(body) > MAX_SDP_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Oferta SDP demasiado grande.")
    sdp_offer = body.decode("utf-8", errors="replace").strip()
    if not sdp_offer.startswith("v=0"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El body debe ser una oferta SDP (Content-Type: application/sdp).")

    with _translate_errors():
        sdp_answer = await manager.connect_openai(session_id, sdp_offer)
    return Response(content=sdp_answer, media_type="application/sdp")


@router.post("/{session_id}/token")
async def connect_gemini(
    session_id: str,
    manager: SessionManager = Depends(get_manager),
    settings: Settings = Depends(get_settings),
) -> GeminiConnectInfo:
    """Motor gemini: token efímero (persona bloqueada) para el WebSocket directo con Gemini."""
    with _translate_errors():
        token = await manager.connect_gemini(session_id)
    return GeminiConnectInfo(
        ws_url=token.ws_url, token=token.token, setup=gemini_client_setup(settings), expires_at=token.expires_at
    )


@router.delete("/{session_id}")
def end_session(session_id: str, manager: SessionManager = Depends(get_manager)) -> SessionInfo:
    with _translate_errors():
        return SessionInfo.from_session(manager.end(session_id))


@contextmanager
def _translate_errors() -> Iterator[None]:
    """Convierte los errores del dominio en respuestas HTTP."""
    try:
        yield
    except SessionNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesión inexistente.") from None
    except InvalidSessionState as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    except ProviderError as exc:
        raise HTTPException(exc.status_code, exc.message) from None
