
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws-audio');

ws.on('open', () => {
    console.log('Connected to server!');
    ws.close();
});

ws.on('error', (error) => {
    console.error('Connection failed:', error.message);
});

ws.on('close', (code, reason) => {
    console.log(`Connection closed: ${code} ${reason}`);
});
