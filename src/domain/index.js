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
  const ratio = basePressureRatio * referencePressureMPa / ambientPressureMPa;
  return finiteResult(ratio, "altitude-adjusted compressor pressure ratio");
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
  const fuelInputKw = hydrogenFeedKgPerHour * hydrogenLhvKwhPerKg;
  const efficiency = finiteResult(netPowerKw / fuelInputKw, "fuel-to-electric efficiency");
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
