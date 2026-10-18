# Rebuild plan — 氢能燃料电池数字工程平台

## Product intent

A reproducible engineering workbench for PEM fuel-cell stack design, operating-point analysis, polarization curves, thermal/water-management studies, degradation tracking, and validated engineering reports.

## Target capabilities

1. Electrochemical model library with documented assumptions and unit-safe inputs
2. Stack sizing and cell-to-stack scaling
3. Polarization and power-density analysis
4. Thermal, pressure-drop, and water-management models
5. Parameter sweeps, sensitivity analysis, and scenario comparison
6. Data import, provenance, and reproducible reports

## Non-negotiable correctness and safety gates

Every equation must cite its source or derivation, declare units and valid ranges, and include reference cases with tolerance-based regression tests. Never present synthetic values as measured stack data.

## Delivery sequence

1. Inventory current behavior, assets, data formats, and dependencies.
2. Define domain model, API contracts, permissions, and migration/import strategy.
3. Implement the smallest end-to-end vertical slice with typed interfaces.
4. Add unit, integration, and browser-level tests for critical workflows.
5. Add CI, security/dependency scanning, and reproducible build instructions.
6. Validate with reference datasets and document known limitations.
7. Review deployment, backup, recovery, and release process before production use.

## Delivered vertical slices

- [x] Shared electrochemical polarization and Nernst model with reference and extreme-value tests
- [x] First/upward operating-branch solver with explicit maximum-power limitation
- [x] Minimum-current floor disclosure when a requested power is below the modeled scan range
- [x] Shared coolant-flow units and thermal-calculator integration
- [ ] Traceable calibration of electrochemical parameters against stack datasets
- [ ] Uncertainty and source references for fitted parameter values
- [ ] Water-management, transient and degradation models with reference datasets
- [ ] Data provenance, reproducible result exports and browser-level acceptance

The current solver status only describes feasibility within its static model and scan range. It is not a dynamic control or safety guarantee.

## Open-source adoption policy

For each dependency or reference project, record its repository URL, license, maintenance activity, security posture, exact component being reused or adapted, and attribution obligations. Prefer stable standards and small interoperable components over copying whole applications.

## Status

- [ ] Existing repository and data audit complete
- [ ] Domain model and architecture approved
- [ ] Core vertical slice implemented
- [ ] Critical workflows tested
- [ ] CI and security checks passing
- [ ] Deployment and backup procedure verified
- [ ] Release candidate reviewed
