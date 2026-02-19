#!/usr/bin/env python3
"""
HC-SR04 Ultrasonic Distance Sensor Reader.

Usage: python3 read_hcsr04.py <trigger_pin> <echo_pin>
Output: JSON {"distanceCm": 42.3}

Requires: pip install RPi.GPIO (or gpiozero)
"""
import sys
import json
import time

def main():
    trigger_pin = int(sys.argv[1]) if len(sys.argv) > 1 else 23
    echo_pin = int(sys.argv[2]) if len(sys.argv) > 2 else 24

    try:
        import RPi.GPIO as GPIO

        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(trigger_pin, GPIO.OUT)
        GPIO.setup(echo_pin, GPIO.IN)

        # Send 10us trigger pulse
        GPIO.output(trigger_pin, False)
        time.sleep(0.002)
        GPIO.output(trigger_pin, True)
        time.sleep(0.00001)
        GPIO.output(trigger_pin, False)

        # Wait for echo
        timeout = time.time() + 0.1  # 100ms timeout
        pulse_start = time.time()
        while GPIO.input(echo_pin) == 0:
            pulse_start = time.time()
            if pulse_start > timeout:
                print(json.dumps({"distanceCm": 999}))
                return

        pulse_end = time.time()
        timeout = time.time() + 0.1
        while GPIO.input(echo_pin) == 1:
            pulse_end = time.time()
            if pulse_end > timeout:
                print(json.dumps({"distanceCm": 999}))
                return

        # Calculate distance
        pulse_duration = pulse_end - pulse_start
        distance = pulse_duration * 17150  # Speed of sound / 2
        distance = round(distance, 1)

        # Clamp to reasonable range
        distance = max(2, min(400, distance))

        print(json.dumps({"distanceCm": distance}))

    except ImportError:
        # Fallback to gpiozero
        from gpiozero import DistanceSensor

        sensor = DistanceSensor(echo=echo_pin, trigger=trigger_pin, max_distance=4)
        distance = sensor.distance * 100  # meters to cm
        sensor.close()

        print(json.dumps({"distanceCm": round(distance, 1)}))

if __name__ == "__main__":
    main()
