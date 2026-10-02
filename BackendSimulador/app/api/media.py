"""Tonos del softphone (llamada entrante y llamada saliente).

Los archivos viven en app/media/InCallRingtone y app/media/OutCallRingtone. Para
cambiar un tono alcanza con reemplazar el archivo de la carpeta: se usa el
primero en orden alfabético.
"""

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
MEDIA_URL = "/media"
TONE_FOLDERS = {"incoming": "InCallRingtone", "outgoing": "OutCallRingtone"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a"}

router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/tones")
def tones() -> dict[str, str | None]:
    """URL de cada tono, o null si la carpeta no tiene audio (el frontend usa un tono sintético)."""
    return {key: _first_audio(folder) for key, folder in TONE_FOLDERS.items()}


def _first_audio(folder: str) -> str | None:
    directory = MEDIA_DIR / folder
    if not directory.is_dir():
        return None
    files = sorted(p for p in directory.iterdir() if p.suffix.lower() in AUDIO_EXTENSIONS)
    return f"{MEDIA_URL}/{folder}/{quote(files[0].name)}" if files else None
