"""Instrucciones del cliente virtual.

MVP: en cada sesión se elige al azar una persona fija cuyo prompt vive en prompts/<nombre>.md.
Se lee en cada sesión para poder ajustar el prompt sin reiniciar el backend.
Más adelante esto se arma a partir de un escenario + knowledge base.
"""
import random
from dataclasses import dataclass
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"


@dataclass(frozen=True)
class Persona:
    name: str
    instructions: str
    # Voz propia de la persona en cada motor. None: la voz por defecto de la configuración.
    openai_voice: str | None = None
    gemini_voice: str | None = None

prompts = [
    "maria_fernandez.md",
    "juan_perez.md",
    "ana_gomez.md",
    "luis_rodriguez.md",
]

# Voces (OpenAI, Gemini) acordes a la edad, el género y el carácter de cada persona.
VOICES = {
    "maria_fernandez.md": ("marin", "Gacrux"),  # mujer de 54, preocupada
    "juan_perez.md": ("cedar", "Algenib"),  # hombre de 72, grave y pausado
    "ana_gomez.md": ("coral", "Kore"),  # mujer de 34, firme y rápida
    "luis_rodriguez.md": ("verse", "Sadachbia"),  # hombre de 46, animado y bromista
}

def load_default_persona() -> Persona:
    prompt = random.choice(prompts)
    instructions = (PROMPTS_DIR / prompt).read_text(encoding="utf-8")
    openai_voice, gemini_voice = VOICES.get(prompt, (None, None))
    return Persona(
        name=prompt.replace(".md", "").replace("_", " "),
        instructions=instructions,
        openai_voice=openai_voice,
        gemini_voice=gemini_voice,
    )
