const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
};
const finiteResult = (value, name) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} exceeds the finite numeric range`);
  return value;
};
export function calculatePolarizationPoint({ reversibleVoltage, activationLoss, currentDensity, areaSpecificResistance, limitingCurrentDensity, concentrationCoefficient }) {
  for (const [name, value] of Object.entries({ reversibleVoltage, activationLoss, currentDensity, areaSpecificResistance, limitingCurrentDensity, concentrationCoefficient })) finite(value, name);
  if (reversibleVoltage <= 0 || activationLoss < 0 || currentDensity < 0 || areaSpecificResistance < 0 || limitingCurrentDensity <= 0 || concentrationCoefficient < 0) throw new RangeError("Polarization inputs are outside their physical domain");
  if (currentDensity >= limitingCurrentDensity) throw new RangeError("currentDensity must be below limitingCurrentDensity");
  const concentrationLoss = concentrationCoefficient * Math.log(1 / (1 - currentDensity / limitingCurrentDensity));
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
export function calculateCellVoltage({ reversibleVoltage, activationCoefficient, currentDensity, exchangeCurrentDensity, areaSpecificResistance, concentrationCoefficient, concentrationExponent }) {
  for (const [name, value] of Object.entries({ reversibleVoltage, activationCoefficient, currentDensity, exchangeCurrentDensity, areaSpecificResistance, concentrationCoefficient, concentrationExponent })) finite(value, name);
  if (reversibleVoltage <= 0 || activationCoefficient < 0 || currentDensity <= 0 || exchangeCurrentDensity <= 0 || areaSpecificResistance < 0 || concentrationCoefficient < 0 || concentrationExponent < 0) throw new RangeError("polarization parameters are outside their physical domain");
  if (currentDensity < exchangeCurrentDensity) throw new RangeError("currentDensity must be at least exchangeCurrentDensity for the Tafel approximation");
  const activationLoss = activationCoefficient * Math.log(currentDensity / exchangeCurrentDensity);
  const ohmicLoss = areaSpecificResistance * currentDensity;
  const concentrationLoss = concentrationCoefficient * Math.exp(concentrationExponent * currentDensity);
  const cellVoltage = reversibleVoltage - activationLoss - ohmicLoss - concentrationLoss;
  for (const [name, value] of Object.entries({ activationLoss, ohmicLoss, concentrationLoss, cellVoltage })) finiteResult(value, name);
  return Object.freeze({ cellVoltage, activationLoss, ohmicLoss, concentrationLoss });
}
