#!/usr/bin/env python3
"""
BME280 Environmental Sensor Reader (I2C).

Usage: python3 read_bme280.py <i2c_bus> <i2c_address>
Output: JSON {"temperature": 22.5, "humidity": 45.2, "pressure": 1013.25}

Requires: pip install smbus2
"""
import sys
import json
import time
import struct

def main():
    bus_num = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    address = int(sys.argv[2]) if len(sys.argv) > 2 else 0x76

    import smbus2

    bus = smbus2.SMBus(bus_num)
    try:
        # Read calibration data
        cal1 = bus.read_i2c_block_data(address, 0x88, 26)
        cal2 = bus.read_i2c_block_data(address, 0xE1, 7)

        # Temperature calibration
        dig_T1 = cal1[0] | (cal1[1] << 8)
        dig_T2 = struct.unpack('<h', bytes(cal1[2:4]))[0]
        dig_T3 = struct.unpack('<h', bytes(cal1[4:6]))[0]

        # Pressure calibration
        dig_P1 = cal1[6] | (cal1[7] << 8)
        dig_P2 = struct.unpack('<h', bytes(cal1[8:10]))[0]
        dig_P3 = struct.unpack('<h', bytes(cal1[10:12]))[0]
        dig_P4 = struct.unpack('<h', bytes(cal1[12:14]))[0]
        dig_P5 = struct.unpack('<h', bytes(cal1[14:16]))[0]
        dig_P6 = struct.unpack('<h', bytes(cal1[16:18]))[0]
        dig_P7 = struct.unpack('<h', bytes(cal1[18:20]))[0]
        dig_P8 = struct.unpack('<h', bytes(cal1[20:22]))[0]
        dig_P9 = struct.unpack('<h', bytes(cal1[22:24]))[0]

        # Humidity calibration
        dig_H1 = cal1[25]
        dig_H2 = struct.unpack('<h', bytes(cal2[0:2]))[0]
        dig_H3 = cal2[2]
        dig_H4 = (cal2[3] << 4) | (cal2[4] & 0x0F)
        dig_H5 = (cal2[5] << 4) | ((cal2[4] >> 4) & 0x0F)
        dig_H6 = struct.unpack('<b', bytes([cal2[6]]))[0]

        # Set oversampling and trigger measurement
        bus.write_byte_data(address, 0xF2, 0x01)  # Humidity oversampling x1
        bus.write_byte_data(address, 0xF4, 0x25)  # Temp+pressure oversampling x1, forced mode
        time.sleep(0.05)

        # Read raw data
        raw = bus.read_i2c_block_data(address, 0xF7, 8)
        raw_pressure = (raw[0] << 12) | (raw[1] << 4) | (raw[2] >> 4)
        raw_temp = (raw[3] << 12) | (raw[4] << 4) | (raw[5] >> 4)
        raw_humidity = (raw[6] << 8) | raw[7]

        # Compensate temperature
        var1 = (raw_temp / 16384.0 - dig_T1 / 1024.0) * dig_T2
        var2 = ((raw_temp / 131072.0 - dig_T1 / 8192.0) ** 2) * dig_T3
        t_fine = var1 + var2
        temperature = t_fine / 5120.0

        # Compensate pressure
        var1 = t_fine / 2.0 - 64000.0
        var2 = var1 * var1 * dig_P6 / 32768.0
        var2 = var2 + var1 * dig_P5 * 2.0
        var2 = var2 / 4.0 + dig_P4 * 65536.0
        var1 = (dig_P3 * var1 * var1 / 524288.0 + dig_P2 * var1) / 524288.0
        var1 = (1.0 + var1 / 32768.0) * dig_P1
        if var1 != 0:
            pressure = 1048576.0 - raw_pressure
            pressure = ((pressure - var2 / 4096.0) * 6250.0) / var1
            var1 = dig_P9 * pressure * pressure / 2147483648.0
            var2 = pressure * dig_P8 / 32768.0
            pressure = (pressure + (var1 + var2 + dig_P7) / 16.0) / 100.0
        else:
            pressure = 0

        # Compensate humidity
        h = t_fine - 76800.0
        if h != 0:
            h = (raw_humidity - (dig_H4 * 64.0 + dig_H5 / 16384.0 * h)) * \
                (dig_H2 / 65536.0 * (1.0 + dig_H6 / 67108864.0 * h * \
                (1.0 + dig_H3 / 67108864.0 * h)))
            h = h * (1.0 - dig_H1 * h / 524288.0)
            humidity = max(0.0, min(100.0, h))
        else:
            humidity = 0

        print(json.dumps({
            "temperature": round(temperature, 1),
            "humidity": round(humidity, 1),
            "pressure": round(pressure, 2),
        }))
    finally:
        bus.close()

if __name__ == "__main__":
    main()
