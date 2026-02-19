#!/usr/bin/env python3
"""
DHT22 Temperature & Humidity Sensor Reader.

Usage: python3 read_dht22.py <gpio_pin>
Output: JSON {"temperature": 22.5, "humidity": 45.2}

Requires: pip install adafruit-circuitpython-dht
          sudo apt install libgpiod2
"""
import sys
import json

def main():
    gpio_pin = int(sys.argv[1]) if len(sys.argv) > 1 else 4

    import board
    import adafruit_dht

    # Map GPIO number to board pin
    pin_map = {
        4: board.D4, 5: board.D5, 6: board.D6, 12: board.D12,
        13: board.D13, 16: board.D16, 17: board.D17, 18: board.D18,
        19: board.D19, 20: board.D20, 21: board.D21, 22: board.D22,
        23: board.D23, 24: board.D24, 25: board.D25, 26: board.D26,
        27: board.D27,
    }

    pin = pin_map.get(gpio_pin)
    if pin is None:
        print(json.dumps({"error": f"Unsupported GPIO pin: {gpio_pin}"}), file=sys.stderr)
        sys.exit(1)

    sensor = adafruit_dht.DHT22(pin)
    try:
        temperature = sensor.temperature
        humidity = sensor.humidity
        if temperature is not None and humidity is not None:
            print(json.dumps({
                "temperature": round(temperature, 1),
                "humidity": round(humidity, 1),
            }))
        else:
            print(json.dumps({"error": "null reading"}), file=sys.stderr)
            sys.exit(1)
    finally:
        sensor.exit()

if __name__ == "__main__":
    main()
