export const runtime = 'nodejs';

import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Create a stream for Server-Sent Events
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Try to load a WebSocket implementation (ws dependency should be installed)
  let WebSocketImpl: any = (global as any).WebSocket || undefined;
  try {
    if (!WebSocketImpl) {
      const wsModule = await import('ws');
      WebSocketImpl = wsModule?.default || wsModule;
    }
  } catch (e) {
    console.error('WS import failed', e);
    try {
      writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Server missing ws dependency' })}\n\n`));
    } catch (_) { }
    try { writer.close(); } catch (_) { }

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Connect to backend WebSocket
  let backendWs: any = null;
  try {
    backendWs = new WebSocketImpl(process.env.BACKEND_WS_URL || 'ws://localhost:8080/ws-audio');

    backendWs.on('open', () => {
      try { writer.write(encoder.encode(`event: info\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`)); } catch (_) { }
    });

    backendWs.on('message', (message: any) => {
      try {
        const str = typeof message === 'string' ? message : message.toString();
        const payload = JSON.parse(str);
        const eventName = payload && payload.type ? String(payload.type) : 'message';
        writer.write(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
      } catch (e) {
        // Non-JSON message, forward as message event
        try { writer.write(encoder.encode(`event: message\ndata: ${JSON.stringify(String(message))}\n\n`)); } catch (_) { }
      }
    });

    backendWs.on('error', (err: any) => {
      console.error('Backend WS error', err);
      try { writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Backend connection failed' })}\n\n`)); } catch (_) { }
    });

    backendWs.on('close', (code: number, reason: any) => {
      try { writer.write(encoder.encode(`event: close\ndata: ${JSON.stringify({ code, reason: String(reason) })}\n\n`)); } catch (_) { }
      try { writer.close(); } catch (_) { }
    });
  } catch (err) {
    console.error('Failed to connect backend WS', err);
    try { writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Failed to connect backend' })}\n\n`)); } catch (_) { }
    try { writer.close(); } catch (_) { }

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Handle client abort
  request.signal.addEventListener('abort', () => {
    try { if (backendWs && backendWs.close) backendWs.close(); } catch (_) { }
    try { writer.close(); } catch (_) { }
  });

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function POST(request: NextRequest) {
  // Receive audio from frontend and forward to Spring Boot
  const body = await request.json();

  // Forward to Spring Boot backend (simplified version)
  const response = await fetch(process.env.BACKEND_API_URL || 'http://localhost:8080/api/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}