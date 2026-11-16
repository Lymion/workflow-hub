---
part: dht22
category: sensor
glyph: DHT
color: '#0F766E'
library: DHT sensor library
price_rm:
- 10
- 15
pins:
- name: DATA
  mode: INPUT
power:
  voltage: 3.3-5V
  current_ma: 2
good_for: Room or greenhouse climate readings.
watch_out: Read at most once every 2 s. Needs a 10k pull-up on DATA.
signals:
  DATA: climateData
lib_dep: adafruit/DHT sensor library
wokwi:
  element: wokwi-dht22
  pins: {DATA: SDA}
docs:
- title: Adafruit DHT sensor library
  url: https://github.com/adafruit/DHT-sensor-library
model:
  tag: 30
  shapes:
  - {w: 15.1, d: 7.7, h: 25, color: '#e9edf2', top: '#f7f9fb'}
  - {y: 3.9, w: 7.6, d: 1.2, h: 2.6, color: '#14171d'}
  - {x: -4, y: -3.95, w: 2.4, d: 0.5, z: 9, h: 2.4, color: '#c3c9d2'}
  - {x: -4, y: -3.95, w: 2.4, d: 0.5, z: 13.5, h: 2.4, color: '#c3c9d2'}
  - {x: -4, y: -3.95, w: 2.4, d: 0.5, z: 18, h: 2.4, color: '#c3c9d2'}
  - {x: 0, y: -3.95, w: 2.4, d: 0.5, z: 9, h: 2.4, color: '#c3c9d2'}
  - {x: 0, y: -3.95, w: 2.4, d: 0.5, z: 13.5, h: 2.4, color: '#c3c9d2'}
  - {x: 0, y: -3.95, w: 2.4, d: 0.5, z: 18, h: 2.4, color: '#c3c9d2'}
  - {x: 4, y: -3.95, w: 2.4, d: 0.5, z: 9, h: 2.4, color: '#c3c9d2'}
  - {x: 4, y: -3.95, w: 2.4, d: 0.5, z: 13.5, h: 2.4, color: '#c3c9d2'}
  - {x: 4, y: -3.95, w: 2.4, d: 0.5, z: 18, h: 2.4, color: '#c3c9d2'}
  - {x: 0, y: 0, w: 12, d: 6, z: 25, h: 0.1, color: '#f7f9fb', text: 'DHT22'}
  pins:
    DATA: [-1.27, 3.9, 2.8]
---
# DHT22 temperature + humidity

Digital temperature (±0.5 °C) and humidity (±2%) sensor.

## Wiring
DATA to any digital pin with a 10 kΩ pull-up to 3V3.
