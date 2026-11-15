---
part: ir-tcrt5000
category: sensor
glyph: IR
color: '#7C3AED'
library: none
price_rm:
- 3
- 5
pins:
- name: DO
  mode: INPUT
- name: AO
  mode: ANALOG
  optional: true
power:
  voltage: 3.3-5V
  current_ma: 20
good_for: Following a black line on the floor.
watch_out: Strong sunlight confuses it. Mount 3–8 mm above the floor.
signals:
  DO: lineSensor
docs:
- title: "Arduino · analogRead()"
  url: https://docs.arduino.cc/language-reference/en/functions/analog-io/analogRead/
- title: "Arduino · digitalRead()"
  url: https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalread/
model:
  tag: 10
  shapes:
  - {w: 32, d: 14, h: 1.6, color: '#2257c2', top: '#2a64d4'}
  - {x: -12, w: 6, d: 10, z: 1.6, h: 4, color: '#1d1f24'}
  - {kind: cyl, x: 4, y: -2, r: 3.2, z: 1.6, h: 5, color: '#2f6fe0'}
  - {x: 14, w: 2.5, d: 10.2, z: 1.6, h: 2.6, color: '#14171d'}
  pins:
    DO: [14, 1.27, 4.6]
    AO: [14, 3.81, 4.6]
---
# IR line sensor (TCRT5000)

Infrared reflector. DO goes LOW over a white surface and HIGH over black (set the threshold with the trimmer).

## Tips
Use two or three side by side for a line follower; read AO for smoother steering.
