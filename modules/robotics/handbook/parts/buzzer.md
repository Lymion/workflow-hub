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
  - {w: 24, d: 14, h: 1.6, color: '#1f4fbf', top: '#2a5ed6'}
  - {kind: cyl, x: 3, r: 6, z: 1.6, h: 9.5, color: '#1d1f24', top: '#2a2d34', inner: '#0b0c0f'}
  - {x: -9.5, w: 2.5, d: 7.6, z: 1.6, h: 2.6, color: '#14171d'}
  - {kind: cyl, x: -9.5, y: -5.5, r: 1.0, z: 1.6, h: 0.12, color: '#d9c27a', inner: '#20242c'}
  - {x: 3, y: -6, w: 8, d: 1.8, z: 1.6, h: 0.1, color: '#2a5ed6', text: 'BUZZER'}
  pins:
    SIG: [-9.5, 0, 4.6]
---
# Active buzzer

Beeps when its pin is HIGH. For tones, use a passive buzzer with `tone()`.
