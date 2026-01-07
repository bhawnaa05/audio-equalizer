'use client';

import CircularVisualizer from './CircularVisualizer';

import { useAudioContext } from '../hooks/useAudioContext';

export default function ToneVisualizer() {
  const { isInitialized, startPolling } = useAudioContext();

  return (
    <div className="p-4">
      <h2 className="text-lg font-medium text-cyan-300 mb-3">Tone Visualizer</h2>
      <CircularVisualizer
        isInitialized={isInitialized}
        startPolling={startPolling}
      />
    </div>
  );
}
