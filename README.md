# ChatGPT-like UI with OpenAI API

Minimal chat UI (React + Vite) with an Express proxy to the OpenAI API.

## Setup

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Install dependencies: `npm install`
3. Start dev: `npm run dev`
   - Web UI: http://localhost:5173
   - API: http://localhost:3001

## Notes

- The server adds a short system prompt in Indonesian.
- Default model is `gpt-4o-mini` and can be changed from the dropdown.
- For simplicity, responses are not streamed yet (can be added later).

