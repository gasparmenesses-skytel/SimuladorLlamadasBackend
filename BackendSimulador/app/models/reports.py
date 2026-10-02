"""Schemas del informe de fin de llamada.

`Evaluation` se usa también como esquema de salida estructurada del modelo que
evalúa: las descripciones de los campos le indican qué completar.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.config import VoiceEngine
from app.models.sessions import ScenarioPublic

Speaker = Literal["operador", "cliente"]


class TranscriptLine(BaseModel):
    speaker: Speaker
    text: str = Field(max_length=4000)


class CallMetrics(BaseModel):
    """Tiempos medidos por el softphone, en segundos."""

    ring_seconds: float = Field(ge=0, description="Tiempo sonando hasta que se atendió.")
    total_seconds: float = Field(ge=0, description="Duración de la llamada desde que se atendió.")
    talk_seconds: float = Field(ge=0, description="Tiempo de conversación, sin contar la espera.")
    hold_seconds: float = Field(ge=0, description="Tiempo total en espera.")
    hold_count: int = Field(ge=0, description="Cantidad de veces que se puso al cliente en espera.")


class ReportRequest(BaseModel):
    transcript: list[TranscriptLine] = Field(max_length=600)
    metrics: CallMetrics
    ended_by: Literal["operador", "cliente", "sistema"] = "operador"


class TalkStats(BaseModel):
    operator_words: int
    customer_words: int
    # Proporción de palabras dichas por el operador (0 a 1).
    operator_share: float


class Scores(BaseModel):
    empathy: int = Field(description="Empatía y trato con el cliente, de 0 a 10.")
    clarity: int = Field(description="Claridad de las explicaciones y del lenguaje, de 0 a 10.")
    procedure: int = Field(
        description="Cumplimiento del procedimiento: verificación de identidad y pasos que el caso requería, de 0 a 10."
    )
    security: int = Field(
        description="Seguridad: no pide datos sensibles (PIN, claves, código de seguridad) y protege al cliente, de 0 a 10."
    )
    call_control: int = Field(
        description="Manejo de la llamada: escucha, ritmo, uso de la espera, control de la conversación y cierre, de 0 a 10."
    )


class CriterionResult(BaseModel):
    criterion: str = Field(description="El criterio, copiado tal cual de la lista de criterios.")
    status: Literal["cumplido", "parcial", "no_cumplido"]
    comment: str = Field(description="Por qué, en una frase, citando un momento de la llamada cuando se pueda.")


class Evaluation(BaseModel):
    customer_satisfaction: int = Field(
        description=(
            "Satisfacción estimada del cliente al terminar la llamada, de 1 (muy insatisfecho) a 5 (muy satisfecho), "
            "según sus reacciones y su tono final."
        )
    )
    satisfaction_reason: str = Field(description="Por qué esa satisfacción, en una o dos frases.")
    resolution: Literal["resuelto", "parcial", "no_resuelto"] = Field(
        description="Si el motivo de la llamada quedó resuelto, parcialmente resuelto o sin resolver."
    )
    resolution_reason: str = Field(description="Por qué, en una o dos frases.")
    scores: Scores
    summary: str = Field(description="Resumen de la llamada en dos o tres frases.")
    strengths: list[str] = Field(description="Entre una y cuatro fortalezas concretas del operador.")
    improvements: list[str] = Field(description="Entre una y cuatro mejoras concretas y accionables para el operador.")
    criteria: list[CriterionResult] = Field(description="Un resultado por cada criterio de la lista, en el mismo orden.")


class CallReport(BaseModel):
    session_id: str
    engine: VoiceEngine
    scenario: ScenarioPublic
    dialed_number: str | None
    metrics: CallMetrics
    talk: TalkStats
    ended_by: str
    evaluation: Evaluation | None
    # Si la evaluación con IA falla, el informe igual sale con las métricas.
    evaluation_error: str | None
    created_at: datetime
