// HC-SR04 distance without blocking the loop. Needs SONAR_TRIG / SONAR_ECHO in pins.h.
#include "pins.h"

const unsigned long PING_EVERY_MS = 60;   // CHANGE: faster pings interfere with each other below ~50 ms
const unsigned long ECHO_TIMEOUT_US = 25000; // CHANGE: 25 ms ≈ 4 m; lower it for short-range robots
unsigned long lastPing = 0;
float distanceCm = -1;                    // -1 = no echo yet

void setupSonar() {
  pinMode(SONAR_TRIG, OUTPUT);
  pinMode(SONAR_ECHO, INPUT);             // through a 1k/2k divider on 3.3V boards
}

void updateSonar() {                      // call every loop()
  if (millis() - lastPing < PING_EVERY_MS) return;
  lastPing = millis();
  digitalWrite(SONAR_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(SONAR_TRIG, LOW);
  unsigned long us = pulseIn(SONAR_ECHO, HIGH, ECHO_TIMEOUT_US);
  distanceCm = us ? us / 58.0 : -1;
}
