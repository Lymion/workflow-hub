---
note: esp32-boot-loops
tags:
- esp32
- power
---
# ESP32 boot loops

## Brownout
`Brownout detector was triggered` means the supply dipped, usually when motors start. Power motors from their own battery and join grounds.

## Strapping pins
GPIO 0, 2, 5, 12 and 15 set boot modes. A load on GPIO 12 can stop boot; move it.
