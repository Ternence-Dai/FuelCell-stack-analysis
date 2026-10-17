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

## Rebuild status

The rebuild/platform-v2 branch is the new implementation track. The existing main branch remains unchanged during development. This repository is not considered rebuilt until the implementation, tests, documentation, and deployment path have been verified.

See [the rebuild plan](docs/REBUILD_PLAN.md).
