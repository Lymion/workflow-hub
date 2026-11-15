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
---
# IR line sensor (TCRT5000)

Infrared reflector. DO goes LOW over a white surface and HIGH over black (set the threshold with the trimmer).

## Tips
Use two or three side by side for a line follower; read AO for smoother steering.
