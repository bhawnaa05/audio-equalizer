// Development helper WebSocket server that simulates a transcription backend.
// Run with: node scripts/mock-ws-server.js

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

console.log('Mock WS transcription server listening on ws://localhost:8080/ws-audio');

wss.on('connection', function connection(ws, req) {
  console.log('Client connected');

  ws.on('message', function incoming(message) {
    // If we receive binary audio frames, we simulate partial transcripts
    if (message instanceof Buffer) {
      // Simulate a partial result after a short delay
      setTimeout(() => {
        const partial = { type: 'partial', text: 'simulated partial ' + Math.random().toString(36).slice(2,6) };
        ws.send(JSON.stringify(partial));
      }, 150);

      // Simulate a final after a second
      setTimeout(() => {
        const final = { type: 'final', text: 'simulated final ' + Math.random().toString(36).slice(2,6) };
        ws.send(JSON.stringify(final));
      }, 1000);
    } else {
      try {
        const txt = message.toString();
        const obj = JSON.parse(txt);
        if (obj && obj.type === 'start') {
          console.log('Streaming started, meta:', obj);
        }
      } catch (e) {
        // echo
        ws.send(JSON.stringify({ type: 'message', text: 'echo: ' + message.toString().slice(0,200) }));
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});
