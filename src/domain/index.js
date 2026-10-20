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
  const hydrogenConsumedKgPerHour =
    cellCount * stackCurrentA * 2.016 * 3.6 / (2 * 96485);
  const hydrogenFeedKgPerHour = hydrogenConsumedKgPerHour * hydrogenStoichRatio;
  // Dry-air/H2 stoichiometric mass ratio: 8 kg O2 per kg H2,
  // divided by the declared 0.232 dry-air oxygen mass fraction.
  const dryAirOxygenMassFraction = 0.232;
  const stoichiometricAirPerHydrogen = 8 / dryAirOxygenMassFraction;
  const airFeedKgPerHour = hydrogenConsumedKgPerHour * stoichiometricAirPerHydrogen * airStoichRatio;
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
  for (const [name, value] of Object.entries({ activationLoss, ohmicLoss, concentrationLoss, cellVoltage })) finiteResult(value, name);
  return Object.freeze({ cellVoltage, activationLoss, ohmicLoss, concentrationLoss });
}
