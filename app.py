import cv2
import requests
import base64
import os
import time
import threading
import queue

# Configuration
API_KEY = "jNiMay2qC56Egxqnu9Au"
MODEL_ID = "thesis-flood-pixel/4"
CONFIDENCE = 40
OVERLAP = 30
URL = f"https://detect.roboflow.com/{MODEL_ID}"

# Global variables for threading
latest_frame = None
latest_results = None
stop_threads = False
frame_lock = threading.Lock()
results_lock = threading.Lock()

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
        # Reducing to 640 width preserves aspect ratio usually
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
                # If we scaled the image, we need to scale the boxes back up
                if scale != 1.0:
                    for pred in data.get('predictions', []):
                        pred['x'] = pred['x'] / scale
                        pred['y'] = pred['y'] / scale
                        pred['width'] = pred['width'] / scale
                        pred['height'] = pred['height'] / scale
                
                with results_lock:
                    latest_results = data
            else:
                # Print error but don't crash
                # print(f"API Error: {response.status_code}") 
                pass
                
        except Exception as e:
            print(f"Inference error: {e}")
            time.sleep(1) # Wait a bit on error before retrying

def draw_predictions(frame, results):
    if not results or 'predictions' not in results:
        return frame
        
    for pred in results['predictions']:
        x = pred['x']
        y = pred['y']
        w = pred['width']
        h = pred['height']
        label = pred['class']
        conf = pred['confidence']
        
        # Calculate coordinates
        x1 = int(x - w/2)
        y1 = int(y - h/2)
        x2 = int(x + w/2)
        y2 = int(y + h/2)
        
        # Colors
        color = (0, 255, 0) # Green for box
        text_color = (0, 0, 0) # Black text
        bg_color = (0, 255, 0) # Green background for label
        
        # Draw Box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        
        # Draw Label with background
        label_text = f"{label} {conf:.0%}"
        (text_w, text_h), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        
        cv2.rectangle(frame, (x1, y1 - text_h - 10), (x1 + text_w + 10, y1), bg_color, -1)
        cv2.putText(frame, label_text, (x1 + 5, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, text_color, 2)
        
    return frame

def main():
    global latest_frame, stop_threads
    
    print("Starting webcam...")
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    # Set webcam resolution (optional, try 1280x720 for better quality if supported)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    # Start inference thread
    thread = threading.Thread(target=inference_worker, daemon=True)
    thread.start()
    
    print("Webcam started. Running threaded inference...")
    print("Press 'q' to quit.")
    
    prev_time = 0
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            # Update global frame for the worker thread
            with frame_lock:
                latest_frame = frame
            
            # Get latest available results
            results = None
            with results_lock:
                results = latest_results
            
            # Draw results on the current frame
            # Use a copy to avoid flickering or race conditions if we were writing to the same array
            display_frame = frame.copy()
            if results:
                display_frame = draw_predictions(display_frame, results)
            
            # FPS Calculation (Display FPS)
            curr_time = time.time()
            fps = 1 / (curr_time - prev_time) if prev_time > 0 else 0
            prev_time = curr_time
            
            cv2.putText(display_frame, f"FPS: {int(fps)}", (20, 40), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            
            cv2.imshow('Roboflow Inference (Threaded)', display_frame)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
                
    finally:
        stop_threads = True
        cap.release()
        cv2.destroyAllWindows()
        print("Exiting...")

if __name__ == "__main__":
    main()