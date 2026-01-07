// app/hooks/useAudioContext.ts
import { useEffect, useRef, useState } from 'react';

export const useAudioContext = () => {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Configuration defaults
  const DEFAULT_FFT_SIZE = 2048;
  const DEFAULT_SMOOTHING = 0.3; // lower smoothing for more responsive visualization

  // Initialize audio (explicit - call from UI)
  const initialize = async (opts?: { fftSize?: number; smoothingTimeConstant?: number }) => {
    if (audioContext) return; // already initialized

    try {
      console.debug('useAudioContext: requesting microphone');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.debug('useAudioContext: microphone granted', stream);
      mediaStreamRef.current = stream;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = opts?.fftSize ?? DEFAULT_FFT_SIZE;
      analyser.smoothingTimeConstant = opts?.smoothingTimeConstant ?? DEFAULT_SMOOTHING;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      setAudioContext(ctx);
      analyserRef.current = analyser;
      sourceRef.current = source;
      setPermission('granted');
      setLastError(null);
    } catch (err: any) {
      console.error('Audio initialization failed:', err);
      setPermission('denied');
      setLastError(err?.message ? String(err.message) : String(err));
      throw err;
    }
  };

  // Start an RAF-based polling loop that invokes callback with latest data.
  // Returns a stop function.
  const startPolling = (cb: (data: {
    frequencyData: Float32Array;
    timeDomainData: Float32Array;
    isSilent: boolean;
    sampleRate: number | null;
    timestamp: number;
  }) => void, options?: { silenceThreshold?: number }) => {
    if (!analyserRef.current || !audioContext) {
      console.warn('startPolling called without initialized audio analyzer');
      return () => { };
    }

    const analyser = analyserRef.current;
    const bufferLen = analyser.frequencyBinCount;

    // Float arrays for precision
    const frequencyData = new Float32Array(bufferLen);
    const timeData = new Float32Array(bufferLen);

    const silenceThreshold = options?.silenceThreshold ?? 0.001; // RMS threshold

    const loop = () => {
      // Get float frequency data and time-domain data
      analyser.getFloatFrequencyData(frequencyData);
      analyser.getFloatTimeDomainData(timeData);

      // Compute RMS on time domain for silence detection
      let sumSquares = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = timeData[i];
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / timeData.length) || 0;
      const isSilent = rms < silenceThreshold;

      cb({
        frequencyData, // Float32 dB values (negative for low energy)
        timeDomainData: timeData,
        isSilent,
        sampleRate: audioContext?.sampleRate ?? null,
        timestamp: performance.now(),
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    // Start loop
    rafRef.current = requestAnimationFrame(loop);

    // Return stop function
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  };

  // Helper to get byte-scaled frequency data (0..255)
  const getByteFrequencyData = (): Uint8Array => {
    if (!analyserRef.current) return new Uint8Array(0);
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(data);
    return data;
  };

  // Transcript state
  const [transcript, setTranscript] = useState<{ partial: string; final: string[] }>({ partial: '', final: [] });

  // Audio processing refs
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const convertFloat32ToInt16 = (buffer: Float32Array) => {
    let l = buffer.length;
    const buf = new Int16Array(l);
    while (l--) {
      // Clamp to [-1, 1]
      let s = Math.max(-1, Math.min(1, buffer[l]));
      // Scale to 16-bit integer range
      buf[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return buf;
  };

  const downsampleBuffer = (buffer: Float32Array, sampleRate: number, outSampleRate: number) => {
    if (outSampleRate === sampleRate) {
      return buffer;
    }
    if (outSampleRate > sampleRate) {
      throw new Error('downsampling rate show be smaller than original sample rate');
    }
    const sampleRateRatio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      // Use average value of accumulated samples
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  const startStreaming = async (wsUrl: string) => {
    if (!audioContext) throw new Error('AudioContext not initialized');
    if (!mediaStreamRef.current) throw new Error('No MediaStream available');
    if (wsRef.current) throw new Error('Already streaming');

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      // Send initial metadata
      const meta = { type: 'start', sampleRate: 16000 };
      ws.send(JSON.stringify(meta));
      setIsStreaming(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'partial') {
          // Update partial transcript
          setTranscript(prev => ({ ...prev, partial: data.text }));
        } else if (data.type === 'final') {
          // Commit to final
          setTranscript(prev => ({
            partial: '',
            final: [...prev.final, data.text]
          }));
        } else if (data.type === 'error') {
          console.error('Server error:', data.text);
          setLastError(data.text);
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = (event) => {
      console.log(`Socket closed: ${event.code} ${event.reason}`);
      setIsStreaming(false);
      stopStreaming(); // Ensure cleanup
    };

    ws.onerror = (e) => {
      console.error('WebSocket error', e);
      setLastError('WebSocket connection failed');
      setIsStreaming(false);
    };

    wsRef.current = ws;

    // Create ScriptProcessor for raw audio access
    // Buffer size 4096 = ~85ms at 48kHz, ~92ms at 44.1kHz
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    // Create a new source specifically for streaming to avoid interfering with visualizer
    const streamSource = audioContext.createMediaStreamSource(mediaStreamRef.current);
    streamSource.connect(processor);
    processor.connect(audioContext.destination); // Needed for processing to happen in some browsers

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Downsample to 16kHz
      const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, 16000);

      // Convert to Int16 PCM
      const pcmData = convertFloat32ToInt16(downsampled);

      // Send raw bytes
      ws.send(pcmData.buffer);
    };

    processorRef.current = processor;
    // Keep reference to source to disconnect later
    (processor as any)._source = streamSource;
  };

  const stopStreaming = async () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      if ((processorRef.current as any)._source) {
        (processorRef.current as any)._source.disconnect();
      }
      processorRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsStreaming(false);
  };

  // Stop microphone and clean up everything
  const stop = async () => {
    // Also stop any ongoing streaming
    await stopStreaming();

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      sourceRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    analyserRef.current = null;

    if (audioContext) {
      try {
        await audioContext.close();
      } catch (e) {
        console.warn('Failed to close AudioContext', e);
      }
      setAudioContext(null);
    }

    setPermission('prompt');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContext) audioContext.close().catch(() => { });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    audioContext,
    permission,
    lastError,
    transcript,
    initialize,
    stop,
    startPolling,
    getByteFrequencyData,
    startStreaming,
    stopStreaming,
    isCapturing: !!mediaStreamRef.current,
    isInitialized: !!audioContext,
    isStreaming, // Return state variable
  } as const;
};