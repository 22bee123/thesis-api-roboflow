'use client';

import { useEffect, useState, useRef } from 'react';
import WaterLevelIndicator from './WaterLevelIndicator';

interface CCTVCanvasProps {
    backendUrl?: string;
    onStatusUpdate?: (status: CCTVStatus) => void;
}

interface CCTVStatus {
    water_level: number;
    detected_labels: string[];
    timestamp: number;
    connected: boolean;
    alarm_active?: boolean;
    esp32_connected?: boolean;
    esp32_url?: string;
}

export default function CCTVCanvas({
    backendUrl = 'http://localhost:8000',
    onStatusUpdate
}: CCTVCanvasProps) {
    const [imageUrl, setImageUrl] = useState<string>('');
    const [status, setStatus] = useState<CCTVStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [fps, setFps] = useState(0);

    // Use refs to avoid dependency cycles in the polling loop
    const imageUrlRef = useRef<string>('');
    const fpsCounterRef = useRef<number[]>([]);
    const onStatusUpdateRef = useRef(onStatusUpdate);
    const mountedRef = useRef(true);

    // Keep the ref in sync with the prop
    onStatusUpdateRef.current = onStatusUpdate;

    // Stable polling loop — runs once on mount, no dependency cycle
    useEffect(() => {
        mountedRef.current = true;
        let snapshotTimer: ReturnType<typeof setTimeout>;
        let statusTimer: ReturnType<typeof setInterval>;

        // Fetch status from backend
        const fetchStatus = async () => {
            try {
                const response = await fetch(`${backendUrl}/api/status`, {
                    headers: {
                        'ngrok-skip-browser-warning': 'true',
                    },
                });

                if (!mountedRef.current) return;

                if (response.ok) {
                    const data: CCTVStatus = await response.json();
                    setStatus(data);
                    setIsConnected(data.connected);
                    setError(null);
                    onStatusUpdateRef.current?.(data);
                } else {
                    throw new Error(`Status error: ${response.status}`);
                }
            } catch (err) {
                if (!mountedRef.current) return;
                console.error('Status fetch error:', err);
            }
        };

        // Fetch snapshot from backend — uses setTimeout chaining instead of setInterval
        // to prevent overlapping requests
        const fetchSnapshot = async () => {
            try {
                const url = `${backendUrl}/api/snapshot?t=${Date.now()}`;

                const response = await fetch(url, {
                    headers: {
                        'ngrok-skip-browser-warning': 'true',
                    },
                });

                if (!mountedRef.current) return;

                if (response.ok) {
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);

                    // Revoke old URL to prevent memory leak
                    if (imageUrlRef.current) {
                        URL.revokeObjectURL(imageUrlRef.current);
                    }

                    imageUrlRef.current = objectUrl;
                    setImageUrl(objectUrl);
                    setError(null);
                    setIsConnected(true);

                    // Calculate FPS
                    const now = performance.now();
                    fpsCounterRef.current.push(now);
                    fpsCounterRef.current = fpsCounterRef.current.filter(t => now - t < 1000);
                    setFps(fpsCounterRef.current.length);
                } else if (response.status === 503) {
                    setError('Waiting for camera feed...');
                    setIsConnected(false);
                } else {
                    throw new Error(`Snapshot error: ${response.status}`);
                }
            } catch (err) {
                if (!mountedRef.current) return;
                console.error('Snapshot fetch error:', err);
                setError('Cannot connect to backend server');
                setIsConnected(false);
            }

            // Schedule next snapshot fetch (chained setTimeout prevents overlap)
            if (mountedRef.current) {
                snapshotTimer = setTimeout(fetchSnapshot, 200);
            }
        };

        // Start polling
        fetchSnapshot();
        fetchStatus();
        statusTimer = setInterval(fetchStatus, 1000);

        return () => {
            mountedRef.current = false;
            clearTimeout(snapshotTimer);
            clearInterval(statusTimer);
            if (imageUrlRef.current) {
                URL.revokeObjectURL(imageUrlRef.current);
            }
        };
    }, [backendUrl]); // Only depends on backendUrl — stable!

    return (
        <div className="relative w-full h-full min-h-[250px] sm:min-h-[350px] bg-gray-900 rounded-lg sm:rounded-xl overflow-hidden shadow-2xl">
            {/* CCTV Feed Image */}
            {imageUrl && (
                <img
                    src={imageUrl}
                    alt="CCTV Feed"
                    className="w-full h-full object-contain"
                />
            )}

            {/* Water Level Indicator */}
            <div className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 scale-75 sm:scale-100 origin-right">
                <WaterLevelIndicator waterLevel={status?.water_level ?? 0} />
            </div>

            {/* FPS Counter */}
            <div className="absolute top-2 sm:top-4 left-2 sm:left-4 bg-black/50 px-2 sm:px-3 py-1 sm:py-2 rounded-md sm:rounded-lg backdrop-blur-sm">
                <span className="text-yellow-400 font-bold text-sm sm:text-lg">
                    FPS: {fps}
                </span>
            </div>

            {/* Connection Status */}
            <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2 bg-black/50 px-2 sm:px-3 py-1 sm:py-2 rounded-md sm:rounded-lg backdrop-blur-sm">
                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-white text-xs sm:text-sm font-medium">
                    {isConnected ? 'Connected' : 'Disconnected'}
                </span>
            </div>

            {/* Backend URL indicator - hidden on mobile */}
            <div className="hidden sm:block absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-lg backdrop-blur-sm">
                <span className="text-gray-400 text-xs font-mono">
                    {backendUrl}
                </span>
            </div>

            {/* ESP32 Connection Status */}
            <div className="absolute top-2 sm:top-4 right-2 sm:right-4 flex items-center gap-2 bg-black/70 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl backdrop-blur-sm">
                <div className={`w-2 h-2 rounded-full ${status?.esp32_connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-gray-300 text-xs">
                    {status?.esp32_connected ? 'ESP32 Connected' : 'ESP32 Offline'}
                </span>
                {status?.alarm_active && (
                    <span className="text-red-400 text-xs font-medium animate-pulse">🔔 ALARM</span>
                )}
            </div>

            {/* Alarm Alert Overlay - Shows when water level is 100% */}
            {status?.alarm_active && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="absolute inset-0 bg-red-500/20 animate-pulse" />
                    <div className="bg-red-600/90 px-6 py-4 rounded-xl backdrop-blur-sm animate-bounce">
                        <div className="flex items-center gap-3">
                            <svg className="w-8 h-8 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <div className="text-white">
                                <p className="text-xl font-bold">⚠️ FLOOD ALERT!</p>
                                <p className="text-sm">Water Level: 100%</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Error state */}
            {error && !imageUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90">
                    <div className="text-center p-8">
                        <div className="w-16 h-16 mx-auto mb-4 text-gray-500">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <p className="text-red-400 text-lg mb-2">{error}</p>
                        <p className="text-gray-500 text-sm">
                            Make sure the Python server is running at:
                        </p>
                        <p className="text-gray-400 text-sm font-mono mt-1">
                            {backendUrl}
                        </p>
                    </div>
                </div>
            )}

            {/* Loading state */}
            {!imageUrl && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-gray-400">Connecting to CCTV...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
