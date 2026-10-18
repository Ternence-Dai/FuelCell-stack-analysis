'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const domain = fs.readFileSync('src/domain/index.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(domain, /export function calculateCoolantFlow\(/,
  'coolant mass/volume conversion must live in the shared domain core');
for (const field of ['heatPowerKw', 'deltaTemperatureK', 'specificHeatKJPerKgK', 'densityKgPerL']) {
  assert.ok(domain.includes(field), 'coolant calculation must declare ' + field);
}
assert.ok(domain.includes('massFlowKgPerSecond') &&
          domain.includes('massFlowKgPerMinute') &&
          domain.includes('volumeFlowLPerMinute'),
  'coolant flow outputs must expose mass and volume units explicitly');

const solverStart = app.indexOf('function solveSystem()');
const solverEnd = app.indexOf('/* ================= 参数组', solverStart);
assert.ok(solverStart >= 0 && solverEnd > solverStart, 'main stack solver must exist');
const solver = app.slice(solverStart, solverEnd);
assert.ok(solver.includes('window.FuelCellDomain.calculateCoolantFlow'),
  'main stack solver must use the shared coolant-flow model for automatic fallback');
assert.ok(solver.includes('densityKgPerL:1.05') &&
          solver.includes('specificHeatKJPerKgK:3.55'),
  'automatic EG50 fallback must use the same documented baseline properties as the thermal calculator');
assert.ok(solver.includes('Number.isFinite(P.coolFlow) && P.coolFlow > 0'),
  'a user-entered positive coolant flow must take precedence over the estimate');
assert.ok(!solver.includes('3.55*4.18'),
  'the stack solver must not multiply specific heat by water specific heat a second time');

const runStart = app.indexOf('function runCalc(type)');
const heatStart = app.indexOf("else if(type === 'heat')", runStart);
const heatEnd = app.indexOf("else if(type === 'purge')", heatStart);
assert.ok(runStart >= 0 && heatStart > runStart && heatEnd > heatStart,
  'standalone thermal calculator branch must exist');
const heat = app.slice(heatStart, heatEnd);
assert.ok(heat.includes('window.FuelCellDomain.calculateCoolantFlow'),
  'standalone thermal calculator must use the same shared coolant-flow equation');
assert.ok(heat.includes('coolantFlow.volumeFlowLPerMinute') &&
          heat.includes('coolantFlow.massFlowKgPerMinute'),
  'standalone thermal calculator must display correctly converted L/min and kg/min');
assert.ok(heat.includes('catch (error)') && heat.includes('检查输入后重试'),
  'invalid thermal inputs must display a recoverable message instead of breaking the calculator');
assert.ok(html.includes('冷却液比热 cp kJ/(kg·K)') &&
          html.includes('冷却液密度 ρ kg/L'),
  'thermal calculator UI must label specific heat and density with their units');

console.log('Fuel-cell coolant thermal-flow integration checks passed.');
