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
---
# DHT22 temperature + humidity

Digital temperature (±0.5 °C) and humidity (±2%) sensor.

## Wiring
DATA to any digital pin with a 10 kΩ pull-up to 3V3.
