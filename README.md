# Chat UI (Vertex AI)

UI chat minimal (React + Vite) dengan backend Express/Serverless yang terhubung ke Vertex AI (Firebase Vertex API) dan mendukung streaming respons.

## Setup

1. Install dependencies: `npm install`
2. Start dev: `npm run dev`
   - Web UI: http://localhost:5173
   - API: http://localhost:3001 (hanya endpoint streaming)

## Notes

- Server menambahkan system prompt singkat dalam Bahasa Indonesia.
- Default provider: Vertex AI. Model default: `gemini-2.5-flash` (bisa dioverride via env).
- Streaming respons tersedia di endpoint: `/api/chat/stream`.

## Konfigurasi AI

- Autentikasi Vertex telah ditanam langsung di `lib/vertex.js` sesuai permintaan, sehingga tidak perlu environment variables untuk kredensial.
- Pengaturan yang masih bisa diubah via env (opsional) ada di `config.js`:
  - `SYSTEM_PROMPT`: pesan sistem yang ditambahkan ke awal percakapan.
  - `GREETING_INSTRUCTION`: instruksi untuk sapaan awal.
  - `PORT`: port server lokal.

Helper:
- `withSystemPrompt(messages)`: menambahkan system prompt secara konsisten.

## Deploy ke Vercel

Repo ini siap dideploy ke Vercel dengan Serverless Functions untuk API streaming.

Termasuk:
- `api/chat/stream.js`: Node Serverless Function pengganti endpoint streaming.
- `vercel.json`: konfigurasi build dasar.

Langkah:
1. Push repo ke GitHub (atau GitLab/Bitbucket).
2. Buat Project Vercel dan import repo.
   - Framework Preset: “Vite”.
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Deploy (Vercel akan mendeteksi folder `api/` dan membuat endpoint `/api/*`).

Catatan:
- Di production, React app memanggil `/api/chat/stream` pada origin yang sama, jadi tidak perlu CORS.
- Server Express lokal (`server/index.mjs`) fokus untuk dev/self-hosting; Vercel menggunakan fungsi di `api/`.

## Credits

- ikyyofc
