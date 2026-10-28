#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// =====================================================
// KONFIGURASI
// =====================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* MQTT_BROKER = "broker.emqx.io";  // ← sama dengan web
const int   MQTT_PORT   = 1883;              // port TCP untuk ESP
const char* MQTT_TOPIC    = "sensor/ruangan";  // ← DISAMAKAN dengan web
const char* CLIENT_ID     = "3QBPJ8HUU9";

const int INTERVAL = 3000;

// =====================================================
// DHT — TARUH DI SINI (GLOBAL), BUKAN DI DALAM FUNGSI
// =====================================================
#define DHTPIN  D4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);   // ← objek global

// =====================================================
// OBJEK WIFI & MQTT
// =====================================================
WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);
unsigned long lastSend = 0;

// =====================================================
// CONNECT WIFI
// =====================================================
void connectWifi() {
  Serial.print("Menghubungkan ke WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi terhubung! IP: ");
  Serial.println(WiFi.localIP());
}

// =====================================================
// CONNECT MQTT
// =====================================================
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Menghubungkan ke MQTT...");
    if (mqttClient.connect(CLIENT_ID)) {
      Serial.println(" ✅ Terhubung!");
    } else {
      Serial.print(" ❌ Gagal rc=");
      Serial.print(mqttClient.state());
      Serial.println(" | Coba lagi 3 detik...");
      delay(3000);
    }
  }
}

// =====================================================
// KIRIM DATA — bersih, tanpa deklarasi DHT di sini
// =====================================================
void kirimData() {
  float suhu       = dht.readTemperature(); // langsung pakai objek global
  float kelembaban = dht.readHumidity();

  if (isnan(suhu) || isnan(kelembaban)) {
    Serial.println("❌ Gagal baca sensor DHT!");
    return;
  }

  StaticJsonDocument<200> doc;
  doc["suhu"]       = suhu;
  doc["kelembaban"] = kelembaban;
  doc["device"]     = CLIENT_ID;

  char payload[200];
  serializeJson(doc, payload);

  if (mqttClient.publish(MQTT_TOPIC, payload)) {
    Serial.print("📤 Terkirim: ");
    Serial.println(payload);
  } else {
    Serial.println("❌ Gagal kirim!");
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  dht.begin();  // ← start sensor di sini

  Serial.println("=== ESP8266 MQTT Sensor ===");
  connectWifi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastSend >= INTERVAL) {
    lastSend = now;
    kirimData();
  }
}