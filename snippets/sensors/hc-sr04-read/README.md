# HC-SR04 non-blocking read

What it does: pings every 60 ms and stores the distance in `distanceCm` (-1 when no echo comes back), without freezing the motor loop.

Dependencies: none. Needs `SONAR_TRIG` and `SONAR_ECHO` in `pins.h` (the wiring view writes them).

Change points: `PING_EVERY_MS` and `ECHO_TIMEOUT_US` (marked `CHANGE:`).

Watch out: ECHO is 5V. On ESP32 use a 1k/2k voltage divider.
