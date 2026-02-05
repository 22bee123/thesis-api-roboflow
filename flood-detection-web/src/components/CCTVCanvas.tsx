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
    const [alarmToggling, setAlarmToggling] = useState(false);
    const fpsCounterRef = useRef<number[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Toggle alarm on/off
    const toggleAlarm = async () => {
        if (alarmToggling) return;
        setAlarmToggling(true);

        try {
            const endpoint = status?.alarm_active ? '/api/alarm/stop' : '/api/alarm/trigger';
            const response = await fetch(`${backendUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                },
            });

            if (response.ok) {
                // Refresh status immediately
                await fetchStatus();
            }
        } catch (err) {
            console.error('Alarm toggle error:', err);
        } finally {
            setAlarmToggling(false);
        }
    };

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
        <div className="relative w-full h-full min-h-[250px] sm:min-h-[350px] bg-gray-900 rounded-lg sm:rounded-xl overflow-hidden shadow-2xl">
            {/* CCTV Feed Image */}
            {imageUrl && (
                <img
                    src={imageUrl}
                    alt="CCTV Feed"
                    className="w-full h-full object-contain"
                />
            )}

            {/* Water Level Indicator - positioned differently on mobile */}
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

            {/* ESP32 Alarm Toggle Switch */}
            <div className="absolute top-2 sm:top-4 right-2 sm:right-4 flex items-center gap-2 sm:gap-3 bg-black/70 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl backdrop-blur-sm">
                {/* Connection indicator */}
                <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${status?.esp32_connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-gray-300 text-xs">
                        {status?.esp32_connected ? 'ESP32' : 'ESP32 Offline'}
                    </span>
                </div>

                {/* Toggle Switch */}
                <button
                    onClick={toggleAlarm}
                    disabled={alarmToggling || !status?.esp32_connected}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${status?.alarm_active
                            ? 'bg-red-600 focus:ring-red-500'
                            : 'bg-gray-600 focus:ring-gray-500'
                        } ${(!status?.esp32_connected || alarmToggling) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${status?.alarm_active ? 'translate-x-6' : 'translate-x-1'
                            } ${alarmToggling ? 'animate-pulse' : ''}`}
                    />
                </button>

                {/* Alarm status label */}
                <span className={`text-xs font-medium ${status?.alarm_active ? 'text-red-400' : 'text-gray-400'}`}>
                    {alarmToggling ? '...' : (status?.alarm_active ? 'ON' : 'OFF')}
                </span>
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
