# Backend Simulador de Llamadas

Backend IA del simulador de entrenamiento para operadores bancarios. El operador habla por voz con un cliente virtual que habla en español rioplatense. Hay dos tipos de llamada:

- **Entrantes:** el cliente llama al banco. El operador tiene que descubrir el motivo.
- **Salientes:** el operador devuelve un caso. En pantalla ve el caso y lo que tiene que comunicar.

En cada llamada se elige al azar un cliente del tipo pedido. Al terminar, un modelo de texto evalúa la llamada y arma un **informe**.

Hay dos motores de voz intercambiables:

| Motor | Modelo | Interacción | Transporte |
|---|---|---|---|
| `openai` | GPT-Live 1 (`gpt-live-1`) | Full-duplex: escucha y habla a la vez | WebRTC |
| `gemini` | Gemini 3.8 Live (`gemini-3.8-live`) | Por turnos, con interrupción del operador | WebSocket |

El frontend (softphone estilo call center) está en [`../FrontendSimulador`](../FrontendSimulador).

## Arquitectura

```
                       1. POST /api/sessions {engine, direction}  -> el backend elige el cliente
Navegador ───────────► 2a. openai: POST /api/sessions/{id}/connect (SDP) ──► Backend ──► OpenAI  (crea la sesión)
                       2b. gemini: POST /api/sessions/{id}/token ─────────► Backend ──► Google  (token efímero)
                       3. POST /api/sessions/{id}/report (transcripción + métricas) ──► Backend ──► modelo de texto

Navegador ═══ audio directo ═══► OpenAI (WebRTC)   o   Google (WebSocket con el token)
              (el audio NUNCA pasa por el backend)
```

- **El audio va directo entre el navegador y el proveedor.** No hay saltos intermedios, así que la latencia es mínima, y no hace falta abrir puertos en Docker.
- **El backend** crea la sesión con su API key y las instrucciones del cliente. Ni la API key ni el prompt llegan al navegador.
- **El navegador es un cliente no confiable:**
  - En OpenAI, por el canal de datos solo puede cortar o silenciar el micrófono.
  - En Gemini, el token efímero es de un solo uso y deja bloqueada toda la configuración (modelo, voz y persona).

### Estructura

```
app/
├── main.py              # app FastAPI, lifespan, rutas
├── config.py            # configuración desde variables de entorno
├── api/                 # endpoints REST (health, sessions, media)
├── providers/           # integraciones de voz: openai_live.py, gemini_live.py
├── ai/                  # configuración de la sesión de voz por proveedor
├── scenarios/           # catálogo de clientes
│   ├── inbound/         # entrantes: María, Juan, Ana, Luis
│   └── outbound/        # salientes (casos a devolver): Carolina, Roberto, Sofía, Patricia
├── evaluation/          # evaluación de la llamada con un modelo de texto
├── sessions/            # CallSession + SessionManager (en memoria)
├── models/              # schemas de la API (sesiones e informes)
└── media/               # tonos de llamada entrante y saliente
dev_client/index.html    # cliente de prueba de bajo nivel (el frontend real es FrontendSimulador)
```

### Escenarios

Cada cliente es un archivo Markdown en `app/scenarios/inbound/` u `outbound/`. Arriba lleva un bloque YAML con sus datos y debajo el prompt de la persona:

```markdown
---
id: carolina-rechazo-tarjeta-activa
direction: outbound
title: "Devolución: tarjeta rechazada, ya está activa"
difficulty: baja            # baja | media | alta
customer: { name: Carolina Silva, age: 38, phone: 097 554 302 }
voices: { openai: shimmer, gemini: Despina }
case:                       # solo salientes: lo que el operador ve en pantalla
  number: GC-2026-118734
  opened: 28/09/2026
  reason: ...
  resolution: ...
  guidance: [...]
evaluation:                 # criterios con los que se evalúa al operador
  - Se presenta, identifica al banco y explica el motivo del llamado.
  - ...
---

# Quién sos
...
```

- **Para agregar un cliente, alcanza con agregar un archivo.** Se lee en cada llamada, así que no hace falta reiniciar.
- Cada prompt incluye un **dato oculto** que el operador tiene que descubrir preguntando.
- A todos los prompts se les agregan las reglas de los "avisos del sistema". Son los mensajes que manda el softphone cuando el cliente atiende, queda en espera o el operador retoma.

### Informe y evaluación

`POST /api/sessions/{id}/report` recibe la transcripción y las métricas que mide el softphone: timbre, duración, conversación, tiempo en espera y cantidad de esperas. Devuelve:

- **Métricas** y proporción de palabras del operador.
- **Evaluación con IA:**
  - satisfacción estimada del cliente (1 a 5);
  - resolución (resuelto, parcial o sin resolver);
  - puntajes de 0 a 10 en empatía, claridad, procedimiento, seguridad y manejo de la llamada;
  - cumplimiento de cada criterio del escenario;
  - fortalezas, mejoras y un resumen.

La evaluación usa Gemini (`gemini-flash-latest`, tiene plan gratuito) si hay `GEMINI_API_KEY`; si no, OpenAI. Si falla, el informe sale igual con las métricas y el motivo del error.

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
2. Levantar todo (backend + frontend) desde la raíz del proyecto, o solo el backend desde esta carpeta:

   ```bash
   docker compose up --build --force-recreate --watch
   ```

3. Abrir el frontend (http://localhost:3000 con Docker, o http://localhost:5173 con `npm run dev`).
   El cliente de prueba de bajo nivel sigue en http://localhost:8000/dev.

`--watch` aplica los cambios de `app/` y `dev_client/` sin reconstruir la imagen. Los cambios en los escenarios (`app/scenarios/**/*.md`) se aplican en la próxima llamada. **Los cambios en `.env` requieren recrear el contenedor** (`--force-recreate`).

Sin Docker:

```bash
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/uvicorn app.main:app --port 8000
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado, motores disponibles y motor por defecto. |
| GET | `/api/media/tones` | URLs de los tonos de llamada entrante y saliente (servidos en `/media/...`). |
| GET | `/api/scenarios/next?direction=outbound` | Próximo cliente al azar, sin repetir el anterior. En salientes trae el caso a devolver, para leerlo antes de llamar. |
| POST | `/api/sessions` | Body: `{"engine"?, "direction": "inbound" \| "outbound", "dialed_number"?, "scenario_id"?}`. Crea la sesión con el cliente indicado (`scenario_id`, el caso que se leyó) o con uno al azar. En entrantes el motivo (`title`) llega oculto. |
| POST | `/api/sessions/{id}/connect` | **openai.** Body: oferta SDP (`Content-Type: application/sdp`). Devuelve la respuesta SDP. |
| POST | `/api/sessions/{id}/token` | **gemini.** Devuelve `ws_url`, `token` (efímero, un solo uso), `setup` y `expires_at`. |
| POST | `/api/sessions/{id}/report` | Cierra la llamada y devuelve el informe con la evaluación. Body: `transcript`, `metrics`, `ended_by`. |
| GET | `/api/sessions/{id}/report` | Informe ya generado. |
| GET | `/api/sessions/{id}` | Estado de la sesión. |
| DELETE | `/api/sessions/{id}` | Cierra la llamada sin informe (por ejemplo, si se cancela mientras suena). |
| GET | `/dev` | Cliente de prueba (solo con `ENABLE_DEV_CLIENT=true`). |

Documentación interactiva: http://localhost:8000/docs

Estados de una sesión: `created → connecting → connected → ended`, o `failed` si el proveedor rechaza la conexión.

### Cómo se conecta un cliente

**openai (WebRTC)**

1. Llamar a `getUserMedia` con `echoCancellation`, `noiseSuppression` y `autoGainControl`.
2. Crear un `RTCPeerConnection`, agregar la pista del micrófono y crear el canal `oai-events` **antes** de la oferta.
3. Hacer `createOffer` + `setLocalDescription` y enviar el SDP a `/connect`. Aplicar la respuesta con `setRemoteDescription`.
4. Esperar `session.started`.
5. Eventos útiles: `session.input_transcript.delta`, `session.output_transcript.delta`, `session.closed` y `error`.
6. Espera: `session.input_audio.mute` / `unmute`. Para cortar: `{"type": "session.close"}`.

**gemini (WebSocket)**

1. Pedir `/token` y abrir `WebSocket(ws_url + "?access_token=" + token)`. Al conectar, enviar el `setup` tal cual y esperar `setupComplete`.
2. Micrófono: PCM16 mono a **16 kHz**, en bloques de unos 30 ms, como `{"realtimeInput": {"audio": {"data": <base64>, "mimeType": "audio/pcm;rate=16000"}}}`.
3. Audio del cliente: `serverContent.modelTurn.parts[].inlineData` (PCM16 a **24 kHz**, base64). Se reproduce en orden.
4. Si llega `serverContent.interrupted`, el operador interrumpió: **cortar de inmediato** lo que se está reproduciendo.
5. Transcripciones: `serverContent.inputTranscription.text` (operador) y `serverContent.outputTranscription.text` (cliente). `turnComplete` marca el fin del turno del cliente.
6. Avisos de texto con `{"realtimeInput": {"text": "[Aviso del sistema: ...]"}}`: en salientes, que el cliente atendió; en la espera, que lo pusieron en espera y cuándo se retomó.

## Configuración

| Variable | Default | Descripción |
|---|---|---|
| `OPENAI_API_KEY` | — | Habilita el motor `openai`. |
| `OPENAI_MODEL` / `OPENAI_VOICE` | `gpt-live-1` / `marin` | La voz es la de respaldo: cada escenario define la suya. |
| `GEMINI_API_KEY` | — | Habilita el motor `gemini` y la evaluación con Gemini. |
| `GEMINI_MODEL` / `GEMINI_VOICE` | `gemini-3.8-live` / `Gacrux` | Igual que en OpenAI: voz de respaldo. |
| `GEMINI_EVAL_MODEL` / `OPENAI_EVAL_MODEL` | `gemini-flash-latest` / `gpt-5.4-mini` | Modelo de texto que evalúa la llamada. |
| `VOICE_ENGINE` | primero con key | Motor por defecto. |
| `MAX_CALL_MINUTES` | `15` | Duración máxima de la llamada (Gemini: vida del token). |
| `ENABLE_DEV_CLIENT` | `true` | Sirve `/dev`. |
| `CORS_ORIGINS` | vacío | Orígenes del frontend si no se sirve por el mismo origen, separados por coma. |
| `LOG_LEVEL` | `INFO` | |

El puerto se publica solo en `127.0.0.1`: el micrófono del navegador exige `localhost` o HTTPS.

## Limitaciones conocidas

- Las sesiones viven en memoria (un único proceso). Si el backend se reinicia se pierde el registro, aunque las llamadas en curso siguen funcionando.
- La transcripción para el informe la manda el navegador: el backend todavía no ve la llamada en vivo (sideband).
- GPT-Live: no se le puede mandar texto desde el navegador, así que en salientes atiende por su cuenta y en la espera solo se silencian el micrófono y el parlante.
- Gemini: una sesión de solo audio dura como máximo 15 minutos.
- La transcripción automática puede tener errores; el evaluador lo tiene en cuenta.

## Próximas etapas

- Monitoreo en vivo desde el backend (sideband): transcripción, estado, cierre y límites.
- Ajuste fino de turnos, interrupciones y silencios.
- Medición de latencia precisa.
- Knowledge base del banco (procedimientos) para evaluar con más contexto.
