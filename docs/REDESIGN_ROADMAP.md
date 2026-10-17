# HyHub — Deep Redesign Roadmap

> Status: discovery and architecture baseline. This document does not claim that source code has been refactored or that scientific models have been validated.

## Product vision
Evolve the existing single-page fuel-cell stack analysis application into a trustworthy engineering workbench for experiment ingestion, electrochemical analysis, diagnostics, and explainable digital-twin workflows.

## Product pillars
1. **Experiment workspace** — immutable raw-data imports, dataset metadata, units, provenance, calibration notes, and reproducible analysis runs.
2. **Electrochemical analysis** — polarization curves, power density, cell-voltage distribution, resistance/impedance workflows where source data supports them, and configurable operating-condition comparisons.
3. **Diagnostic intelligence** — rule-based anomaly flags first; statistical/ML diagnosis only after representative labelled data and validation exist. Show evidence, confidence, and limitations.
4. **Stack digital twin** — parameterized models with explicit assumptions, calibration status, validation datasets, and model-version history. Never present simulated values as measurements.
5. **Engineering reporting** — export plots, tables, parameters, source dataset IDs, calculation versions, and reproducibility notes.

## Proposed architecture
- Frontend: TypeScript + React/Vite, componentized dashboard, accessible responsive layouts, chart adapters.
- Domain core: pure tested TypeScript calculation modules with explicit units and validation.
- Data/API: versioned API boundary; select persistence only after reviewing current data requirements.
- Scientific layer: optional Python service for validated numerical workflows; keep deterministic calculations independently testable.
- Quality: Vitest unit tests, Playwright critical-path tests, schema validation, CI build and dependency/security checks.

## Redesign workstreams
### P0 — preserve and understand
- Inventory all existing screens, controls, calculations, data formats, exports, and browser storage.
- Capture screenshots and baseline behavior.
- Identify every equation, unit, coefficient, and data-source assumption.
- Remove unnecessary personal contact metadata from public HTML and docs; retain only intentionally published project attribution.

### P1 — trustworthy engineering core
- Define canonical entities: Experiment, Stack, Cell, OperatingPoint, Measurement, AnalysisRun, ModelVersion.
- Add unit-aware input validation, missing-data handling, and calculation provenance.
- Build regression fixtures from known examples; independently verify scientific equations before changing outputs.

### P2 — product experience
- Redesign navigation around Projects / Experiments / Analysis / Diagnostics / Digital Twin / Reports.
- Add comparison views, uncertainty/quality indicators, empty/error/loading states, keyboard accessibility, and mobile behavior.
- Keep advanced features progressive rather than overwhelming first-time users.

### P3 — validated intelligence
- Add explainable diagnostic rules and user-reviewed findings.
- Add model calibration and validation workflows before predictive claims.
- Track drift, model version, data coverage, and confidence; abstain when evidence is insufficient.

## Acceptance criteria
- Existing supported workflows have documented regression tests before replacement.
- Every engineering value has a unit, source, and calculation/model version.
- Invalid, incomplete, or out-of-range inputs are handled explicitly.
- Simulation, measured data, and estimated values are visually distinguishable.
- Scientific calculations have reviewed reference cases and tolerances.
- CI build, unit tests, and end-to-end smoke tests pass before merge.

## Non-goals / safeguards
- No unsupported claims of remaining useful life or fault prediction accuracy.
- No invented electrochemical constants or fabricated experimental datasets.
- No destructive migration of user data.
- No merge to main until the owner reviews the pull request and evidence.
