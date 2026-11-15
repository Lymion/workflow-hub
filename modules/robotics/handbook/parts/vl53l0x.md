---
part: vl53l0x
category: sensor
glyph: ToF
color: '#1F6F8B'
library: Adafruit_VL53L0X
price_rm:
- 12
- 18
interface: i2c
i2c_address: '0x29'
pins:
- name: SDA
  mode: I2C
- name: SCL
  mode: I2C
power:
  voltage: 3.3-5V
  current_ma: 19
good_for: Precise distance up to 2 m, works on soft surfaces.
watch_out: Narrow beam; misses thin objects to the side.
lib_dep: adafruit/Adafruit_VL53L0X
docs:
- title: Adafruit VL53L0X library
  url: https://github.com/adafruit/Adafruit_VL53L0X
- title: "Arduino · Wire (I2C)"
  url: https://docs.arduino.cc/language-reference/en/functions/communication/wire/
model:
  tag: 10
  shapes:
  - {w: 25, d: 13, h: 1.6, color: '#1f2937', top: '#2b3646'}
  - {w: 4.4, d: 2.4, z: 1.6, h: 1, color: '#0b0d12'}
  - {y: 5.2, w: 15.2, d: 2.5, z: 1.6, h: 2.6, color: '#14171d'}
  pins:
    SDA: [1.27, 5.2, 4.6]
    SCL: [-1.27, 5.2, 4.6]
---
# VL53L0X laser distance

Time-of-flight laser ranger on I2C (0x29). More precise than ultrasonic and fine on cloth.

## Wiring
Same I2C pins as other sensors (SDA 21, SCL 22 on ESP32).
