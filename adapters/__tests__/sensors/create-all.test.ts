import { describe, it, expect } from "vitest";
import { createAllDrivers } from "../../src/sensors/create-all.js";
import type { SensorDriver } from "../../../engine/src/perception/sensor-driver.js";

// ---------------------------------------------------------------------------
// createAllDrivers() does NOT start or detect hardware — it only instantiates
// driver objects. So no mocking is needed for these tests.
// ---------------------------------------------------------------------------

describe("createAllDrivers", () => {
  // -----------------------------------------------------------------------
  // Basic creation
  // -----------------------------------------------------------------------
  describe("basic creation", () => {
    it("returns a non-empty array of drivers", () => {
      const drivers = createAllDrivers();
      expect(Array.isArray(drivers)).toBe(true);
      expect(drivers.length).toBeGreaterThan(0);
    });

    it("always includes the system driver", () => {
      const drivers = createAllDrivers();
      const systemDriver = drivers.find(d => d.config.id === "system-metrics");
      expect(systemDriver).toBeDefined();
      expect(systemDriver!.config.modality).toBe("system");
    });

    it("creates drivers for all expected sensor types", () => {
      const drivers = createAllDrivers();
      const ids = drivers.map(d => d.config.id);

      // All expected driver IDs from the factory
      const expectedIds = [
        "system-metrics",
        "camera",
        "microphone",
        "dht22-temperature",
        "dht22-humidity",
        "bh1750-light",
        "bme280-temperature",
        "bme280-humidity",
        "bme280-pressure",
        "hcsr04-proximity",
        "touch",
      ];

      for (const id of expectedIds) {
        expect(ids).toContain(id);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Driver interface conformance
  // -----------------------------------------------------------------------
  describe("driver interface", () => {
    it("every driver has the required SensorDriver methods", () => {
      const drivers = createAllDrivers();
      for (const driver of drivers) {
        expect(typeof driver.detect).toBe("function");
        expect(typeof driver.start).toBe("function");
        expect(typeof driver.read).toBe("function");
        expect(typeof driver.stop).toBe("function");
      }
    });

    it("every driver has a valid config object", () => {
      const drivers = createAllDrivers();
      for (const driver of drivers) {
        expect(driver.config).toBeDefined();
        expect(typeof driver.config.id).toBe("string");
        expect(driver.config.id.length).toBeGreaterThan(0);
        expect(typeof driver.config.name).toBe("string");
        expect(driver.config.name.length).toBeGreaterThan(0);
        expect(typeof driver.config.modality).toBe("string");
        expect(typeof driver.config.pollIntervalMs).toBe("number");
        expect(driver.config.pollIntervalMs).toBeGreaterThan(0);
        expect(typeof driver.config.enabled).toBe("boolean");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Unique names / no duplicates
  // -----------------------------------------------------------------------
  describe("uniqueness", () => {
    it("every driver has a unique id", () => {
      const drivers = createAllDrivers();
      const ids = drivers.map(d => d.config.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("no duplicate driver instances", () => {
      const drivers = createAllDrivers();
      const uniqueRefs = new Set(drivers);
      expect(uniqueRefs.size).toBe(drivers.length);
    });
  });

  // -----------------------------------------------------------------------
  // Disable option
  // -----------------------------------------------------------------------
  describe("disable option", () => {
    it("can disable specific drivers", () => {
      const drivers = createAllDrivers({ disable: ["camera", "microphone"] });
      const ids = drivers.map(d => d.config.id);
      expect(ids).not.toContain("camera");
      expect(ids).not.toContain("microphone");
      // System should still be present
      expect(ids).toContain("system-metrics");
    });

    it("system driver cannot be disabled via normal id (uses 'system')", () => {
      // The disable array matches on the short id passed to add(), which is "system"
      const drivers = createAllDrivers({ disable: ["system"] });
      const ids = drivers.map(d => d.config.id);
      // When "system" is disabled, system-metrics should be gone
      expect(ids).not.toContain("system-metrics");
    });

    it("disabling all drivers results in empty array", () => {
      const allIds = [
        "system", "camera", "microphone",
        "dht22-temperature", "dht22-humidity",
        "bh1750",
        "bme280-temperature", "bme280-humidity", "bme280-pressure",
        "hcsr04", "touch",
      ];
      const drivers = createAllDrivers({ disable: allIds });
      expect(drivers.length).toBe(0);
    });

    it("disabling a nonexistent driver does not cause errors", () => {
      const drivers = createAllDrivers({ disable: ["nonexistent-sensor"] });
      // Should still have all the normal drivers
      expect(drivers.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Config passthrough
  // -----------------------------------------------------------------------
  describe("config passthrough", () => {
    it("accepts custom GPIO/I2C configuration without error", () => {
      const drivers = createAllDrivers({
        dhtGpioPin: 17,
        hcsr04TriggerPin: 5,
        hcsr04EchoPin: 6,
        i2cBus: 2,
        bh1750Address: 0x5c,
        bme280Address: 0x77,
        touchSensorType: "mpr121",
        touchGpioPin: 27,
        mpr121Address: 0x5b,
      });
      expect(drivers.length).toBeGreaterThan(0);
    });

    it("uses defaults when no config is provided", () => {
      // Should not throw
      const drivers = createAllDrivers();
      expect(drivers.length).toBeGreaterThan(0);
    });
  });
});
