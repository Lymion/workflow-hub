---
part: hc-sr04
category: sensor
glyph: US
color: '#0E7490'
library: none
price_rm:
- 5
- 10
pins:
- name: TRIG
  mode: OUTPUT
- name: ECHO
  mode: INPUT
  voltage: 5V
power:
  voltage: 5V
  current_ma: 15
snippet: sensors/hc-sr04-read
warn: ECHO is 5V, use a voltage divider on ESP32
good_for: Measuring distance to obstacles in front of the robot.
watch_out: ECHO is 5V. Use a 1k/2k divider on 3.3V boards.
specs:
  Range: 2–400 cm
  Accuracy: ±3 mm
  Beam angle: 15°
  Frequency: 40 kHz
  Max rate: ~16 reads/s
---
# HC-SR04 ultrasonic sensor

Measures 2–400 cm with a sound ping. Cheap and reliable indoors; blind under 2 cm and on soft surfaces.

> ECHO outputs 5V. On ESP32, put a 1k/2k voltage divider between ECHO and the GPIO.

## How it works
A 10 µs pulse on TRIG fires eight 40 kHz pings. ECHO then stays HIGH for the round trip. Divide the microseconds by 58 to get centimetres.

## Wiring on ESP32
1. **VCC → VIN** (5V) and **GND → GND**.
2. **TRIG → any output pin**. 3.3V is enough to trigger it.
3. **ECHO → 1 kΩ → GPIO**, then **GPIO → 2 kΩ → GND**.

## Common problems
| Problem | Fix |
|---|---|
| Always reads -1 or 0 | ECHO isn't reaching the pin. Check the divider and shared ground. |
| Numbers jump around | Take three readings and use the middle one. |
| Misses soft or angled objects | Aim it straight, or add an IR sensor for close range. |
