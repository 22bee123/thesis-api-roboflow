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
                # Print error but don't crash
                # print(f"API Error: {response.status_code}") 
                pass
                
        except Exception as e:
            print(f"Inference error: {e}")
            time.sleep(1) # Wait a bit on error before retrying

# Color mapping for labels (BGR format)
LABEL_COLORS = {
    'green': (0, 255, 0),      # Green
    'yellow': (0, 255, 255),   # Yellow
    'orange': (0, 165, 255),   # Orange
    'red': (0, 0, 255),        # Red
}

# Water level mapping: which labels covered = what percentage
# Green covered = 25%, Yellow covered = 50%, Orange covered = 75%, Red covered = 100%
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
    # Default color if no match
    return (255, 100, 0)  # Blue-ish default

def draw_water_level_indicator(frame, detected_labels):
    """
    Draw a vertical water level indicator based on detected labels.
    The bar fills up based on which color labels are covered by water.
    """
    height, width = frame.shape[:2]
    
    # Indicator dimensions and position (right side of frame)
    bar_width = 40
    bar_height = 200
    bar_x = width - bar_width - 20
    bar_y = height // 2 - bar_height // 2
    
    # Calculate water level percentage based on MISSING (covered by water) labels
    # If a color is NOT detected, it means it's covered by water
    # All 4 visible = 0%, green missing = 25%, green+yellow missing = 50%, etc.
    
    detected_lower = [label.lower() for label in detected_labels]
    
    # Check which colors are detected (visible, not covered)
    green_visible = any('green' in label for label in detected_lower)
    yellow_visible = any('yellow' in label for label in detected_lower)
    orange_visible = any('orange' in label for label in detected_lower)
    red_visible = any('red' in label for label in detected_lower)
    
    # Calculate water level based on missing colors (from bottom up: green, yellow, orange, red)
    water_level = 0
    if not green_visible:
        water_level = 25  # Green is covered
    if not yellow_visible and not green_visible:
        water_level = 50  # Yellow is covered
    if not orange_visible and not yellow_visible and not green_visible:
        water_level = 75  # Orange is covered
    if not red_visible and not orange_visible and not yellow_visible and not green_visible:
        water_level = 100  # All covered
    
    # Draw the background (empty bar)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_width, bar_y + bar_height), (50, 50, 50), -1)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_width, bar_y + bar_height), (255, 255, 255), 2)
    
    # Draw the 4 level sections with colors (from bottom to top: green, yellow, orange, red)
    section_height = bar_height // 4
    section_colors = [
        ((0, 255, 0), 'G', 25),      # Green - bottom (25%)
        ((0, 255, 255), 'Y', 50),    # Yellow (50%)
        ((0, 165, 255), 'O', 75),    # Orange (75%)
        ((0, 0, 255), 'R', 100),     # Red - top (100%)
    ]
    
    for i, (color, letter, level) in enumerate(section_colors):
        section_y = bar_y + bar_height - (i + 1) * section_height
        # Draw section outline
        cv2.rectangle(frame, (bar_x, section_y), (bar_x + bar_width, section_y + section_height), color, 1)
        # Draw letter label
        cv2.putText(frame, letter, (bar_x + 12, section_y + section_height // 2 + 5), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    
    # Fill the bar based on water level (fill from bottom up)
    if water_level > 0:
        fill_height = int(bar_height * water_level / 100)
        fill_y = bar_y + bar_height - fill_height
        
        # Determine fill color based on water level
        if water_level >= 100:
            fill_color = (0, 0, 255)  # Red
        elif water_level >= 75:
            fill_color = (0, 165, 255)  # Orange
        elif water_level >= 50:
            fill_color = (0, 255, 255)  # Yellow
        else:
            fill_color = (0, 255, 0)  # Green
        
        # Draw filled portion directly (no transparency needed for the fill)
        cv2.rectangle(frame, (bar_x + 2, fill_y), (bar_x + bar_width - 2, bar_y + bar_height - 2), fill_color, -1)
    
    # Draw water level percentage text
    cv2.putText(frame, f"{water_level}%", (bar_x - 5, bar_y - 10), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(frame, "WATER", (bar_x - 10, bar_y + bar_height + 20), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(frame, "LEVEL", (bar_x - 5, bar_y + bar_height + 40), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    return frame

def draw_predictions(frame, results):
    import numpy as np
    
    if not results or 'predictions' not in results:
        # Still draw the water level indicator even with no detections
        frame = draw_water_level_indicator(frame, [])
        return frame
    
    # Create an overlay for transparent masks
    overlay = frame.copy()
    
    # Collect all detected labels for water level calculation
    detected_labels = []
    
    for pred in results['predictions']:
        label = pred['class']
        conf = pred['confidence']
        detected_labels.append(label)
        
        # Get colors based on label name
        mask_color = get_label_color(label)
        outline_color = mask_color
        text_color = (0, 0, 0)  # Black text
        bg_color = mask_color  # Use label color for background
        
        # Check if segmentation points are available
        if 'points' in pred and len(pred['points']) > 0:
            # Instance Segmentation: Draw polygon mask
            points = pred['points']
            # Convert points to numpy array of integers
            pts = np.array([[int(p['x']), int(p['y'])] for p in points], np.int32)
            pts = pts.reshape((-1, 1, 2))
            
            # Draw filled polygon on overlay
            cv2.fillPoly(overlay, [pts], mask_color)
            
            # Draw polygon outline
            cv2.polylines(frame, [pts], True, outline_color, 2)
            
            # Get centroid for label placement
            M = cv2.moments(pts)
            if M['m00'] != 0:
                cx = int(M['m10'] / M['m00'])
                cy = int(M['m01'] / M['m00'])
            else:
                # Fallback to bounding box center
                cx = int(pred.get('x', pts[0][0][0]))
                cy = int(pred.get('y', pts[0][0][1]))
            
            # Draw Label with background
            label_text = f"{label} {conf:.0%}"
            (text_w, text_h), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            
            # Position label near centroid
            label_x = cx - text_w // 2
            label_y = cy - text_h // 2
            
            cv2.rectangle(frame, (label_x - 5, label_y - text_h - 5), 
                         (label_x + text_w + 5, label_y + 5), bg_color, -1)
            cv2.putText(frame, label_text, (label_x, label_y), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, text_color, 2)
        else:
            # Fallback to bounding box if no segmentation points
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
    
    # Blend the overlay with the original frame for transparency
    alpha = 0.4  # Transparency factor (0.0 to 1.0)
    frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
    
    # Draw water level indicator
    frame = draw_water_level_indicator(frame, detected_labels)
        
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