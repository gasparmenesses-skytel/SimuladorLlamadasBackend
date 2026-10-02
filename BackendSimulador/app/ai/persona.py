"""Instrucciones del cliente virtual.

MVP: una única persona fija (María) cuyo prompt vive en prompts/maria_fernandez.md.
Se lee en cada sesión para poder ajustar el prompt sin reiniciar el backend.
Más adelante esto se arma a partir de un escenario + knowledge base.
"""

from dataclasses import dataclass
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"


@dataclass(frozen=True)
class Persona:
    name: str
    instructions: str


def load_default_persona() -> Persona:
    instructions = (PROMPTS_DIR / "maria_fernandez.md").read_text(encoding="utf-8")
    return Persona(name="María Fernández", instructions=instructions)
