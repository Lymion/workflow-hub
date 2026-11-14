// Run code every N ms without delay(). Keeps sensors, motors and serial responsive.
struct Every {
  unsigned long period, last = 0;
  explicit Every(unsigned long ms) : period(ms) {}
  bool due() {
    unsigned long now = millis();
    if (now - last < period) return false;   // overflow-safe
    last = now;
    return true;
  }
};

Every blink(500);    // CHANGE: period in ms
Every report(1000);

void loop() {
  if (blink.due())  digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
  if (report.due()) Serial.println(millis());
}
