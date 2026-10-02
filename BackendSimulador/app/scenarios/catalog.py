"""Catálogo de escenarios de llamada.

Cada escenario es un archivo Markdown en inbound/ (el cliente llama al banco) u
outbound/ (el operador devuelve un caso). Arriba lleva un bloque YAML con los
datos del escenario y debajo el prompt de la persona. Para agregar un cliente
alcanza con agregar un archivo. Se leen en cada llamada, así los cambios se
aplican sin reiniciar el backend.
"""

import logging
import random
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

SCENARIOS_DIR = Path(__file__).parent

# Se agrega al prompt de todas las personas: así el cliente entiende los avisos
# de texto que manda el softphone (atender, poner en espera, retomar).
SYSTEM_NOTICES_RULES = """

# Avisos del sistema

- A veces vas a recibir mensajes entre corchetes que empiezan con "Aviso del sistema". No los dice nadie en la llamada: te cuentan lo que pasa (que atendiste el teléfono, que el operador te puso en espera o que volvió). Actuá en consecuencia y nunca los leas ni los menciones.
- Mientras estás en espera no hablás: escuchás la música de espera. Cuando el operador vuelve, esperá a que te hable; si la espera fue larga, se te nota en el tono.
"""


class Direction(StrEnum):
    INBOUND = "inbound"  # el cliente llama al banco
    OUTBOUND = "outbound"  # el operador llama al cliente para devolver un caso


@dataclass(frozen=True)
class Customer:
    name: str
    age: int
    phone: str


@dataclass(frozen=True)
class CallbackCase:
    """Caso a devolver: lo que el operador ve antes y durante una llamada saliente."""

    number: str
    opened: str
    reason: str
    resolution: str
    guidance: list[str]


@dataclass(frozen=True)
class Scenario:
    id: str
    direction: Direction
    title: str
    difficulty: str
    customer: Customer
    instructions: str
    evaluation_criteria: list[str]
    openai_voice: str | None = None
    gemini_voice: str | None = None
    case: CallbackCase | None = None


class ScenarioNotFound(Exception):
    pass


def load_scenarios(root: Path = SCENARIOS_DIR) -> list[Scenario]:
    scenarios = []
    for direction in Direction:
        for path in sorted((root / direction.value).glob("*.md")):
            try:
                scenarios.append(_parse(path, direction))
            except Exception as exc:  # un archivo roto no debe tirar abajo el resto
                logger.error("Escenario inválido %s: %s", path.name, exc)
    return scenarios


def pick_scenario(direction: Direction, exclude_id: str | None = None) -> Scenario:
    """Elige un escenario al azar, evitando repetir el anterior si hay alternativas."""
    candidates = [s for s in load_scenarios() if s.direction is direction]
    if not candidates:
        raise ScenarioNotFound(f"No hay escenarios de tipo '{direction}'.")
    fresh = [s for s in candidates if s.id != exclude_id]
    return random.choice(fresh or candidates)


def get_scenario(scenario_id: str) -> Scenario:
    for scenario in load_scenarios():
        if scenario.id == scenario_id:
            return scenario
    raise ScenarioNotFound(f"No existe el escenario '{scenario_id}'.")


def _parse(path: Path, direction: Direction) -> Scenario:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError("falta el bloque YAML inicial (--- ... ---)")
    _, front, body = text.split("---", 2)
    meta = yaml.safe_load(front)

    customer = meta["customer"]
    voices = meta.get("voices") or {}
    case = meta.get("case")
    return Scenario(
        id=meta["id"],
        direction=direction,
        title=meta["title"],
        difficulty=meta.get("difficulty", "media"),
        customer=Customer(name=customer["name"], age=int(customer["age"]), phone=str(customer["phone"])),
        instructions=body.strip() + SYSTEM_NOTICES_RULES,
        evaluation_criteria=list(meta.get("evaluation") or []),
        openai_voice=voices.get("openai"),
        gemini_voice=voices.get("gemini"),
        case=CallbackCase(
            number=str(case["number"]),
            opened=str(case["opened"]),
            reason=case["reason"],
            resolution=case["resolution"],
            guidance=list(case.get("guidance") or []),
        )
        if case
        else None,
    )
