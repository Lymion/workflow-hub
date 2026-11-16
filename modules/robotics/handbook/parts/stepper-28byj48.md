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
docs:
- title: AccelStepper reference
  url: https://www.airspayce.com/mikem/arduino/AccelStepper/
- title: "Arduino · Stepper library"
  url: https://docs.arduino.cc/libraries/stepper/
model:
  tag: 24
  shapes:
  - {kind: cyl, r: 14, h: 19, color: '#c5cbd3', top: '#d9dee5'}
  - {kind: cyl, x: 0, y: -8, r: 4.5, z: 19, h: 1.5, color: '#c5cbd3'}
  - {x: 32, w: 21, d: 35, h: 1.6, color: '#2b6de0', top: '#3b7cf0'}
  - {x: 32, w: 6, d: 18, z: 1.6, h: 4, color: '#1d1f24'}
  - {x: 40, w: 2.5, d: 10.2, z: 1.6, h: 2.6, color: '#14171d'}
  - {x: 0, y: 0, w: 42, d: 7, z: 17.5, h: 1.2, color: '#c5cbd3', top: '#d9dee5'}
  - {kind: cyl, x: -17.5, y: 0, r: 2, z: 18.7, h: 0.12, color: '#9aa3ad', inner: '#20242c'}
  - {kind: cyl, x: 17.5, y: 0, r: 2, z: 18.7, h: 0.12, color: '#9aa3ad', inner: '#20242c'}
  - {kind: cyl, x: 0, y: -8, r: 1.5, z: 20.5, h: 6, color: '#e9c46a'}
  - {x: 0, y: 14.5, w: 14, d: 4, z: 3, h: 12, color: '#3a7bd5'}
  - {x: 32, y: -10, w: 12, d: 6, z: 1.6, h: 0.1, color: '#3b7cf0', text: 'ULN2003'}
  pins:
    IN1: [40, -3.81, 4.6]
    IN2: [40, -1.27, 4.6]
    IN3: [40, 1.27, 4.6]
    IN4: [40, 3.81, 4.6]
---
# 28BYJ-48 stepper + ULN2003

Geared stepper, 2048 steps per turn, with a ULN2003 driver board.

## Code
`AccelStepper stepper(AccelStepper::HALF4WIRE, IN1, IN3, IN2, IN4);` (note the pin order).
