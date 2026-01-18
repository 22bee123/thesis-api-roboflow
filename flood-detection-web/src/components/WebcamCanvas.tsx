'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { DetectionResult } from '@/lib/types';
import { drawPredictions, calculateWaterLevel } from '@/lib/drawPredictions';
import WaterLevelIndicator from './WaterLevelIndicator';

interface WebcamCanvasProps {
    onFpsUpdate?: (fps: number) => void;
}

export default function WebcamCanvas({ onFpsUpdate }: WebcamCanvasProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | null>(null);
    const lastInferenceTime = useRef<number>(0);
    const fpsCounterRef = useRef<number[]>([]);

    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [waterLevel, setWaterLevel] = useState(0);
    const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [displayFps, setDisplayFps] = useState(0);

    // Inference interval in ms (~5 FPS for API calls to balance performance)
    const INFERENCE_INTERVAL = 200;

    const startWebcam = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment', // Prefer back camera on mobile
                },
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setIsStreaming(true);
                setError(null);
            }
        } catch (err) {
            console.error('Webcam error:', err);
            setError('Could not access webcam. Please allow camera permissions.');
        }
    }, []);

    const stopWebcam = useCallback(() => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsStreaming(false);
    }, []);

    const captureAndInfer = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current || isProcessing) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to match video
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        // Draw current video frame
        ctx.drawImage(video, 0, 0);

        // Check if we should run inference
        const now = performance.now();
        if (now - lastInferenceTime.current < INFERENCE_INTERVAL) {
            // Just redraw predictions from last result
            if (detectionResult) {
                const labels = drawPredictions(ctx, detectionResult, canvas.width, canvas.height);
                setWaterLevel(calculateWaterLevel(labels));
            }
            return;
        }

        lastInferenceTime.current = now;
        setIsProcessing(true);

        try {
            // Resize for faster upload (640px width)
            const scale = Math.min(1, 640 / video.videoWidth);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = video.videoWidth * scale;
            tempCanvas.height = video.videoHeight * scale;
            const tempCtx = tempCanvas.getContext('2d');

            if (tempCtx) {
                tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
                const base64 = tempCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];

                const response = await fetch('/api/detect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64 }),
                });

                if (response.ok) {
                    const data: DetectionResult = await response.json();

                    // Scale predictions back up if we resized
                    if (scale !== 1) {
                        for (const pred of data.predictions || []) {
                            pred.x /= scale;
                            pred.y /= scale;
                            pred.width /= scale;
                            pred.height /= scale;
                            if (pred.points) {
                                for (const point of pred.points) {
                                    point.x /= scale;
                                    point.y /= scale;
                                }
                            }
                        }
                    }

                    setDetectionResult(data);
                    const labels = drawPredictions(ctx, data, canvas.width, canvas.height);
                    setWaterLevel(calculateWaterLevel(labels));
                }
            }
        } catch (err) {
            console.error('Inference error:', err);
        } finally {
            setIsProcessing(false);
        }
    }, [isProcessing, detectionResult]);

    // Animation loop
    const animate = useCallback(() => {
        if (!isStreaming) return;

        // Calculate FPS
        const now = performance.now();
        fpsCounterRef.current.push(now);
        fpsCounterRef.current = fpsCounterRef.current.filter(t => now - t < 1000);
        const fps = fpsCounterRef.current.length;
        setDisplayFps(fps);
        onFpsUpdate?.(fps);

        captureAndInfer();
        requestRef.current = requestAnimationFrame(animate);
    }, [isStreaming, captureAndInfer, onFpsUpdate]);

    useEffect(() => {
        if (isStreaming) {
            requestRef.current = requestAnimationFrame(animate);
        }
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [isStreaming, animate]);

    // Auto-start webcam on mount
    useEffect(() => {
        startWebcam();
        return () => stopWebcam();
    }, [startWebcam, stopWebcam]);

    return (
        <div className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
            {/* Hidden video element */}
            <video
                ref={videoRef}
                className="hidden"
                playsInline
                muted
            />

            {/* Canvas overlay */}
            <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
            />

            {/* Water Level Indicator */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <WaterLevelIndicator waterLevel={waterLevel} />
            </div>

            {/* FPS Counter */}
            <div className="absolute top-4 left-4 bg-black/50 px-3 py-2 rounded-lg backdrop-blur-sm">
                <span className="text-yellow-400 font-bold text-lg">
                    FPS: {displayFps}
                </span>
            </div>

            {/* Processing indicator */}
            {isProcessing && (
                <div className="absolute top-4 right-4 bg-blue-500/80 px-3 py-1 rounded-full backdrop-blur-sm">
                    <span className="text-white text-sm font-medium animate-pulse">
                        Processing...
                    </span>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90">
                    <div className="text-center p-8">
                        <p className="text-red-400 text-lg mb-4">{error}</p>
                        <button
                            onClick={startWebcam}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            )}

            {/* Loading state */}
            {!isStreaming && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-gray-400">Starting webcam...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
