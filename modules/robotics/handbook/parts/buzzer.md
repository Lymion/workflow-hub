---
part: buzzer
category: output
glyph: BZ
symbol: buzzer
color: '#3F3F46'
library: none
price_rm:
- 1
- 3
pins:
- name: SIG
  mode: OUTPUT
power:
  voltage: 3.3-5V
  current_ma: 30
good_for: Beeps for alarms, start-up and warnings.
watch_out: Loud at 5V; add a resistor for quieter beeps.
signals:
  SIG: buzzer
wokwi:
  element: wokwi-buzzer
  pins: {SIG: '2'}
docs:
- title: "Arduino · tone()"
  url: https://docs.arduino.cc/language-reference/en/functions/advanced-io/tone/
model:
  tag: 14
  shapes:
  - {kind: cyl, r: 6, h: 9.5, color: '#1d1f24', top: '#2a2d34', inner: '#0b0c0f'}
  pins:
    SIG: [3.2, 5, 1.5]
---
# Active buzzer

Beeps when its pin is HIGH. For tones, use a passive buzzer with `tone()`.
