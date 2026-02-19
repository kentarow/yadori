/**
 * YADORI Sensor Diagnostic Tool
 *
 * Usage:  node --import tsx scripts/sensors.ts
 * Or:     npm run sensors
 *
 * Detects all available hardware sensors and reports status.
 * Also tests a single read from each detected sensor.
 * Generates/updates sensors.json config file.
 *
 * Run this before starting the heartbeat to verify your hardware setup.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createAllDrivers, type AllDriversConfig } from "../adapters/src/sensors/create-all.js";
import type { SensorDriver } from "../engine/src/perception/sensor-driver.js";

const WORKSPACE_ROOT = process.env.YADORI_WORKSPACE ?? join(homedir(), ".openclaw", "workspace");
const SENSORS_CONFIG_PATH = join(WORKSPACE_ROOT, "sensors.json");

/**
 * Sensor configuration saved to sensors.json.
 */
export interface SensorsConfig {
  /** DHT22 data GPIO pin (default: 4) */
  dhtGpioPin: number;
  /** HC-SR04 trigger GPIO pin (default: 23) */
  hcsr04TriggerPin: number;
  /** HC-SR04 echo GPIO pin (default: 24) */
  hcsr04EchoPin: number;
  /** Touch sensor type: "ttp223" or "mpr121" (default: "ttp223") */
  touchSensorType: "ttp223" | "mpr121";
  /** Touch sensor GPIO pin for TTP223 (default: 17) */
  touchGpioPin: number;
  /** I2C bus number (default: 1) */
  i2cBus: number;
  /** BH1750 I2C address (default: 0x23) */
  bh1750Address: number;
  /** BME280 I2C address (default: 0x76) */
  bme280Address: number;
  /** MPR121 I2C address (default: 0x5a) */
  mpr121Address: number;
  /** Drivers to disable by ID */
  disable: string[];
}

const DEFAULT_CONFIG: SensorsConfig = {
  dhtGpioPin: 4,
  hcsr04TriggerPin: 23,
  hcsr04EchoPin: 24,
  touchSensorType: "ttp223",
  touchGpioPin: 17,
  i2cBus: 1,
  bh1750Address: 0x23,
  bme280Address: 0x76,
  mpr121Address: 0x5a,
  disable: [],
};

async function loadConfig(): Promise<SensorsConfig> {
  try {
    const content = await readFile(SENSORS_CONFIG_PATH, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(config: SensorsConfig): Promise<void> {
  await writeFile(SENSORS_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function statusIcon(available: boolean): string {
  return available ? "[OK]" : "[--]";
}

async function main() {
  console.log("");
  console.log("  ╭──────────────────────────────────╮");
  console.log("  │     YADORI  Sensor Diagnostic     │");
  console.log("  ╰──────────────────────────────────╯");
  console.log("");

  // Load or create config
  const config = await loadConfig();
  console.log(`  Config: ${SENSORS_CONFIG_PATH}`);
  console.log("");

  // Create drivers with config
  const driversConfig: AllDriversConfig = {
    dhtGpioPin: config.dhtGpioPin,
    hcsr04TriggerPin: config.hcsr04TriggerPin,
    hcsr04EchoPin: config.hcsr04EchoPin,
    touchSensorType: config.touchSensorType,
    touchGpioPin: config.touchGpioPin,
    i2cBus: config.i2cBus,
    bh1750Address: config.bh1750Address,
    bme280Address: config.bme280Address,
    mpr121Address: config.mpr121Address,
    disable: config.disable,
  };

  const drivers = createAllDrivers(driversConfig);

  console.log("  Detecting sensors...\n");

  let availableCount = 0;
  const results: { id: string; modality: string; available: boolean; details: string }[] = [];

  for (const driver of drivers) {
    const detection = await driver.detect();
    results.push({
      id: driver.config.id,
      modality: driver.config.modality,
      available: detection.available,
      details: detection.available
        ? detection.details ?? ""
        : detection.reason ?? "not available",
    });
    if (detection.available) availableCount++;
  }

  // Print results grouped by category
  const categories: { label: string; ids: string[] }[] = [
    { label: "System", ids: ["system-metrics"] },
    { label: "Camera", ids: ["camera"] },
    { label: "Audio", ids: ["microphone"] },
    { label: "Temperature", ids: ["dht22-temperature", "bme280-temperature"] },
    { label: "Humidity", ids: ["dht22-humidity", "bme280-humidity"] },
    { label: "Light", ids: ["bh1750-light"] },
    { label: "Pressure", ids: ["bme280-pressure"] },
    { label: "Proximity", ids: ["hcsr04-proximity"] },
    { label: "Touch", ids: ["touch"] },
  ];

  for (const cat of categories) {
    const catResults = results.filter(r => cat.ids.includes(r.id));
    if (catResults.length === 0) continue;

    const anyAvailable = catResults.some(r => r.available);
    console.log(`  ${statusIcon(anyAvailable)} ${cat.label}`);

    for (const r of catResults) {
      const icon = r.available ? "  +" : "  -";
      console.log(`     ${icon} ${r.id}: ${r.details}`);
    }
    console.log("");
  }

  // Summary
  console.log("  ─────────────────────────────────");
  console.log(`  ${availableCount}/${results.length} sensors available`);

  // Count unique modalities
  const availableModalities = new Set(
    results.filter(r => r.available).map(r => r.modality),
  );
  console.log(`  ${availableModalities.size} modalities: ${[...availableModalities].join(", ")}`);

  // Test read from available sensors
  const availableDrivers = drivers.filter(d =>
    results.find(r => r.id === d.config.id)?.available,
  );

  if (availableDrivers.length > 1) { // More than just system-metrics
    console.log("");
    console.log("  Testing sensor reads...\n");

    for (const driver of availableDrivers) {
      try {
        await driver.start();
        const reading = await driver.read();
        await driver.stop();

        if (reading) {
          console.log(`  [OK] ${driver.config.id}: read successful`);
        } else {
          console.log(`  [--] ${driver.config.id}: read returned null`);
        }
      } catch (err) {
        console.log(`  [!!] ${driver.config.id}: ${(err as Error).message}`);
      }
    }
  }

  // Save config (creates default if none exists)
  await saveConfig(config);
  console.log(`\n  Config saved to ${SENSORS_CONFIG_PATH}`);

  // Guidance
  console.log("");
  console.log("  To customize GPIO pins or I2C addresses:");
  console.log(`  Edit ${SENSORS_CONFIG_PATH}`);
  console.log("");
  console.log("  To disable a sensor, add its ID to the \"disable\" array.");
  console.log("  Then run 'npm run heartbeat' to start with sensors active.");
  console.log("");
}

main().catch((err) => {
  console.error("\n  Sensor diagnostic failed:", err.message);
  process.exit(1);
});
