/* Shared physical constants — the single source of truth for this domain
 * core. assets/js/legacy-app.js mirrors these literals (it is parsed before
 * this module's dynamic import resolves, so it cannot read them
 * synchronously); keep both in sync. */
export const PHYSICAL_CONSTANTS = Object.freeze({
  F_C_PER_MOL: 96485.33212, // 法拉第常数 (C/mol)，CODATA 2018 精确定义值（e × N_A）
  R_J_PER_MOL_K: 8.314462618, // 理想气体常数 (J/(mol·K))，CODATA 2018 精确定义值
  M_H2_G_PER_MOL: 2.016, // 氢气摩尔质量 (g/mol)，工程常用取值
  LHV_H2_KWH_PER_KG: 33.33, // 氢气低热值 LHV ≈ 120 MJ/kg = 33.33 kWh/kg
  HHV_THERMONEUTRAL_V: 1.482, // 热中性电压 (V)，HHV 口径，25 ℃
  LHV_THERMONEUTRAL_V: 1.253 // 热中性电压 (V)，LHV 口径，25 ℃
});

export function solveFirstPowerCrossing({ targetPower, minCurrentDensity, maxCurrentDensity, steps = 600, powerAt }) {
  for (const [name, value] of Object.entries({ targetPower, minCurrentDensity, maxCurrentDensity })) {
    if (!Number.isFinite(value)) throw new TypeError(name + " must be finite");
  }
  if (targetPower < 0 || minCurrentDensity < 0 || maxCurrentDensity <= minCurrentDensity) {
    throw new RangeError("power target and current-density interval must be non-negative and increasing");
  }
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 100000) {
    throw new RangeError("steps must be a positive safe integer no greater than 100000");
  }
  if (typeof powerAt !== "function") throw new TypeError("powerAt must be a function");

  const evaluate = current => {
    const power = powerAt(current);
    if (!Number.isFinite(power)) {
      throw new RangeError("powerAt must return a finite power");
    }
    return power;
  };
  let previousCurrent = minCurrentDensity;
  const initialPower = evaluate(previousCurrent);
  let peakCurrent = previousCurrent;
  let peakPower = initialPower;
  if (targetPower <= initialPower) return minCurrentDensity;

  for (let step = 1; step <= steps; step++) {
    const current = minCurrentDensity +
      (maxCurrentDensity - minCurrentDensity) * (step / steps);
    const power = evaluate(current);
    if (power > peakPower) {
      peakPower = power;
      peakCurrent = current;
    }
    // Return the first upward crossing, not a later crossing on the
    // descending branch of the non-monotonic stack power curve.
    if (power >= targetPower) {
      let low = previousCurrent;
      let high = current;
      for (let iteration = 0; iteration < 60; iteration++) {
        const middle = low + (high - low) / 2;
        if (evaluate(middle) >= targetPower) high = middle;
        else low = middle;
      }
      // Return the feasible side of the bracket so the requested power is not under-shot.
      return high;
    }
    previousCurrent = current;
  }
  // An unattainable target resolves to the sampled maximum-power point.
  return peakCurrent;
}

const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
};
const finiteResult = (value, name) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} exceeds the finite numeric range`);
  return value;
};

export function calculateAltitudeAdjustedPressureRatio({
  basePressureRatio,
  ambientPressureMPa,
  referencePressureMPa = 0.1013
}) {
  for (const [name, value] of Object.entries({
    basePressureRatio, ambientPressureMPa, referencePressureMPa
  })) finite(value, name);
  if (basePressureRatio <= 1 || ambientPressureMPa <= 0 || referencePressureMPa <= 0) {
    throw new RangeError("compressor pressure ratio must exceed 1 and absolute pressures must be positive");
  }
  // Treat the configured ratio as the sea-level design point. Holding
  // absolute discharge pressure constant requires Pout/Pambient at altitude.
  // Evaluate the positive ratio in log space so a large numerator does
  // not overflow before division by a similarly large ambient pressure.
  const ratio = finiteResult(Math.exp(
    Math.log(basePressureRatio) + Math.log(referencePressureMPa) - Math.log(ambientPressureMPa)
  ), "altitude-adjusted compressor pressure ratio");
  if (ratio <= 1) {
    throw new RangeError("ambient pressure leaves no feasible compressor pressure rise at the configured absolute discharge pressure");
  }
  return ratio;
}
export function calculateCoolantPumpPower({
  volumeFlowLPerMinute,
  pressureDropKPa,
  pumpEfficiency
}) {
  for (const [name, value] of Object.entries({
    volumeFlowLPerMinute, pressureDropKPa, pumpEfficiency
  })) finite(value, name);
  if (volumeFlowLPerMinute < 0 || pressureDropKPa < 0 ||
      pumpEfficiency <= 0 || pumpEfficiency > 1) {
    throw new RangeError("coolant flow and pressure drop must be non-negative and pump efficiency must be in (0, 1]");
  }
  if (volumeFlowLPerMinute === 0 || pressureDropKPa === 0) return 0;
  // Combine scale factors before exponentiation. Converting an extremely small
  // L/min value to m³/s first can underflow to zero even when the final kW is
  // representable after multiplication by a large pressure drop.
  const powerKw = Math.exp(
    Math.log(volumeFlowLPerMinute) + Math.log(pressureDropKPa) -
    Math.log(60000) - Math.log(pumpEfficiency)
  );
  if (powerKw === 0) {
    throw new RangeError("positive coolant pump inputs produce power below the representable numeric range");
  }
  return finiteResult(powerKw, "coolant pump electrical power");
}

export function calculateNetElectricalPower({ stackPowerKw, balanceOfPlantPowerKw }) {
  finite(stackPowerKw, "stackPowerKw");
  finite(balanceOfPlantPowerKw, "balanceOfPlantPowerKw");
  if (stackPowerKw < 0 || balanceOfPlantPowerKw < 0) {
    throw new RangeError("stack and balance-of-plant power must be non-negative");
  }
  // A system consuming more than the stack produces has no positive net export.
  // Do not add an artificial minimum output to an infeasible operating point.
  return Math.max(0, stackPowerKw - balanceOfPlantPowerKw);
}

export function calculateFuelToElectricEfficiency({
  netPowerKw,
  hydrogenFeedKgPerHour,
  hydrogenLhvKwhPerKg = 33.33
}) {
  for (const [name, value] of Object.entries({
    netPowerKw, hydrogenFeedKgPerHour, hydrogenLhvKwhPerKg
  })) finite(value, name);
  if (netPowerKw < 0 || hydrogenFeedKgPerHour <= 0 || hydrogenLhvKwhPerKg <= 0) {
    throw new RangeError("net power must be non-negative and hydrogen feed and LHV must be positive");
  }
  if (netPowerKw === 0) return 0;
  // Divide in log space: the fuel-energy product may overflow even when the
  // final efficiency ratio is a perfectly representable finite number.
  const efficiency = finiteResult(Math.exp(
    Math.log(netPowerKw) - Math.log(hydrogenFeedKgPerHour) - Math.log(hydrogenLhvKwhPerKg)
  ), "fuel-to-electric efficiency");
  if (efficiency === 0) throw new RangeError("positive net power produces efficiency below the representable numeric range");
  if (efficiency > 1) throw new RangeError("net electrical output cannot exceed hydrogen chemical energy input");
  return efficiency;
}

export function calculatePolarizationPoint({ reversibleVoltage, activationLoss, currentDensity, areaSpecificResistance, limitingCurrentDensity, concentrationCoefficient }) {
  for (const [name, value] of Object.entries({ reversibleVoltage, activationLoss, currentDensity, areaSpecificResistance, limitingCurrentDensity, concentrationCoefficient })) finite(value, name);
  if (reversibleVoltage <= 0 || activationLoss < 0 || currentDensity < 0 || areaSpecificResistance < 0 || limitingCurrentDensity <= 0 || concentrationCoefficient < 0) throw new RangeError("Polarization inputs are outside their physical domain");
  if (currentDensity >= limitingCurrentDensity) throw new RangeError("currentDensity must be below limitingCurrentDensity");
  let concentrationLoss = 0;
  if (concentrationCoefficient > 0) {
    const ratio = currentDensity / limitingCurrentDensity;
    // Preserve a representable loss when the pressure-independent current
    // ratio underflows to zero before multiplication by a large coefficient.
    concentrationLoss = ratio === 0
      ? Math.exp(Math.log(concentrationCoefficient) + Math.log(currentDensity) - Math.log(limitingCurrentDensity))
      : concentrationCoefficient * -Math.log1p(-ratio);
  }
  const ohmicLoss = currentDensity * areaSpecificResistance;
  const cellVoltage = reversibleVoltage - activationLoss - ohmicLoss - concentrationLoss;
  if (cellVoltage < 0) throw new RangeError("polarization losses exceed the reversible cell voltage");
  const powerDensity = cellVoltage * currentDensity;
  for (const [name, value] of Object.entries({ cellVoltage, activationLoss, ohmicLoss, concentrationLoss, powerDensity })) finiteResult(value, name);
  return Object.freeze({ cellVoltage, activationLoss, ohmicLoss, concentrationLoss, currentDensity, powerDensity });
}

export function calculateNernstPotential({ temperatureK, hydrogenPressureMPa, airPressureMPa }) {
  for (const [name, value] of Object.entries({ temperatureK, hydrogenPressureMPa, airPressureMPa })) finite(value, name);
  if (temperatureK <= 0 || hydrogenPressureMPa <= 0 || airPressureMPa <= 0) throw new RangeError("temperature and inlet pressures must be positive");
  const referencePressureMPa = 0.101325;
  // Work in log-pressure space: forming pressure ratios first can overflow
  // even when their logarithms and the final Nernst potential are finite.
  const logHydrogenAtm = Math.log(hydrogenPressureMPa) - Math.log(referencePressureMPa);
  const logOxygenAtm = Math.log(airPressureMPa) + Math.log(0.21) - Math.log(referencePressureMPa);
  const potential = 1.229 - 0.85e-3 * (temperatureK - 298.15)
    + 4.308e-5 * temperatureK * (logHydrogenAtm + 0.5 * logOxygenAtm);
  finiteResult(potential, "Nernst potential");
  return potential;
}
export function calculateReactantMassFlows({
  cellCount,
  stackCurrentA,
  hydrogenStoichRatio,
  airStoichRatio
}) {
  for (const [name, value] of Object.entries({
    cellCount, stackCurrentA, hydrogenStoichRatio, airStoichRatio
  })) finite(value, name);
  if (!Number.isSafeInteger(cellCount) || cellCount <= 0 ||
      stackCurrentA < 0 || hydrogenStoichRatio < 1 || airStoichRatio < 1) {
    throw new RangeError("cell count must be positive; current must be non-negative; stoichiometric ratios must be at least 1");
  }
  // Faraday's law gives the electrochemically consumed H2 independently of
  // the anode excess-feed ratio. λH2 affects fresh H2 feed only; λair is
  // applied separately to the theoretical cathode air requirement.
  if (stackCurrentA === 0) {
    return Object.freeze({
      hydrogenConsumedKgPerHour: 0,
      hydrogenFeedKgPerHour: 0,
      airFeedKgPerHour: 0
    });
  }
  // Combine Faraday and stoichiometric factors in log space. The direct
  // product can overflow at cellCount*current before the final divisor brings
  // a mathematically representable mass flow back into range.
  const logHydrogenConsumed = Math.log(cellCount) + Math.log(stackCurrentA) +
    Math.log(2.016) + Math.log(3.6) - Math.log(2) - Math.log(96485);
  const hydrogenConsumedKgPerHour = Math.exp(logHydrogenConsumed);
  const hydrogenFeedKgPerHour = Math.exp(logHydrogenConsumed + Math.log(hydrogenStoichRatio));
  // Dry-air/H2 stoichiometric mass ratio: 8 kg O2 per kg H2,
  // divided by the declared 0.232 dry-air oxygen mass fraction.
  const stoichiometricAirPerHydrogen = 8 / 0.232;
  const airFeedKgPerHour = Math.exp(
    logHydrogenConsumed + Math.log(stoichiometricAirPerHydrogen) + Math.log(airStoichRatio)
  );
  if (hydrogenConsumedKgPerHour === 0 || hydrogenFeedKgPerHour === 0 || airFeedKgPerHour === 0) {
    throw new RangeError("positive stack current produces reactant flow below the representable numeric range");
  }
  const result = {
    hydrogenConsumedKgPerHour,
    hydrogenFeedKgPerHour,
    airFeedKgPerHour
  };
  for (const [name, value] of Object.entries(result)) finiteResult(value, name);
  return Object.freeze(result);
}

export function calculateCoolantFlow({ heatPowerKw, deltaTemperatureK, specificHeatKJPerKgK, densityKgPerL }) {
  for (const [name, value] of Object.entries({ heatPowerKw, deltaTemperatureK, specificHeatKJPerKgK, densityKgPerL })) {
    finite(value, name);
  }
  if (heatPowerKw < 0 || deltaTemperatureK <= 0 ||
      specificHeatKJPerKgK <= 0 || densityKgPerL <= 0) {
    throw new RangeError("heat power must be non-negative; temperature rise, specific heat and density must be positive");
  }
  if (heatPowerKw === 0) {
    return Object.freeze({ massFlowKgPerSecond:0, massFlowKgPerMinute:0, volumeFlowLPerMinute:0 });
  }
  // kW is kJ/s. Use logarithms to avoid an avoidable overflow in cp*ΔT
  // when the final mass or volume flow is still representable.
  const logMassFlowPerSecond = Math.log(heatPowerKw) -
    Math.log(specificHeatKJPerKgK) - Math.log(deltaTemperatureK);
  const massFlowKgPerSecond = Math.exp(logMassFlowPerSecond);
  const massFlowKgPerMinute = Math.exp(logMassFlowPerSecond + Math.log(60));
  const volumeFlowLPerMinute = Math.exp(logMassFlowPerSecond + Math.log(60) - Math.log(densityKgPerL));
  // A positive heat load cannot physically produce an exact zero flow. If any
  // required output underflows, reject it instead of silently reporting zero.
  if (massFlowKgPerSecond === 0 || massFlowKgPerMinute === 0 || volumeFlowLPerMinute === 0) {
    throw new RangeError("positive coolant heat load produces a flow below the representable numeric range");
  }
  for (const [name, value] of Object.entries({ massFlowKgPerSecond, massFlowKgPerMinute, volumeFlowLPerMinute })) {
    finiteResult(value, name);
  }
  return Object.freeze({ massFlowKgPerSecond, massFlowKgPerMinute, volumeFlowLPerMinute });
}

export function calculateCellVoltage({ reversibleVoltage, activationCoefficient, currentDensity, exchangeCurrentDensity, areaSpecificResistance, concentrationCoefficient, concentrationExponent }) {
  for (const [name, value] of Object.entries({ reversibleVoltage, activationCoefficient, currentDensity, exchangeCurrentDensity, areaSpecificResistance, concentrationCoefficient, concentrationExponent })) finite(value, name);
  if (reversibleVoltage <= 0 || activationCoefficient < 0 || currentDensity <= 0 || exchangeCurrentDensity <= 0 || areaSpecificResistance < 0 || concentrationCoefficient < 0 || concentrationExponent < 0) throw new RangeError("polarization parameters are outside their physical domain");
  if (currentDensity < exchangeCurrentDensity) throw new RangeError("currentDensity must be at least exchangeCurrentDensity for the Tafel approximation");
  // Subtract logarithms instead of dividing: current/exchange can overflow
  // although the logarithmic Tafel loss is still finite.
  const activationLoss = activationCoefficient === 0 ? 0
    : activationCoefficient * (Math.log(currentDensity) - Math.log(exchangeCurrentDensity));
  const ohmicLoss = areaSpecificResistance * currentDensity;
  // A zero coefficient means no concentration loss, even at extreme current.
  // Combine logarithms before exponentiation so a tiny coefficient can offset
  // exp() overflow while the mathematically scaled loss is still representable.
  const concentrationLoss = concentrationCoefficient === 0 ? 0
    : Math.exp(Math.log(concentrationCoefficient) + concentrationExponent * currentDensity);
  const cellVoltage = reversibleVoltage - activationLoss - ohmicLoss - concentrationLoss;
  if (cellVoltage < 0) throw new RangeError("polarization losses exceed the reversible cell voltage");
  for (const [name, value] of Object.entries({ activationLoss, ohmicLoss, concentrationLoss, cellVoltage })) finiteResult(value, name);
  return Object.freeze({ cellVoltage, activationLoss, ohmicLoss, concentrationLoss });
}


/**
 * Amphlett static PEMFC polarization point based on the published OPEM
 * implementation equations. Pressures are partial pressures in atm;
 * current is A; area and membrane thickness are cm² and cm.
 * This is a separate model from the project's existing empirical helper.
 */
export function calculateAmphlettPolarizationPoint({
  temperatureK,
  hydrogenPartialPressureAtm,
  oxygenPartialPressureAtm,
  currentA,
  activeAreaCm2,
  membraneThicknessCm,
  membraneWaterContentLambda,
  electronicResistanceOhm = 0,
  maxCurrentDensityAcm2 = 1.5,
  numberOfCells = 1
}) {
  const inputs = {
    temperatureK, hydrogenPartialPressureAtm, oxygenPartialPressureAtm,
    currentA, activeAreaCm2, membraneThicknessCm, membraneWaterContentLambda,
    electronicResistanceOhm, maxCurrentDensityAcm2
  };
  for (const [name, value] of Object.entries(inputs)) {
    if (!Number.isFinite(value)) throw new TypeError(name + " must be finite");
  }
  if (temperatureK <= 0 || hydrogenPartialPressureAtm <= 0 || oxygenPartialPressureAtm <= 0 ||
      currentA < 0 || activeAreaCm2 <= 0 || membraneThicknessCm <= 0 ||
      electronicResistanceOhm < 0 || maxCurrentDensityAcm2 <= 0) {
    throw new RangeError("Amphlett model inputs are outside their positive physical domain");
  }
  if (membraneWaterContentLambda < 14 || membraneWaterContentLambda > 23) {
    throw new RangeError("membraneWaterContentLambda must be between 14 and 23");
  }
  if (!Number.isSafeInteger(numberOfCells) || numberOfCells < 1 || numberOfCells > 100000) {
    throw new RangeError("numberOfCells must be a positive safe integer no greater than 100000");
  }

  const currentDensityAcm2 = currentA / activeAreaCm2;
  if (currentA > 0 && currentDensityAcm2 === 0) {
    throw new RangeError("positive current produces a current density below the representable numeric range");
  }
  if (currentDensityAcm2 >= maxCurrentDensityAcm2) {
    throw new RangeError("current density must remain below the Amphlett limiting current density");
  }
  const membraneDenominator = membraneWaterContentLambda - 0.634 - 3 * currentDensityAcm2;
  if (membraneDenominator <= 0) {
    throw new RangeError("Amphlett membrane-resistivity denominator must remain positive");
  }

  const hydrogenConcentrationMolPerCm3 =
    hydrogenPartialPressureAtm / (1.09e6 * Math.exp(77 / temperatureK));
  const oxygenConcentrationMolPerCm3 =
    oxygenPartialPressureAtm / (5.08e6 * Math.exp(-498 / temperatureK));
  if (!Number.isFinite(hydrogenConcentrationMolPerCm3) ||
      hydrogenConcentrationMolPerCm3 <= 0 ||
      !Number.isFinite(oxygenConcentrationMolPerCm3) ||
      oxygenConcentrationMolPerCm3 <= 0) {
    throw new RangeError("Amphlett gas concentrations must remain finite and positive within the model's numeric domain");
  }
  const nernstVoltageV = 1.229 - 8.5e-4 * (temperatureK - 298.15) +
    4.308e-5 * temperatureK *
    (Math.log(hydrogenPartialPressureAtm) + 0.5 * Math.log(oxygenPartialPressureAtm));

  let activationLossV = 0;
  let ohmicLossV = 0;
  let concentrationLossV = 0;
  let membraneResistivityOhmCm = 0;
  let protonResistanceOhm = 0;
  if (currentA > 0) {
    const xi2 = 0.00286 + 0.0002 * Math.log(activeAreaCm2) +
      4.3e-5 * Math.log(hydrogenConcentrationMolPerCm3);
    activationLossV = -(
      -0.948 + xi2 * temperatureK +
      7.6e-5 * temperatureK * Math.log(oxygenConcentrationMolPerCm3) -
      1.93e-4 * temperatureK * Math.log(currentA)
    );

    const densityRatio = currentDensityAcm2;
    membraneResistivityOhmCm = 181.6 *
      (1 + 0.03 * densityRatio +
        0.062 * Math.pow(temperatureK / 303, 2) * Math.pow(densityRatio, 2.5)) /
      (membraneDenominator * Math.exp(4.18 * ((temperatureK - 303) / temperatureK)));
    protonResistanceOhm = membraneResistivityOhmCm * membraneThicknessCm / activeAreaCm2;
    ohmicLossV = currentA * (protonResistanceOhm + electronicResistanceOhm);

    const gasConstantJPerKmolK = 8314.47;
    const faradayCPerKmol = 96484600;
    const electronsTransferred = 2;
    const concentrationCoefficientV =
      (gasConstantJPerKmolK * temperatureK) / (electronsTransferred * faradayCPerKmol);
    concentrationLossV = -concentrationCoefficientV *
      Math.log(1 - currentDensityAcm2 / maxCurrentDensityAcm2);
  }

  const cellVoltageV = nernstVoltageV - activationLossV - ohmicLossV - concentrationLossV;
  if (cellVoltageV < 0) {
    throw new RangeError("Amphlett polarization losses exceed the reversible voltage; operating point is outside the feasible cell-voltage domain");
  }
  const stackVoltageV = numberOfCells * cellVoltageV;
  const cellPowerW = cellVoltageV * currentA;
  const stackPowerW = numberOfCells * cellPowerW;
  const result = {
    model: "Amphlett static PEMFC",
    temperatureK,
    hydrogenPartialPressureAtm,
    oxygenPartialPressureAtm,
    currentA,
    currentDensityAcm2,
    hydrogenConcentrationMolPerCm3,
    oxygenConcentrationMolPerCm3,
    nernstVoltageV,
    activationLossV,
    ohmicLossV,
    concentrationLossV,
    membraneResistivityOhmCm,
    protonResistanceOhm,
    cellVoltageV,
    numberOfCells,
    stackVoltageV,
    cellPowerW,
    stackPowerW
  };
  for (const [name, value] of Object.entries(result)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new RangeError("Amphlett result " + name + " exceeds the finite numeric range");
    }
  }
  return Object.freeze(result);
}
