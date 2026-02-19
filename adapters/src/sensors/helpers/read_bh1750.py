#!/usr/bin/env python3
"""
BH1750 Light Sensor Reader (I2C).

Usage: python3 read_bh1750.py <i2c_bus> <i2c_address>
Output: JSON {"lux": 342.5}

Requires: pip install smbus2
"""
import sys
import json
import time

def main():
    bus_num = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    address = int(sys.argv[2]) if len(sys.argv) > 2 else 0x23

    import smbus2

    bus = smbus2.SMBus(bus_num)
    try:
        # Power on
        bus.write_byte(address, 0x01)
        # One-time high resolution mode (1 lux resolution, 120ms)
        bus.write_byte(address, 0x20)
        time.sleep(0.18)  # Wait for measurement

        data = bus.read_i2c_block_data(address, 0x00, 2)
        lux = (data[0] << 8 | data[1]) / 1.2

        print(json.dumps({"lux": round(lux, 1)}))
    finally:
        bus.close()

if __name__ == "__main__":
    main()
