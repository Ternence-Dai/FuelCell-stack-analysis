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

The modernization work is being applied directly to `main`. The verified slice now includes shared Nernst/polarization/cell-voltage calculations, a branch-aware current-density solver that explicitly distinguishes targets below the minimum modeled current from targets above peak stack power, a single shared source for polarization-loss reporting in the stack solver and standalone calculator, and a shared coolant-flow calculation used by both the stack solver and thermal calculator. The V3 interface visibly changes the former dark, dense parameter list into a light engineering workspace with a refined KPI dashboard, two-column parameter-category cards, three-column expanded parameter cards, and responsive phone layouts. The domain and UI regression checks cover pressure normalization, polarization boundaries, extreme numeric cases, coolant mass/volume-flow units, and the visible responsive interface. The current Pages build and CI checks pass; this confirms a buildable slice, not a fully validated engineering product.

Remaining delivery work includes calibration against traceable stack datasets, source references and uncertainty for the fitted electrochemical parameters, deeper water/thermal and transient models, data provenance/import-export, and browser-level tests for critical workflows. Built-in project examples remain demonstrations, not measured customer or laboratory results.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).


## 开源项目深度对标

本项目采用的上游参考、架构借鉴、实现边界与后续验收要求见 [docs/OPEN_SOURCE_BENCHMARKS.md](docs/OPEN_SOURCE_BENCHMARKS.md)。

## 本地运行

本应用以相对路径动态加载 ES 模块（`src/domain/index.js`），直接双击 `index.html`（file://）打开时模块会加载失败（页面底部会给出提示）。请用任意静态 HTTP 服务托管项目目录：

```bash
python3 -m http.server 8000
# 然后在浏览器打开 http://localhost:8000
```

开发校验（需要 Node.js）：

```bash
npm test        # 领域核心单元测试（node --test）
npm run check   # JS 语法检查 + 吹扫计算器单位链校验（scripts/validate-purge.cjs）
# 其余工程校验脚本在 scripts/validate-*.cjs，可逐个用 node 运行
```
