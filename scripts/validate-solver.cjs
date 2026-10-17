'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
function extract(name) {
  const match = html.match(new RegExp('function ' + name + '\\\\([^)]*\\\\)\\\\s*\\\\{[\\\\s\\\\S]*?\\\\n\\\\}'));
  if (!match) throw new Error(name + ' function not found');
  return match[0];
}
const sandbox = {Math, Number};
sandbox.nernstPotential = vm.runInNewContext('(' + extract('nernstPotential') + ')', sandbox);
sandbox.vcell = vm.runInNewContext('(' + extract('vcell') + ')', sandbox);
sandbox.solveCurrentDensity = vm.runInNewContext('(' + extract('solveCurrentDensity') + ')', sandbox);
const p = {N:370,area:420,T_K:355.15,pH2:0.19,pAir:0.20,R:0.095,Aact:0.0085,i0:0.0018,m:2.2e-5,n:4};
const powerAt = i => p.N * sandbox.vcell(i,p.T_K,p) * i * p.area / 1000;
let peakI=0.01, peakPower=powerAt(peakI);
for(let i=0.01;i<=3;i+=0.001){const power=powerAt(i);if(Number.isFinite(power)&&power>peakPower){peakPower=power;peakI=i;}}
assert.ok(peakPower>80,'test parameters must support the 80 kW target');
const solved=sandbox.solveCurrentDensity(80,p);
assert.ok(solved<peakI,'solver must choose the first/upward operating branch');
assert.ok(Math.abs(powerAt(solved)-80)<0.05,'solver should converge to requested power');
const limited=sandbox.solveCurrentDensity(peakPower*2,p);
assert.ok(Math.abs(limited-peakI)<0.01,'unattainable target must return the modeled peak-power point');
console.log('Fuel-cell solver branch and power-limit regression checks passed.');
