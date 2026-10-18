# Domain core

The first rebuild slice extracts a deterministic PEM polarization calculation from the presentation layer. All losses and coefficients are explicit inputs; no hidden fitted constants or synthetic measurements are introduced. Units must be supplied consistently by callers (documented convention: V, A/cm², Ω·cm², V for the concentration coefficient).

## Shared calculations and unit contract

- `calculateNernstPotential`: temperature is K; hydrogen pressure is the hydrogen partial pressure in MPa; air pressure is total inlet air pressure in MPa. The implementation assumes an oxygen mole fraction of 0.21 in air, converts pressures relative to 0.101325 MPa (1 atm), and returns reversible voltage in V. This is a simplified inlet-gas Nernst calculation; it does not model water-vapour dilution or local channel composition.
- `calculatePolarizationPoint`: reversible voltage, activation loss and concentration coefficient are V; current density and limiting current density are A/cm²; area-specific resistance is Ω·cm². It calculates ohmic loss as ASR × current density and concentration loss as coefficient × -ln(1 - j/jL). The limiting-current singularity is rejected.
- `calculateCoolantFlow`: heat load is kW (kJ/s); temperature rise is K; specific heat is kJ/(kg·K); density is kg/L. It returns mass flow in kg/s and kg/min plus volume flow in L/min using `ṁ = Q/(cp·ΔT)` and `V̇ = ṁ/ρ`. The EG50 automatic-flow fallback uses cp = 3.55 kJ/(kg·K) and density = 1.05 kg/L; other coolant selections should use measured or manufacturer-specified properties in the adjustable thermal calculator.
- `calculateCellVoltage`: reversible voltage, activation coefficient and concentration coefficient are V; current density and exchange current density are A/cm²; area-specific resistance is Ω·cm²; concentration exponent is (A/cm²)⁻¹. It uses a Tafel-form activation loss and an empirical exponential concentration-loss term. The Tafel approximation is rejected below the exchange-current reference.

The two polarization helpers use different concentration-loss parameterisations. Their coefficients must not be interchanged without fitting and dimensional review.

## Power-target feasibility and solver boundary

The current-density solver searches the upward branch over the documented scan interval of 0.01–3.0 A/cm². It intentionally does not extrapolate below the Tafel model's minimum current density or above the modeled peak-power point.

- If the target lies below the minimum scan point's power, the solver uses the 0.01 A/cm² floor and labels the result `below-minimum`; calculated output is higher than the requested target.
- If the target exceeds the modeled peak, it uses the peak-power point and labels the result `above-maximum`; calculated output is lower than the request.
- Only a result labelled `attained` is within the solver's 0.5% target tolerance.

The standalone electrochemical calculator and main stack dashboard both consume the same domain-computed activation, ohmic and concentration-loss terms. The status is a numerical feasibility disclosure, not a guarantee of dynamic stability, durability, or safe operating limits.

## Correctness boundary
- This is a model component, not a validated electrochemical parameter set.
- Calibration, parameter provenance, temperature/pressure correction and literature citations are required before engineering decisions.
- The model rejects the limiting-current singularity rather than silently clamping it.


## Reactant-feed mass basis

Hydrogen consumption follows Faraday's law. Fresh hydrogen feed is scaled only by the hydrogen stoichiometric ratio; cathode air feed is calculated independently as 8 kg O₂ per kg H₂ divided by the declared dry-air oxygen mass fraction 0.232, then multiplied by the air stoichiometric ratio. This gives 34.4827586 kg dry air per kg hydrogen at λair = 1. The value is a stated composition assumption, not a measured site-specific air composition.
