'use client';

import { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, Settings } from 'lucide-react';

type AudioControlsProps = {
  initialize: () => Promise<void>;
  stop: () => Promise<void>;
  isInitialized: boolean;
  sensitivity: number;
  setSensitivity: (n: number) => void;
  startStreaming?: (wsUrl: string) => Promise<void>;
  stopStreaming?: () => Promise<void>;
  isCapturing?: boolean;
  lastError?: string | null;
};

export default function AudioControls({ initialize, stop, isInitialized, sensitivity, setSensitivity, startStreaming, stopStreaming, isCapturing, lastError }: AudioControlsProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isStreaming, setIsStreaming] = useState(false);
  const [wsUrl, setWsUrl] = useState(process.env.NEXT_PUBLIC_BACKEND_WS_URL || 'ws://localhost:8080/ws-audio');

  const handleToggle = async () => {
    if (isRecording) {
      await stop();
      setIsRecording(false);
    } else {
      try {
        await initialize();
        setIsRecording(true);
      } catch (e: any) {
        console.error('Failed to start microphone', e);
        // Alert user (since lastError might not update fast enough or be noticed)
        alert(`Failed to access microphone: ${e.message || e}`);
      }
    }
  };

  const requestPermissionOnly = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop immediately: this is only to trigger permission prompt and ensure permissions granted.
      s.getTracks().forEach((t) => t.stop());
      // Optionally call initialize now that permission is granted
      await initialize();
      setIsRecording(true);
    } catch (e) {
      console.error('Permission request failed', e);
    }
  };

  // Keep local recording state in sync with external initialization state
  useEffect(() => {
    setIsRecording(isInitialized);
  }, [isInitialized]);

  const handleStreamToggle = async () => {
    if (isStreaming) {
      if (typeof stopStreaming === 'function') await stopStreaming();
      setIsStreaming(false);
    } else {
      try {
        if (!isRecording) {
          // Ensure microphone is started before streaming
          await initialize();
          setIsRecording(true);
        }

        if (!wsUrl.startsWith('ws')) {
          alert('Please enter a valid WebSocket URL starting with ws:// or wss://');
          return;
        }

        if (typeof startStreaming === 'function') {
          try {
            await startStreaming(wsUrl);
            setIsStreaming(true);
          } catch (streamError: any) {
            console.error('Streaming failed', streamError);
            alert(`Failed to start streaming: ${streamError.message}`);
          }
        }
      } catch (e: any) {
        console.error('Failed to start streaming sequence', e);
        alert(`Error: ${e.message}`);
      }
    }
  };


  return (
    <div className="space-y-6">
      {/* Record Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleToggle}
          className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-3 transition-all ${isRecording
            ? 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700'
            : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700'
            }`}
        >
          {isRecording ? (
            <>
              <MicOff size={24} />
              Stop Microphone
            </>
          ) : (
            <>
              <Mic size={24} />
              Start Microphone
            </>
          )}
        </button>
      </div>

      {/* Microphone status */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <div>
          <span className="font-medium">Mic status:</span>{' '}
          <span className="ml-2">
            {isRecording ? 'recording' : isCapturing ? 'capturing' : 'stopped'}
          </span>
        </div>
        <div>
          <span className="font-medium">Permission:</span>{' '}
          <span className="ml-2">{isInitialized ? 'granted' : 'prompt'}</span>
        </div>
        <div className="text-red-400 ml-4">
          {lastError ? `Error: ${lastError}` : null}
        </div>
      </div>

      {/* Request permission */}
      <div className="text-xs text-gray-400">
        <button onClick={requestPermissionOnly} className="underline">Request microphone permission</button>
      </div>

      {/* Volume Control */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 size={20} className="text-gray-400" />
            <span className="font-medium">Volume</span>
          </div>
          <span className="text-cyan-300 font-mono">{volume}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => setVolume(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
        />
      </div>

      {/* Sensitivity Control */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-gray-400" />
            <span className="font-medium">Sensitivity</span>
          </div>
          <span className="text-cyan-300 font-mono">{sensitivity}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={sensitivity}
          onChange={(e) => setSensitivity(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400"
        />
      </div>

      {/* Stream Controls */}
      <div className="space-y-3">
        <label className="text-sm text-gray-400">Streaming endpoint</label>
        <div className="flex gap-2">
          <input
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-900 text-white border border-gray-700"
          />
          <button
            onClick={handleStreamToggle}
            className={`px-4 py-2 rounded-lg font-medium ${isStreaming ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
          >
            {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-3 gap-2">
        {['Speech', 'Music', 'Bass'].map((preset) => (
          <button
            key={preset}
            className="py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}