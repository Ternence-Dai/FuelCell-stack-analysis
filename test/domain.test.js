import test from "node:test";
import assert from "node:assert/strict";
import { calculatePolarizationPoint, calculateNernstPotential, calculateCellVoltage } from "../src/domain/index.js";
const base = { reversibleVoltage:1.18, activationLoss:0.04, currentDensity:0.5, areaSpecificResistance:0.12, limitingCurrentDensity:2, concentrationCoefficient:0.03 };
test("polarization losses sum to reversible voltage minus cell voltage", () => {
 const p = calculatePolarizationPoint(base);
 assert.ok(p.cellVoltage > 0 && p.cellVoltage < base.reversibleVoltage);
 assert.ok(Math.abs(p.cellVoltage - (1.18 - 0.04 - p.ohmicLoss - p.concentrationLoss)) < 1e-12);
});
test("rejects current density at or above limiting current", () => assert.throws(() => calculatePolarizationPoint({...base,currentDensity:2}), RangeError));
test("rejects non-finite inputs", () => assert.throws(() => calculatePolarizationPoint({...base,areaSpecificResistance:NaN}), TypeError));

test("Nernst voltage normalizes MPa partial pressures against 1 atm",()=>{
 const v=calculateNernstPotential({temperatureK:355.15,hydrogenPressureMPa:0.19,airPressureMPa:0.20});
 assert.ok(v>1.1 && v<1.3);
 assert.ok(calculateNernstPotential({temperatureK:355.15,hydrogenPressureMPa:0.25,airPressureMPa:0.20})>v);
 assert.ok(calculateNernstPotential({temperatureK:355.15,hydrogenPressureMPa:0.19,airPressureMPa:0.25})>v);
});
test("cell voltage exposes physically separated polarization losses",()=>{
 const p=calculateCellVoltage({reversibleVoltage:1.18,activationCoefficient:0.0085,currentDensity:0.5,exchangeCurrentDensity:0.0018,areaSpecificResistance:0.095,concentrationCoefficient:2.2e-5,concentrationExponent:4});
 assert.ok(p.cellVoltage>0 && p.cellVoltage<1.18);
 assert.ok(Math.abs(p.cellVoltage-(1.18-p.activationLoss-p.ohmicLoss-p.concentrationLoss))<1e-12);
});
test("rejects nonphysical Nernst and polarization inputs",()=>{
 assert.throws(()=>calculateNernstPotential({temperatureK:355,hydrogenPressureMPa:0,airPressureMPa:0.2}),RangeError);
 assert.throws(()=>calculateCellVoltage({reversibleVoltage:1,activationCoefficient:0.1,currentDensity:0,exchangeCurrentDensity:0.001,areaSpecificResistance:0.1,concentrationCoefficient:0.001,concentrationExponent:4}),RangeError);
});

test("rejects finite inputs whose derived Nernst potential overflows",()=>{
 assert.throws(()=>calculateNernstPotential({temperatureK:355.15,hydrogenPressureMPa:Number.MAX_VALUE,airPressureMPa:0.2}),TypeError);
});
test("rejects finite inputs whose calculated power density overflows",()=>{
 assert.throws(()=>calculatePolarizationPoint({...base,activationLoss:0,currentDensity:1e308,areaSpecificResistance:0,limitingCurrentDensity:Number.MAX_VALUE,concentrationCoefficient:0}),TypeError);
});
