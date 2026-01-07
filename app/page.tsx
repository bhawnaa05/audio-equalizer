// File: app/page.tsx - CORRECTED VERSION
'use client';

import { useState, useEffect, useRef } from 'react';
import CircularVisualizer from '../components/CircularVisualizer';
import TranscriptionPanel from '../components/TranscriptionPanel';
import AudioControls from '../components/AudioControls';
import { useAudioContext } from '../hooks/useAudioContext';

export default function HomePage() {
  const { initialize, stop, isInitialized, startStreaming, stopStreaming, lastError, isCapturing, transcript, startPolling, isStreaming } = useAudioContext();
  const [sensitivity, setSensitivity] = useState(50);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <h1 className="text-3xl font-bold text-center mb-8">
        Circular Audio Equalizer
      </h1>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Visualizer */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Frequency Visualizer</h2>
          <CircularVisualizer
            bands={60}
            sensitivity={sensitivity}
            isInitialized={isInitialized}
            startPolling={startPolling}
          />
        </div>

        {/* Right: Controls & Transcription */}
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Audio Controls</h2>
            <AudioControls
              initialize={initialize}
              stop={stop}
              isInitialized={isInitialized}
              sensitivity={sensitivity}
              setSensitivity={setSensitivity}
              startStreaming={startStreaming}
              stopStreaming={stopStreaming}
              isCapturing={isCapturing}
              lastError={lastError}
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Live Transcription</h2>
            <TranscriptionPanel transcript={transcript} isStreaming={isStreaming} />
          </div>
        </div>
      </div>
    </div>
  );
}