'use client';

import CircularVisualizer from './CircularVisualizer';

export default function ToneVisualizer() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-medium text-cyan-300 mb-3">Tone Visualizer</h2>
      <CircularVisualizer />
    </div>
  );
}
