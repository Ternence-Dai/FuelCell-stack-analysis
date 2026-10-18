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

The modernization work is being applied directly to `main`. The current baseline includes a domain-core module, automated domain tests, standalone-app validation, and a GitHub Pages deployment workflow. These checks passing confirms the current baseline is buildable; it does **not** mean the full product rebuild is complete.

Remaining delivery work includes validating the existing application workflows and data, extracting maintainable modules from the legacy entry point, adding migration-safe persistence and import/export checks, and documenting verified domain rules. Existing user data and the legacy application must be preserved while these changes are introduced.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
