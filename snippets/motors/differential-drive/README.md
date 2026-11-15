# Differential drive (L298N)

What it does: `drive(left, right)` with -255..255 per side, plus `stopMotors()` and `turnInPlace()`.

Dependencies: ESP32 Arduino core 3.x (`ledcAttach`). On core 2.x use `ledcSetup` + `ledcAttachPin`.

Change points: PWM frequency and left trim (marked `CHANGE:`).
