# Domain core

The first rebuild slice extracts a deterministic PEM polarization calculation from the presentation layer. All losses and coefficients are explicit inputs; no hidden fitted constants or synthetic measurements are introduced. Units must be supplied consistently by callers (documented convention: V, A/cm², Ω·cm², V for the concentration coefficient).

## Correctness boundary
- This is a model component, not a validated electrochemical parameter set.
- Calibration, parameter provenance, temperature/pressure correction and literature citations are required before engineering decisions.
- The model rejects the limiting-current singularity rather than silently clamping it.
