#!/usr/bin/env python3
"""
Capacitive Touch Sensor Reader.

Supports:
- TTP223: Single-point binary touch via GPIO
- MPR121: 12-channel capacitive touch via I2C

Usage: python3 read_touch.py <type> <i2c_bus> <i2c_address> <gpio_pin>
Output: JSON {"channels": [0, 3, 5], "values": [45, 30, 55]}
        or   {"channels": [0], "values": null}  (for TTP223)

Requires:
- TTP223: RPi.GPIO or gpiozero
- MPR121: pip install adafruit-circuitpython-mpr121
"""
import sys
import json

def read_ttp223(gpio_pin):
    """Read TTP223 single-point capacitive touch."""
    try:
        import RPi.GPIO as GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(gpio_pin, GPIO.IN)

        touched = GPIO.input(gpio_pin)
        channels = [0] if touched else []
        return {"channels": channels, "values": None}
    except ImportError:
        from gpiozero import Button
        button = Button(gpio_pin, pull_up=False)
        touched = button.is_pressed
        button.close()
        channels = [0] if touched else []
        return {"channels": channels, "values": None}

def read_mpr121(i2c_bus, i2c_address):
    """Read MPR121 12-channel capacitive touch."""
    import board
    import busio
    import adafruit_mpr121

    i2c = busio.I2C(board.SCL, board.SDA)
    mpr121 = adafruit_mpr121.MPR121(i2c, address=i2c_address)

    channels = []
    values = []

    for i in range(12):
        if mpr121[i].value:
            channels.append(i)
            values.append(mpr121[i].raw_value)

    return {"channels": channels, "values": values if values else None}

def main():
    sensor_type = sys.argv[1] if len(sys.argv) > 1 else "ttp223"
    i2c_bus = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    i2c_address = int(sys.argv[3]) if len(sys.argv) > 3 else 0x5A
    gpio_pin = int(sys.argv[4]) if len(sys.argv) > 4 else 17

    if sensor_type == "ttp223":
        result = read_ttp223(gpio_pin)
    elif sensor_type == "mpr121":
        result = read_mpr121(i2c_bus, i2c_address)
    else:
        print(json.dumps({"error": f"Unknown sensor type: {sensor_type}"}), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result))

if __name__ == "__main__":
    main()
