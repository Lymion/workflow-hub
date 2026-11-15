---
board: arduino-nano
glyph: NA
color: '#00878A'
price_rm:
- 18
- 18
good_for: Small 5V board that plugs into a breadboard. Simple and beginner-friendly.
watch_out: No wireless and only 2 KB of RAM. A6/A7 are analog input only.
logic_voltage: 5.0
monitor_speed: 9600
pio_board: nanoatmega328new
category: board
specs:
  Logic: 5.0V
  PlatformIO: nanoatmega328new
  Serial: 9600 baud
  Wireless: none
docs:
- title: "Arduino · Nano"
  url: https://docs.arduino.cc/hardware/nano/
- title: "PlatformIO · Arduino Nano board"
  url: https://docs.platformio.org/en/latest/boards/atmelavr/nanoatmega328new.html
---
# Arduino Nano

Same chip as the Uno on a breadboard-friendly board.

## Upload
Clones with the old bootloader need `board = nanoatmega328` in platformio.ini.
