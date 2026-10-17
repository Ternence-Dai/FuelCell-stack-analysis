'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');

function extract(name) {
  const match = html.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
  if (!match) throw new Error(name + ' function not found');
  return match[0];
}

async function main() {
  const domain = await import('../src/domain/index.js');
  const sandbox = { Math, Number, window: { FuelCellDomain: domain } };
  sandbox.nernstPotential = vm.runInNewContext('(' + extract('nernstPotential') + ')', sandbox);
  sandbox.vcell = vm.runInNewContext('(' + extract('vcell') + ')', sandbox);
  sandbox.solveCurrentDensity = vm.runInNewContext('(' + extract('solveCurrentDensity') + ')', sandbox);
  const p = { N:370, area:420, T_K:355.15, pH2:0.19, pAir:0.20, R:0.095, Aact:0.0085, i0:0.0018, m:2.2e-5, n:4 };
  const powerAt = i => p.N * sandbox.vcell(i, p.T_K, p) * i * p.area / 1000;
  let peakI = 0.01, peakPower = powerAt(peakI);
  for (let i=0.01; i<=3; i+=0.001) {
    const power = powerAt(i);
    if (Number.isFinite(power) && power > peakPower) { peakPower = power; peakI = i; }
  }
  assert.ok(peakPower > 80, 'test parameters must support the 80 kW target');
  const solved = sandbox.solveCurrentDensity(80, p);
  assert.ok(solved < peakI, 'solver must choose the first/upward operating branch');
  assert.ok(Math.abs(powerAt(solved)-80) < 0.05, 'solver should converge to requested power');
  const limited = sandbox.solveCurrentDensity(peakPower*2, p);
  assert.ok(Math.abs(limited-peakI) < 0.01, 'unattainable target must return the modeled peak-power point');
  assert.match(html, /没有加载训练数据、执行神经网络训练或真实推理/, 'model metrics must be disclosed as simulated');
  assert.match(html, /规划模块（尚未实现）/, 'unimplemented neural-network architecture must be labeled as a plan');
  assert.doesNotMatch(html, /贡献度 85%|贡献度 92%|贡献度 68%|贡献度 76%/, 'fabricated model contribution percentages must not be displayed');
  assert.match(html, /启动演示/, 'synthetic model activity must be presented as a demo, not real training');
  console.log('Fuel-cell solver branch and power-limit regression checks passed against domain core');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
