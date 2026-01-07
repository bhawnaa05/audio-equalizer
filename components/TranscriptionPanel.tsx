'use client';

import React, { useEffect, useState, useRef } from 'react';

type PartialMsg = { type: 'partial' | 'final' | string; text?: string;[k: string]: any };

export default function TranscriptionPanel({
  transcript = { partial: '', final: [] },
  isStreaming = false,
}: {
  transcript?: { partial: string; final: string[] };
  isStreaming?: boolean;
}) {
  const { partial, final } = transcript;

  return (
    <div className="text-gray-300 space-y-3 min-h-[100px]">
      {isStreaming && final.length === 0 && !partial ? (
        <div className="flex items-center gap-2 text-emerald-400 animate-pulse">
          <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
          <p className="text-sm font-medium">Listening...</p>
        </div>
      ) : null}

      {!isStreaming && final.length === 0 && !partial ? (
        <p className="text-sm text-gray-500">Start streaming to see transcription.</p>
      ) : null}

      <div className="space-y-2">
        <>
          {final.map((t, i) => (
            <p key={i} className={`text-sm ${t.startsWith('[ERROR]') ? 'text-red-400 font-bold' : ''}`}>
              {t}
            </p>
          ))}
          {partial ? (
            <p className="text-sm text-gray-400 italic">{partial}</p>
          ) : null}
        </>

      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 mt-2">Live transcription (partial updates shown in italic)</p>
      </div>
    </div >
  );
}
