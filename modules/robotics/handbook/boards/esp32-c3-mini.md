---
board: esp32-c3-mini
glyph: C3
color: '#334155'
price_rm:
- 15
- 15
good_for: Tiny, cheap wireless sensor nodes that sip power.
watch_out: Fewer pins than the DevKit; GPIO 2, 8 and 9 are strapping pins.
logic_voltage: 3.3
monitor_speed: 115200
pio_board: esp32-c3-devkitm-1
category: board
specs:
  Logic: 3.3V
  PlatformIO: esp32-c3-devkitm-1
  Serial: 115200 baud
  Wireless: wifi, ble
docs:
- title: ESP32 Arduino core
  url: https://docs.espressif.com/projects/arduino-esp32/en/latest/
- title: ESP32-C3 datasheet (PDF)
  url: https://www.espressif.com/sites/default/files/documentation/esp32-c3_datasheet_en.pdf
- title: "PlatformIO · ESP32-C3 DevKitM-1 board"
  url: https://docs.platformio.org/en/latest/boards/espressif32/esp32-c3-devkitm-1.html
---
# ESP32-C3 Super Mini

Single-core RISC-V with Wi-Fi and BLE, about the size of a thumbnail.

## USB
Uses native USB; the hub sets `ARDUINO_USB_CDC_ON_BOOT=1` so Serial works over USB.
