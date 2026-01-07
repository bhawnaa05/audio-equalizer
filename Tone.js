// Only import Tone.js on client side
import dynamic from 'next/dynamic';

const ToneVisualizer = dynamic(
  () => import('@/components/ToneVisualizer'),
  { 
    ssr: false, // Don't render on server
    loading: () => <div className="text-gray-400">Loading audio engine...</div>
  }
);

// Use in your component
export default function VisualizerPage() {
  return (
    <div>
      <h1>Audio Visualizer</h1>
      <ToneVisualizer />
    </div>
  );
}