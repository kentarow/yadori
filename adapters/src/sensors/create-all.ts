/**
 * Create All Drivers — Convenience factory for standard RPi sensor setup.
 *
 * Creates drivers for all common RPi sensors.
 * Each driver will auto-detect during startService() — only available
 * hardware will actually be polled.
 */

import type { SensorDriver } from "../../../engine/src/perception/sensor-driver.js";
import { createSystemDriver } from "./drivers/system.js";
import { createCameraDriver } from "./drivers/camera.js";
import { createMicrophoneDriver } from "./drivers/microphone.js";
import { createDHT22Driver } from "./drivers/dht22.js";
import { createBH1750Driver } from "./drivers/bh1750.js";
import { createBME280Driver } from "./drivers/bme280.js";
import { createHCSR04Driver } from "./drivers/hcsr04.js";
import { createTouchDriver, type TouchSensorType } from "./drivers/touch.js";

export interface AllDriversConfig {
  /** DHT22 GPIO data pin (default: 4) */
  dhtGpioPin?: number;
  /** HC-SR04 trigger GPIO pin (default: 23) */
  hcsr04TriggerPin?: number;
  /** HC-SR04 echo GPIO pin (default: 24) */
  hcsr04EchoPin?: number;
  /** Touch sensor type (default: "ttp223") */
  touchSensorType?: TouchSensorType;
  /** Touch sensor GPIO pin for TTP223 (default: 17) */
  touchGpioPin?: number;
  /** I2C bus number (default: 1) */
  i2cBus?: number;
  /** BH1750 I2C address (default: 0x23) */
  bh1750Address?: number;
  /** BME280 I2C address (default: 0x76) */
  bme280Address?: number;
  /** MPR121 I2C address for touch (default: 0x5a) */
  mpr121Address?: number;
  /** Disable specific drivers */
  disable?: string[];
}

/**
 * Create all standard RPi sensor drivers.
 * Only creates — does not start or detect. That happens in startService().
 */
export function createAllDrivers(config: AllDriversConfig = {}): SensorDriver[] {
  const {
    dhtGpioPin = 4,
    hcsr04TriggerPin = 23,
    hcsr04EchoPin = 24,
    touchSensorType = "ttp223",
    touchGpioPin = 17,
    i2cBus = 1,
    bh1750Address = 0x23,
    bme280Address = 0x76,
    mpr121Address = 0x5a,
    disable = [],
  } = config;

  const drivers: SensorDriver[] = [];

  const add = (id: string, factory: () => SensorDriver) => {
    if (!disable.includes(id)) {
      drivers.push(factory());
    }
  };

  // Always-available
  add("system", () => createSystemDriver());

  // Camera & microphone
  add("camera", () => createCameraDriver());
  add("microphone", () => createMicrophoneDriver());

  // DHT22 — temperature + humidity (two separate drivers, one sensor)
  add("dht22-temperature", () => createDHT22Driver("temperature", dhtGpioPin));
  add("dht22-humidity", () => createDHT22Driver("humidity", dhtGpioPin));

  // BH1750 — light
  add("bh1750", () => createBH1750Driver(i2cBus, bh1750Address));

  // BME280 — temperature + humidity + pressure (three drivers, one sensor)
  add("bme280-temperature", () => createBME280Driver("temperature", i2cBus, bme280Address));
  add("bme280-humidity", () => createBME280Driver("humidity", i2cBus, bme280Address));
  add("bme280-pressure", () => createBME280Driver("pressure", i2cBus, bme280Address));

  // HC-SR04 — ultrasonic proximity
  add("hcsr04", () => createHCSR04Driver(hcsr04TriggerPin, hcsr04EchoPin));

  // Touch sensor
  add("touch", () => createTouchDriver(touchSensorType, {
    gpioPin: touchGpioPin,
    i2cBus,
    i2cAddress: mpr121Address,
  }));

  return drivers;
}
