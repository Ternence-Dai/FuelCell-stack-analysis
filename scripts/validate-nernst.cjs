const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const match = html.match(/function nernstPotential\(T_K, p\)\s*\{[\s\S]*?\n\}/);
if (!match) throw new Error('nernstPotential function not found');
async function main(){\nconst domain = await import('../src/domain/index.js');\nconst nernstPotential = vm.runInNewContext('(' + match[0] + ')', {window:{FuelCellDomain:domain}});

const T = 82 + 273.15;
const p = { pH2: 0.19, pAir: 0.20 };
const actual = nernstPotential(T, p);
const p0 = 0.101325;
const expected = 1.229 - 0.85e-3 * (T - 298.15)
  + 4.308e-5 * T * (
    Math.log(p.pH2 / p0) +
    0.5 * Math.log(p.pAir * 0.21 / p0)
  );
if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-12)
  throw new Error('Nernst MPa-to-atm conversion mismatch: ' + actual + ' vs ' + expected);
if (!(nernstPotential(T, {pH2: p.pH2, pAir: 0.25}) > actual))
  throw new Error('Increasing air inlet pressure should increase reversible voltage');
if (!(nernstPotential(T, {pH2: 0.25, pAir: p.pAir}) > actual))
  throw new Error('Increasing hydrogen inlet pressure should increase reversible voltage');
console.log('Nernst model OK: domain core MPa normalization and pressure sensitivity');\n}\nmain().catch(error=>{console.error(error);process.exitCode=1;});
