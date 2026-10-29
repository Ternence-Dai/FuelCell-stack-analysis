'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const domain = fs.readFileSync('src/domain/index.js', 'utf8');

// --- The page must implement the corrected unit chain -----------------------
// Density: rho(g/L) = (p_MPa x10 -> bar x M_H2 2.016 g/mol) / (R 0.0831446
// L*bar/(mol*K) x T_K). Per-purge loss: volume(L) x rho(g/L) / 1000 = kg.
// The legacy chain (rho = p*1000/(0.08314*353), then x 2.016/22.4) mixed a
// molar-volume conversion into an already mass-based density and was off by
// orders of magnitude.
const runStart = app.indexOf('function runCalc(type)');
const purgeStart = app.indexOf("else if(type === 'purge')", runStart);
const purgeEnd = app.indexOf("else if(type === 'cal')", purgeStart);
assert.ok(runStart >= 0 && purgeStart > runStart && purgeEnd > purgeStart,
  'purge calculator branch must exist');
const purge = app.slice(purgeStart, purgeEnd);
assert.ok(purge.includes('(ph * 10 * 2.016) / (0.0831446 * Tk)'),
  'purge density must be rho(g/L) = (p_MPa*10 * M_H2) / (R_L_bar * T_K)');
assert.ok(purge.includes('vol * rho / 1000'),
  'per-purge hydrogen loss must be volume(L) * rho(g/L) / 1000 kg');
assert.ok(!purge.includes('2.016 / 22.4') && !purge.includes('ph * 1000 / (0.08314 * 353)'),
  'legacy purge unit chain (x1000 density, extra /22.4 factor) must be gone');
assert.ok(app.includes("F_('堆温 (K · 堆温近似)', 'c_Tk', 353, 1)"),
  'purge form must expose stack temperature (K, labelled as an approximation) with a 353 K default');
assert.ok(purge.includes("readCalcInput('c_Tk')"),
  'purge calculator must read the temperature input explicitly (no silent default)');

// --- Independent re-implementation of the same formula, hand vector ---------
function purgeDensityGPerL(pressureMPa, temperatureK) {
  return (pressureMPa * 10 * 2.016) / (0.0831446 * temperatureK);
}
function purgeLossKg(volumeL, pressureMPa, temperatureK) {
  return volumeL * purgeDensityGPerL(pressureMPa, temperatureK) / 1000;
}

// Hand vector: 0.19 MPa, 353 K, anode volume 1.2 L
// rho = (0.19*10 * 2.016) / (0.0831446*353) = 3.8304 / 29.35006 = 0.13051 g/L (~0.131)
// loss = 1.2 * 0.13051 / 1000 = 1.566e-4 kg (~1.6e-4)
const rho = purgeDensityGPerL(0.19, 353);
assert.ok(Math.abs(rho - 0.13052) / 0.13052 < 0.01,
  'rho at 0.19 MPa / 353 K must be ~0.131 g/L, got ' + rho);
const loss = purgeLossKg(1.2, 0.19, 353);
assert.ok(Math.abs(loss - 1.5662e-4) / 1.5662e-4 < 0.01,
  'per-purge loss for 1.2 L must be ~1.6e-4 kg, got ' + loss);

// Temperature must actually participate: hotter gas is less dense.
assert.ok(purgeDensityGPerL(0.19, 363) < rho,
  'density must decrease as temperature rises');
// Pressure scaling is linear (ideal gas at fixed T).
assert.ok(Math.abs(purgeDensityGPerL(0.38, 353) - 2 * rho) < 1e-12,
  'density must scale linearly with pressure');

// The molar mass used by the page formula must match the domain constants.
assert.ok(domain.includes('M_H2_G_PER_MOL: 2.016'),
  'domain PHYSICAL_CONSTANTS must carry M_H2 = 2.016 g/mol');

console.log('Purge calculator unit-chain checks passed: rho=' + rho.toFixed(4) +
  ' g/L, per-purge loss=' + loss.toExponential(3) + ' kg @ 0.19 MPa, 353 K, 1.2 L.');
