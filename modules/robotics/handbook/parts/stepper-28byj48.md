---
part: stepper-28byj48
category: actuator
glyph: ST
color: '#475569'
library: AccelStepper
price_rm:
- 8
- 11
pins:
- name: IN1
  mode: OUTPUT
- name: IN2
  mode: OUTPUT
- name: IN3
  mode: OUTPUT
- name: IN4
  mode: OUTPUT
power:
  voltage: 5V
  current_ma: 240
good_for: Slow, exact positioning like dials, blinds or turntables.
watch_out: Slow and weak; not for driving wheels.
signals:
  IN1: stepperIn1
  IN2: stepperIn2
  IN3: stepperIn3
  IN4: stepperIn4
lib_dep: waspinator/AccelStepper
---
# 28BYJ-48 stepper + ULN2003

Geared stepper, 2048 steps per turn, with a ULN2003 driver board.

## Code
`AccelStepper stepper(AccelStepper::HALF4WIRE, IN1, IN3, IN2, IN4);` (note the pin order).
