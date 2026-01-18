'use client';

import { useState } from 'react';
import WebcamCanvas from '@/components/WebcamCanvas';
import CCTVCanvas from '@/components/CCTVCanvas';

type FeedMode = 'webcam' | 'cctv';

export default function Home() {
  const [feedMode, setFeedMode] = useState<FeedMode>('cctv');

  // Backend URL - can be configured via environment variable for Vercel
  // Use ngrok URL when accessing from Vercel, localhost for local dev
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Flood Detection System</h1>
            <p className="text-sm text-gray-400">Real-time Water Level Monitoring</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Feed Mode Toggle */}
          <div className="flex items-center gap-2 bg-gray-800/50 rounded-lg p-1">
            <button
              onClick={() => setFeedMode('webcam')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${feedMode === 'webcam'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Webcam
              </span>
            </button>
            <button
              onClick={() => setFeedMode('cctv')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${feedMode === 'cctv'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                CCTV
              </span>
            </button>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-400">Live</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 p-6">
        <div className="h-full max-w-6xl mx-auto">
          {feedMode === 'webcam' ? (
            <WebcamCanvas />
          ) : (
            <CCTVCanvas backendUrl={backendUrl} />
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-white/10">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>Thesis Project - Flood Detection with Instance Segmentation</p>
          <div className="flex items-center gap-4">
            {feedMode === 'cctv' && (
              <p className="text-xs text-gray-600">
                Backend: {backendUrl}
              </p>
            )}
            <p>Powered by Roboflow API</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
