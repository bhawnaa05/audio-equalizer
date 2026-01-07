This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Live audio streaming & transcription (architecture notes)

This project expects a low-latency backend WebSocket endpoint to accept audio chunks and emit partial transcription results. Key expectations:

- Frontend streams short audio chunks (recommended timeslice 200–300ms) as binary frames over WebSocket to a backend (e.g. `ws://localhost:8080/ws-audio`). The client sends a JSON `start` control message first containing metadata like `sampleRate`.
- Backend should accept binary audio blobs (commonly `audio/webm;codecs=opus`) and perform streaming transcription or re-encode them for an STT system.
- Backend should emit JSON messages on the same or a separate WS with shape `{ type: 'partial' | 'final' | 'error', text?: string, ... }`.
- The Next.js app exposes an SSE bridge at `/api/audio/stream` which connects to the backend WS and forwards messages as SSE events, so the frontend can listen via `EventSource` and update the transcription UI with partials instantly.

Notes:
- The frontend `useAudioContext` hook provides `startStreaming(wsUrl, timesliceMs)` and `stopStreaming()` helpers and uses `MediaRecorder` for chunking with small timeslices for low latency. For production, consider an AudioWorklet if you need precise PCM frames.
- `CircularVisualizer` now maps real FFT dB data into logarithmic frequency bands (real FFT frequency mapping) and uses RMS-based silence detection to prevent false animation when there's no mic input.

If you need help wiring your backend to the expected WS format, tell me about the backend (Spring Boot or other) and I will propose concrete server-side changes.

Development helper: `scripts/mock-ws-server.js` is a small test WebSocket server that accepts binary audio chunks and emits simulated partial/final messages so you can test the frontend pipeline locally without a real STT backend. Run it with `node scripts/mock-ws-server.js`.

Spring Boot demo server

A minimal Spring Boot WebSocket demo lives in `server-springboot/`. It provides a simple `/ws-audio` WebSocket endpoint and simulates partial/final transcription messages in response to binary audio frames. To run it locally:

- Ensure you have Java 17+ and Maven installed.
- Start the server: `mvn -f server-springboot/pom.xml spring-boot:run`
- The server will listen on port 8080 and accept connections at `ws://localhost:8080/ws-audio`.

Notes about Gemini integration

- The Spring Boot demo contains a placeholder handler (`AudioWebSocketHandler`) with comments indicating where to integrate a streaming request to the Gemini API.
- For real Gemini streaming you will need a service account / API key and to implement an incremental/streaming client that forwards partial results back to the WebSocket clients.
- Set `GEMINI_API_KEY` in your environment when you implement production forwarding.

