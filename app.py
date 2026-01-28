import cv2
import requests
import base64
import os
import time
import threading
import numpy as np
from io import BytesIO

# FastAPI imports
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Configuration
API_KEY = os.getenv("ROBOFLOW_API_KEY", "jNiMay2qC56Egxqnu9Au")
MODEL_ID = "thesis-flood-pixel/4"
CONFIDENCE = 40
OVERLAP = 30
URL = f"https://detect.roboflow.com/{MODEL_ID}"

# RTSP URL from environment variable (for security)
# Default fallback for local testing
RTSP_URL = os.getenv("RTSP_URL", "rtsp://admin:Paulkian@18!@192.168.100.44:554")

# Global variables for threading
latest_frame = None
latest_results = None
latest_processed_frame = None
current_water_level = 0
detected_labels_list = []
stop_threads = False
frame_lock = threading.Lock()
results_lock = threading.Lock()
processed_frame_lock = threading.Lock()

# FastAPI app
app = FastAPI(title="Flood Detection API")

# Add CORS middleware for Vercel frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def inference_worker():
    """
    Worker thread that continuously sends the latest frame to the API.
    """
    global latest_frame, latest_results, stop_threads
    
    print("Inference thread started...")
    
    while not stop_threads:
        # Get the latest frame safely
        current_frame = None
        with frame_lock:
            if latest_frame is not None:
                current_frame = latest_frame.copy()
        
        if current_frame is None:
            time.sleep(0.1)
            continue
            
        # Resize frame for faster upload (optional, but good for speed)
        height, width = current_frame.shape[:2]
        scale = 1.0
        if width > 640:
            scale = 640 / width
            current_frame = cv2.resize(current_frame, (0, 0), fx=scale, fy=scale)

        # Encode frame
        _, img_encoded = cv2.imencode('.jpg', current_frame)
        jpg_as_text = base64.b64encode(img_encoded).decode('utf-8')

        params = {
            "api_key": API_KEY,
            "confidence": CONFIDENCE,
            "overlap": OVERLAP
        }

        try:
            start_time = time.time()
            response = requests.post(
                URL, 
                params=params, 
                data=jpg_as_text, 
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code == 200:
                data = response.json()
                # If we scaled the image, we need to scale the boxes AND points back up
                if scale != 1.0:
                    for pred in data.get('predictions', []):
                        pred['x'] = pred['x'] / scale
                        pred['y'] = pred['y'] / scale
                        pred['width'] = pred['width'] / scale
                        pred['height'] = pred['height'] / scale
                        # Scale segmentation points as well
                        if 'points' in pred:
                            for point in pred['points']:
                                point['x'] = point['x'] / scale
                                point['y'] = point['y'] / scale
                
                with results_lock:
                    latest_results = data
            else:
                pass
                
        except Exception as e:
            print(f"Inference error: {e}")
            time.sleep(1)

# Color mapping for labels (BGR format)
LABEL_COLORS = {
    'green': (0, 255, 0),
    'yellow': (0, 255, 255),
    'orange': (0, 165, 255),
    'red': (0, 0, 255),
}

WATER_LEVEL_MAP = {
    'green': 25,
    'yellow': 50,
    'orange': 75,
    'red': 100,
}

def get_label_color(label):
    """Get color based on label name (case-insensitive)."""
    label_lower = label.lower()
    for key, color in LABEL_COLORS.items():
        if key in label_lower:
            return color
    return (255, 100, 0)

def calculate_water_level(detected_labels):
    """Calculate water level based on detected/missing labels."""
    detected_lower = [label.lower() for label in detected_labels]
    
    green_visible = any('green' in label for label in detected_lower)
    yellow_visible = any('yellow' in label for label in detected_lower)
    orange_visible = any('orange' in label for label in detected_lower)
    red_visible = any('red' in label for label in detected_lower)
    
    water_level = 0
    if not green_visible:
        water_level = 25
    if not yellow_visible and not green_visible:
        water_level = 50
    if not orange_visible and not yellow_visible and not green_visible:
        water_level = 75
    if not red_visible and not orange_visible and not yellow_visible and not green_visible:
        water_level = 100
    
    return water_level

def draw_water_level_indicator(frame, detected_labels):
    """Draw a vertical water level indicator based on detected labels."""
    height, width = frame.shape[:2]
    
    bar_width = 40
    bar_height = 200
    bar_x = width - bar_width - 20
    bar_y = height // 2 - bar_height // 2
    
    water_level = calculate_water_level(detected_labels)
    
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_width, bar_y + bar_height), (50, 50, 50), -1)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_width, bar_y + bar_height), (255, 255, 255), 2)
    
    section_height = bar_height // 4
    section_colors = [
        ((0, 255, 0), 'G', 25),
        ((0, 255, 255), 'Y', 50),
        ((0, 165, 255), 'O', 75),
        ((0, 0, 255), 'R', 100),
    ]
    
    for i, (color, letter, level) in enumerate(section_colors):
        section_y = bar_y + bar_height - (i + 1) * section_height
        cv2.rectangle(frame, (bar_x, section_y), (bar_x + bar_width, section_y + section_height), color, 1)
        cv2.putText(frame, letter, (bar_x + 12, section_y + section_height // 2 + 5), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    
    if water_level > 0:
        fill_height = int(bar_height * water_level / 100)
        fill_y = bar_y + bar_height - fill_height
        
        if water_level >= 100:
            fill_color = (0, 0, 255)
        elif water_level >= 75:
            fill_color = (0, 165, 255)
        elif water_level >= 50:
            fill_color = (0, 255, 255)
        else:
            fill_color = (0, 255, 0)
        
        cv2.rectangle(frame, (bar_x + 2, fill_y), (bar_x + bar_width - 2, bar_y + bar_height - 2), fill_color, -1)
    
    cv2.putText(frame, f"{water_level}%", (bar_x - 5, bar_y - 10), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(frame, "WATER", (bar_x - 10, bar_y + bar_height + 20), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(frame, "LEVEL", (bar_x - 5, bar_y + bar_height + 40), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    return frame, water_level

def draw_predictions_no_overlay(frame, results):
    """Draw predictions on frame WITHOUT water level indicator (for API snapshot)."""
    global current_water_level, detected_labels_list
    
    if not results or 'predictions' not in results:
        current_water_level = calculate_water_level([])
        detected_labels_list = []
        return frame
    
    overlay = frame.copy()
    detected_labels = []
    
    for pred in results['predictions']:
        label = pred['class']
        conf = pred['confidence']
        detected_labels.append(label)
        
        mask_color = get_label_color(label)
        outline_color = mask_color
        text_color = (0, 0, 0)
        bg_color = mask_color
        
        if 'points' in pred and len(pred['points']) > 0:
            points = pred['points']
            pts = np.array([[int(p['x']), int(p['y'])] for p in points], np.int32)
            pts = pts.reshape((-1, 1, 2))
            
            cv2.fillPoly(overlay, [pts], mask_color)
            cv2.polylines(frame, [pts], True, outline_color, 2)
            
            M = cv2.moments(pts)
            if M['m00'] != 0:
                cx = int(M['m10'] / M['m00'])
                cy = int(M['m01'] / M['m00'])
            else:
                cx = int(pred.get('x', pts[0][0][0]))
                cy = int(pred.get('y', pts[0][0][1]))
            
            label_text = f"{label} {conf:.0%}"
            (text_w, text_h), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            
            label_x = cx - text_w // 2
            label_y = cy - text_h // 2
            
            cv2.rectangle(frame, (label_x - 5, label_y - text_h - 5), 
                         (label_x + text_w + 5, label_y + 5), bg_color, -1)
            cv2.putText(frame, label_text, (label_x, label_y), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, text_color, 2)
        else:
            x = pred['x']
            y = pred['y']
            w = pred['width']
            h = pred['height']
            
            x1 = int(x - w/2)
            y1 = int(y - h/2)
            x2 = int(x + w/2)
            y2 = int(y + h/2)
            
            cv2.rectangle(frame, (x1, y1), (x2, y2), outline_color, 2)
            
            label_text = f"{label} {conf:.0%}"
            (text_w, text_h), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            
            cv2.rectangle(frame, (x1, y1 - text_h - 10), (x1 + text_w + 10, y1), bg_color, -1)
            cv2.putText(frame, label_text, (x1 + 5, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, text_color, 2)
    
    alpha = 0.4
    frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
    
    # Update global state for API (no visual overlay drawing)
    current_water_level = calculate_water_level(detected_labels)
    detected_labels_list = detected_labels
        
    return frame

def draw_predictions(frame, results):
    """Draw predictions on frame and return detected labels."""
    global current_water_level, detected_labels_list
    
    if not results or 'predictions' not in results:
        frame, water_level = draw_water_level_indicator(frame, [])
        current_water_level = water_level
        detected_labels_list = []
        return frame
    
    overlay = frame.copy()
    detected_labels = []
    
    for pred in results['predictions']:
        label = pred['class']
        conf = pred['confidence']
        detected_labels.append(label)
        
        mask_color = get_label_color(label)
        outline_color = mask_color
        text_color = (0, 0, 0)
        bg_color = mask_color
        
        if 'points' in pred and len(pred['points']) > 0:
            points = pred['points']
            pts = np.array([[int(p['x']), int(p['y'])] for p in points], np.int32)
            pts = pts.reshape((-1, 1, 2))
            
            cv2.fillPoly(overlay, [pts], mask_color)
            cv2.polylines(frame, [pts], True, outline_color, 2)
            
            M = cv2.moments(pts)
            if M['m00'] != 0:
                cx = int(M['m10'] / M['m00'])
                cy = int(M['m01'] / M['m00'])
            else:
                cx = int(pred.get('x', pts[0][0][0]))
                cy = int(pred.get('y', pts[0][0][1]))
            
            label_text = f"{label} {conf:.0%}"
            (text_w, text_h), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            
            label_x = cx - text_w // 2
            label_y = cy - text_h // 2
            
            cv2.rectangle(frame, (label_x - 5, label_y - text_h - 5), 
                         (label_x + text_w + 5, label_y + 5), bg_color, -1)
            cv2.putText(frame, label_text, (label_x, label_y), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, text_color, 2)
        else:
            x = pred['x']
            y = pred['y']
            w = pred['width']
            h = pred['height']
            
            x1 = int(x - w/2)
            y1 = int(y - h/2)
            x2 = int(x + w/2)
            y2 = int(y + h/2)
            
            cv2.rectangle(frame, (x1, y1), (x2, y2), outline_color, 2)
            
            label_text = f"{label} {conf:.0%}"
            (text_w, text_h), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            
            cv2.rectangle(frame, (x1, y1 - text_h - 10), (x1 + text_w + 10, y1), bg_color, -1)
            cv2.putText(frame, label_text, (x1 + 5, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, text_color, 2)
    
    alpha = 0.4
    frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
    
    frame, water_level = draw_water_level_indicator(frame, detected_labels)
    
    # Update global state for API
    current_water_level = water_level
    detected_labels_list = detected_labels
        
    return frame

# ============ FastAPI Endpoints ============

@app.get("/api/status")
async def get_status():
    """Return current detection status and water level."""
    return {
        "water_level": current_water_level,
        "detected_labels": detected_labels_list,
        "timestamp": time.time(),
        "connected": latest_frame is not None
    }

@app.get("/api/snapshot")
async def get_snapshot():
    """Return the latest processed frame as JPEG."""
    global latest_processed_frame
    
    with processed_frame_lock:
        if latest_processed_frame is None:
            return Response(content="No frame available", status_code=503)
        
        _, img_encoded = cv2.imencode('.jpg', latest_processed_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        return Response(content=img_encoded.tobytes(), media_type="image/jpeg")

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "rtsp_connected": latest_frame is not None}

# ============ Main Video Processing ============

def video_capture_loop():
    """Main loop for capturing and processing video from RTSP stream."""
    global latest_frame, latest_processed_frame, stop_threads
    
    print(f"Connecting to RTSP stream: {RTSP_URL[:30]}...")
    
    # Use RTSP URL instead of webcam
    cap = cv2.VideoCapture(RTSP_URL)
    
    # Set buffer size to reduce latency
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    if not cap.isOpened():
        print("Error: Could not open RTSP stream.")
        print("Please check:")
        print("  1. Camera IP is correct and reachable")
        print("  2. Username/password are correct")
        print("  3. RTSP port (554) is not blocked")
        return

    print("RTSP stream connected successfully!")
    print("Starting threaded inference...")
    
    # Start inference thread
    thread = threading.Thread(target=inference_worker, daemon=True)
    thread.start()
    
    prev_time = 0
    show_window = os.getenv("SHOW_WINDOW", "true").lower() == "true"
    
    try:
        while not stop_threads:
            ret, frame = cap.read()
            if not ret:
                print("Lost connection to RTSP stream, attempting to reconnect...")
                cap.release()
                time.sleep(2)
                cap = cv2.VideoCapture(RTSP_URL)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                continue
                
            # Update global frame for the worker thread
            with frame_lock:
                latest_frame = frame
            
            # Get latest available results
            results = None
            with results_lock:
                results = latest_results
            
            # Draw results on the current frame (for API - no FPS/Level overlays)
            api_frame = frame.copy()
            if results:
                # Draw segmentation masks only (no water level bar since web UI has it)
                api_frame = draw_predictions_no_overlay(api_frame, results)
            
            # For local display - add FPS and water level
            display_frame = frame.copy()
            if results:
                display_frame = draw_predictions(display_frame, results)
            else:
                display_frame, _ = draw_water_level_indicator(display_frame, [])
            
            # FPS Calculation
            curr_time = time.time()
            fps = 1 / (curr_time - prev_time) if prev_time > 0 else 0
            prev_time = curr_time
            
            cv2.putText(display_frame, f"FPS: {int(fps)}", (20, 40), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            
            # Update processed frame for API (clean, no overlays)
            with processed_frame_lock:
                latest_processed_frame = api_frame.copy()
            
            # Optionally show local window
            if show_window:
                cv2.imshow('Flood Detection - RTSP', display_frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
                    
    finally:
        stop_threads = True
        cap.release()
        cv2.destroyAllWindows()
        print("Video capture stopped.")

def run_server():
    """Run the FastAPI server."""
    uvicorn.run(app, host="0.0.0.0", port=8000)

def main():
    """Main entry point - runs both video capture and API server."""
    global stop_threads
    
    print("=" * 50)
    print("Flood Detection System - RTSP + API Server")
    print("=" * 50)
    print(f"RTSP URL: {RTSP_URL[:30]}...")
    print("API will be available at: http://localhost:8000")
    print("Endpoints:")
    print("  - GET /api/status   - Water level & detection data")
    print("  - GET /api/snapshot - Latest processed frame (JPEG)")
    print("  - GET /api/health   - Health check")
    print("=" * 50)
    print("Press 'q' in the video window to quit")
    print()
    
    # Start API server in background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Give server time to start
    time.sleep(1)
    
    # Run video capture in main thread
    try:
        video_capture_loop()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        stop_threads = True

if __name__ == "__main__":
    main()