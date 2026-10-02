# Frontend Simulador de Llamadas

Softphone web de entrenamiento, al estilo de las consolas de los call centers (Genesys y similares). Lo usa el operador para atender y hacer llamadas con clientes simulados por IA. Habla con el [Backend Simulador](../BackendSimulador) y el audio va directo del navegador al proveedor de voz.

## Qué hace

- **Estado del agente** (arriba a la derecha):
  - **Disponible:** luz verde parpadeante.
  - **Ocupado:** luz roja parpadeante.
  - Durante la llamada la luz muestra En llamada, En espera o Post-llamada.
- **Llamadas entrantes:**
  - Al ponerte Disponible, entre 2 y 5 s después entra una llamada.
  - Suena con el tono de `media/` entre 4 y 7 s y se atiende sola.
  - Mientras suena se conecta con el proveedor, así que al atender ya podés hablar. Atendés vos primero.
- **Llamadas salientes:**
  - Al entrar a la sección se carga al azar un **caso a devolver**: cliente, teléfono, consulta original, resolución a comunicar e indicaciones.
  - Lo leés con calma, y con **Cambiar caso** podés saltearlo.
  - Cuando estés listo, marcás cualquier número y tocás Llamar. Atiende el cliente del caso y habla primero.
  - Al cerrar el informe se carga un caso nuevo.
- **Teléfono** (panel derecho):
  - cronómetro de la llamada;
  - indicador "Llamada activa";
  - medidores de audio de los dos lados;
  - **Espera / Retomar**: el cliente no te escucha y vos no lo escuchás, y sabe cuánto tiempo estuvo en espera;
  - **Cortar**.
- **Transcripción en vivo**, que se puede ocultar para entrenar como en una llamada real.
- **Informe al cortar:**
  - duración, conversación, tiempo en espera, timbre y cuánto hablaste;
  - satisfacción estimada del cliente y resolución;
  - puntajes, criterios del escenario, fortalezas, mejoras y transcripción.
- **Historial** de llamadas con su informe e indicadores (atendidas, duración promedio, satisfacción promedio y porcentaje de resueltas), guardado en el navegador.
- **Selector de motor** de voz: Gemini Live u OpenAI GPT-Live, según las keys del backend.

## Desarrollo

Requiere Node 20 o más y el backend corriendo en `http://localhost:8000`. Vite redirige `/api`, `/health` y `/media` al backend.

```bash
npm install
```

```bash
npm run dev
```

Abrir http://localhost:5173 en Chrome o Edge, **con auriculares**. El micrófono solo funciona en `localhost` o HTTPS.

Otros comandos: `npm run typecheck` y `npm run build`.

## Docker

La imagen compila la app y la sirve con nginx, que redirige `/api`, `/health` y `/media` al servicio `backend`. Desde la raíz del proyecto:

```bash
docker compose up --build
```

Frontend en http://localhost:3000.

## Estructura

```
src/
├── api.ts               # cliente de la API del backend (tipos espejados de FastAPI)
├── voice/               # llamadas de voz directas con el proveedor
│   ├── openai.ts        #   WebRTC con OpenAI GPT-Live
│   ├── gemini.ts        #   WebSocket con Gemini Live (PCM 16 kHz / 24 kHz)
│   └── audio.ts         #   micrófono, medidores y tonos
├── softphone/store.ts   # estado del softphone: disponibilidad, timbre, espera, métricas, informe
└── components/          # TopBar, Softphone, Entrantes, Salientes, Historial, Informe…
```
