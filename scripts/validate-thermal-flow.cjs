'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const domain = fs.readFileSync('src/domain/index.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const productCss = fs.readFileSync('assets/css/product-system.css', 'utf8');
assert.ok(html.includes('product-system.css?v=20261019-v8'),
  'HyHub must load the current V8 engineering workspace stylesheet');
assert.ok(html.includes('viewport-fit=cover') && !html.includes('user-scalable=no'),
  'HyHub must retain mobile safe-area support and browser zoom accessibility');
assert.ok(productCss.includes('HyHub V3') || productCss.includes('visible product interface refresh'),
  'HyHub V3 product interface layer must be present');
for (const selector of [
  '.sidebar{', '.topbar{', '.hyhub-intro{', '.hero{', '.kpi{',
  '.param-group{', '.lib-categories-grid{', '.lib-cat.open .lib-cat-body'
]) assert.ok(productCss.includes(selector),
  'HyHub V3 must style the main engineering workspace surface: ' + selector);
assert.ok(productCss.includes('@media(max-width:760px)') &&
          productCss.includes('@media(max-width:420px)'),
  'HyHub V3 must include tablet/mobile responsive layouts');

assert.ok(html.includes('product-system.css?v=20261019-v8'),
  'HyHub must load the cache-busted V4 dashboard and parameter-library theme');
for (const selector of [
  '.lib-categories-grid{', '.lib-cat{', '.lib-cat-head{', '.lib-cat-body{',
  '.lib-cat.open .lib-cat-body{', '.lib-item{', '.hyhub-intro{'
]) assert.ok(productCss.includes(selector),
  'HyHub V3.2 must explicitly style parameter library component: ' + selector);
assert.ok(productCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important') &&
          productCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'),
  'desktop category and expanded parameter cards must use two/three-column layouts');
assert.ok(productCss.includes('background:#fff!important') &&
          productCss.includes('background:#f7fafc'),
  'the library cards and expansion surface must use the new light engineering palette');


assert.ok(productCss.includes('HyHub V4') &&
          productCss.includes('.dashboard-command{') &&
          productCss.includes('.content:has(.hero)>.hero{') &&
          productCss.includes('.content:has(.hero) .gcard-grid{'),
  'HyHub V4 must provide the new dashboard command surface, hero layout, and benchmark card system');
assert.ok(productCss.includes('grid-template-areas:"top top" "power metrics" "slider metrics" "scale metrics"') &&
          productCss.includes('@media(max-width:980px)'),
  'HyHub V4 dashboard must reflow its engineering KPIs responsively');

assert.ok(productCss.includes('prefers-reduced-motion:reduce'),
  'HyHub V3 must respect reduced-motion preferences');


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
assert.ok(app.includes('冷却液比热 cp kJ/(kg·K)') &&
          app.includes('冷却液密度 ρ kg/L'),
  'thermal calculator UI must label specific heat and density with their units');


assert.ok(domain.includes('export function solveFirstPowerCrossing('),
  'the non-monotonic stack operating-point solver must live in the tested domain core');
assert.ok(app.includes('window.FuelCellDomain.solveFirstPowerCrossing('),
  'the main stack solver must call the shared first-crossing solver');
assert.ok(app.includes('return window.FuelCellDomain.solveFirstPowerCrossing({') &&
          !app.includes('const minI = 0.01, maxI = 3.0, steps = 600'),
  'the application must delegate the scan instead of retaining a duplicate implementation');

console.log('Fuel-cell coolant thermal-flow integration checks passed.');
