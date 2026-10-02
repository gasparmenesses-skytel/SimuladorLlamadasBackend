# Simulador de Llamadas

Simulador de entrenamiento para operadores de un banco. El operador atiende y hace llamadas por voz con clientes virtuales generados por IA, que hablan en español rioplatense. Al terminar cada llamada recibe un informe con su evaluación.

| Proyecto | Qué es |
|---|---|
| [`BackendSimulador`](BackendSimulador) | FastAPI. Escenarios de clientes, sesiones de voz con OpenAI GPT-Live o Gemini Live, y evaluación de las llamadas. |
| [`FrontendSimulador`](FrontendSimulador) | React. Softphone estilo call center: estado del agente, llamadas entrantes y salientes, espera, informe e historial. |

El audio va directo del navegador al proveedor de voz, sin pasar por el backend, para tener la menor latencia posible.

## Levantar todo con Docker

1. Completar la API key en `BackendSimulador/.env` (plantilla en `BackendSimulador/.env.example`). Gemini tiene plan gratuito: https://aistudio.google.com/apikey.
2. Desde esta carpeta:

   ```bash
   docker compose up --build
   ```

3. Abrir http://localhost:3000 en Chrome o Edge, con auriculares, y ponerse **Disponible**.

Para desarrollar, ver los README de cada proyecto (backend con `--watch` y frontend con `npm run dev`).
