/*
 * ESP32-CAM Alarm Controller for Flood Detection System
 * 
 * This firmware connects to WiFi and provides HTTP endpoints
 * to control a relay connected to GPIO4 (P4) for alarm triggering.
 * 
 * Endpoints:
 *   GET /trigger-alarm  - Turn ON the alarm relay
 *   GET /stop-alarm     - Turn OFF the alarm relay
 *   GET /status         - Get current alarm state
 * 
 * Hardware:
 *   - ESP32-CAM
 *   - Relay module connected to GPIO4
 */

#include <WiFi.h>
#include <WebServer.h>

// ============ CONFIGURATION ============
// Change these values to match your network
const char* ssid = "YOUR_WIFI_SSID";         // Your WiFi network name
const char* password = "YOUR_WIFI_PASSWORD"; // Your WiFi password

// Relay configuration
const int RELAY_PIN = 4;         // GPIO4 (P4) for relay control
const bool RELAY_ACTIVE_HIGH = true;  // Set to false if relay is active LOW

// ============ GLOBAL VARIABLES ============
WebServer server(80);
bool alarmActive = false;
unsigned long alarmStartTime = 0;
unsigned long alarmDuration = 0;  // 0 = manual control, >0 = auto-off duration in ms

// ============ HELPER FUNCTIONS ============
void setRelay(bool state) {
    if (RELAY_ACTIVE_HIGH) {
        digitalWrite(RELAY_PIN, state ? HIGH : LOW);
    } else {
        digitalWrite(RELAY_PIN, state ? LOW : HIGH);
    }
    alarmActive = state;
    
    if (state) {
        alarmStartTime = millis();
    }
    
    Serial.print("Relay/Alarm: ");
    Serial.println(state ? "ON" : "OFF");
}

// ============ HTTP HANDLERS ============
void handleRoot() {
    String html = "<!DOCTYPE html><html><head>";
    html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
    html += "<title>ESP32 Alarm Controller</title>";
    html += "<style>";
    html += "body { font-family: Arial; text-align: center; margin: 20px; background: #1a1a2e; color: white; }";
    html += ".btn { padding: 20px 40px; margin: 10px; font-size: 20px; border: none; border-radius: 10px; cursor: pointer; }";
    html += ".on { background: #e74c3c; color: white; }";
    html += ".off { background: #27ae60; color: white; }";
    html += ".status { padding: 20px; margin: 20px; border-radius: 10px; font-size: 24px; }";
    html += ".active { background: #e74c3c; }";
    html += ".inactive { background: #27ae60; }";
    html += "</style></head><body>";
    html += "<h1>🚨 Flood Alarm Controller</h1>";
    html += "<div class='status " + String(alarmActive ? "active" : "inactive") + "'>";
    html += "Alarm Status: " + String(alarmActive ? "ACTIVE" : "INACTIVE");
    html += "</div>";
    html += "<br><button class='btn on' onclick=\"fetch('/trigger-alarm').then(()=>location.reload())\">🔔 TRIGGER ALARM</button>";
    html += "<br><button class='btn off' onclick=\"fetch('/stop-alarm').then(()=>location.reload())\">🔕 STOP ALARM</button>";
    html += "<br><br><p>IP Address: " + WiFi.localIP().toString() + "</p>";
    html += "</body></html>";
    
    server.send(200, "text/html", html);
}

void handleTriggerAlarm() {
    // Check if duration parameter is provided
    if (server.hasArg("duration")) {
        alarmDuration = server.arg("duration").toInt() * 1000;  // Convert to ms
    } else {
        alarmDuration = 0;  // Manual control
    }
    
    setRelay(true);
    
    // Enable CORS for cross-origin requests
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", "{\"success\":true,\"alarm\":true,\"message\":\"Alarm triggered\"}");
}

void handleStopAlarm() {
    setRelay(false);
    alarmDuration = 0;
    
    // Enable CORS
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", "{\"success\":true,\"alarm\":false,\"message\":\"Alarm stopped\"}");
}

void handleStatus() {
    String json = "{";
    json += "\"alarm_active\":" + String(alarmActive ? "true" : "false") + ",";
    json += "\"relay_pin\":" + String(RELAY_PIN) + ",";
    json += "\"uptime\":" + String(millis() / 1000) + ",";
    json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
    json += "\"rssi\":" + String(WiFi.RSSI());
    json += "}";
    
    // Enable CORS
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);
}

void handleCORS() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(204);
}

// ============ SETUP ============
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n\n========================================");
    Serial.println("ESP32 Flood Alarm Controller");
    Serial.println("========================================");
    
    // Initialize relay pin
    pinMode(RELAY_PIN, OUTPUT);
    setRelay(false);  // Start with alarm OFF
    
    // Connect to WiFi
    Serial.print("Connecting to WiFi: ");
    Serial.println(ssid);
    
    WiFi.begin(ssid, password);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n\n✅ WiFi Connected!");
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
        Serial.println("\nEndpoints:");
        Serial.println("  http://" + WiFi.localIP().toString() + "/trigger-alarm");
        Serial.println("  http://" + WiFi.localIP().toString() + "/stop-alarm");
        Serial.println("  http://" + WiFi.localIP().toString() + "/status");
    } else {
        Serial.println("\n\n❌ WiFi Connection Failed!");
        Serial.println("Please check your SSID and password");
    }
    
    // Setup HTTP server routes
    server.on("/", handleRoot);
    server.on("/trigger-alarm", HTTP_GET, handleTriggerAlarm);
    server.on("/trigger-alarm", HTTP_OPTIONS, handleCORS);
    server.on("/stop-alarm", HTTP_GET, handleStopAlarm);
    server.on("/stop-alarm", HTTP_OPTIONS, handleCORS);
    server.on("/status", HTTP_GET, handleStatus);
    server.on("/status", HTTP_OPTIONS, handleCORS);
    
    server.begin();
    Serial.println("\nHTTP server started!");
    Serial.println("========================================\n");
}

// ============ MAIN LOOP ============
void loop() {
    server.handleClient();
    
    // Auto-off timer (if duration is set)
    if (alarmActive && alarmDuration > 0) {
        if (millis() - alarmStartTime >= alarmDuration) {
            Serial.println("Auto-stopping alarm (timer expired)");
            setRelay(false);
            alarmDuration = 0;
        }
    }
    
    delay(10);  // Small delay to prevent watchdog issues
}
