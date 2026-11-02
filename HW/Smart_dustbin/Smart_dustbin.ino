#include <ESP8266WiFi.h>
#include <Firebase_ESP_Client.h>
#include <Servo.h>

// =====================================================
//                    WIFI
// =====================================================

#define WIFI_SSID       "SVERI_TP"
#define WIFI_PASSWORD   "12121212"

// =====================================================
//                  FIREBASE
// =====================================================

#define API_KEY         "AIzaSyAOTi9nXQsYf66SamsRT1AfqQhkIhwTfU0"

#define DATABASE_URL    "https://smart-dustbin-b3e9f-default-rtdb.firebaseio.com/"

// =====================================================
//                 FIREBASE OBJECTS
// =====================================================

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// =====================================================
//                    PINS
// =====================================================

#define TRIG_PIN    D3
#define ECHO_PIN    D4
#define SERVO_PIN   D5
#define IR_PIN      D6

// =====================================================
//              DUSTBIN CALIBRATION
// =====================================================

const float EMPTY_DISTANCE = 22.0;
const float FULL_DISTANCE  = 4.0;

// =====================================================
//                  SERVO ANGLES
// =====================================================

const int SERVO_CLOSED = 0;
const int SERVO_OPEN   = 90;

// =====================================================
//                SHUTTER TIMING
// =====================================================

const unsigned long SHUTTER_OPEN_TIME = 3000;

// =====================================================
//                FIREBASE UPDATE
// =====================================================

const unsigned long UPDATE_INTERVAL = 3000;

// =====================================================
//                  VARIABLES
// =====================================================

float distanceCM = 0;
float garbageLevel = 0;

bool shutterOpen = false;

unsigned long shutterOpenedAt = 0;
unsigned long lastFirebaseUpdate = 0;

// =====================================================
//                    SERVO
// =====================================================

Servo dustbinServo;

// =====================================================
//                    SETUP
// =====================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("======================================");
  Serial.println("       SMART DUSTBIN ESP8266");
  Serial.println("======================================");

  // ---------------------------------------------------
  // Ultrasonic
  // ---------------------------------------------------

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  digitalWrite(TRIG_PIN, LOW);

  // ---------------------------------------------------
  // IR SENSOR
  // ---------------------------------------------------

  pinMode(IR_PIN, INPUT);

  // ---------------------------------------------------
  // Servo
  // ---------------------------------------------------

  dustbinServo.attach(SERVO_PIN);

  dustbinServo.write(SERVO_CLOSED);

  Serial.println("Servo initialized.");
  Serial.println("Shutter: CLOSED");

  // ---------------------------------------------------
  // WiFi
  // ---------------------------------------------------

  WiFi.mode(WIFI_STA);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {

    delay(500);

    Serial.print(".");
  }

  Serial.println();

  Serial.println("WiFi Connected!");

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  Serial.print("Signal Strength: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");

  // ---------------------------------------------------
  // Firebase
  // ---------------------------------------------------

  config.api_key = API_KEY;

  config.database_url = DATABASE_URL;

  Serial.println();
  Serial.println("Starting Firebase...");

  // Anonymous authentication

  if (Firebase.signUp(&config, &auth, "", "")) {

    Serial.println("Firebase signup successful!");

  }
  else {

    Serial.println("Firebase signup failed!");

    Serial.print("Error: ");

    Serial.println(
      config.signer.signupError.message.c_str()
    );
  }

  // IMPORTANT FOR ESP8266 SSL

  fbdo.setBSSLBufferSize(4096, 1024);

  Firebase.reconnectNetwork(true);

  Firebase.begin(&config, &auth);

  Serial.println("Firebase initialized.");

  delay(2000);

  // Initial Firebase update

  updateFirebase();

  Serial.println();
  Serial.println("Smart Dustbin is running...");
}

// =====================================================
//                     LOOP
// =====================================================

void loop() {

  // ---------------------------------------------------
  // WiFi reconnection
  // ---------------------------------------------------

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi disconnected!");

    WiFi.reconnect();

    delay(1000);

    return;
  }

  // ---------------------------------------------------
  // Read garbage level
  // ---------------------------------------------------

  distanceCM = readDistance();

  if (distanceCM > 0) {

    garbageLevel = calculateGarbageLevel(distanceCM);
  }

  // ---------------------------------------------------
  // IR MOTION DETECTION
  // ---------------------------------------------------

  int irState = digitalRead(IR_PIN);

  // Most IR sensors are ACTIVE LOW

  if (irState == LOW) {

    Serial.println();
    Serial.println(">>> PERSON DETECTED <<<");

    // -------------------------------------------------
    // Check garbage level
    // -------------------------------------------------

    if (garbageLevel < 90) {

      if (!shutterOpen) {

        openShutter();
      }

    }
    else {

      Serial.println("Dustbin is FULL!");
      Serial.println("Shutter will NOT open.");

      updateShutterFirebase(
        "FULL - CLOSED",
        SERVO_CLOSED
      );
    }
  }

  // ---------------------------------------------------
  // Automatically close shutter
  // ---------------------------------------------------

  if (shutterOpen) {

    if (millis() - shutterOpenedAt >= SHUTTER_OPEN_TIME) {

      closeShutter();
    }
  }

  // ---------------------------------------------------
  // Firebase update
  // ---------------------------------------------------

  if (millis() - lastFirebaseUpdate >= UPDATE_INTERVAL) {

    lastFirebaseUpdate = millis();

    updateFirebase();
  }

  delay(50);
}

// =====================================================
//             READ ULTRASONIC DISTANCE
// =====================================================

float readDistance() {

  digitalWrite(TRIG_PIN, LOW);

  delayMicroseconds(3);

  digitalWrite(TRIG_PIN, HIGH);

  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(
    ECHO_PIN,
    HIGH,
    30000
  );

  if (duration == 0) {

    Serial.println("Ultrasonic timeout!");

    return -1;
  }

  float distance = duration * 0.0343 / 2.0;

  return distance;
}

// =====================================================
//             CALCULATE GARBAGE LEVEL
// =====================================================

float calculateGarbageLevel(float distance) {

  if (distance <= FULL_DISTANCE) {

    return 100;
  }

  if (distance >= EMPTY_DISTANCE) {

    return 0;
  }

  float level =
    ((EMPTY_DISTANCE - distance) /
     (EMPTY_DISTANCE - FULL_DISTANCE))
    * 100.0;

  if (level < 0) {

    level = 0;
  }

  if (level > 100) {

    level = 100;
  }

  return level;
}

// =====================================================
//                  OPEN SHUTTER
// =====================================================

void openShutter() {

  Serial.println();
  Serial.println("Opening shutter...");

  dustbinServo.write(SERVO_OPEN);

  shutterOpen = true;

  shutterOpenedAt = millis();

  Serial.println("Shutter OPEN");

  updateShutterFirebase(
    "OPEN",
    SERVO_OPEN
  );
}

// =====================================================
//                  CLOSE SHUTTER
// =====================================================

void closeShutter() {

  Serial.println();
  Serial.println("Closing shutter...");

  dustbinServo.write(SERVO_CLOSED);

  shutterOpen = false;

  Serial.println("Shutter CLOSED");

  updateShutterFirebase(
    "CLOSED",
    SERVO_CLOSED
  );
}

// =====================================================
//            UPDATE SHUTTER FIREBASE
// =====================================================

void updateShutterFirebase(
  String status,
  int angle
) {

  if (!Firebase.ready()) {

    return;
  }

  Firebase.RTDB.setString(
    &fbdo,
    "/smart_dustbin/shutter/status",
    status
  );

  Firebase.RTDB.setInt(
    &fbdo,
    "/smart_dustbin/shutter/angle",
    angle
  );
}

// =====================================================
//              UPDATE FIREBASE
// =====================================================

void updateFirebase() {

  // ---------------------------------------------------
  // Check distance
  // ---------------------------------------------------

  if (distanceCM <= 0) {

    distanceCM = readDistance();

    if (distanceCM <= 0) {

      return;
    }

    garbageLevel =
      calculateGarbageLevel(distanceCM);
  }

  // ---------------------------------------------------
  // Determine garbage status
  // ---------------------------------------------------

  String garbageStatus;

  if (garbageLevel >= 90) {

    garbageStatus = "FULL";

  }
  else if (garbageLevel >= 70) {

    garbageStatus = "ALMOST FULL";

  }
  else {

    garbageStatus = "NORMAL";
  }

  // ---------------------------------------------------
  // Serial output
  // ---------------------------------------------------

  Serial.println();
  Serial.println("--------------------------------------");

  Serial.print("Distance: ");
  Serial.print(distanceCM);
  Serial.println(" cm");

  Serial.print("Garbage Level: ");
  Serial.print(garbageLevel);
  Serial.println("%");

  Serial.print("Garbage Status: ");
  Serial.println(garbageStatus);

  Serial.print("Shutter: ");

  if (shutterOpen) {

    Serial.println("OPEN");

  }
  else {

    Serial.println("CLOSED");
  }

  // ---------------------------------------------------
  // Firebase ready?
  // ---------------------------------------------------

  if (!Firebase.ready()) {

    Serial.println("Firebase not ready!");

    return;
  }

  // ---------------------------------------------------
  // Garbage level
  // ---------------------------------------------------

  if (Firebase.RTDB.setFloat(
        &fbdo,
        "/smart_dustbin/garbage/level",
        garbageLevel
      )) {

    Serial.println("Garbage level uploaded.");

  }
  else {

    Serial.print("Garbage level error: ");

    Serial.println(
      fbdo.errorReason()
    );
  }

  // ---------------------------------------------------
  // Garbage status
  // ---------------------------------------------------

  if (Firebase.RTDB.setString(
        &fbdo,
        "/smart_dustbin/garbage/status",
        garbageStatus
      )) {

    Serial.println("Garbage status uploaded.");

  }
  else {

    Serial.print("Garbage status error: ");

    Serial.println(
      fbdo.errorReason()
    );
  }

  // ---------------------------------------------------
  // Shutter
  // ---------------------------------------------------

  Firebase.RTDB.setString(
    &fbdo,
    "/smart_dustbin/shutter/status",
    shutterOpen ? "OPEN" : "CLOSED"
  );

  Firebase.RTDB.setInt(
    &fbdo,
    "/smart_dustbin/shutter/angle",
    shutterOpen
      ? SERVO_OPEN
      : SERVO_CLOSED
  );

  // ---------------------------------------------------
  // WiFi
  // ---------------------------------------------------

  Firebase.RTDB.setString(
    &fbdo,
    "/smart_dustbin/system/wifi",
    "Connected"
  );

  // ---------------------------------------------------
  // Last update
  // ---------------------------------------------------

  String updateTime =
    String(millis() / 1000) + " sec";

  Firebase.RTDB.setString(
    &fbdo,
    "/smart_dustbin/system/lastUpdate",
    updateTime
  );

  Serial.println("Firebase update complete.");

  Serial.println("--------------------------------------");
}