---
part: tt-motor
category: actuator
glyph: TT
symbol: motor
color: '#CA8A04'
library: none
price_rm:
- 5
- 7
pins:
- name: M+
  mode: MOTOR
- name: M-
  mode: MOTOR
power:
  voltage: 3-6V
  current_ma: 150
stall_ma: 1500
good_for: Cheap wheels for small 2WD robots.
watch_out: Stall current up to 1.5 A each. Needs a driver, never a GPIO pin.
docs:
- title: "Arduino · analogWrite()"
  url: https://docs.arduino.cc/language-reference/en/functions/analog-io/analogWrite/
- title: "ESP32 Arduino core · LEDC (PWM)"
  url: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html
model:
  tag: 22
  shapes:
  - {w: 37, d: 22, h: 18.5, color: '#f2b705', top: '#f8c936'}
  - {x: 12, w: 4, d: 26, z: 7.5, h: 4, color: '#f3f3f3'}
  - {x: -14, w: 8, d: 10, z: 4, h: 10, color: '#e8e8ea'}
  - {x: -1, y: 0, w: 16, d: 9, z: 18.5, h: 0.1, color: '#f8c936', text: 'TT MOTOR'}
  - {kind: cyl, x: 9, y: -7, r: 1.3, z: 18.5, h: 0.12, color: '#c99a04', inner: '#20242c'}
  - {kind: cyl, x: 9, y: 7, r: 1.3, z: 18.5, h: 0.12, color: '#c99a04', inner: '#20242c'}
  - {kind: cyl, x: 12, y: 13.3, r: 2.2, z: 7.5, h: 0.5, color: '#f3f3f3', inner: '#c9c9cc'}
  - {x: -18.3, y: -2.5, w: 0.6, d: 1.6, z: 7, h: 4, color: '#d6b25a'}
  - {x: -18.3, y: 2.5, w: 0.6, d: 1.6, z: 7, h: 4, color: '#d6b25a'}
  pins:
    M+: [-18, -2.5, 9]
    M-: [-18, 2.5, 9]
---
# TT gear motor

Yellow plastic gearbox motor (1:48) with a wheel. About 200 RPM at 6V.

## Wiring
Connect both wires to a driver output (OUT1/OUT2 on the L298N). Swap the wires if it spins backwards.

## Tips
- Solder a 100 nF capacitor across the terminals to cut electrical noise.
- Two motors never run at exactly the same speed; trim in code.
