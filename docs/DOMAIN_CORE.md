# Domain core

The first rebuild slice extracts a deterministic PEM polarization calculation from the presentation layer. All losses and coefficients are explicit inputs; no hidden fitted constants or synthetic measurements are introduced. Units must be supplied consistently by callers (documented convention: V, A/cm², Ω·cm², V for the concentration coefficient).

## Shared calculations and unit contract

- `calculateNernstPotential`: temperature is K; hydrogen pressure is the hydrogen partial pressure in MPa; air pressure is total inlet air pressure in MPa. The implementation assumes an oxygen mole fraction of 0.21 in air, converts pressures relative to 0.101325 MPa (1 atm), and returns reversible voltage in V. This is a simplified inlet-gas Nernst calculation; it does not model water-vapour dilution or local channel composition.
- `calculatePolarizationPoint`: reversible voltage, activation loss and concentration coefficient are V; current density and limiting current density are A/cm²; area-specific resistance is Ω·cm². It calculates ohmic loss as ASR × current density and concentration loss as coefficient × -ln(1 - j/jL). The limiting-current singularity is rejected.
- `calculateCoolantFlow`: heat load is kW (kJ/s); temperature rise is K; specific heat is kJ/(kg·K); density is kg/L. It returns mass flow in kg/s and kg/min plus volume flow in L/min using `ṁ = Q/(cp·ΔT)` and `V̇ = ṁ/ρ`. The EG50 automatic-flow fallback uses cp = 3.55 kJ/(kg·K) and density = 1.05 kg/L; other coolant selections should use measured or manufacturer-specified properties in the adjustable thermal calculator.
- `calculateCellVoltage`: reversible voltage, activation coefficient and concentration coefficient are V; current density and exchange current density are A/cm²; area-specific resistance is Ω·cm²; concentration exponent is (A/cm²)⁻¹. It uses a Tafel-form activation loss and an empirical exponential concentration-loss term. The Tafel approximation is rejected below the exchange-current reference.

The two polarization helpers use different concentration-loss parameterisations. Their coefficients must not be interchanged without fitting and dimensional review.

## Power-target feasibility and solver boundary

The current-density solver is implemented in the shared domain core as `solveFirstPowerCrossing`. It scans the documented interval of 0.01–3.0 A/cm², brackets the first upward crossing, and refines that crossing with 60 bisection iterations. It intentionally does not extrapolate below the Tafel model's minimum current density or above the modeled peak-power point. Finite negative power values on the high-current descending branch are permitted during the scan but cannot become a positive target crossing; non-finite model output is rejected.

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

## Reference implementations and parameter provenance

The model architecture is benchmarked against the public [ECSIM/OPEM PEMFC simulator](https://github.com/ECSIM/opem), which separates several published static and dynamic model families and documents input units, test vectors, outputs, and literature references. OPEM is a reference implementation for comparison and reproducibility; its fitted coefficients must not be copied into this project without confirming the same model family, units, cell geometry, operating conditions, and calibration basis.

Relevant primary model references identified by OPEM include:

- Amphlett et al. (1995), *Performance Modeling of the Ballard Mark IV Solid Polymer Electrolyte Fuel Cell*, Journal of The Electrochemical Society 142(1), 9–15, [doi:10.1149/1.2043959](https://doi.org/10.1149/1.2043959).
- Correa et al. (2005), *Sensitivity Analysis of the Modeling Parameters Used in Simulation of Proton Exchange Membrane Fuel Cells*, IEEE Transactions on Energy Conversion 20(1), 211–218, [doi:10.1109/TEC.2004.842382](https://doi.org/10.1109/TEC.2004.842382).
- Kim et al. (1995), *Modeling of Proton Exchange Membrane Fuel Cell Performance with an Empirical Equation*, Journal of The Electrochemical Society 142(8), 2670–2674, [doi:10.1149/1.2050072](https://doi.org/10.1149/1.2050072).

Parameter and composition safeguards:

- The 0.21 oxygen fraction used by the simplified Nernst calculation is a dry-air **mole fraction**. The 0.232 oxygen fraction used for dry-air mass-flow conversion is a **mass fraction**. They represent different bases and must never be interchanged.
- The Faraday feed calculation uses the declared hydrogen molar mass of 2.016 g/mol and Faraday constant of 96,485 C/mol. The resulting stoichiometric feed is a theoretical calculation, not a measured consumption rate.
- Activation coefficient, exchange current density, area-specific resistance, concentration coefficient, concentration exponent, coolant properties, and operating limits remain stack- or coolant-specific inputs. They require a source, calibration record, uncertainty, and valid operating range before use for engineering decisions.
- A comparison with OPEM is valid only after selecting a matching model family and aligning temperature, pressure basis, active area, membrane properties, current-density range, and parameter definitions. Similar-looking polarization curves alone do not establish model equivalence.



## Amphlett static PEMFC reference model

`calculateAmphlettPolarizationPoint` adds a separately named Amphlett static model; it does not replace the existing project's empirical polarization helper. Its inputs are explicit: temperature in K, hydrogen/oxygen partial pressures in atm, current in A, active area in cm², membrane thickness in cm, membrane water-content parameter `lambda` (14–23), electronic resistance in Ω, and limiting current density in A/cm².

The implementation follows the published OPEM Amphlett equations for Nernst potential, activation loss, membrane/proton resistance, ohmic loss, and concentration loss. It returns each loss term and the cell/stack voltage and power separately. Current density at or above the configured limiting current is rejected; values are not silently clamped.

The implementation is independently written and tested against the OPEM v1.4 documented reference vector (T=343.15 K, PH₂=1 atm, PO₂=1 atm, i=2 A, A=50.6 cm², membrane thickness=0.0178 cm, lambda=23, JMax=1.5 A/cm²). The reference point is a software regression fixture, not a calibration certificate or proof of accuracy for a particular physical stack. Real use still requires parameter provenance, unit review, calibration against measured polarization data, and independent validation.

Reference: [ECSIM/OPEM Amphlett static model documentation](https://www.ecsim.site/opem/doc/Static/Amphlett.html) and [ECSIM/opem source repository](https://github.com/ECSIM/opem). The underlying model reference is Amphlett et al., *Performance Modeling of the Ballard Mark IV Solid Polymer Electrolyte Fuel Cell*, Journal of The Electrochemical Society 142(1), 1995, DOI: 10.1149/1.2043959.
