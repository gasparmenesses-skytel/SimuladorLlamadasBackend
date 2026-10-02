"""Evaluación de la llamada con un modelo de texto (salida JSON estructurada).

Usa Gemini si hay GEMINI_API_KEY (tiene plan gratuito) y si no, OpenAI.
"""

import logging

import httpx
import openai
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from openai import AsyncOpenAI
from pydantic import ValidationError

from app.config import Settings
from app.models.reports import CallMetrics, Evaluation, TranscriptLine
from app.scenarios.catalog import Direction, Scenario

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Sos un evaluador de calidad de un centro de atención telefónica de un banco. Evaluás llamadas \
de entrenamiento: un operador real habla con un cliente simulado por una IA que sigue un guion. Tu evaluación es \
para que el operador aprenda.

Reglas:
- Evaluá solo lo que pasó en la transcripción. Es automática y puede tener errores de reconocimiento: no \
penalices palabras mal transcriptas.
- Sé justo y concreto: citá momentos de la llamada.
- La satisfacción del cliente se estima por sus reacciones y por su tono al final de la llamada.
- Si la llamada es muy corta o casi no hubo conversación, decilo y puntuá bajo.
- Escribí en español rioplatense, con voseo, dirigiéndote al operador ("te presentaste", "podrías haber...")."""


class EvaluationError(Exception):
    pass


class Evaluator:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._gemini: genai.Client | None = None
        self._openai: AsyncOpenAI | None = None
        timeout = settings.evaluation_timeout_seconds
        if settings.gemini_api_key:
            self._gemini = genai.Client(
                api_key=settings.gemini_api_key.get_secret_value(),
                http_options=types.HttpOptions(timeout=int(timeout * 1000)),
            )
        elif settings.openai_api_key:
            self._openai = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=timeout, max_retries=1)

    async def evaluate(
        self, scenario: Scenario, transcript: list[TranscriptLine], metrics: CallMetrics
    ) -> Evaluation:
        prompt = build_prompt(scenario, transcript, metrics)
        try:
            if self._gemini:
                evaluation = await self._evaluate_with_gemini(prompt)
            elif self._openai:
                evaluation = await self._evaluate_with_openai(prompt)
            else:
                raise EvaluationError("No hay ninguna API key configurada para evaluar.")
        except genai_errors.APIError as exc:
            logger.warning("Gemini falló al evaluar (HTTP %s): %s", exc.code, exc.message)
            if exc.code == 429:
                raise EvaluationError("Se alcanzó el límite de uso del modelo que evalúa. Probá de nuevo en un minuto.") from exc
            if exc.code in (401, 403) or (exc.code == 400 and "api key" in (exc.message or "").lower()):
                raise EvaluationError("La API key de Gemini no es válida para evaluar la llamada.") from exc
            raise EvaluationError(f"El modelo que evalúa devolvió un error (HTTP {exc.code}).") from exc
        except openai.APIError as exc:
            logger.warning("OpenAI falló al evaluar: %s", exc)
            raise EvaluationError("El modelo que evalúa devolvió un error.") from exc
        except (httpx.HTTPError, ValidationError) as exc:
            logger.warning("Evaluación inválida o sin respuesta: %s", exc)
            raise EvaluationError("No se pudo obtener una evaluación válida. Probá de nuevo.") from exc
        return _clamp(evaluation)

    async def _evaluate_with_gemini(self, prompt: str) -> Evaluation:
        response = await self._gemini.aio.models.generate_content(
            model=self._settings.gemini_eval_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=Evaluation,
                temperature=0.2,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        if isinstance(response.parsed, Evaluation):
            return response.parsed
        return Evaluation.model_validate_json(response.text or "")

    async def _evaluate_with_openai(self, prompt: str) -> Evaluation:
        response = await self._openai.responses.parse(
            model=self._settings.openai_eval_model,
            instructions=SYSTEM_PROMPT,
            input=prompt,
            text_format=Evaluation,
        )
        if response.output_parsed is None:
            raise EvaluationError("El modelo que evalúa no devolvió un resultado.")
        return response.output_parsed

    async def aclose(self) -> None:
        if self._gemini:
            await self._gemini.aio.aclose()
        if self._openai:
            await self._openai.close()


def build_prompt(scenario: Scenario, transcript: list[TranscriptLine], metrics: CallMetrics) -> str:
    parts = [
        "# Escenario",
        "Tipo de llamada: "
        + (
            "entrante (el cliente llamó al banco)"
            if scenario.direction is Direction.INBOUND
            else "saliente (el operador llamó al cliente para devolver un caso)"
        ),
        f"Motivo: {scenario.title}",
        f"Dificultad: {scenario.difficulty}",
        f"Cliente: {scenario.customer.name}, {scenario.customer.age} años",
    ]
    if scenario.case:
        case = scenario.case
        parts += [
            "",
            "# Caso que el operador tenía que devolver (el operador lo tenía en pantalla)",
            f"Número: {case.number} (abierto el {case.opened})",
            f"Motivo original: {case.reason}",
            f"Resolución a comunicar: {case.resolution}",
            "Indicaciones para el operador:",
            *[f"- {item}" for item in case.guidance],
        ]
    parts += [
        "",
        "# Criterios a evaluar",
        *[f"{i}. {criterion}" for i, criterion in enumerate(scenario.evaluation_criteria, start=1)],
        "",
        "# Métricas del softphone",
        f"- Sonó durante {metrics.ring_seconds:.0f} s antes de atenderse.",
        f"- Duración desde que se atendió: {_mmss(metrics.total_seconds)}.",
        f"- En espera: {metrics.hold_count} vez/veces, {_mmss(metrics.hold_seconds)} en total.",
        "",
        "# Guion del cliente simulado (el operador NO lo conocía; sirve para saber qué datos ocultos tenía el cliente)",
        scenario.instructions,
        "",
        "# Transcripción de la llamada",
        *[f"{'Operador' if line.speaker == 'operador' else 'Cliente'}: {line.text}" for line in transcript],
    ]
    return "\n".join(parts)


def _mmss(seconds: float) -> str:
    total = int(round(seconds))
    return f"{total // 60}:{total % 60:02d}"


def _clamp(evaluation: Evaluation) -> Evaluation:
    evaluation.customer_satisfaction = min(5, max(1, evaluation.customer_satisfaction))
    scores = evaluation.scores
    for name in type(scores).model_fields:
        setattr(scores, name, min(10, max(0, getattr(scores, name))))
    return evaluation
