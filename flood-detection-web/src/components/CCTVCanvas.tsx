'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
    const fpsCounterRef = useRef<number[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Fetch status from backend
    const fetchStatus = useCallback(async () => {
        try {
            const response = await fetch(`${backendUrl}/api/status`, {
                signal: abortControllerRef.current?.signal,
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                },
            });

            if (response.ok) {
                const data: CCTVStatus = await response.json();
                setStatus(data);
                setIsConnected(data.connected);
                setError(null);
                onStatusUpdate?.(data);
            } else {
                throw new Error(`Status error: ${response.status}`);
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Status fetch error:', err);
            }
        }
    }, [backendUrl, onStatusUpdate]);

    // Fetch snapshot from backend
    const fetchSnapshot = useCallback(async () => {
        try {
            // Add timestamp to prevent caching
            const url = `${backendUrl}/api/snapshot?t=${Date.now()}`;

            const response = await fetch(url, {
                signal: abortControllerRef.current?.signal,
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                },
            });

            if (response.ok) {
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);

                // Revoke old URL to prevent memory leak
                if (imageUrl) {
                    URL.revokeObjectURL(imageUrl);
                }

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
            if ((err as Error).name !== 'AbortError') {
                console.error('Snapshot fetch error:', err);
                setError('Cannot connect to backend server');
                setIsConnected(false);
            }
        }
    }, [backendUrl, imageUrl]);

    // Polling loop
    useEffect(() => {
        abortControllerRef.current = new AbortController();

        // Initial fetch
        fetchSnapshot();
        fetchStatus();

        // Set up intervals
        const snapshotInterval = setInterval(fetchSnapshot, 200); // ~5 FPS
        const statusInterval = setInterval(fetchStatus, 1000); // 1 Hz for status

        return () => {
            abortControllerRef.current?.abort();
            clearInterval(snapshotInterval);
            clearInterval(statusInterval);
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [fetchSnapshot, fetchStatus]);

    // Cleanup imageUrl on unmount
    useEffect(() => {
        return () => {
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl]);

    return (
        <div className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
            {/* CCTV Feed Image */}
            {imageUrl && (
                <img
                    src={imageUrl}
                    alt="CCTV Feed"
                    className="w-full h-full object-contain"
                />
            )}

            {/* Water Level Indicator */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <WaterLevelIndicator waterLevel={status?.water_level ?? 0} />
            </div>

            {/* FPS Counter */}
            <div className="absolute top-4 left-4 bg-black/50 px-3 py-2 rounded-lg backdrop-blur-sm">
                <span className="text-yellow-400 font-bold text-lg">
                    FPS: {fps}
                </span>
            </div>

            {/* Connection Status */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 px-3 py-2 rounded-lg backdrop-blur-sm">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-white text-sm font-medium">
                    {isConnected ? 'CCTV Connected' : 'Disconnected'}
                </span>
            </div>

            {/* Backend URL indicator */}
            <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-lg backdrop-blur-sm">
                <span className="text-gray-400 text-xs font-mono">
                    {backendUrl}
                </span>
            </div>

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
