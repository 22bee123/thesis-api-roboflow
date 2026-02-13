'use client';

import CCTVCanvas from '@/components/CCTVCanvas';

export default function Home() {
  // Backend URL - can be configured via environment variable for Vercel
  // Use ngrok URL when accessing from Vercel, localhost for local dev
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 gap-3 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white">Flood Detection System</h1>
            <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Real-time Water Level Monitoring</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs sm:text-sm text-gray-400">Live</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 p-2 sm:p-4 md:p-6">
        <div className="h-full max-w-6xl mx-auto min-h-[300px] sm:min-h-[400px] md:min-h-[500px]">
          <CCTVCanvas backendUrl={backendUrl} />
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 sm:px-6 py-2 sm:py-4 border-t border-white/10">
        <div className="flex flex-col sm:flex-row items-center justify-between text-xs sm:text-sm text-gray-500 gap-2 sm:gap-0">
          <p className="text-center sm:text-left">Flood Detection with Instance Segmentation</p>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <p className="text-xs text-gray-600 truncate max-w-[200px] sm:max-w-none">
              Backend: {backendUrl}
            </p>
            <p className="hidden sm:block">Powered by Roboflow API</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
