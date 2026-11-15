---
part: buttons
category: input
glyph: BTN
symbol: switch
color: '#52525B'
library: none
price_rm:
- 1
- 3
pins:
- name: BTN
  mode: INPUT_PULLUP
power:
  voltage: '-'
  current_ma: 0
good_for: Start, stop and mode buttons.
watch_out: Use INPUT_PULLUP and debounce in code.
signals:
  BTN: button
wokwi:
  element: wokwi-pushbutton
  pins: {BTN: 1.l}
docs:
- title: "Arduino · digitalRead()"
  url: https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalread/
- title: "Arduino · pinMode()"
  url: https://docs.arduino.cc/language-reference/en/functions/digital-io/pinMode/
- title: "Arduino · attachInterrupt()"
  url: https://docs.arduino.cc/language-reference/en/functions/external-interrupts/attachInterrupt/
model:
  tag: 12
  shapes:
  - {w: 12, d: 12, h: 3.5, color: '#2b2e35', top: '#353942'}
  - {kind: cyl, r: 3.5, z: 3.5, h: 2.2, color: '#e5484d', top: '#ff6b70'}
  pins:
    BTN: [6, 4, 2]
---
# Push buttons (6 mm)

Wire one leg to a GPIO and the other to GND, then `pinMode(pin, INPUT_PULLUP)`. Pressed reads LOW.
