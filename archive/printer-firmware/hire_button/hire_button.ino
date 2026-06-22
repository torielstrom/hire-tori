/*
 * Hire Tori — the physical button.
 *
 * An ESP32 with one push-button and the onboard LED.
 *  - Press the button  -> fires a `hire_button_pressed` event straight into PostHog
 *                         (yes, an event from a microcontroller) AND pokes Maxine's
 *                         /hire endpoint so the agent reacts on the printer.
 *  - Onboard LED       -> mirrors printer state polled from the agent /status:
 *                         solid = idle/ready, slow pulse = printing, fast blink = error.
 *
 * Wiring: button between BUTTON_PIN and GND (uses internal pull-up).
 * Boards: any ESP32 dev board (Arduino core for ESP32).
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ---------- CONFIG: fill these in ----------
const char* WIFI_SSID     = "your-wifi";
const char* WIFI_PASS     = "your-wifi-password";

// Maxine's HTTP bridge (agent/server.py) on your LAN:
const char* AGENT_BASE    = "http://192.168.1.50:8787";

// PostHog so the button reports for itself, even if the agent is offline:
const char* POSTHOG_HOST  = "https://us.i.posthog.com";
const char* POSTHOG_KEY   = "phc_xxx";
const char* DISTINCT_ID   = "tori-superday";

const int BUTTON_PIN = 0;        // BOOT button on many ESP32 boards; or wire your own
const int LED_PIN    = 2;        // onboard LED on many ESP32 boards
// -------------------------------------------

unsigned long lastPoll = 0;
String printerState = "unknown";

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.printf(" connected: %s\n", WiFi.localIP().toString().c_str());
}

void postJSON(const String& url, const String& body) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  Serial.printf("POST %s -> %d\n", url.c_str(), code);
  http.end();
}

void firePostHog() {
  String body = String("{\"api_key\":\"") + POSTHOG_KEY +
                "\",\"event\":\"hire_button_pressed\",\"distinct_id\":\"" + DISTINCT_ID +
                "\",\"properties\":{\"source\":\"esp32-hardware\",\"$lib\":\"esp32\"}}";
  postJSON(String(POSTHOG_HOST) + "/capture/", body);
}

void pokeAgent() {
  postJSON(String(AGENT_BASE) + "/hire", "{\"source\":\"esp32-hardware\"}");
}

void pollStatus() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(AGENT_BASE) + "/status");
  if (http.GET() == 200) {
    String payload = http.getString();
    int i = payload.indexOf("\"state\":\"");
    if (i >= 0) {
      i += 9;
      printerState = payload.substring(i, payload.indexOf("\"", i));
    }
  }
  http.end();
}

void updateLED() {
  unsigned long t = millis();
  if (printerState == "printing")      digitalWrite(LED_PIN, (t / 800) % 2);   // slow pulse
  else if (printerState == "error")    digitalWrite(LED_PIN, (t / 150) % 2);   // fast blink
  else                                  digitalWrite(LED_PIN, HIGH);            // solid = ready
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  connectWiFi();
}

void loop() {
  static bool wasDown = false;
  bool isDown = digitalRead(BUTTON_PIN) == LOW;
  if (isDown && !wasDown) {            // rising edge = press
    Serial.println("Hire button pressed!");
    firePostHog();
    pokeAgent();
    delay(250);                        // debounce
  }
  wasDown = isDown;

  if (millis() - lastPoll > 4000) {    // poll printer state every 4s
    lastPoll = millis();
    pollStatus();
  }
  updateLED();
  delay(20);
}
