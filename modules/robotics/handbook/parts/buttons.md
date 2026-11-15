---
part: buttons
category: input
glyph: BTN
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
---
# Push buttons (6 mm)

Wire one leg to a GPIO and the other to GND, then `pinMode(pin, INPUT_PULLUP)`. Pressed reads LOW.
