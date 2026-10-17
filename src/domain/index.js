const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
};
export function calculatePolarizationPoint({ reversibleVoltage, activationLoss, currentDensity, areaSpecificResistance, limitingCurrentDensity, concentrationCoefficient }) {
  for (const [name, value] of Object.entries({ reversibleVoltage, activationLoss, currentDensity, areaSpecificResistance, limitingCurrentDensity, concentrationCoefficient })) finite(value, name);
  if (reversibleVoltage <= 0 || activationLoss < 0 || currentDensity < 0 || areaSpecificResistance < 0 || limitingCurrentDensity <= 0 || concentrationCoefficient < 0) throw new RangeError("Polarization inputs are outside their physical domain");
  if (currentDensity >= limitingCurrentDensity) throw new RangeError("currentDensity must be below limitingCurrentDensity");
  const concentrationLoss = concentrationCoefficient * Math.log(1 / (1 - currentDensity / limitingCurrentDensity));
  const ohmicLoss = currentDensity * areaSpecificResistance;
  const cellVoltage = reversibleVoltage - activationLoss - ohmicLoss - concentrationLoss;
  return Object.freeze({ cellVoltage, activationLoss, ohmicLoss, concentrationLoss, currentDensity, powerDensity: cellVoltage * currentDensity });
}
