# Backend Simulador de Llamadas

Backend IA del simulador de entrenamiento para operadores bancarios. El operador habla por voz con un cliente virtual que habla en español rioplatense. En cada llamada se elige al azar una de cuatro personas (María, Juan, Ana o Luis), cada una con su caso, su personalidad y su voz.

Hay dos motores de voz intercambiables, para compararlos:

| Motor | Modelo | Interacción | Transporte |
|---|---|---|---|
| `openai` | GPT-Live 1 (`gpt-live-1`) | Full-duplex: escucha y habla a la vez | WebRTC |
| `gemini` | Gemini 3.8 Live (`gemini-3.8-live`) | Por turnos, con interrupción del operador | WebSocket |

> Etapa actual: **MVP de conversación de voz**. Todavía no hay escenarios configurables, knowledge base ni evaluación.

## Arquitectura

```
                       1. POST /api/sessions {engine}
Navegador ───────────► 2a. openai: POST /api/sessions/{id}/connect (SDP) ──► Backend ──► OpenAI  (crea la sesión)
                       2b. gemini: POST /api/sessions/{id}/token ─────────► Backend ──► Google  (token efímero)

Navegador ═══ audio directo ═══► OpenAI (WebRTC)   o   Google (WebSocket con el token)
              (el audio NUNCA pasa por el backend)
```

- **El audio va directo entre el navegador y el proveedor.** No hay saltos intermedios, así que la latencia es mínima, y no hace falta abrir puertos en Docker.
- **El backend** crea la sesión con su API key y las instrucciones de la persona. Ni la API key ni el prompt llegan al navegador.
- **El navegador es un cliente no confiable:**
  - En OpenAI, por el canal de datos solo puede cortar o silenciar el micrófono.
  - En Gemini, el token efímero es de un solo uso y deja bloqueada toda la configuración (modelo, voz y persona).

### Estructura

```
app/
├── main.py              # app FastAPI, lifespan, rutas
├── config.py            # configuración desde variables de entorno
├── api/                 # endpoints REST (health, sessions)
├── providers/           # integraciones: openai_live.py, gemini_live.py
├── ai/                  # persona y configuración de la sesión de voz por proveedor
│   └── prompts/         # prompts de las personas (María, Juan, Ana, Luis)
├── sessions/            # CallSession + SessionManager (en memoria)
└── models/              # schemas de la API
dev_client/index.html    # cliente de prueba (NO es el frontend)
```

## Requisitos

- Docker Desktop (con Docker Compose).
- Al menos una API key:
  - **OpenAI** (`sk-proj-…`): https://platform.openai.com/api-keys. Necesita saldo cargado; GPT-Live no está en el plan gratuito.
  - **Gemini** (`AQ.…`; las keys viejas `AIza…` dejaron de funcionar en septiembre de 2026): https://aistudio.google.com/apikey, en "Create API key". Tiene plan gratuito. En ese plan Google usa los datos para mejorar sus productos; para uso real conviene el plan pago.
- Chrome o Edge, y **auriculares**.

Para verificar una key antes de usarla:

```bash
curl.exe https://api.openai.com/v1/models -H "Authorization: Bearer TU_API_KEY"
```

```bash
curl.exe https://generativelanguage.googleapis.com/v1beta/models -H "x-goog-api-key: TU_API_KEY"
```

## Puesta en marcha

1. Completar `OPENAI_API_KEY` y/o `GEMINI_API_KEY` en el archivo `.env` (hay una plantilla en `.env.example`).
2. Levantar el backend:

   ```bash
   docker compose up --build --force-recreate --watch
   ```

3. Abrir http://localhost:8000/dev, elegir el motor, tocar **Atender llamada** y saludar como operador: "Banco, buenas tardes, habla Juan, ¿en qué te puedo ayudar?".

Para comparar motores, fijate en dos cosas:
- **La latencia aproximada** que muestra la página: el tiempo entre que dejás de hablar y la clienta empieza a sonar.
- **Cómo se siente:** el acento, si sostiene el personaje y cómo maneja las interrupciones.

`--watch` aplica los cambios de `app/` y `dev_client/` sin reconstruir la imagen. Los cambios al prompt (`app/ai/prompts/*.md`) se aplican en la próxima llamada. **Los cambios en `.env` requieren recrear el contenedor** (`--force-recreate`).

Sin Docker:

```bash
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/uvicorn app.main:app --port 8000
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado, motores disponibles y motor por defecto. |
| POST | `/api/sessions` | Body opcional `{"engine": "openai" \| "gemini"}`. Crea una sesión. |
| POST | `/api/sessions/{id}/connect` | **openai.** Body: oferta SDP (`Content-Type: application/sdp`). Devuelve la respuesta SDP. |
| POST | `/api/sessions/{id}/token` | **gemini.** Devuelve `ws_url`, `token` (efímero, un solo uso), `setup` y `expires_at`. |
| GET | `/api/sessions/{id}` | Estado de la sesión. |
| DELETE | `/api/sessions/{id}` | Marca la llamada como finalizada. |
| GET | `/dev` | Cliente de prueba (solo con `ENABLE_DEV_CLIENT=true`). |

Documentación interactiva: http://localhost:8000/docs

Estados de una sesión: `created → connecting → connected → ended`, o `failed` si el proveedor rechaza la conexión.

### Cómo se conecta un cliente (el futuro frontend React hace lo mismo)

**openai (WebRTC)**

1. Llamar a `getUserMedia` con `echoCancellation`, `noiseSuppression` y `autoGainControl`.
2. Crear un `RTCPeerConnection`, agregar la pista del micrófono y crear el canal `oai-events` **antes** de la oferta.
3. Hacer `createOffer` + `setLocalDescription` y enviar el SDP a `/connect`. Aplicar la respuesta con `setRemoteDescription`.
4. Esperar `session.started`.
5. Eventos útiles: `session.input_transcript.delta`, `session.output_transcript.delta`, `session.closed` y `error`.
6. Para cortar: enviar `{"type": "session.close"}` y cerrar la conexión.

**gemini (WebSocket)**

1. Pedir `/token` y abrir `WebSocket(ws_url + "?access_token=" + token)`. Al conectar, enviar el `setup` tal cual y esperar `setupComplete`.
2. Micrófono: PCM16 mono a **16 kHz**, en bloques de unos 30 ms, como `{"realtimeInput": {"audio": {"data": <base64>, "mimeType": "audio/pcm;rate=16000"}}}`.
3. Audio de la clienta: `serverContent.modelTurn.parts[].inlineData` (PCM16 a **24 kHz**, base64). Se reproduce en orden.
4. Si llega `serverContent.interrupted`, el operador interrumpió: **cortar de inmediato** lo que se está reproduciendo.
5. Transcripciones: `serverContent.inputTranscription.text` (operador) y `serverContent.outputTranscription.text` (clienta). `turnComplete` marca el fin del turno de la clienta.

Al terminar, en los dos motores: `DELETE /api/sessions/{id}`.

## Configuración

| Variable | Default | Descripción |
|---|---|---|
| `OPENAI_API_KEY` | — | Habilita el motor `openai`. |
| `OPENAI_MODEL` / `OPENAI_VOICE` | `gpt-live-1` / `marin` | La voz es la de respaldo: cada persona define la suya en `app/ai/persona.py`. |
| `GEMINI_API_KEY` | — | Habilita el motor `gemini`. |
| `GEMINI_MODEL` / `GEMINI_VOICE` | `gemini-3.8-live` / `Gacrux` | Igual que en OpenAI: voz de respaldo si la persona no define una. |
| `VOICE_ENGINE` | primero con key | Motor por defecto. |
| `MAX_CALL_MINUTES` | `15` | Duración máxima de la llamada (Gemini: vida del token). |
| `ENABLE_DEV_CLIENT` | `true` | Sirve `/dev`. |
| `CORS_ORIGINS` | vacío | Orígenes del frontend, separados por coma. |
| `LOG_LEVEL` | `INFO` | |

El puerto se publica solo en `127.0.0.1`: el micrófono del navegador exige `localhost` o HTTPS.

## Limitaciones conocidas del MVP

- Las sesiones viven en memoria (un único proceso). Si el backend se reinicia se pierde el registro, aunque las llamadas en curso siguen funcionando.
- El backend todavía no ve la llamada en vivo: no recibe la transcripción y no detecta cuándo termina. Eso llega en la etapa 3.
- GPT-Live: las 12 voces nuevas son de variantes de inglés y de portugués de Brasil. Hay que validar de oído el acento rioplatense.
- Gemini: una sesión de solo audio dura como máximo 15 minutos.
- Gemini: si María no actúa como María (por ejemplo, responde como un asistente), el bloqueo de la persona en el token no se está aplicando. Revisar los logs y avisar.
- La latencia que muestra `/dev` es aproximada: se mide por el nivel de audio y supone que usás auriculares.

## Próximas etapas

3. Monitoreo en vivo desde el backend: transcripciones, estado, cierre y límites.
4. Ajuste de turnos, interrupciones y silencios.
5. Medición de latencia precisa.
6. Escenarios configurables (YAML).
7. Knowledge base.
8. Evaluación del operador.
