/**
 * Sensor Drivers — RPi-compatible hardware sensor adapters.
 *
 * Each driver auto-detects its hardware and reads data via:
 * - System commands (libcamera-still, arecord, vcgencmd)
 * - Python helper scripts (for I2C/GPIO sensors)
 * - /proc and /sys filesystem reads
 *
 * Zero npm dependencies for hardware access.
 * Python helpers use the RPi's built-in adafruit-circuitpython libraries.
 */

export { createSystemDriver } from "./drivers/system.js";
export { createCameraDriver } from "./drivers/camera.js";
export { createMicrophoneDriver } from "./drivers/microphone.js";
export { createDHT22Driver } from "./drivers/dht22.js";
export { createBH1750Driver } from "./drivers/bh1750.js";
export { createBME280Driver } from "./drivers/bme280.js";
export { createHCSR04Driver } from "./drivers/hcsr04.js";
export { createTouchDriver } from "./drivers/touch.js";

export { createAllDrivers } from "./create-all.js";
