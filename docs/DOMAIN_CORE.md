# Domain core

The first rebuild slice extracts a deterministic PEM polarization calculation from the presentation layer. All losses and coefficients are explicit inputs; no hidden fitted constants or synthetic measurements are introduced. Units must be supplied consistently by callers (documented convention: V, A/cm², Ω·cm², V for the concentration coefficient).

## Shared calculations and unit contract

- `calculateNernstPotential`: temperature is K; hydrogen pressure is the hydrogen partial pressure in MPa; air pressure is total inlet air pressure in MPa. The implementation assumes an oxygen mole fraction of 0.21 in air, converts pressures relative to 0.101325 MPa (1 atm), and returns reversible voltage in V. This is a simplified inlet-gas Nernst calculation; it does not model water-vapour dilution or local channel composition.
- `calculatePolarizationPoint`: reversible voltage, activation loss and concentration coefficient are V; current density and limiting current density are A/cm²; area-specific resistance is Ω·cm². It calculates ohmic loss as ASR × current density and concentration loss as coefficient × -ln(1 - j/jL). The limiting-current singularity is rejected.
- `calculateCellVoltage`: reversible voltage, activation coefficient and concentration coefficient are V; current density and exchange current density are A/cm²; area-specific resistance is Ω·cm²; concentration exponent is (A/cm²)⁻¹. It uses a Tafel-form activation loss and an empirical exponential concentration-loss term. The Tafel approximation is rejected below the exchange-current reference.

The two polarization helpers use different concentration-loss parameterisations. Their coefficients must not be interchanged without fitting and dimensional review.

## Correctness boundary
- This is a model component, not a validated electrochemical parameter set.
- Calibration, parameter provenance, temperature/pressure correction and literature citations are required before engineering decisions.
- The model rejects the limiting-current singularity rather than silently clamping it.
