'use client';

import { useEffect, useRef, useState } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useAudioContext } from '../hooks/useAudioContext';

function mapFftToBands(frequencyData: Float32Array, sampleRate: number, bands = 60, minFreq = 20) {
  const fftBins = frequencyData.length;
  const fftSize = fftBins * 2;
  const nyquist = sampleRate / 2;
  const binFreq = sampleRate / fftSize;

  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(Math.max(minFreq + 1, nyquist));

  const bandsOut = new Float32Array(bands);

  let maxVal = 0;

  for (let i = 0; i < bands; i++) {
    const startFreq = Math.pow(10, logMin + (i / bands) * (logMax - logMin));
    const endFreq = Math.pow(10, logMin + ((i + 1) / bands) * (logMax - logMin));

    let startBin = Math.floor(startFreq / binFreq);
    let endBin = Math.ceil(endFreq / binFreq);

    startBin = Math.max(0, Math.min(startBin, fftBins - 1));
    endBin = Math.max(0, Math.min(endBin, fftBins - 1));

    if (endBin < startBin) endBin = startBin;

    let sum = 0;
    for (let b = startBin; b <= endBin; b++) {
      // frequencyData is in dB (negative values), convert to linear amplitude
      const db = frequencyData[b];
      const linear = Math.pow(10, db / 20);
      sum += linear;
    }

    const avg = sum / (endBin - startBin + 1 || 1);
    bandsOut[i] = avg;
    if (avg > maxVal) maxVal = avg;
  }

  // Normalize
  if (maxVal > 0) {
    for (let i = 0; i < bands; i++) bandsOut[i] = bandsOut[i] / maxVal;
  }

  return bandsOut;
}

export default function CircularVisualizer({
  bands = 60,
  sensitivity = 50,
  isInitialized,
  startPolling
}: {
  bands?: number;
  sensitivity?: number;
  isInitialized: boolean;
  startPolling: (cb: (data: any) => void, options?: any) => () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  // Removed local useAudioContext call to avoid state isolation

  const [isSilent, setIsSilent] = useState(false);

  const { scale } = useSpring({
    scale: 1 + (isSilent ? 0 : 0.07),
    config: { tension: 170, friction: 26 },
  });

  const computedSilenceThreshold = (() => {
    const s = Math.max(0, Math.min(100, sensitivity ?? 50));
    // sensitivity 100 => lowest threshold (very sensitive), sensitivity 0 => highest threshold (less sensitive)
    return 0.0005 + (1 - s / 100) * 0.02;
  })();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Drawing callback invoked at audio frame rate by startPolling
    let stopPolling = () => { };

    if (isInitialized && startPolling) {
      stopPolling = startPolling(({ frequencyData, timeDomainData, isSilent: silent, sampleRate, timestamp }) => {
        if (!sampleRate) return;
        setIsSilent(silent);

        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.3;

        // Fade background slightly
        ctx.fillStyle = 'rgba(10, 10, 20, 0.12)';
        ctx.fillRect(0, 0, width, height);

        const mapped = mapFftToBands(frequencyData, sampleRate, bands, 20);

        const angleStep = (2 * Math.PI) / bands;

        for (let i = 0; i < bands; i++) {
          const amplitude = mapped[i]; // 0..1
          const angle = i * angleStep + rotationRef.current;
          const barHeight = amplitude * radius * 0.9;

          const hue = (i / bands) * 360;
          ctx.strokeStyle = `hsl(${hue}, 80%, ${40 + amplitude * 40}%)`;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';

          const x1 = centerX + Math.cos(angle) * radius;
          const y1 = centerY + Math.sin(angle) * radius;
          const x2 = centerX + Math.cos(angle) * (radius + barHeight);
          const y2 = centerY + Math.sin(angle) * (radius + barHeight);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        // center
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 0.3);
        gradient.addColorStop(0, 'rgba(100, 150, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(20, 30, 80, 0.2)');

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.3, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();

        // rotation
        rotationRef.current = (rotationRef.current + 0.005) % (Math.PI * 2);
      }, { silenceThreshold: computedSilenceThreshold });
    } else {
      // Clear canvas when not initialized
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(10, 10, 20, 1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      stopPolling();
    };
  }, [isInitialized, startPolling, bands]);

  return (
    <animated.div style={{ scale }} className="relative">
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="rounded-full border-2 border-gray-700/50 shadow-2xl"
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className={`text-2xl font-bold mb-2 ${isInitialized ? 'text-cyan-300' : 'text-gray-500'}`}>
            {isInitialized ? 'Live Audio' : 'Equalizer Standby'}
          </div>
          <div className="text-gray-400 text-sm">
            {bands} frequency bands
          </div>
          {isInitialized ? (
            isSilent ? (
              <div className="text-sm text-gray-500 italic mt-2">No audio detected</div>
            ) : null
          ) : (
            <div className="text-sm text-red-400 italic mt-2">No microphone connected</div>
          )}
        </div>
      </div>
    </animated.div>
  );
}
