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
  sandbox.cellVoltagePoint = vm.runInNewContext('(' + extract('cellVoltagePoint') + ')', sandbox);
  sandbox.vcell = vm.runInNewContext('(' + extract('vcell') + ')', {
    Math, Number, window:sandbox.window, cellVoltagePoint:sandbox.cellVoltagePoint
  });
  sandbox.solveCurrentDensity = vm.runInNewContext('(' + extract('solveCurrentDensity') + ')', sandbox);
  sandbox.classifyPowerTarget = vm.runInNewContext('(' + extract('classifyPowerTarget') + ')', sandbox);
  const p = { N:370, area:420, T_K:355.15, pH2:0.19, pAir:0.20, R:0.095, Aact:0.0085, i0:0.0018, m:2.2e-5, n:4 };
  const point = sandbox.cellVoltagePoint(0.7, p.T_K, p);
  const direct = domain.calculateCellVoltage({
    reversibleVoltage: domain.calculateNernstPotential({
      temperatureK:p.T_K,hydrogenPressureMPa:p.pH2,airPressureMPa:p.pAir
    }),
    activationCoefficient:p.Aact,currentDensity:0.7,exchangeCurrentDensity:p.i0,
    areaSpecificResistance:p.R,concentrationCoefficient:p.m,concentrationExponent:p.n
  });
  assert.equal(point.cellVoltage,direct.cellVoltage);
  assert.equal(point.activationLoss,direct.activationLoss);
  assert.equal(point.ohmicLoss,direct.ohmicLoss);
  assert.equal(point.concentrationLoss,direct.concentrationLoss);
  assert.equal(sandbox.vcell(0.7,p.T_K,p),point.cellVoltage);
  assert.match(html, /key:'pH2', k:'氢气分压（干气近似）'/,
    'Nernst hydrogen input must be labelled as dry-basis hydrogen partial pressure');
  assert.match(html, /key:'pAir', k:'干空气入口总绝对压力'/,
    'Nernst air input must be labelled as dry-air total absolute pressure');
  assert.match(html, /Nernst 模型使用干气等效氢分压/,
    'the hydrogen pressure control must disclose the dry-gas basis');
  assert.match(html, /Nernst 按干空气氧摩尔分数 0\.21 估算氧分压/,
    'the air pressure control must disclose the oxygen-fraction assumption');
  const system = extract('solveSystem');
  assert.ok(system.includes('calculateCoolantPumpPower') && system.includes('pressureDropKPa:P.dpCool ?? 250'), 'coolant pump power must use the configured coolant-loop pressure drop and shared hydraulic-power calculation');
  assert.ok(system.includes("P.coolFlowMode === 'auto'") &&
    system.includes("P.coolFlowMode === 'auto'\n    ? Math.max(autoCoolantFlow, 10)") &&
    html.includes("coolFlowMode:'manual'") &&
    html.includes("key:'coolFlowMode', k:'冷却流量模式'"),
    'coolant flow must distinguish manual setpoint from heat-load-based automatic estimation, with legacy-safe manual default');
  assert.ok(html.includes('比热 3.55 kJ/(kg·K)') &&
    html.includes('密度 1.05 kg/L'),
    'automatic coolant sizing must disclose its fixed coolant-property assumptions');
  assert.ok(system.includes('calculateNetElectricalPower') && system.includes('netPowerDeficit') &&
    !system.includes('Math.max(Pstack - pBop, 0.1)'),
    'net output must clamp at zero and expose an explicit BOP power deficit instead of inventing a positive floor');
  assert.ok(system.includes('calculateFuelToElectricEfficiency') && system.includes('calculateAltitudeAdjustedPressureRatio') && system.includes('compressorInletTemperatureK = P.Tamb + 273.15'), 'system solver must use hydrogen-feed efficiency and altitude/ambient-aware compressor inputs');
  assert.ok(system.includes('window.FuelCellDomain.calculateReactantMassFlows'),
    'main stack solver must use the shared Faraday/stoichiometric reactant-flow model');
  assert.ok(system.includes('reactantFlows.hydrogenFeedKgPerHour') &&
    system.includes('reactantFlows.airFeedKgPerHour'),
    'stack hydrogen and air feeds must come from the shared unit-explicit calculation');
  assert.ok(!system.includes('mAir = mH2 * 34.3'),
    'legacy air-feed scaling must not multiply the hydrogen excess-feed ratio into cathode air demand');
  assert.ok(system.includes('const cell = cellVoltagePoint(i, T_K, p);'),
    'system diagnostics must use the same domain point as cell voltage');
  assert.ok(system.includes('cell.activationLoss') && system.includes('cell.ohmicLoss') &&
    system.includes('cell.concentrationLoss'),
    'stack loss diagnostics must be aggregated from the domain-calculated loss terms');
  assert.ok(!system.includes('Math.log(i/P.i0)') &&
    !system.includes('P.R * i') && !system.includes('P.m * Math.exp'),
    'legacy UI loss equations must not be duplicated');
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
  const minimumPowerKw = powerAt(0.01);
  const belowFloor = sandbox.solveCurrentDensity(minimumPowerKw*0.5, p);
  assert.equal(belowFloor, 0.01, 'a target below the lowest modeled current point must select the documented current-density floor');
  assert.equal(sandbox.classifyPowerTarget(minimumPowerKw*0.5, minimumPowerKw, minimumPowerKw),
    'below-minimum', 'the target below the scan floor must be identified as an over-target floor-limited condition');
  assert.equal(sandbox.classifyPowerTarget(peakPower*2, peakPower, minimumPowerKw),
    'above-maximum', 'a target above peak stack power must be identified as maximum-limited');
  assert.equal(sandbox.classifyPowerTarget(80, 80, minimumPowerKw),
    'attained', 'a matched feasible target must not be flagged as limited');
  assert.throws(()=>sandbox.classifyPowerTarget(NaN,80,minimumPowerKw),/targetKw must be finite/);
  assert.throws(()=>sandbox.classifyPowerTarget(-1,80,minimumPowerKw),/targetKw must be non-negative/);

  assert.ok(system.includes('powerFloorLimited') && system.includes('minimumFeasiblePowerKw'),
    'main system solver must expose a lower-current-density floor warning separately from a peak-power shortfall');
  assert.ok(system.includes("powerTargetStatus === 'below-minimum'") &&
            system.includes("powerTargetStatus === 'above-maximum'"),
    'main system solver must classify both directions of an unreachable target');

  const appRunCalcStart = html.indexOf('function runCalc(type)');
  const appElecStart = html.indexOf("if(type === 'elec')", appRunCalcStart);
  const appElecEnd = html.indexOf("else if(type === 'h2')", appElecStart);
  assert.ok(appRunCalcStart >= 0 && appElecStart > appRunCalcStart && appElecEnd > appElecStart,
    'standalone electrochemical calculator branch must be available');
  const elecCalculator = html.slice(appElecStart, appElecEnd);
  assert.ok(elecCalculator.includes('cellVoltagePoint(i, p.T_K, p)') &&
            elecCalculator.includes('cell.activationLoss') &&
            elecCalculator.includes('cell.ohmicLoss') &&
            elecCalculator.includes('cell.concentrationLoss'),
    'standalone calculator must report the same domain loss outputs as the stack solver');
  assert.ok(!elecCalculator.includes('Math.exp(nn*i)') &&
            !elecCalculator.includes('Aact*Math.log(i/i0)') &&
            !elecCalculator.includes('R*i'),
    'standalone calculator must not duplicate legacy polarization equations');
  assert.ok(elecCalculator.includes('classifyPowerTarget(PkW, actualPowerKw, minimumFeasiblePowerKw)') &&
            elecCalculator.includes('目标低于求解器下限'),
    'standalone calculator must disclose both minimum-current and peak-power limits');
  assert.match(html, /经验指数浓差项（非完整 Amphlett 模型）/, 'the electrochemical parameter group must disclose that its concentration-loss model is empirical and not a full Amphlett implementation');
  assert.match(html, /未显式建模极限电流密度与反应物传质状态/, 'the concentration-loss parameter must disclose omitted limiting-current and reactant-transport physics');
  assert.match(html, /没有加载训练数据、执行神经网络训练或真实推理/, 'model metrics must be disclosed as simulated');
  assert.match(html, /规划模块（尚未实现）/, 'unimplemented neural-network architecture must be labeled as a plan');
  assert.doesNotMatch(html, /贡献度 85%|贡献度 92%|贡献度 68%|贡献度 76%/, 'fabricated model contribution percentages must not be displayed');
  assert.match(html, /启动演示/, 'synthetic model activity must be presented as a demo, not real training');
  const runSimStart = html.indexOf('function runSim()');
  const runSimEnd = html.indexOf('/* ================= 计算器', runSimStart);
  assert.ok(runSimStart >= 0 && runSimEnd > runSimStart,
    'simulation modes must remain bounded for disclosure and provenance checks');
  const simulationSource = html.slice(runSimStart, runSimEnd);
  assert.ok(simulationSource.includes('role="note"') &&
            simulationSource.includes('不代表台架实测、产品认证或国家标准符合性结论') &&
            simulationSource.includes('res.insertAdjacentHTML(\'afterbegin\''),
    'every simulation mode must disclose that model outputs are not measured or certification results');
  assert.ok(simulationSource.includes('标准符合性判定</div><div class="kpi-v" style="font-size:15px;color:var(--muted)">未执行') &&
            !simulationSource.includes('国标判定</div><div class="kpi-v" style="font-size:15px;color:var(--green)">优秀'),
    'cold-start mode must not claim standards compliance without a test');
  assert.ok(simulationSource.includes('剩余寿命结论</div><div class="kpi-v" style="font-size:15px;color:var(--muted)">未标定') &&
            !simulationSource.includes('12000<small>h</small>'),
    'durability mode must not present a fabricated remaining-life estimate');
  assert.ok(simulationSource.includes('合成扰动样本（非实测）') &&
            simulationSource.includes('const syntheticRmse =') &&
            simulationSource.includes('const syntheticMaxError =') &&
            simulationSource.includes('const syntheticR2 ='),
    'bench metrics must be computed from and labeled as synthetic demonstration samples');
  assert.ok(simulationSource.includes('downloadSyntheticBenchDataset()') &&
            simulationSource.includes('导出本次合成演示样本 JSON') &&
            simulationSource.includes('state.lastSyntheticBenchDataset = dataset'),
    'synthetic bench results must expose an export action for the exact displayed run');
  assert.ok(html.includes('datasetKind:\'synthetic-demonstration\'') &&
            html.includes('measured:false') &&
            html.includes('hardwareConnected:false') &&
            html.includes('Not a physical bench measurement'),
    'exported demo data must carry machine-readable non-measurement provenance');

  const syntheticContext = {
    Math, Date, Number, Array, Object,
    vcell:sandbox.vcell
  };
  const buildSyntheticDataset = vm.runInNewContext('(' + extract('buildSyntheticBenchDataset') + ')', syntheticContext);
  const demo = buildSyntheticDataset({T:82,N:370,area:420,pH2:0.19,pAir:0.20,R:0.095,Aact:0.0085,i0:0.0018,m:2.2e-5,n:4});
  assert.equal(demo.schema,'hyhub.synthetic-bench-demo.v1');
  assert.equal(demo.datasetKind,'synthetic-demonstration');
  assert.equal(demo.provenance.measured,false);
  assert.equal(demo.provenance.hardwareConnected,false);
  assert.equal(demo.samples.length,25);
  assert.ok(demo.samples.every(row=>Number.isFinite(row.modelCellVoltageV)&&
    Number.isFinite(row.syntheticSampleCellVoltageV)&&Number.isFinite(row.residualMv)));
  const independentlyCalculatedRmse = Math.sqrt(demo.samples.reduce((sum,row)=>sum+row.residualMv**2,0)/demo.samples.length);
  assert.ok(Math.abs(demo.metrics.rmseMv-independentlyCalculatedRmse)<1e-10,
    'exported RMSE must be reproducible from the exported residual samples');
  const repeated = buildSyntheticDataset({T:82,N:370,area:420,pH2:0.19,pAir:0.20,R:0.095,Aact:0.0085,i0:0.0018,m:2.2e-5,n:4});
  assert.deepEqual(repeated.samples,demo.samples,
    'identical model inputs must reproduce the same synthetic sample set');

  assert.ok(simulationSource.includes('80℃模型边界电流密度') &&
            simulationSource.includes('膜水合状态') &&
            simulationSource.includes('未建模'),
    'transport-boundary mode must distinguish calculated curve limits from unmodeled membrane hydration');
  console.log('Fuel-cell solver branch and power-limit regression checks passed against domain core');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
