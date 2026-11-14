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
---
# VL53L0X laser distance

Time-of-flight laser ranger on I2C (0x29). More precise than ultrasonic and fine on cloth.

## Wiring
Same I2C pins as other sensors (SDA 21, SCL 22 on ESP32).
