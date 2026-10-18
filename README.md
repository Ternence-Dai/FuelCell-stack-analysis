# Hydrogen Fuel Cell Engineering Platform

> 氢能燃料电池数字工程平台

A reproducible engineering workbench for PEM fuel-cell stack design, operating-point analysis, polarization curves, thermal/water-management studies, degradation tracking, and validated engineering reports.

## Product modules

- Electrochemical model library with documented assumptions and unit-safe inputs
- Stack sizing and cell-to-stack scaling
- Polarization and power-density analysis
- Thermal, pressure-drop, and water-management models
- Parameter sweeps, sensitivity analysis, and scenario comparison
- Data import, provenance, and reproducible reports

## Engineering principles

Every equation must cite its source or derivation, declare units and valid ranges, and include reference cases with tolerance-based regression tests. Never present synthetic values as measured stack data.

- Modular, typed, documented code; no monolithic application entry point.
- Reproducible setup, deterministic tests, and automated quality checks.
- Secure configuration: secrets belong in environment variables or managed secret stores, never in source control.
- Accessible, responsive interface with clear loading, empty, error, and offline states.
- Open-source components are evaluated for maintenance, license compatibility, security, and fit before adoption.

## Delivery status

The modernization work is being applied directly to `main`. The verified slice now includes shared Nernst/polarization/cell-voltage calculations, a branch-aware current-density solver with a power-limited state, and a shared coolant-flow calculation used by both the stack solver and thermal calculator. The V3 interface visibly changes the former dark, dense parameter list into a light engineering workspace with a refined KPI dashboard, two-column parameter-category cards, three-column expanded parameter cards, and responsive phone layouts. The domain and UI regression checks cover pressure normalization, polarization boundaries, extreme numeric cases, coolant mass/volume-flow units, and the visible responsive interface. The current Pages build and CI checks pass; this confirms a buildable slice, not a fully validated engineering product.

Remaining delivery work includes calibration against traceable stack datasets, source references and uncertainty for the fitted electrochemical parameters, deeper water/thermal and transient models, data provenance/import-export, and browser-level tests for critical workflows. Built-in project examples remain demonstrations, not measured customer or laboratory results.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
