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

## Deploy to Vercel

This repo is ready to deploy on Vercel using Serverless Functions for the API.

What’s included:
- `api/chat.js` and `api/chat/stream.js`: Node Serverless Functions that replace the Express endpoints on Vercel.
- `vercel.json`: pins Node 18 runtime for the functions.

Steps:
1. Push this repo to GitHub (or GitLab/Bitbucket).
2. Create a new Vercel Project and import the repo.
   - Framework Preset: “Vite”.
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add environment variable in Vercel Project Settings:
   - `OPENAI_API_KEY` = your OpenAI API key
4. Deploy (Vercel will detect the `api/` directory and create `/api/*` endpoints).

CLI alternative:
```
npm i -g vercel
vercel login
vercel               # first deploy (Preview)
vercel env add OPENAI_API_KEY  # paste your key
vercel --prod        # production deploy
```

Notes:
- In production the React app calls `/api/chat` and `/api/chat/stream` on the same origin, so no CORS needed.
- The local Express server (`server/index.mjs`) is for local dev or self-hosting; Vercel uses the Serverless Functions in `api/` instead.
