// Two DC motors through an L298N: drive(left, right) with -255..255 per side.
#include "pins.h"

const int PWM_FREQ = 20000;   // CHANGE: 20 kHz is silent; drop to 1000 if the driver gets hot
const int PWM_BITS = 8;

void setupMotors() {
  pinMode(LEFT_MOTOR_IN1, OUTPUT);  pinMode(LEFT_MOTOR_IN2, OUTPUT);
  pinMode(RIGHT_MOTOR_IN3, OUTPUT); pinMode(RIGHT_MOTOR_IN4, OUTPUT);
  ledcAttach(LEFT_MOTOR_PWM, PWM_FREQ, PWM_BITS);   // ESP32 core 3.x
  ledcAttach(RIGHT_MOTOR_PWM, PWM_FREQ, PWM_BITS);
}

static void side(int in1, int in2, int pwmPin, int speed) {
  speed = constrain(speed, -255, 255);
  digitalWrite(in1, speed > 0);
  digitalWrite(in2, speed < 0);
  ledcWrite(pwmPin, abs(speed));
}

void drive(int left, int right) {
  const float TRIM_LEFT = 1.0;  // CHANGE: lower to 0.95 if the robot pulls left
  side(LEFT_MOTOR_IN1, LEFT_MOTOR_IN2, LEFT_MOTOR_PWM, left * TRIM_LEFT);
  side(RIGHT_MOTOR_IN3, RIGHT_MOTOR_IN4, RIGHT_MOTOR_PWM, right);
}

void stopMotors() { drive(0, 0); }
void turnInPlace(int speed) { drive(speed, -speed); }   // + = clockwise
