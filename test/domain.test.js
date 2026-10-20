import test from "node:test";
import assert from "node:assert/strict";
import { calculatePolarizationPoint, calculateNernstPotential, calculateCellVoltage, calculateCoolantFlow, calculateReactantMassFlows, calculateAltitudeAdjustedPressureRatio, calculateFuelToElectricEfficiency, calculateCoolantPumpPower, calculateNetElectricalPower, solveFirstPowerCrossing } from "../src/domain/index.js";
const base = { reversibleVoltage:1.18, activationLoss:0.04, currentDensity:0.5, areaSpecificResistance:0.12, limitingCurrentDensity:2, concentrationCoefficient:0.03 };
test("altitude compensation raises compressor pressure ratio as inlet pressure falls",()=>{
 const seaLevel=calculateAltitudeAdjustedPressureRatio({basePressureRatio:2.5,ambientPressureMPa:0.1013});
 const altitude=calculateAltitudeAdjustedPressureRatio({basePressureRatio:2.5,ambientPressureMPa:0.054});
 assert.ok(Math.abs(seaLevel-2.5)<1e-12);
 assert.ok(altitude>seaLevel);
 assert.ok(Math.abs(altitude-(2.5*0.1013/0.054))<1e-12);
 assert.throws(()=>calculateAltitudeAdjustedPressureRatio({basePressureRatio:1,ambientPressureMPa:0.1}),RangeError);
 assert.throws(()=>calculateAltitudeAdjustedPressureRatio({basePressureRatio:2.5,ambientPressureMPa:0}),RangeError);
 assert.throws(()=>calculateAltitudeAdjustedPressureRatio({basePressureRatio:2.5,ambientPressureMPa:0.3}),RangeError,
  "reject an ambient pressure above the configured absolute discharge pressure");
});
test("coolant pump power uses flow pressure drop and efficiency with SI conversion",()=>{
 const power=calculateCoolantPumpPower({
  volumeFlowLPerMinute:120,pressureDropKPa:250,pumpEfficiency:0.65
 });
 assert.ok(Math.abs(power-(250*120/60000/0.65))<1e-12);
 assert.equal(calculateCoolantPumpPower({
  volumeFlowLPerMinute:0,pressureDropKPa:250,pumpEfficiency:0.65
 }),0);
 assert.throws(()=>calculateCoolantPumpPower({
  volumeFlowLPerMinute:120,pressureDropKPa:250,pumpEfficiency:0
 }),RangeError);
 assert.throws(()=>calculateCoolantPumpPower({
  volumeFlowLPerMinute:120,pressureDropKPa:250,pumpEfficiency:1.1
 }),RangeError);
});
test("net system efficiency uses actual hydrogen feed chemical energy",()=>{
 const efficiency=calculateFuelToElectricEfficiency({
  netPowerKw:50,hydrogenFeedKgPerHour:3,hydrogenLhvKwhPerKg:33.33
 });
 assert.ok(Math.abs(efficiency-(50/(3*33.33)))<1e-12);
 assert.equal(calculateFuelToElectricEfficiency({
  netPowerKw:0,hydrogenFeedKgPerHour:3
 }),0);
 assert.throws(()=>calculateFuelToElectricEfficiency({
  netPowerKw:100,hydrogenFeedKgPerHour:1
 }),RangeError);
 assert.throws(()=>calculateFuelToElectricEfficiency({
  netPowerKw:50,hydrogenFeedKgPerHour:0
 }),RangeError);
});
// Independent cross-check against ECSIM/OPEM test/test_Amphlett.py:
// Enernst_Calc(T=343.15 K, PH2=1 atm, PO2=1 atm) = 1.19075 V.
// This app accepts dry-air total pressure, so PO2=1 atm maps to
// Pair=1/0.21 atm; all pressures are then converted to MPa.
test("Nernst potential matches the published OPEM Amphlett reference vector",()=>{
 const voltage=calculateNernstPotential({
  temperatureK:343.15,
  hydrogenPressureMPa:0.101325,
  airPressureMPa:0.101325/0.21
 });
 assert.ok(Math.abs(voltage-1.19075)<1e-12,
  "MPa and dry-air-to-oxygen partial-pressure conversion must reproduce OPEM's 1 atm reference case");
});

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

test("Nernst calculation remains finite when pressure ratios would overflow",()=>{
 const potential=calculateNernstPotential({temperatureK:355.15,hydrogenPressureMPa:Number.MAX_VALUE,airPressureMPa:0.2});
 assert.ok(Number.isFinite(potential));
 assert.ok(potential>1.5, "extreme finite pressure should yield a finite logarithmic Nernst term");
});
test("rejects finite inputs whose calculated power density overflows",()=>{
 assert.throws(()=>calculatePolarizationPoint({...base,activationLoss:0,currentDensity:1.7e308,areaSpecificResistance:0,limitingCurrentDensity:Number.MAX_VALUE,concentrationCoefficient:0}),RangeError);
});

test("Tafel polarization rejects current below the exchange-current reference",()=>{
 const params={reversibleVoltage:1.18,activationCoefficient:0.0085,currentDensity:0.0005,exchangeCurrentDensity:0.0018,areaSpecificResistance:0.095,concentrationCoefficient:2.2e-5,concentrationExponent:4};
 assert.throws(()=>calculateCellVoltage(params),RangeError);
 assert.ok(calculateCellVoltage({...params,currentDensity:params.exchangeCurrentDensity}).activationLoss===0);
});

test("Nernst reference case at 25 C and 1 atm hydrogen/air is stable",()=>{
 const voltage=calculateNernstPotential({temperatureK:298.15,hydrogenPressureMPa:0.101325,airPressureMPa:0.101325});
 assert.ok(Math.abs(voltage-1.2189772845028344)<1e-12);
});
test("polarization point is continuous at zero current density",()=>{
 const p=calculatePolarizationPoint({...base,currentDensity:0});
 assert.equal(p.powerDensity,0);
 assert.equal(p.ohmicLoss,0);
 assert.equal(p.concentrationLoss,0);
 assert.equal(p.cellVoltage,base.reversibleVoltage-base.activationLoss);
});

test("derived Tafel losses report numeric overflow as a range error",()=>{
 const params={reversibleVoltage:1.18,activationCoefficient:Number.MAX_VALUE,currentDensity:Number.MAX_VALUE,exchangeCurrentDensity:Number.MIN_VALUE,areaSpecificResistance:0,concentrationCoefficient:0,concentrationExponent:0};
 assert.throws(()=>calculateCellVoltage(params),RangeError);
});

test("Tafel loss remains finite when the current-to-exchange ratio overflows",()=>{
 const p=calculateCellVoltage({reversibleVoltage:1,activationCoefficient:1e-308,currentDensity:Number.MAX_VALUE,exchangeCurrentDensity:Number.MIN_VALUE,areaSpecificResistance:0,concentrationCoefficient:0,concentrationExponent:1});
 assert.ok(Number.isFinite(p.activationLoss));
 assert.equal(p.concentrationLoss,0);
 assert.ok(Number.isFinite(p.cellVoltage));
});
test("concentration loss remains representable when the current ratio underflows",()=>{
 const p=calculatePolarizationPoint({
  reversibleVoltage:1.18,activationLoss:0,currentDensity:Number.MIN_VALUE,
  areaSpecificResistance:0,limitingCurrentDensity:Number.MAX_VALUE,
  concentrationCoefficient:Number.MAX_VALUE
 });
 assert.equal(p.concentrationLoss,Number.MIN_VALUE);
 assert.ok(Number.isFinite(p.cellVoltage));
});

test("zero concentration coefficient suppresses exponential overflow",()=>{
 const p=calculateCellVoltage({reversibleVoltage:1,activationCoefficient:0,currentDensity:1e308,exchangeCurrentDensity:1,areaSpecificResistance:0,concentrationCoefficient:0,concentrationExponent:10});
 assert.equal(p.concentrationLoss,0);
 assert.equal(p.activationLoss,0);
 assert.equal(p.cellVoltage,1);
});
test("reactant flows apply hydrogen and air stoichiometric ratios independently",()=>{
 const base=calculateReactantMassFlows({
  cellCount:370,stackCurrentA:300,hydrogenStoichRatio:1,airStoichRatio:2
 });
 const excessHydrogen=calculateReactantMassFlows({
  cellCount:370,stackCurrentA:300,hydrogenStoichRatio:1.2,airStoichRatio:2
 });
 const excessAir=calculateReactantMassFlows({
  cellCount:370,stackCurrentA:300,hydrogenStoichRatio:1,airStoichRatio:2.5
 });
 assert.ok(base.hydrogenConsumedKgPerHour>0);
 assert.ok(Math.abs(excessHydrogen.hydrogenConsumedKgPerHour/base.hydrogenConsumedKgPerHour-1)<1e-12,
  "hydrogen stoichiometry must not change Faradaic reaction consumption");
 assert.ok(Math.abs(excessHydrogen.hydrogenFeedKgPerHour/base.hydrogenFeedKgPerHour-1.2)<1e-12,
  "hydrogen stoichiometry must scale the fresh hydrogen feed");
 assert.ok(Math.abs(excessHydrogen.airFeedKgPerHour/base.airFeedKgPerHour-1)<1e-12,
  "hydrogen stoichiometry must not inflate cathode air demand");
 assert.ok(Math.abs(excessAir.airFeedKgPerHour/base.airFeedKgPerHour-1.25)<1e-12,
  "air stoichiometry must scale cathode air independently");
 assert.ok(Math.abs(excessAir.hydrogenFeedKgPerHour/base.hydrogenFeedKgPerHour-1)<1e-12,
  "air stoichiometry must not change hydrogen feed");
 assert.ok(Object.isFrozen(base));
});
test("reactant air feed uses the declared 23.2% dry-air oxygen mass fraction",()=>{
 const flow=calculateReactantMassFlows({
  cellCount:370,stackCurrentA:300,hydrogenStoichRatio:1,airStoichRatio:1
 });
 const expectedHydrogenKgPerHour=370*300*2.016*3.6/(2*96485);
 const expectedAirKgPerHour=expectedHydrogenKgPerHour*(8/0.232);
 assert.ok(Math.abs(flow.hydrogenConsumedKgPerHour-expectedHydrogenKgPerHour)<1e-12);
 assert.ok(Math.abs(flow.airFeedKgPerHour-expectedAirKgPerHour)<1e-12);
});
test("reactant flow model rejects invalid cell, current and stoichiometric inputs",()=>{
 const valid={cellCount:370,stackCurrentA:300,hydrogenStoichRatio:1.1,airStoichRatio:2.2};
 assert.throws(()=>calculateReactantMassFlows({...valid,cellCount:0}),RangeError);
 assert.throws(()=>calculateReactantMassFlows({...valid,cellCount:1.5}),RangeError);
 assert.throws(()=>calculateReactantMassFlows({...valid,stackCurrentA:-1}),RangeError);
 assert.throws(()=>calculateReactantMassFlows({...valid,hydrogenStoichRatio:0.9}),RangeError);
 assert.throws(()=>calculateReactantMassFlows({...valid,airStoichRatio:0.9}),RangeError);
 assert.throws(()=>calculateReactantMassFlows({...valid,stackCurrentA:NaN}),TypeError);
});
test("reactant flows reject unrepresentable derived mass rates",()=>{
 assert.throws(()=>calculateReactantMassFlows({
  cellCount:Number.MAX_SAFE_INTEGER,stackCurrentA:Number.MAX_VALUE,
  hydrogenStoichRatio:Number.MAX_VALUE,airStoichRatio:Number.MAX_VALUE
 }),RangeError);
});

test("coolant flow converts heat load to mass and volume flow with consistent SI units",()=>{
 const flow=calculateCoolantFlow({
  heatPowerKw:10,deltaTemperatureK:5,
  specificHeatKJPerKgK:3.55,densityKgPerL:1.05
 });
 assert.ok(Math.abs(flow.massFlowKgPerSecond-(10/(3.55*5)))<1e-12);
 assert.ok(Math.abs(flow.massFlowKgPerMinute-flow.massFlowKgPerSecond*60)<1e-12);
 assert.ok(Math.abs(flow.volumeFlowLPerMinute-flow.massFlowKgPerMinute/1.05)<1e-12);
 assert.ok(Math.abs(flow.volumeFlowLPerMinute-32.19)<0.02);
 assert.ok(Object.isFrozen(flow));
});
test("coolant flow handles zero heat and rejects nonphysical properties",()=>{
 const zero=calculateCoolantFlow({
  heatPowerKw:0,deltaTemperatureK:5,
  specificHeatKJPerKgK:3.55,densityKgPerL:1.05
 });
 assert.deepEqual({...zero},{massFlowKgPerSecond:0,massFlowKgPerMinute:0,volumeFlowLPerMinute:0});
 assert.throws(()=>calculateCoolantFlow({heatPowerKw:-1,deltaTemperatureK:5,specificHeatKJPerKgK:3.55,densityKgPerL:1.05}),RangeError);
 assert.throws(()=>calculateCoolantFlow({heatPowerKw:1,deltaTemperatureK:0,specificHeatKJPerKgK:3.55,densityKgPerL:1.05}),RangeError);
 assert.throws(()=>calculateCoolantFlow({heatPowerKw:1,deltaTemperatureK:5,specificHeatKJPerKgK:0,densityKgPerL:1.05}),RangeError);
 assert.throws(()=>calculateCoolantFlow({heatPowerKw:1,deltaTemperatureK:5,specificHeatKJPerKgK:3.55,densityKgPerL:0}),RangeError);
 assert.throws(()=>calculateCoolantFlow({heatPowerKw:1,deltaTemperatureK:5,specificHeatKJPerKgK:NaN,densityKgPerL:1.05}),TypeError);
});
test("coolant flow avoids an overflowing heat-capacity product when final flow is finite",()=>{
 const flow=calculateCoolantFlow({
  heatPowerKw:1e308,deltaTemperatureK:1e308,
  specificHeatKJPerKgK:1e308,densityKgPerL:1e-308
 });
 assert.ok(Number.isFinite(flow.massFlowKgPerSecond) && flow.massFlowKgPerSecond>0);
 assert.ok(Math.abs(flow.volumeFlowLPerMinute/60-1)<1e-12);
});

test("tiny concentration coefficient offsets raw exponential overflow",()=>{
 const p=calculateCellVoltage({
  reversibleVoltage:1,activationCoefficient:0,currentDensity:1,
  exchangeCurrentDensity:1,areaSpecificResistance:0,
  concentrationCoefficient:Number.MIN_VALUE,concentrationExponent:720
 });
 assert.ok(Number.isFinite(p.concentrationLoss));
 assert.ok(p.concentrationLoss>0);
 assert.ok(Math.abs(p.concentrationLoss-Math.exp(Math.log(Number.MIN_VALUE)+720))<1e-25);
 assert.ok(Number.isFinite(p.cellVoltage));
});

test("net electrical output never invents positive power when BOP exceeds stack output",()=>{
 assert.equal(calculateNetElectricalPower({stackPowerKw:100,balanceOfPlantPowerKw:20}),80);
 assert.equal(calculateNetElectricalPower({stackPowerKw:20,balanceOfPlantPowerKw:20}),0);
 assert.equal(calculateNetElectricalPower({stackPowerKw:10,balanceOfPlantPowerKw:12}),0);
 assert.throws(()=>calculateNetElectricalPower({stackPowerKw:-1,balanceOfPlantPowerKw:0}),RangeError);
 assert.throws(()=>calculateNetElectricalPower({stackPowerKw:10,balanceOfPlantPowerKw:NaN}),TypeError);
});


test("power solver chooses the first upward crossing on a non-monotonic polarization power curve",()=>{
 const current=solveFirstPowerCrossing({
  targetPower:3,minCurrentDensity:0.1,maxCurrentDensity:3.9,steps:100,
  powerAt:i=>i*(4-i)
 });
 assert.ok(Math.abs(current-1)<1e-10);
 assert.ok(current<2,"solver must not select the descending high-current branch");
});
test("power solver returns a feasible point that does not under-shoot a target",()=>{
 const current=solveFirstPowerCrossing({
  targetPower:2,minCurrentDensity:0,maxCurrentDensity:2,steps:1,
  powerAt:i=>i*i
 });
 assert.ok(current*current>=2,"returned operating point must meet or exceed requested power");
});
test("power solver returns the sampled maximum when target power is unattainable",()=>{
 const current=solveFirstPowerCrossing({
  targetPower:5,minCurrentDensity:0,maxCurrentDensity:4,steps:100,
  powerAt:i=>i*(4-i)
 });
 assert.equal(current,2);
});
test("power solver returns the minimum-current point when target is already met",()=>{
 assert.equal(solveFirstPowerCrossing({
  targetPower:0.05,minCurrentDensity:0.1,maxCurrentDensity:3,steps:100,
  powerAt:i=>i
 }),0.1);
});
test("power solver bisects safely when current-density endpoints would overflow when added",()=>{
 const current=solveFirstPowerCrossing({
  targetPower:1,minCurrentDensity:8e307,maxCurrentDensity:1.6e308,steps:2,
  powerAt:i=>i/1e308
 });
 assert.ok(Number.isFinite(current));
 assert.ok(current/1e308>=1,"returned operating point must meet the target");
 assert.ok(Math.abs(current/1e308-1)<1e-12);
});

test("power solver rejects malformed intervals, steps and non-finite model output",()=>{
 const base={targetPower:1,minCurrentDensity:0.1,maxCurrentDensity:2,powerAt:i=>i};
 assert.throws(()=>solveFirstPowerCrossing({...base,maxCurrentDensity:0.1}),RangeError);
 assert.throws(()=>solveFirstPowerCrossing({...base,steps:0}),RangeError);
 assert.throws(()=>solveFirstPowerCrossing({...base,powerAt:null}),TypeError);
 assert.throws(()=>solveFirstPowerCrossing({...base,powerAt:()=>NaN}),RangeError);
});
