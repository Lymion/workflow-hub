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
