import test from "node:test";
import assert from "node:assert/strict";
import { calculatePolarizationPoint } from "../src/domain/index.js";
const base = { reversibleVoltage:1.18, activationLoss:0.04, currentDensity:0.5, areaSpecificResistance:0.12, limitingCurrentDensity:2, concentrationCoefficient:0.03 };
test("polarization losses sum to reversible voltage minus cell voltage", () => {
 const p = calculatePolarizationPoint(base);
 assert.ok(p.cellVoltage > 0 && p.cellVoltage < base.reversibleVoltage);
 assert.ok(Math.abs(p.cellVoltage - (1.18 - 0.04 - p.ohmicLoss - p.concentrationLoss)) < 1e-12);
});
test("rejects current density at or above limiting current", () => assert.throws(() => calculatePolarizationPoint({...base,currentDensity:2}), RangeError));
test("rejects non-finite inputs", () => assert.throws(() => calculatePolarizationPoint({...base,areaSpecificResistance:NaN}), TypeError));
