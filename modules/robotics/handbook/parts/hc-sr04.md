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
signals:
  TRIG: sonarTrig
  ECHO: sonarEcho
wokwi:
  element: wokwi-hc-sr04
docs:
- title: "Arduino · pulseIn()"
  url: https://docs.arduino.cc/language-reference/en/functions/advanced-io/pulseIn/
- title: "Arduino · digitalWrite()"
  url: https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalwrite/
model:
  tag: 16
  shapes:
  - {w: 45, d: 20, h: 1.6, color: '#2257c2', top: '#2a64d4'}
  - {kind: cyl, x: -13, r: 7.6, z: 1.6, h: 12, color: '#c5cbd3', top: '#d9dee5', inner: '#3a404c'}
  - {kind: cyl, x: 13, r: 7.6, z: 1.6, h: 12, color: '#c5cbd3', top: '#d9dee5', inner: '#3a404c'}
  - {y: -5, w: 6, d: 3, z: 1.6, h: 1.6, color: '#d8dbe0'}
  - {y: 8.5, w: 10.2, d: 2.5, z: 1.6, h: 2.6, color: '#14171d'}
  - {x: 0, y: -8, w: 14, d: 3, z: 1.6, h: 0.1, color: '#2a64d4', text: 'HC-SR04'}
  - {kind: cyl, x: -13, r: 7.6, z: 13.6, h: 0.15, color: '#c5cbd3', inner: '#2a2f38'}
  - {x: -13, y: 0, w: 4, d: 4, z: 13.75, h: 0.1, color: '#3a404c', text: 'T'}
  - {x: 13, y: 0, w: 4, d: 4, z: 13.75, h: 0.1, color: '#3a404c', text: 'R'}
  - {kind: cyl, x: -20.5, y: -8, r: 1.1, z: 1.6, h: 0.12, color: '#d9c27a', inner: '#20242c'}
  - {kind: cyl, x: 20.5, y: -8, r: 1.1, z: 1.6, h: 0.12, color: '#d9c27a', inner: '#20242c'}
  - {kind: cyl, x: -20.5, y: 8, r: 1.1, z: 1.6, h: 0.12, color: '#d9c27a', inner: '#20242c'}
  - {kind: cyl, x: 20.5, y: 8, r: 1.1, z: 1.6, h: 0.12, color: '#d9c27a', inner: '#20242c'}
  pins:
    VCC: [-3.81, 8.5, 4.6]
    TRIG: [-1.27, 8.5, 4.6]
    ECHO: [1.27, 8.5, 4.6]
    GND: [3.81, 8.5, 4.6]
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
