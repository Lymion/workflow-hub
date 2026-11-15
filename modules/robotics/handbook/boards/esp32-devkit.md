---
board: esp32-devkit
glyph: E32
color: '#1F3A5F'
price_rm:
- 25
- 25
good_for: 'The best all-rounder: Wi-Fi, Bluetooth, lots of PWM pins and plenty of speed for robots.'
watch_out: "3.3V logic. GPIO 0, 2, 5, 12 and 15 are strapping pins; 34\u201339 are input-only."
logic_voltage: 3.3
monitor_speed: 115200
pio_board: esp32dev
category: board
specs:
  Logic: 3.3V
  PlatformIO: esp32dev
  Serial: 115200 baud
  Wireless: wifi, ble
docs:
- title: ESP32 Arduino core
  url: https://docs.espressif.com/projects/arduino-esp32/en/latest/
- title: "ESP32 Arduino core · GPIO"
  url: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html
- title: ESP32 datasheet (PDF)
  url: https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf
- title: "PlatformIO · ESP32 DevKit board"
  url: https://docs.platformio.org/en/latest/boards/espressif32/esp32dev.html
---
# ESP32 DevKit V1

Dual-core 240 MHz with Wi-Fi and Bluetooth. The default board for hub robots.

## Pins to avoid
- **GPIO 0, 12**: strapping; a load can stop boot.
- **GPIO 2, 5, 15**: strapping; fine for outputs that tolerate a blip at boot.
- **GPIO 34–39**: input only, no pull-ups.
- **GPIO 1, 3**: USB serial.

## Drivers
CP210x or CH340 USB chip. On Windows, install the CP210x driver from Silicon Labs if no COM port appears.
