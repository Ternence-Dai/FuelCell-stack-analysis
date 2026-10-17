
/* =========================================================
   氢枢 HyHub · 燃料电池电堆全能平台 V2.0 大模型版
   设计者：戴煜 | 燃料电池研发工程师
   联系方式：18662613315@163.com
   版权所有 © 2026 戴煜 · 保留所有权利
   ========================================================= */
'use strict';

const state = {
  view: 'dashboard',
  simMode: 'steady',
  calcTab: 'elec',
  libOpen: '',
  libTier: 'all',
  libSearch: '',
  libFav: new Set(),
  presetIdx: 2,
  paramOpen: { struct:true, op:true, mea:false, bpp:false, echem:false, thermal:false, bop:false, adv:false, sel:false },
  kbOpen: {},
  kbCatOpen: {},
  kbSearch: '',
  dataSel: { A:0, B:1 },
  dataMetrics: { eta:true, soh:true, mh2:true, gkwh:false, i:false, vpd:false, sp:false, q:false },
  mon: {
    auto: true, t: 0, hist: [], eisHist: [], timer: null,
    over: { power:150, T:82, pH2:0.19, pAir:0.20, lamAir:2.3 },
    cells: [],
  },
  model: {
    running: false, epoch: 0, loss: [], timer: null, pred: [], aiStage: 0,
  },
  params: {
    stackPower:150, N:370, area:420, cellThk:1.5, bppThk:0.40, compress:1.2, dT:5.5,
    T:82, Tamb:25, altitude:0, pH2:0.19, pAir:0.20, lambdaH2:1.12, lambdaAir:2.3,
    purH2:5.0, rh:45, stoichMode:'auto',
    memType:'gore', memThk:15, ptLoading:0.25, catType:'ptco',
    gdlThk:200, gdlPorosity:76, ionomer:30, mplThk:30,
    memBrand:'gore', catBrand:'tanakaCo', ptAlloy:'ptco', support:'ketjen',
    gdlBrand:'sgl29bc', mplBrand:'sgl', ionomerType:'nafion',
    bppMat:'ti', flowField:'3d', coating:'tin', coatThk:120, contactR:5,
    bppBrand:'ti-g1', bppCoatingBrand:'tin-1', sealType:'fkm', gasketType:'ptfe', endPlate:'cf',
    R:0.095, Aact:0.0085, i0:0.0018, m:2.2e-5, n:4,
    coolFlow:120, coolType:'eg50', dpH2:15, dpAir:22, radMargin:20, pumpEff:0.65,
    cmpType:'centri', cmpEff:0.72, cmpRatio:2.5, dcdcEff:0.98, recirc:'ejector',
    purgePeriod:15, purgeDur:0.9,
    optMode:'balanced', adaptive:'on', sohWeight:50,
  },
  projects: [
    { name:'城市公交电堆 120kW 稳态', tier:'中型', power:120, date:'2026-09-28', N:280, area:460, T:79, eta:58.2, mh2:5.2, soh:98.2 },
    { name:'重卡电堆 220kW 动态变载', tier:'大型', power:220, date:'2026-09-26', N:410, area:480, T:83, eta:57.5, mh2:9.6, soh:97.6 },
    { name:'乘用车电堆 90kW 低温启动', tier:'小型', power:90, date:'2026-09-22', N:330, area:300, T:75, eta:59.1, mh2:3.8, soh:98.8 },
    { name:'电站电堆 350kW 耐久循环', tier:'大型', power:350, date:'2026-09-20', N:480, area:620, T:85, eta:56.8, mh2:15.4, soh:96.4 },
    { name:'便携电堆 18kW 教学验证', tier:'微型', power:18, date:'2026-09-18', N:80, area:180, T:63, eta:52.6, mh2:0.86, soh:99.1 },
    { name:'物流车电堆 60kW 经济型', tier:'小型', power:60, date:'2026-09-15', N:260, area:280, T:76, eta:57.8, mh2:2.7, soh:98.5 },
    { name:'热电联供电堆 280kW', tier:'大型', power:280, date:'2026-09-12', N:440, area:560, T:86, eta:58.6, mh2:11.8, soh:97.9 },
    { name:'无人机电堆 12kW 轻量', tier:'微型', power:12, date:'2026-09-10', N:64, area:160, T:60, eta:51.4, mh2:0.62, soh:99.3 },
  ],
};

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = (v,d=2) => (isFinite(v) ? Number(v).toFixed(d) : '—');
const clamp = (v,a,b) => Math.min(b, Math.max(a,v));

let toastTimer;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2000);
}

const TIERS = [
  {id:'micro', name:'微型', min:10, max:30, color:'#22d3ee', scenes:'便携电源电堆 / 无人机电堆 / 小型备电 / 教学电堆'},
  {id:'small', name:'小型', min:30, max:80, color:'#00d48a', scenes:'乘用车电堆 / 轻型物流车电堆 / 小型测试电堆'},
  {id:'mid',   name:'中型', min:80, max:200, color:'#0a84ff', scenes:'客车电堆 / 重卡电堆 / 工程机械电堆 / 商用测试电堆'},
  {id:'large', name:'大型', min:200, max:400, color:'#a78bfa', scenes:'电站电堆 / 热电联供电堆 / 重载装备电堆 / 高端测试电堆'},
];
const tierOf = P => TIERS.find(t => P <= t.max) || TIERS[3];
const tierName = id => (TIERS.find(t=>t.id===id) || {}).name || id;

const F = 96485, M_H2 = 2.016, LHV_H2 = 33.33, E_IDEAL = 1.482;

/* ================= 电堆求解内核 ================= */
function nernstPotential(T_K, p){
  return window.FuelCellDomain.calculateNernstPotential({
    temperatureK:T_K, hydrogenPressureMPa:Number(p.pH2), airPressureMPa:Number(p.pAir)
  });
}
function vcell(i, T_K, p){
  const point = window.FuelCellDomain.calculateCellVoltage({
    reversibleVoltage:nernstPotential(T_K,p),
    activationCoefficient:p.Aact,
    currentDensity:Math.max(i,0.005),
    exchangeCurrentDensity:p.i0,
    areaSpecificResistance:p.R,
    concentrationCoefficient:p.m,
    concentrationExponent:p.n
  });
  return point.cellVoltage;
}
function solveCurrentDensity(targetP_kW, p){
  const target = Number(targetP_kW) * 1000;
  const minI = 0.01, maxI = 3.0, steps = 600;
  const powerAt = current => p.N * vcell(current, p.T_K, p) * current * p.area;
  let previousI = minI;
  let previousPower = powerAt(previousI);
  let peakI = previousI;
  let peakPower = previousPower;
  if(!Number.isFinite(target) || target <= previousPower) return minI;

  // Find the first upward crossing. Stack power is not monotonic over the
  // entire current-density range; a single wide bisection can converge to
  // the high-current descending branch and report an unstable operating point.
  for(let step=1; step<=steps; step++){
    const current = minI + (maxI-minI)*step/steps;
    const power = powerAt(current);
    if(Number.isFinite(power) && power > peakPower){
      peakPower = power;
      peakI = current;
    }
    if(Number.isFinite(power) && power >= target){
      let lo = previousI, hi = current;
      for(let k=0;k<60;k++){
        const mid = (lo+hi)/2;
        if(powerAt(mid) >= target) hi = mid;
        else lo = mid;
      }
      return (lo+hi)/2;
    }
    previousI = current;
    previousPower = power;
  }
  // Requested power exceeds the modelled maximum: return the peak-power
  // operating point. solveSystem exposes a powerLimited flag to the UI.
  return peakI;
}
function solveSystem(){
  const P = state.params;
  const t = tierOf(P.stackPower);
  const T_K = P.T + 273.15;
  const pAtm = 0.1013 * Math.pow(Math.max(1 - 2.25577e-5 * (P.altitude||0), 0.05), 5.2559);
  const p = { N:P.N, area:P.area, T_K, pH2:P.pH2, pAir:P.pAir, R:P.R, Aact:P.Aact, i0:P.i0, m:P.m, n:P.n };
  const i = solveCurrentDensity(P.stackPower, p);
  const Vc = vcell(i, T_K, p);
  const Vstack = P.N * Vc;
  const I = i * P.area;
  const Pstack = P.N * Vc * I / 1000;
  const powerLimited = Pstack < P.stackPower * 0.995;
  const etaStack = Vc / E_IDEAL;

  const lamH2 = P.stoichMode === 'auto' ? 1.05 + 0.10*Math.sqrt(P.stackPower/400) : P.lambdaH2;
  const lamAir = P.stoichMode === 'auto' ? 1.8 + 1.0*Math.pow(P.stackPower/400, 0.7) : P.lambdaAir;

  const mH2 = P.N * I * M_H2 * 3.6 / (2 * F) * lamH2;
  const mAir = mH2 * 34.3 * lamAir;

  const gamma = 0.2857;
  const cmpEff = P.cmpEff || 0.72;
  const ratio = Math.max(P.cmpRatio || 2.5, 1.01) * (0.75 + 0.25 * pAtm / 0.1013);
  const pCmp = (mAir/3600) * 1.005 * 293 * (Math.pow(ratio, gamma) - 1) / cmpEff;

  const Q = Pstack * (1/etaStack - 1);
  const flow = P.coolFlow || Math.max(Q / (3.55*4.18*(P.dT||5)) * 60, 10);
  const pPump = flow * 0.25 / 60 / (P.pumpEff || 0.65);

  const pRecirc = P.recirc === 'ejector' ? P.stackPower * 0.004
                 : P.recirc === 'roots' ? P.stackPower * 0.020 : P.stackPower * 0.012;

  const pDcdc = Pstack * (1 - (P.dcdcEff || 0.98));

  const pBop = pCmp + pPump + pRecirc + pDcdc;
  const Pnet = Math.max(Pstack - pBop, 0.1);
  const etaSys = Pnet / Math.max(Pstack, 1e-6) * etaStack;

  const coreVolL = P.N * (P.cellThk||1.5) * P.area / 1000;
  const volL = coreVolL * 1.5;
  const massKg = coreVolL * 1.65 + 8;
  const vpd = Pstack / Math.max(volL, 1e-6);
  const sp = Pstack / Math.max(massKg, 1e-6);
  const pd = Vc * i * 1000;

  const lossAct = P.N * I * P.Aact * Math.log(i/P.i0) / 1000;
  const lossOhm = P.N * I * P.R * i / 1000;
  const lossCon = P.N * I * P.m * Math.exp(P.n*i) / 1000;

  return {
    tier:t, i, Vc, Vstack, I, Pstack, powerLimited, etaStack, etaSys, lamH2, lamAir, mH2, mAir,
    pCmp, pPump, pRecirc, pDcdc, pBop, Pnet, Q, flow,
    gkwh: mH2*1000/Math.max(Pnet,1e-6),
    loss:{act:lossAct,ohm:lossOhm,con:lossCon}, T_K,
    volL, massKg, vpd, sp, pd, pAtm, coreVolL,
  };
}

/* ================= 参数组 ================= */
const PARAM_GROUPS = [
  { id:'struct', ico:'▤', name:'电堆结构与规格', desc:'额定功率、片数、有效面积、板厚、封装压缩', items:[
    { key:'stackPower', k:'电堆额定功率', unit:'kW', min:10, max:400, step:1, dec:0, note:'对标 Mirai 2 128kW / NEXO 95kW / 亿华通 G120 120kW / 捷氢 P4 130kW / Nikola 200kW' },
    { key:'N', k:'电堆片数', unit:'片', min:40, max:600, step:5, dec:0, note:'金属板乘用车 300–370 片；商用车 400–480 片；石墨堆可至 600 片' },
    { key:'area', k:'单片有效面积', unit:'cm²', min:100, max:800, step:5, dec:0, note:'乘用车 250–350 cm²；商用车 400–550 cm²；电站堆可至 620 cm²' },
    { key:'cellThk', k:'单片厚度（含板）', unit:'mm', min:0.9, max:3.5, step:0.05, dec:2, note:'金属板 1.2–1.5 mm；石墨板 2.0–3.0 mm；Mirai 2 约 1.1 mm' },
    { key:'bppThk', k:'双极板单板厚度', unit:'mm', min:0.30, max:2.00, step:0.05, dec:2, note:'Mirai 2 钛板约 0.4 mm；不锈钢板 0.5–0.8 mm；石墨板 1.5–3.0 mm' },
    { key:'compress', k:'封装压缩力', unit:'MPa', min:0.5, max:2.5, step:0.1, dec:1, note:'压缩力过低接触电阻大，过高可能压溃 GDL；典型 0.8–1.5 MPa' },
    { key:'dT', k:'冷却液温差', unit:'K', min:3, max:12, step:0.5, dec:1, note:'领先水平 4–6 K；温差越小温度场越均匀，但泵功上升' },
  ]},
  { id:'op', ico:'≈', name:'电堆操作条件', desc:'温度、海拔、氢/空压力、计量比、纯度、湿度', items:[
    { key:'T', k:'电堆工作温度', unit:'℃', min:40, max:100, step:1, dec:0, note:'领先水平 80–90℃ 高温低湿运行；Mirai 2 约 85℃' },
    { key:'Tamb', k:'环境温度', unit:'℃', min:-40, max:55, step:1, dec:0, note:'影响冷启动与散热；-30℃ 以下需专门低温策略' },
    { key:'altitude', k:'海拔高度', unit:'m', min:0, max:5000, step:100, dec:0, note:'海拔每升高 1000 m 大气压降约 11%，空气侧传质与空压机压比需补偿' },
    { key:'pH2', k:'氢气入口绝对压力', unit:'MPa', min:0.08, max:0.35, step:0.01, dec:2, note:'领先水平 0.16–0.25 MPa 中高压运行' },
    { key:'pAir', k:'空气入口绝对压力', unit:'MPa', min:0.08, max:0.35, step:0.01, dec:2, note:'与氢压协同匹配；氢空压差是水管理的关键参数' },
    { key:'lambdaH2', k:'氢气计量比', unit:'—', min:1.00, max:1.50, step:0.01, dec:2, note:'领先水平 1.05–1.15；配合引射器与脉冲吹扫实现低氢损' },
    { key:'lambdaAir', k:'空气计量比', unit:'—', min:1.5, max:4.0, step:0.1, dec:1, note:'高功率段 2.2–2.6；低功率段 1.8–2.0 提效' },
    { key:'purH2', k:'氢气纯度等级', unit:'—', min:3.0, max:5.0, step:0.5, dec:1, note:'5.0 = 99.999%，车用标准（GB/T 37244 / SAE J2719 / ISO 14687）' },
    { key:'rh', k:'进气相对湿度', unit:'%', min:10, max:90, step:1, dec:0, note:'高温低湿运行是领先方向；30–60% 为典型工作区间' },
    { key:'stoichMode', k:'计量比模式', unit:'—', type:'select', options:[{v:'auto',t:'自动（按电堆功率自适应）'},{v:'manual',t:'手动（使用上方设定值）'}], note:'领先水平：MPC 模型预测控制' },
  ]},
  { id:'mea', ico:'◈', name:'膜电极 MEA 参数', desc:'膜厚、Pt 载量、催化剂、GDL、离聚物、微孔层', items:[
    { key:'memType', k:'质子交换膜类型', unit:'—', type:'select', options:[
      {v:'gore',t:'Gore SELECT 增强复合膜（8–12 μm）'},{v:'nafion211',t:'Nafion 211（25 μm）'},
      {v:'nafion212',t:'Nafion 212（50 μm）'},{v:'eptfe',t:'ePTFE 增强复合膜（15 μm）'}],
      note:'Mirai 2 采用增强复合膜（约 10 μm）；NEXO 采用 15 μm 级复合膜' },
    { key:'memThk', k:'质子膜厚度', unit:'μm', min:6, max:60, step:1, dec:0, note:'领先水平 8–25 μm；乘用车 8–15 μm；商用车 15–25 μm' },
    { key:'ptLoading', k:'阴极 Pt 载量', unit:'mg/cm²', min:0.08, max:0.50, step:0.01, dec:2, note:'领先水平 0.15–0.28 mg/cm²；Mirai 2 约 0.20；捷氢 P4 约 0.22' },
    { key:'catType', k:'催化剂类型', unit:'—', type:'select', options:[
      {v:'ptc',t:'Pt/C 通用型'},{v:'ptco',t:'PtCo/C 抗衰减型（主流）'},
      {v:'ptni',t:'PtNi/C 高比活性'},{v:'core',t:'核壳结构（前沿）'}],
      note:'PtCo 合金抗衰减更好；PtNi 达更高比活性；核壳结构实验室阶段' },
    { key:'gdlThk', k:'GDL 厚度', unit:'μm', min:100, max:400, step:5, dec:0, note:'低湿高电流密度宜用薄 GDL（150–190 μm）' },
    { key:'gdlPorosity', k:'GDL 孔隙率', unit:'%', min:60, max:90, step:1, dec:0, note:'70–82% 为车用主流；高孔隙利于传质但机械强度下降' },
    { key:'ionomer', k:'离聚物含量', unit:'wt%', min:15, max:45, step:1, dec:0, note:'25–35% 为典型；离聚物高则质子传导好，但氧气传质阻力上升' },
    { key:'mplThk', k:'微孔层 MPL 厚度', unit:'μm', min:10, max:80, step:5, dec:0, note:'20–50 μm 为典型；薄 MPL 传质好，厚 MPL 保水能力强' },
  ]},
  { id:'sel', ico:'✦', name:'部件选型（品牌/型号）', desc:'膜、催化剂、载体、GDL、MPL、离聚物、双极板、涂层、密封', items:[
    { key:'memBrand', k:'膜品牌/型号', unit:'—', type:'select', options:[
      {v:'gore',t:'Gore SELECT（8–12 μm）'},
      {v:'goreM820',t:'Gore M820（15 μm 增强）'},
      {v:'nafion211',t:'Nafion 211（25 μm）'},
      {v:'nafion212',t:'Nafion 212（50 μm）'},
      {v:'eptfe',t:'ePTFE 增强复合膜（15 μm）'},
      {v:'spi',t:'SPI 增强膜（12 μm）'},
      {v:'fumatech',t:'Fumatech 增强膜（20 μm）'}],
      note:'乘用车主流：Gore SELECT；商用车：Nafion 211 / ePTFE 增强' },
    { key:'catBrand', k:'催化剂品牌/型号', unit:'—', type:'select', options:[
      {v:'tanaka',t:'田中 TEC10E50E（Pt/C）'},
      {v:'tanakaCo',t:'田中 PtCo/C 合金'},
      {v:'jm',t:'Johnson Matthey HiSPEC'},
      {v:'pmc',t:'PMC PtCo/C'},
      {v:'greenerity',t:'Greenerity PtNi/C'},
      {v:'core',t:'核壳 Pt@Pd/C（前沿）'}],
      note:'PtCo 合金抗衰减更好；PtNi 达更高比活性' },
    { key:'ptAlloy', k:'Pt 合金化', unit:'—', type:'select', options:[
      {v:'pt',t:'纯 Pt'},{v:'ptco',t:'PtCo 合金'},{v:'ptni',t:'PtNi 合金'},{v:'ptcrmn',t:'PtCrMn 三元'}],
      note:'合金化提高比活性 2–3 倍' },
    { key:'support', k:'催化剂载体', unit:'—', type:'select', options:[
      {v:'ketjen',t:'Ketjenblack EC-300J'},{v:'vulcan',t:'Vulcan XC-72'},
      {v:'graphitized',t:'石墨化碳（抗腐蚀）'},{v:'cnt',t:'碳纳米管（前沿）'}],
      note:'石墨化碳载体抗腐蚀性更好，但比表面积下降' },
    { key:'gdlBrand', k:'GDL 品牌/型号', unit:'—', type:'select', options:[
      {v:'sgl29bc',t:'SGL 29BC（碳纸 + MPL）'},
      {v:'sgl28bb',t:'SGL 28BB（疏水处理）'},
      {v:'sgl22bb',t:'SGL 22BB（薄型）'},
      {v:'toray060',t:'Toray 060（高压缩）'},
      {v:'freudenberg',t:'Freudenberg H14C14'},
      {v:'carbonCloth',t:'碳布（柔性高压缩）'}],
      note:'SGL 29BC 为车用主流；低湿工况选带 MPL 型号' },
    { key:'mplBrand', k:'MPL 类型', unit:'—', type:'select', options:[
      {v:'sgl',t:'SGL 标准 MPL'},{v:'custom',t:'定制 MPL（高疏水）'},
      {v:'dual',t:'双层 MPL'},{v:'none',t:'无 MPL'}],
      note:'带 MPL 显著改善低湿与高电流密度性能' },
    { key:'ionomerType', k:'离聚物类型', unit:'—', type:'select', options:[
      {v:'nafion',t:'Nafion D2020 / D521'},{v:'aquivion',t:'Aquivion（短侧链）'},
      {v:'spi',t:'SPI 系列'},{v:'custom',t:'定制'}],
      note:'短侧链离聚物（Aquivion）高湿高温性能更佳' },
    { key:'bppBrand', k:'双极板品牌/型号', unit:'—', type:'select', options:[
      {v:'ti-g1',t:'钛合金 Ti-G1（0.4 mm）'},
      {v:'ss316L',t:'不锈钢 316L（0.5 mm）'},
      {v:'ss304',t:'不锈钢 304（0.6 mm）'},
      {v:'graphite',t:'石墨板（1.5 mm）'},
      {v:'composite',t:'金属-石墨复合板'}],
      note:'金属板为主流；钛合金轻但成本高' },
    { key:'bppCoatingBrand', k:'涂层品牌/型号', unit:'—', type:'select', options:[
      {v:'tin-1',t:'TiN 氮化钛（工业级）'},
      {v:'crn-1',t:'CrN 氮化铬'},
      {v:'au-1',t:'Au 金涂层（高导电）'},
      {v:'dlc',t:'DLC 类金刚石碳'},
      {v:'poly',t:'导电聚合物'}],
      note:'Au 导电最好但成本高；TiN/CrN 更经济' },
    { key:'sealType', k:'密封件类型', unit:'—', type:'select', options:[
      {v:'silicone',t:'高温硅胶'},{v:'epdm',t:'EPDM 三元乙丙'},
      {v:'fkm',t:'FKM 氟橡胶（耐酸）'},{v:'ptfe',t:'PTFE 包覆'}],
      note:'FKM/PTFE 耐酸、耐高温更佳' },
    { key:'gasketType', k:'垫片类型', unit:'—', type:'select', options:[
      {v:'ptfe',t:'PTFE 垫片'},{v:'pen',t:'PEN 垫片'},{v:'pet',t:'PET 垫片'}],
      note:'PTFE 化学稳定性最佳' },
    { key:'endPlate', k:'端板材料', unit:'—', type:'select', options:[
      {v:'al-6061',t:'铝合金 6061'},{v:'al-7075',t:'铝合金 7075（高强）'},
      {v:'cf',t:'碳纤维复合材料（轻量）'}],
      note:'碳纤维复合材料可减重 30% 以上' },
  ]},
  { id:'bpp', ico:'◇', name:'双极板与流场', desc:'材料、涂层、流场类型与接触电阻', items:[
    { key:'bppMat', k:'双极板材料', unit:'—', type:'select', options:[
      {v:'ti',t:'钛合金（Mirai 2）'},{v:'ss',t:'不锈钢（NEXO）'},
      {v:'graphite',t:'石墨板'},{v:'composite',t:'复合材料'}],
      note:'金属板为主流；钛合金轻但贵，不锈钢便宜但需涂层' },
    { key:'flowField', k:'流场类型', unit:'—', type:'select', options:[
      {v:'3d',t:'3D 细密流场（Mirai 2）'},{v:'serp',t:'蛇形流场'},
      {v:'inter',t:'交指流场'},{v:'par',t:'平行流场'}],
      note:'3D 细密流场排水好、传质强、压降低；蛇形流场排水好但压降高' },
    { key:'coating', k:'涂层类型', unit:'—', type:'select', options:[
      {v:'tin',t:'TiN 氮化钛'},{v:'crn',t:'CrN 氮化铬'},
      {v:'au',t:'Au 金涂层'},{v:'c',t:'导电碳涂层'}],
      note:'Au 涂层薄但成本高；TiN/CrN 涂层较厚但更经济；金属板必需涂层' },
    { key:'coatThk', k:'涂层厚度', unit:'nm', min:20, max:500, step:10, dec:0, note:'50–200 nm 为典型区间' },
    { key:'contactR', k:'界面接触电阻', unit:'mΩ·cm²', min:3, max:20, step:0.5, dec:1, note:'领先水平 < 6 mΩ·cm²；直接影响欧姆损耗' },
  ]},
  { id:'echem', ico:'⚡', name:'电化学性能参数', desc:'内阻、活化系数、交换电流、浓差系数', items:[
    { key:'R', k:'单片内阻 R', unit:'Ω·cm²', min:0.06, max:0.20, step:0.001, dec:3, note:'领先水平 0.075–0.095 Ω·cm²；Mirai 2 约 0.085' },
    { key:'Aact', k:'活化系数', unit:'V', min:0.006, max:0.014, step:0.0001, dec:4, note:'领先水平 0.0075–0.009 V' },
    { key:'i0', k:'交换电流密度', unit:'A/cm²', min:0.0001, max:0.005, step:0.0001, dec:4, note:'领先水平 0.0015–0.0025 A/cm²' },
    { key:'m', k:'浓差系数', unit:'V', min:1e-5, max:6e-5, step:1e-6, dec:6, note:'领先水平 1.8e-5–2.5e-5 V' },
    { key:'n', k:'浓差指数', unit:'—', min:2, max:6, step:0.5, dec:1, note:'控制浓差损耗上升陡峭度；典型 4' },
  ]},
  { id:'thermal', ico:'❄', name:'水热管理参数', desc:'冷却液、流量、压降、散热裕度', items:[
    { key:'coolType', k:'冷却液类型', unit:'—', type:'select', options:[
      {v:'eg50',t:'50% 乙二醇水溶液（-37℃）'},{v:'eg60',t:'60% 乙二醇水溶液（-48℃）'},
      {v:'di',t:'去离子水（18.2 MΩ·cm）'}],
      note:'高寒地区可提高乙二醇比例；去离子水需在线电导率监控' },
    { key:'coolFlow', k:'冷却液流量', unit:'L/min', min:10, max:400, step:5, dec:0, note:'流量随功率近似线性增长；120kW 级典型 100–160 L/min' },
    { key:'pumpEff', k:'冷却水泵效率', unit:'—', min:0.40, max:0.85, step:0.01, dec:2, note:'高效永磁同步水泵可达 0.75–0.85' },
    { key:'dpH2', k:'氢侧压降', unit:'kPa', min:5, max:50, step:1, dec:0, note:'压降升高预示流场堵塞或水淹；典型 10–25 kPa' },
    { key:'dpAir', k:'空气侧压降', unit:'kPa', min:8, max:60, step:1, dec:0, note:'压降过高增加空压机功耗；典型 15–30 kPa' },
    { key:'radMargin', k:'散热器裕度', unit:'%', min:5, max:40, step:1, dec:0, note:'≥ 20% 为推荐；考虑夏季高温 + 老化衰减 + 结垢' },
  ]},
  { id:'bop', ico:'⚙', name:'BOP 辅机参数', desc:'空压机、氢循环、DC-DC 效率', items:[
    { key:'cmpType', k:'空压机类型', unit:'—', type:'select', options:[
      {v:'centri',t:'离心式（带膨胀机）'},{v:'roots',t:'罗茨式'},
      {v:'screw',t:'螺杆式'}],
      note:'大功率离心式；小功率罗茨；带膨胀机可回收 8–15% 压缩功' },
    { key:'cmpEff', k:'空压机等熵效率', unit:'—', min:0.55, max:0.85, step:0.01, dec:2, note:'领先水平 0.72–0.80；直接影响 BOP 占比' },
    { key:'cmpRatio', k:'空压机压比', unit:'—', min:1.5, max:3.5, step:0.1, dec:1, note:'匹配电堆 0.16–0.25 MPa 操作压力；典型 2.0–2.8' },
    { key:'recirc', k:'氢循环方式', unit:'—', type:'select', options:[
      {v:'ejector',t:'引射器（省去循环泵）'},{v:'claw',t:'爪式氢循环泵'},
      {v:'roots',t:'罗茨氢循环泵'}],
      note:'引射器方案氢损最低（约 0.4%）；爪式效率高，罗茨流量大' },
    { key:'dcdcEff', k:'DC-DC 效率', unit:'—', min:0.94, max:0.99, step:0.005, dec:3, note:'SiC 器件 + 软开关可达 0.985–0.99' },
  ]},
  { id:'adv', ico:'✦', name:'智能优化与吹扫', desc:'优化目标、自适应控制、SOH 权重、吹扫策略', items:[
    { key:'optMode', k:'优化目标', unit:'—', type:'select', options:[
      {v:'balanced',t:'平衡（效率/耐久/成本）'},{v:'efficiency',t:'效率优先'},
      {v:'durability',t:'耐久优先'},{v:'cold',t:'低温启动优先'}],
      note:'根据应用场景智能调整控制策略' },
    { key:'adaptive', k:'自适应控制', unit:'—', type:'select', options:[
      {v:'on',t:'开启（MPC 模型预测）'},{v:'off',t:'关闭（固定策略）'}],
      note:'开启后系统根据实时工况动态调整计量比、温度与吹扫策略' },
    { key:'sohWeight', k:'SOH 权重', unit:'%', min:0, max:100, step:5, dec:0, note:'优化算法中 SOH 权重；权重越高越倾向长寿命策略' },
    { key:'purgePeriod', k:'阳极吹扫周期', unit:'s', min:5, max:60, step:1, dec:0, note:'功率越高吹扫周期越短；大功率典型 8–15 s' },
    { key:'purgeDur', k:'阳极吹扫时长', unit:'s', min:0.1, max:3.0, step:0.1, dec:1, note:'吹扫时长影响氢损与排水效果；典型 0.3–1.5 s' },
  ]},
];

const PRESETS = [
  { name:'微型电堆 18kW', stackPower:18, N:80, area:180, T:63, pH2:0.12, pAir:0.12, memThk:25, ptLoading:0.35, gdlThk:250, R:0.135, Aact:0.010, i0:0.0010, m:3.5e-5, n:4, dT:5, cellThk:2.2, bppThk:1.5, cmpRatio:1.8, cmpEff:0.62 },
  { name:'乘用车电堆 90kW', stackPower:90, N:330, area:300, T:75, pH2:0.16, pAir:0.17, memThk:12, ptLoading:0.22, gdlThk:180, R:0.095, Aact:0.0085, i0:0.0018, m:2.2e-5, n:4, dT:5.5, cellThk:1.3, bppThk:0.4, cmpRatio:2.3, cmpEff:0.76 },
  { name:'商用车电堆 150kW', stackPower:150, N:370, area:420, T:82, pH2:0.19, pAir:0.20, memThk:15, ptLoading:0.25, gdlThk:200, R:0.092, Aact:0.0082, i0:0.0020, m:2.0e-5, n:4, dT:5, cellThk:1.5, bppThk:0.45, cmpRatio:2.5, cmpEff:0.74 },
  { name:'电站电堆 350kW', stackPower:350, N:480, area:620, T:86, pH2:0.23, pAir:0.24, memThk:20, ptLoading:0.30, gdlThk:230, R:0.088, Aact:0.0080, i0:0.0022, m:1.8e-5, n:4, dT:6, cellThk:1.8, bppThk:0.6, cmpRatio:2.8, cmpEff:0.78 },
  { name:'重卡电堆 220kW', stackPower:220, N:410, area:480, T:83, pH2:0.21, pAir:0.22, memThk:16, ptLoading:0.26, gdlThk:210, R:0.090, Aact:0.0082, i0:0.0020, m:2.0e-5, n:4, dT:5.5, cellThk:1.6, bppThk:0.5, cmpRatio:2.6, cmpEff:0.75 },
  { name:'物流车电堆 60kW', stackPower:60, N:260, area:280, T:76, pH2:0.15, pAir:0.16, memThk:18, ptLoading:0.28, gdlThk:210, R:0.100, Aact:0.0090, i0:0.0016, m:2.6e-5, n:4, dT:5, cellThk:1.6, bppThk:0.5, cmpRatio:2.2, cmpEff:0.70 },
];

/* ================= 参数库 ================= */
const LIB = [
  { id:'stack_struct', t:'电堆结构与规格', ico:'▤', desc:'片数、有效面积、厚度、体积与重量', items:[
    { id:'stack.N', k:'片数范围', v:'300 – 480', u:'片', range:'40 – 600', note:'金属板乘用车 300–370 片；商用车 400–480 片', tiers:['micro','small','mid','large'], map:{key:'N', value:370} },
    { id:'stack.area', k:'单片有效面积', v:'250 – 550', u:'cm²', range:'100 – 850', note:'乘用车 250–350 cm²；商用车 400–550 cm²', tiers:['micro','small','mid','large'], map:{key:'area', value:420} },
    { id:'stack.thk', k:'单片厚度（含板）', v:'1.2 – 2.0', u:'mm', range:'0.9 – 3.5', note:'金属板单板 0.4–0.6 mm；含 MEA 与密封后单片厚度 1.2–1.5 mm', tiers:['small','mid','large'], map:{key:'cellThk', value:1.5} },
    { id:'stack.bppThk', k:'双极板单板厚度', v:'0.40 – 0.80', u:'mm', range:'0.30 – 2.00', note:'Mirai 2 钛合金板约 0.4 mm；不锈钢板 0.5–0.8 mm', tiers:['small','mid','large'], map:{key:'bppThk', value:0.4} },
    { id:'stack.compress', k:'封装压缩力', v:'0.8 – 1.5', u:'MPa', range:'0.5 – 2.5', note:'压缩力过低接触电阻大，过高可能压溃 GDL', tiers:['small','mid','large'], map:{key:'compress', value:1.2} },
    { id:'stack.h', k:'电堆高度', v:'300 – 450', u:'mm', range:'150 – 600', note:'乘用车目标 ≤ 350 mm；商用车 400–450 mm' },
    { id:'stack.w', k:'电堆宽度', v:'250 – 400', u:'mm', range:'120 – 550', note:'受限于发动机舱与安装支架尺寸' },
    { id:'stack.V', k:'电堆体积', v:'30 – 80', u:'L', range:'10 – 150', note:'Mirai 2 电堆体积约 37 L / 128 kW → 5.4 kW/L（领先）', tiers:['small','mid','large'] },
    { id:'stack.m', k:'电堆质量', v:'35 – 90', u:'kg', range:'10 – 180', note:'Mirai 2 电堆约 32 kg / 128 kW → 4.0 kW/kg（领先）', tiers:['micro','small','mid'] },
    { id:'stack.bolt', k:'紧固螺栓数量', v:'8 – 16', u:'个', range:'6 – 24', note:'力分布均匀性直接影响单片一致性' },
  ]},
  { id:'mea', t:'膜电极 MEA', ico:'◈', desc:'质子膜、催化剂、GDL 与 MPL', items:[
    { id:'mea.mem', k:'质子交换膜', v:'Gore SELECT / Nafion 211 / 212 / ePTFE 增强', u:'—', range:'—', note:'Gore SELECT 增强复合膜（8–12 μm）为车用主流', tiers:['micro','small','mid','large'] },
    { id:'mea.memt', k:'膜厚度', v:'8 – 25', u:'μm', range:'6 – 60', note:'乘用车 8–15 μm；商用车 15–25 μm', tiers:['small','mid','large'], map:{key:'memThk', value:15} },
    { id:'mea.ptA', k:'阳极 Pt 载量', v:'0.03 – 0.08', u:'mg/cm²', range:'0.02 – 0.15', note:'阳极载量持续下探；抗 CO 场景需提高至 0.10–0.20' },
    { id:'mea.ptC', k:'阴极 Pt 载量', v:'0.15 – 0.28', u:'mg/cm²', range:'0.10 – 0.45', note:'Mirai 2 阴极约 0.20 mg/cm²；捷氢 P4 约 0.22', tiers:['micro','small','mid','large'], map:{key:'ptLoading', value:0.25} },
    { id:'mea.cat', k:'催化剂类型', v:'PtCo/C · PtNi/C · 高活性 Pt/C', u:'—', range:'—', note:'PtCo 合金抗衰减更好；PtNi 达更高比活性', tiers:['small','mid','large'] },
    { id:'mea.gdl', k:'GDL 类型', v:'碳纸（SGL 29BC / Toray 060）+ MPL', u:'—', range:'碳纸 / 碳布', note:'带 MPL 的碳纸为车用主流', tiers:['micro','small','mid','large'] },
    { id:'mea.gdlt', k:'GDL 厚度', v:'150 – 250', u:'μm', range:'100 – 400', note:'低湿高电流密度宜用薄 GDL（150–190 μm）', tiers:['small','mid','large'], map:{key:'gdlThk', value:200} },
    { id:'mea.mplT', k:'MPL 厚度', v:'20 – 50', u:'μm', range:'10 – 80', note:'薄 MPL 传质好，厚 MPL 保水能力强', map:{key:'mplThk', value:30} },
    { id:'mea.ion', k:'离聚物含量', v:'25 – 35', u:'wt%', range:'15 – 45', note:'离聚物高则质子传导好，但氧气传质阻力上升', map:{key:'ionomer', value:30} },
    { id:'mea.por', k:'GDL 孔隙率', v:'70 – 82', u:'%', range:'60 – 90', note:'高孔隙利于传质但机械强度下降', map:{key:'gdlPorosity', value:76} },
  ]},
  { id:'bpp', t:'双极板与流场', ico:'◇', desc:'材料、厚度、流场与镀层', items:[
    { id:'bpp.mat', k:'板材料', v:'钛合金 / 不锈钢（金属板为主流）', u:'—', range:'石墨 / 金属 / 复合', note:'Mirai 2 用钛合金板；NEXO 用不锈钢板；电站堆多用石墨板', tiers:['micro','small','mid','large'] },
    { id:'bpp.thk', k:'单板厚度', v:'0.4 – 0.8', u:'mm', range:'0.3 – 2.0', note:'金属板 0.4–0.6 mm（Mirai 2 约 0.4 mm）', tiers:['small','mid','large'], map:{key:'bppThk', value:0.4} },
    { id:'bpp.fld', k:'流场类型', v:'3D 细密流场 / 交指 / 蛇形', u:'—', range:'蛇形 / 平行 / 交指 / 3D', note:'Mirai 2 采用 3D 细密流场；交指流场传质强但压降高', tiers:['micro','small','mid','large'] },
    { id:'bpp.res', k:'接触电阻', v:'< 6', u:'mΩ·cm²', range:'3 – 20', note:'金属板需 Au、TiN、CrN、导电聚合物涂层', tiers:['small','mid','large'], map:{key:'contactR', value:5} },
    { id:'bpp.cond', k:'导热系数', v:'> 100', u:'W/m·K', range:'20 – 400', note:'钛合金 ≥ 15；不锈钢 ≥ 16；石墨 ≥ 100', tiers:['small','mid','large'] },
    { id:'bpp.ct', k:'涂层厚度', v:'50 – 200', u:'nm', range:'20 – 500', note:'Au 涂层薄但成本高；TiN/CrN 涂层较厚但更经济', map:{key:'coatThk', value:120} },
    { id:'bpp.rough', k:'表面粗糙度 Ra', v:'0.05 – 0.20', u:'μm', range:'0.02 – 0.50', note:'低粗糙度有利于降低界面接触电阻' },
    { id:'bpp.chW', k:'流道宽度', v:'0.6 – 1.2', u:'mm', range:'0.4 – 2.0', note:'窄流道传质好但压降高' },
    { id:'bpp.chD', k:'流道深度', v:'0.4 – 0.8', u:'mm', range:'0.3 – 1.5', note:'深流道排水好但传质阻力上升' },
  ]},
  { id:'op', t:'电堆操作参数', ico:'⬡', desc:'温度、压力、计量比与气体品质', items:[
    { id:'op.T', k:'电堆工作温度', v:'80 – 90', u:'℃', range:'40 – 100', note:'高温低湿运行是领先方向；Mirai 2 约 85℃', tiers:['micro','small','mid','large'], map:{key:'T', value:82} },
    { id:'op.Tamb', k:'环境温度', v:'-30 – 50', u:'℃', range:'-40 – 55', note:'-30℃ 以下需专门低温策略', map:{key:'Tamb', value:25} },
    { id:'op.alt', k:'海拔高度', v:'0 – 3000', u:'m', range:'0 – 5000', note:'海拔每升高 1000 m 大气压降约 11%', map:{key:'altitude', value:0} },
    { id:'op.pH2', k:'氢气入口压力', v:'0.16 – 0.25', u:'MPa', range:'0.08 – 0.35', note:'中高压运行提升传质与排水', tiers:['micro','small','mid','large'], map:{key:'pH2', value:0.19} },
    { id:'op.pAir', k:'空气入口压力', v:'0.17 – 0.26', u:'MPa', range:'0.08 – 0.35', note:'与氢压协同匹配', tiers:['micro','small','mid','large'], map:{key:'pAir', value:0.20} },
    { id:'op.lamH2', k:'氢气计量比', v:'1.05 – 1.15', u:'—', range:'1.02 – 1.50', note:'配合引射器 + 脉冲吹扫', tiers:['micro','small','mid','large'], map:{key:'lambdaH2', value:1.12} },
    { id:'op.lamAir', k:'空气计量比', v:'1.8 – 2.6', u:'—', range:'1.5 – 3.5', note:'小功率低计量比提效；大功率高计量比保水热平衡', tiers:['micro','small','mid','large'], map:{key:'lambdaAir', value:2.3} },
    { id:'op.pur', k:'氢气纯度', v:'5.0 级（99.999%）', u:'—', range:'5.0 / 4.5 / 3.0', note:'车用标准 5.0 级（GB/T 37244）', map:{key:'purH2', value:5.0} },
    { id:'op.rh', k:'进气相对湿度', v:'30 – 60', u:'%', range:'10 – 90', note:'高温低湿运行是领先方向', map:{key:'rh', value:45} },
    { id:'op.dpH2', k:'氢侧压降', v:'10 – 25', u:'kPa', range:'5 – 50', note:'压降升高预示流场堵塞或水淹', map:{key:'dpH2', value:15} },
    { id:'op.dpAir', k:'空气侧压降', v:'15 – 30', u:'kPa', range:'8 – 60', note:'压降过高增加空压机功耗', map:{key:'dpAir', value:22} },
  ]},
  { id:'therm', t:'电堆水热管理', ico:'≈', desc:'温差、流量、水淹/膜干判定', items:[
    { id:'therm.Tin', k:'进堆水温', v:'65 – 85', u:'℃', range:'50 – 90', note:'进堆水温比堆温低 3–6 K', tiers:['micro','small','mid','large'] },
    { id:'therm.Tout', k:'出堆水温', v:'75 – 90', u:'℃', range:'60 – 95', note:'出堆水温和温差反映产热与散热匹配', tiers:['micro','small','mid','large'] },
    { id:'therm.dT', k:'进出堆温差', v:'4 – 6', u:'K', range:'3 – 10', note:'温差越小越均匀', tiers:['micro','small','mid','large'], map:{key:'dT', value:5.5} },
    { id:'therm.flow', k:'冷却液流量', v:'30 – 400', u:'L/min', range:'10 – 600', note:'流量随功率近似线性增长', tiers:['small','mid','large'], map:{key:'coolFlow', value:120} },
    { id:'therm.cool', k:'冷却液类型', v:'50% 乙二醇水溶液', u:'—', range:'—', note:'冰点 -37℃；高寒地区可提高乙二醇比例' },
    { id:'therm.flood', k:'水淹判定', v:'压降↑ + 单片电压抖动 + 高频阻抗↓', u:'—', range:'—', note:'基于 EIS + 压降 + 单片电压波动的多参数融合判定' },
    { id:'therm.dry', k:'膜干判定', v:'高频阻抗↑ + 整堆电压缓慢下降', u:'—', range:'—', note:'基于 EIS 高频阻抗 + 单片电压趋势；提前 30 min 预警' },
    { id:'therm.coolP', k:'冷却泵功耗', v:'1.5 – 4', u:'%', range:'1 – 6', note:'高效永磁同步水泵 + 变频控制可降低至 1.5%' },
    { id:'therm.radM', k:'散热器裕度', v:'≥ 20', u:'%', range:'10 – 40', note:'考虑夏季高温 + 老化衰减 + 结垢', map:{key:'radMargin', value:20} },
  ]},
  { id:'perf', t:'电堆性能指标', ico:'⚡', desc:'功率密度、效率、氢耗与一致性', items:[
    { id:'perf.pd', k:'功率密度', v:'1.0 – 1.5', u:'W/cm²', range:'0.6 – 1.8', note:'Mirai 2 达 1.3 W/cm²；捷氢 P4 约 1.3', tiers:['small','mid','large'] },
    { id:'perf.vpd', k:'体积功率密度', v:'4.5 – 6.5', u:'kW/L', range:'3.0 – 8.0', note:'Mirai 2 达 5.4 kW/L；捷氢 P4 达 5.0 kW/L', tiers:['small','mid','large'] },
    { id:'perf.sp', k:'比功率', v:'2.5 – 4.5', u:'kW/kg', range:'1.8 – 5.5', note:'Mirai 2 达 4.0 kW/kg；捷氢 P4 达 3.6 kW/kg', tiers:['micro','small','mid'] },
    { id:'perf.ocv', k:'开路电压 OCV', v:'0.96 – 1.02', u:'V', range:'0.92 – 1.08', note:'受膜厚、温度、湿度、氢渗综合影响', tiers:['micro','small','mid','large'] },
    { id:'perf.ilim', k:'极限电流密度', v:'2.5 – 3.2', u:'A/cm²', range:'2.0 – 3.8', note:'Mirai 2 达 3.0 A/cm²', tiers:['small','mid','large'] },
    { id:'perf.eff', k:'额定点电堆效率', v:'55 – 62', u:'%', range:'48 – 65', note:'Mirai 2 / NEXO 约 60%', tiers:['micro','small','mid','large'] },
    { id:'perf.gkwh', k:'电堆单位氢耗', v:'48 – 60', u:'g/kWh', range:'40 – 75', note:'电堆级氢耗（不含辅机）' },
    { id:'perf.cons', k:'单片一致性', v:'最大偏差 < 20', u:'mV', range:'10 – 60', note:'< 20 mV 为国际领先', tiers:['small','mid','large'] },
    { id:'perf.peak', k:'峰值功率倍率', v:'1.10 – 1.25', u:'—', range:'1.05 – 1.40', note:'峰值功率持续时间 ≥ 30 s' },
    { id:'perf.ramp', k:'加载速率', v:'40 – 80', u:'kW/s', range:'20 – 120', note:'10%→90% 加载时间 ≤ 3 s（领先 ≤ 2 s）' },
  ]},
  { id:'life', t:'电堆寿命与耐久', ico:'∞', desc:'寿命、启停、衰减与失效模式', items:[
    { id:'life.h', k:'电堆设计寿命', v:'15000 – 30000', u:'h', range:'8000 – 40000', note:'车用 ≥ 15000 h；电站 ≥ 30000 h；Ballard FCmove-HD 达 30000 h', tiers:['small','mid','large'] },
    { id:'life.cycle', k:'启停次数', v:'≥ 8000', u:'次', range:'5000 – 30000', note:'每次启停衰减 < 12 μV/片', tiers:['small','mid','large'] },
    { id:'life.deg', k:'衰减速率', v:'1.2 – 3.0', u:'μV/h·cell', range:'0.8 – 6.0', note:'稳态 ≤ 1.5 μV/h·cell；动态 ≤ 3.0', tiers:['small','mid','large'] },
    { id:'life.fail', k:'主要失效模式', v:'Pt 团聚 / 膜降解 / 碳腐蚀', u:'—', range:'—', note:'Pt 溶解与团聚占衰减 40–50%', tiers:['small','mid','large'] },
    { id:'life.soh', k:'SOH 评估指标', v:'V_avg / R_ohmic / 氢耗', u:'—', range:'—', note:'多参数融合模型' },
    { id:'life.cold', k:'低温启动衰减', v:'30 – 60', u:'μV/次', range:'15 – 100', note:'-30℃ 启动对膜与催化剂的损伤大于常温启动' },
    { id:'life.rul', k:'剩余寿命预测 RUL', v:'基于 SOH + 衰减速率', u:'h', range:'—', note:'卡尔曼滤波 + 经验衰减模型融合预测' },
  ]},
  { id:'gas', t:'气路系统', ico:'⚙', desc:'气路元件与参数', items:[
    { id:'gas.pur', k:'氢气纯度等级', v:'5.0 / 4.5 / 3.0', u:'—', range:'—', note:'车用标准 5.0 级；3.0 级工业副产氢需深度净化' },
    { id:'gas.mfc', k:'质量流量控制器精度', v:'±0.5 – ±1.0', u:'% FS', range:'±0.2 – ±2.0', note:'阳极侧高精度 MFC 保证氢计量准确' },
    { id:'gas.ejector', k:'引射器方案', v:'主动引射 / 被动引射', u:'—', range:'—', note:'主动引射可省去氢循环泵，氢损降至 0.4%' },
    { id:'gas.recirc', k:'氢循环泵类型', v:'爪式 / 罗茨 / 离心', u:'—', range:'—', note:'爪式低流量高效率；罗茨流量大但效率偏低' },
    { id:'gas.purgeT', k:'吹扫周期', v:'8 – 40', u:'s', range:'5 – 60', note:'功率越高吹扫周期越短；大功率典型 8–15 s', map:{key:'purgePeriod', value:15} },
    { id:'gas.purgeD', k:'吹扫时长', v:'0.3 – 1.5', u:'s', range:'0.1 – 3.0', note:'吹扫时长影响氢损与排水效果', map:{key:'purgeDur', value:0.9} },
    { id:'gas.valveT', k:'电磁阀响应', v:'< 20', u:'ms', range:'5 – 50', note:'响应越快控制精度越高；车用典型 ≤ 20 ms' },
    { id:'gas.leak', k:'允许泄漏率', v:'< 0.5', u:'% / 100h', range:'0.1 – 2.0', note:'SAE J2579 / GB/T 26990 对泄漏率有明确规定' },
  ]},
  { id:'bop', t:'BOP 辅机', ico:'⚙', desc:'空压机、水泵、DC-DC', items:[
    { id:'bop.cmp', k:'空压机类型', v:'离心式（带膨胀机）/ 罗茨', u:'—', range:'离心 / 螺杆 / 罗茨', note:'大功率离心式；小功率罗茨', tiers:['small','mid','large'] },
    { id:'bop.cmpR', k:'空压机压比', v:'2.0 – 2.8', u:'—', range:'1.5 – 3.5', note:'匹配电堆 0.16–0.25 MPa 操作压力', tiers:['small','mid','large'], map:{key:'cmpRatio', value:2.5} },
    { id:'bop.cmpE', k:'空压机等熵效率', v:'0.72 – 0.80', u:'—', range:'0.55 – 0.85', note:'领先水平 0.72–0.80', map:{key:'cmpEff', value:0.72} },
    { id:'bop.surg', k:'喘振裕度', v:'≥ 20', u:'%', range:'15 – 35', note:'先进空压机喘振裕度 20–25%' },
    { id:'bop.cmpP', k:'空压机功耗占比', v:'12 – 20', u:'%', range:'10 – 25', note:'带膨胀机的离心空压机占比可低至 12%', tiers:['small','mid','large'] },
    { id:'bop.pumpP', k:'水泵功耗占比', v:'1.5 – 4', u:'%', range:'1 – 6', note:'高效永磁同步水泵 + 变频控制' },
    { id:'bop.recircP', k:'氢循环泵占比', v:'0.8 – 3', u:'%', range:'0.5 – 5', note:'引射器方案可省去循环泵，仅 0.5–1%' },
    { id:'bop.dcdc', k:'DC-DC 效率', v:'97 – 99', u:'%', range:'94 – 99', note:'SiC 器件 + 软开关可达 98.5–99%', map:{key:'dcdcEff', value:0.98} },
    { id:'bop.total', k:'辅机总占比', v:'12 – 22', u:'%', range:'10 – 30', note:'大功率系统 BOP 占比 12–18%' },
  ]},
  { id:'bench', t:'台架专属', ico:'⌗', desc:'测试台架标定与采样规范', items:[
    { id:'bench.P', k:'功率范围', v:'10 – 400', u:'kW', range:'5 – 500', note:'台架覆盖被测对象 1.2 倍额定功率' },
    { id:'bench.fs', k:'采样频率', v:'100 – 2000', u:'Hz', range:'10 – 10000', note:'稳态 ≥ 100 Hz；动态变载 ≥ 1 kHz' },
    { id:'bench.precV', k:'电压采样精度', v:'±0.02', u:'% FS', range:'±0.01 – ±0.1', note:'≥ 24 bit ADC；单片电压差仅数十 mV' },
    { id:'bench.precI', k:'电流采样精度', v:'±0.05', u:'% FS', range:'±0.02 – ±0.2', note:'霍尔 + 分流器双路冗余' },
    { id:'bench.stst', k:'稳态判定', v:'电压波动 < ±3 mV / 30 s', u:'—', range:'±1 – ±10', note:'±3 mV / 30 s；严格判定保证标定数据可比性' },
    { id:'bench.load', k:'负载匹配', v:'电机对拖（带能量回馈）', u:'—', range:'电子负载 / 电机对拖', note:'电机对拖可回收 85%+ 能量' },
    { id:'bench.pts', k:'标定点数', v:'≥ 40', u:'点', range:'20 – 200', note:'10%–100% 每 2.5% 取一点' },
    { id:'bench.gas', k:'气体分析精度', v:'±0.05', u:'% FS', range:'±0.02 – ±0.2', note:'氢浓度、氧含量、露点检测' },
  ]},
  { id:'std', t:'国标与阈值', ico:'§', desc:'国家标准与电堆级基准', items:[
    { id:'std.24554', k:'GB/T 24554', v:'燃料电池发动机性能试验方法', u:'—', range:'—', note:'规定 10–400kW 车用燃料电池发动机的功率、效率、氢耗试验方法' },
    { id:'std.33979', k:'GB/T 33979', v:'低温冷启动试验方法', u:'—', range:'—', note:'-30℃ / -35℃ 冷启动判定条件与测试流程' },
    { id:'std.37244', k:'GB/T 37244', v:'燃料电池汽车用燃料氢气', u:'—', range:'—', note:'氢气纯度 5.0 / 4.5 / 3.0 分级与杂质限值；对标 SAE J2719' },
    { id:'std.26990', k:'GB/T 26990', v:'车载氢系统技术条件', u:'—', range:'—', note:'35 MPa / 70 MPa 储氢系统安全要求' },
    { id:'std.24549', k:'GB/T 24549', v:'燃料电池电动汽车安全要求', u:'—', range:'—', note:'涵盖电堆、氢系统、电气安全等要求' },
    { id:'std.j2719', k:'SAE J2719', v:'氢气品质标准（国际）', u:'—', range:'—', note:'H₂ ≥ 99.97%；CO ≤ 0.2 μmol/mol；总硫 ≤ 0.004 μmol/mol' },
    { id:'std.j2579', k:'SAE J2579', v:'氢系统安全技术规范', u:'—', range:'—', note:'泄漏率、耐压、碰撞等安全试验方法' },
    { id:'std.iso14687', k:'ISO 14687', v:'氢气燃料质量规范', u:'—', range:'—', note:'国际通用氢气品质标准，分 Grade A/B/C/D' },
    { id:'std.iec62282', k:'IEC 62282', v:'燃料电池技术国际标准', u:'—', range:'—', note:'涵盖固定式、便携式、车用燃料电池全系列国际标准' },
    { id:'std.cold', k:'低温启动阈值', v:'-30℃ 通过 / -40℃ 领先', u:'—', range:'—', note:'-30℃ ≤ 30 s；-40℃ 无需外部辅助可启动' },
    { id:'std.dur', k:'耐久阈值', v:'15000 h 衰减 < 5%', u:'—', range:'—', note:'车用 15000 h；电站级 30000–40000 h' },
    { id:'std.eff', k:'电堆效率阈值', v:'≥ 58', u:'%', range:'50 – 65', note:'额定点电堆效率 ≥ 58%' },
    { id:'std.h2c', k:'单位氢耗阈值', v:'≤ 52', u:'g/kWh', range:'45 – 70', note:'电堆级氢耗；对应电堆效率约 60%' },
  ]},
  { id:'diagnose', t:'电堆诊断与故障', ico:'⚕', desc:'故障模式、诊断方法、阈值', items:[
    { id:'diag.cold', k:'低温启动故障', v:'冰堵 / 膜脆化 / 电压爬升慢', u:'—', range:'—', note:'提前吹扫除水；采用 PTC 或电加热辅助' },
    { id:'diag.flood', k:'水淹特征', v:'单片电压抖动 / 压降上升 / 高频阻抗下降', u:'—', range:'—', note:'提高电流密度、降低增湿、增大空气流量' },
    { id:'diag.dry', k:'膜干特征', v:'整堆电压缓慢下降 / 高频阻抗上升', u:'—', range:'—', note:'提高增湿、降低堆温、降低空气计量比' },
    { id:'diag.coPoison', k:'CO 中毒特征', v:'阳极过电位上升 / 单片电压骤降', u:'—', range:'—', note:'提高阳极 Pt 载量；定期空气吹扫再生' },
    { id:'diag.carbon', k:'碳腐蚀特征', v:'长期衰减加速 / 阴极 ECSA 下降', u:'—', range:'—', note:'避免高电位滞留；减少启停次数' },
    { id:'diag.mem', k:'膜针孔特征', v:'氢渗增加 / OCV 下降 / 局部发热', u:'—', range:'—', note:'更换 MEA；检查 GDL 与流场是否损伤' },
    { id:'diag.consist', k:'单片一致性恶化', v:'最大偏差持续扩大', u:'—', range:'—', note:'检查流场堵塞、GDL 老化、MEA 损伤' },
    { id:'diag.eis', k:'EIS 诊断频段', v:'高频（1k–10kHz）/ 中频 / 低频', u:'—', range:'—', note:'高频反映欧姆阻抗；中频电荷转移；低频传质' },
  ]},
  { id:'control', t:'电堆控制策略', ico:'◆', desc:'控制算法与策略参数', items:[
    { id:'ctrl.mpc', k:'MPC 预测模型', v:'模型预测控制', u:'—', range:'—', note:'根据未来工况预测动态调整计量比、温度、吹扫策略' },
    { id:'ctrl.pi', k:'PID 参数', v:'Kp / Ki / Kd', u:'—', range:'—', note:'温度、压力、流量控制回路' },
    { id:'ctrl.anti', k:'防喘振控制', v:'流量前馈 + 压比反馈', u:'—', range:'—', note:'空压机喘振前提前降低转速' },
    { id:'ctrl.water', k:'水管理控制', v:'湿度 / 压降 / 阻抗融合', u:'—', range:'—', note:'基于多参数融合的水淹与膜干实时判定' },
    { id:'ctrl.thermal', k:'热管理控制', v:'温度前馈 + 流量反馈', u:'—', range:'—', note:'目标堆温 80–90℃' },
    { id:'ctrl.start', k:'冷启动策略', v:'预热 / 恒流 / 变压', u:'—', range:'—', note:'-30℃ 启动典型策略' },
    { id:'ctrl.stop', k:'停机策略', v:'吹扫 / 降温 / 短路', u:'—', range:'—', note:'停机吹扫去除残余水' },
    { id:'ctrl.observe', k:'状态观测器', v:'扩展卡尔曼滤波 EKF', u:'—', range:'—', note:'在线估计膜含水量、Pt 活性面积、SOH' },
  ]},
  { id:'safety', t:'电堆安全', ico:'⚠', desc:'安全阈值、监控项与响应', items:[
    { id:'safe.T', k:'温度上限', v:'90 – 100', u:'℃', range:'85 – 105', note:'超过上限触发降功率或停机' },
    { id:'safe.dT', k:'温差上限', v:'8 – 12', u:'K', range:'6 – 15', note:'温差过大预示散热异常' },
    { id:'safe.Vmin', k:'单片电压下限', v:'0.55 – 0.60', u:'V', range:'0.50 – 0.65', note:'低于下限触发保护；碳腐蚀风险增加' },
    { id:'safe.consist', k:'单片一致性上限', v:'40 – 60', u:'mV', range:'30 – 100', note:'超过上限触发降功率或停机' },
    { id:'safe.h2', k:'氢浓度上限', v:'< 1', u:'% LEL', range:'0.5 – 2.0', note:'超过阈值立即切断氢气并通风' },
    { id:'safe.dpH2', k:'氢侧压降上限', v:'40 – 60', u:'kPa', range:'30 – 80', note:'压降异常预示水淹或堵塞' },
    { id:'safe.leak', k:'氢气泄漏阈值', v:'< 0.5', u:'% / 100h', range:'0.2 – 1.0', note:'SAE J2579 / GB/T 26990 有明确要求' },
    { id:'safe.insul', k:'绝缘电阻', v:'≥ 100', u:'Ω/V', range:'100 – 500', note:'GB/T 24549 规定电堆绝缘电阻 ≥ 100 Ω/V' },
  ]},
  { id:'cost', t:'成本与成本优化', ico:'￥', desc:'电堆成本构成与降本路径', items:[
    { id:'cost.mea', k:'MEA 成本占比', v:'45 – 60', u:'%', range:'35 – 70', note:'MEA 是电堆成本大头；Pt 与膜是主要成本' },
    { id:'cost.bpp', k:'双极板成本占比', v:'20 – 30', u:'%', range:'15 – 40', note:'金属板 + 涂层是主要成本' },
    { id:'cost.pt', k:'Pt 用量', v:'0.15 – 0.30', u:'g/kW', range:'0.10 – 0.50', note:'Mirai 2 约 0.17 g/kW；目标 2025 降至 0.10' },
    { id:'cost.target', k:'目标成本', v:'500 – 1500', u:'元/kW', range:'300 – 3000', note:'2025 年目标 500–800 元/kW（大批量）' },
    { id:'cost.path', k:'降本路径', v:'低 Pt / 薄板 / 大产能', u:'—', range:'—', note:'低 Pt 催化剂 + 薄金属板 + 规模化是三大降本路径' },
    { id:'cost.h2', k:'氢气成本', v:'25 – 40', u:'元/kg', range:'15 – 60', note:'绿氢目标 20 元/kg 以下' },
  ]},
  { id:'test', t:'测试与标定', ico:'⌬', desc:'极化曲线、EIS、CV 等测试', items:[
    { id:'test.iv', k:'极化曲线测试', v:'V–i 曲线 ≥ 40 点', u:'—', range:'—', note:'从低电流到高电流扫描' },
    { id:'test.eis', k:'EIS 测试频段', v:'10 kHz – 0.1 Hz', u:'—', range:'—', note:'高频反映欧姆阻抗；中频电荷转移；低频传质' },
    { id:'test.cv', k:'CV 测试', v:'0.05 – 1.2 V', u:'—', range:'—', note:'评估 ECSA（电化学活性面积）；扫描 20–100 mV/s' },
    { id:'test.lsv', k:'LSV 氢渗测试', v:'0.1 – 0.4 V', u:'—', range:'—', note:'评估膜氢渗电流密度；越小膜越致密' },
    { id:'test.cycle', k:'耐久循环', v:'5000 – 15000 h', u:'—', range:'—', note:'启停循环 / 变载循环 / 怠速循环 三类' },
    { id:'test.cold', k:'冷启动测试', v:'-30 / -35 / -40', u:'℃', range:'-40 – 0', note:'环境仓浸泡 ≥ 8h 至热平衡' },
  ]},
  { id:'global', t:'全球电堆数据库', ico:'', desc:'国际主流电堆实测参数对标', items: GLOBAL_DB.map((g,i) => ({
    id:'g.'+i, k:g.n, v:`${g.p} kW / ${g.vpd} kW/L / ${g.sp} kW/kg`, u:'—', range:'—',
    note:`${g.N} 片 · ${g.area} cm² · ${g.i} A/cm² · 效率 ${g.eta}% · 寿命 ${g.life}h · ${g.r}`
  }))},
];

function libAllItems(){
  const out = [];
  LIB.forEach(cat => cat.items.forEach(it => out.push({ ...it, _cat: cat.t, _catId: cat.id })));
  return out;
}
function libFindItem(id){
  for(const cat of LIB){
    const it = cat.items.find(x => x.id === id);
    if(it) return { ...it, _cat: cat.t, _catId: cat.id };
  }
  return null;
}
function libFilterItems(items){
  const kw = state.libSearch.trim().toLowerCase();
  return items.filter(it => {
    if(state.libTier !== 'all'){
      if(!it.tiers || !it.tiers.includes(state.libTier)) return false;
    }
    if(kw){
      const blob = [it.k, it.v, it.u, it.note, it._cat].join(' ').toLowerCase();
      if(!blob.includes(kw)) return false;
    }
    return true;
  });
}

function kbAllEntries(){
  const out = [];
  KB_CATS.forEach(cat => cat.entries.forEach(e => out.push({ ...e, _cat:cat.name, _catId:cat.id, _catIco:cat.ico })));
  return out;
}
function kbFilterEntries(entries){
  const kw = state.kbSearch.trim().toLowerCase();
  if(!kw) return entries;
  return entries.filter(e => {
    const blob = [e.title, e.summary, (e.tags||[]).join(' '), e._cat].join(' ').toLowerCase();
    return blob.includes(kw);
  });
}

/* ================= 导航 ================= */
const NAV = [
  { id:'dashboard', ico:'◈', label:'工作台' },
  { id:'model',     ico:'✦', label:'大模型' },
  { id:'sim',       ico:'∿', label:'仿真' },
  { id:'calc',      ico:'∑', label:'计算器' },
  { id:'lib',       ico:'▤', label:'参数库' },
  { id:'monitor',   ico:'◉', label:'监控' },
  { id:'data',      ico:'◫', label:'数据' },
  { id:'kb',        ico:'❖', label:'知识库' },
];
const TITLES = {
  dashboard:'电堆工作台', model:'电堆动态大模型', sim:'电堆全域仿真系统',
  calc:'电堆工程计算器', lib:'电堆参数库', monitor:'电堆实时监控',
  data:'数据管理与对比', kb:'电堆知识库'
};

function renderNav(){
  $('#sideNav').innerHTML = NAV.map(n =>
    `<div class="nav-item ${n.id === state.view ? 'active' : ''}" data-action="nav" data-id="${n.id}">
       <span class="ico">${n.ico}</span><span>${n.label}</span>
     </div>`).join('');
  $('#bottomNav').innerHTML = NAV.map(n =>
    `<div class="bn-item ${n.id === state.view ? 'active' : ''}" data-action="nav" data-id="${n.id}">
       <span class="bi">${n.ico}</span><span class="bl">${n.label}</span>
     </div>`).join('');
}

function navigate(id){
  state.view = id;
  $('#pageTitle').textContent = TITLES[id] || '';
  renderNav();
  renderView();
  $('#content').scrollTop = 0;
  if(id === 'monitor') startMonitor(); else stopMonitor();
  if(id === 'model' && state.model.running) startModelTrain(); else if(id !== 'model') stopModelTrain();
}

function renderView(){
  const c = $('#content');
  const V = {
    dashboard: viewDashboard, model: viewModel, sim: viewSim, calc: viewCalc,
    lib: viewLib, monitor: viewMonitor, data: viewData, kb: viewKb,
  };
  c.innerHTML = (V[state.view] || (() => ''))();
  if(state.view === 'sim')     afterSim();
  if(state.view === 'monitor') afterMonitor();
  if(state.view === 'dashboard') afterDashboard();
  if(state.view === 'lib')     afterLib();
  if(state.view === 'kb')      afterKb();
  if(state.view === 'data')    afterData();
  if(state.view === 'model')   afterModel();
}

/* ================= 工作台 ================= */
function viewDashboard(){
  const r = solveSystem();
  const pct = (state.params.stackPower - 10) / 390 * 100;
  const tierColor = r.tier.color;

  return `
  <div class="hero ${state.model.running ? 'mdl-running' : ''}">
    <div class="hero-top">
      <div class="hero-label">燃料电池电堆自适应引擎 · 全球数据库联动</div>
      <div class="hero-tier" id="tierTag" style="background:${tierColor}22;color:${tierColor};border-color:${tierColor}55">
        ${r.tier.name}型 · ${r.tier.min}–${r.tier.max}kW
      </div>
    </div>
    <div class="power-row">
      <div class="power-num" id="pNum">${state.params.stackPower}</div>
      <div class="power-unit">kW</div>
      <div class="power-hint">电堆功率 10–400 kW</div>
    </div>
    <input type="range" id="pSlider" min="10" max="400" step="1" value="${state.params.stackPower}" style="--p:${pct}%">
    <div class="scale-row"><span>10</span><span>100</span><span>200</span><span>300</span><span>400</span></div>
    <div class="auto-grid" id="autoGrid">
      ${[
        ['电流密度','i','A/cm²',2],['单片电压','Vc','V',3],
        ['电堆效率','etaStack','%',1],['电堆氢耗','mH2','kg/h',2],
        ['电堆电压','Vstack','V',0],['电堆电流','I','A',0],
        ['体积功率密度','vpd','kW/L',2],['比功率','sp','kW/kg',2],
        ['产热功率','Q','kW',1],['冷却流量','flow','L/min',0],
        ['净功率','Pnet','kW',1],['辅机占比','bopPct','%',1],
      ].map(x => `
        <div class="auto-item">
          <div class="auto-k">${x[0]}</div>
          <div class="auto-v" data-live="${x[1]}">—<small>${x[2]}</small></div>
        </div>`).join('')}
    </div>
  </div>
  ${r.powerLimited ? '<div class="hint" role="alert" style="border-color:rgba(255,159,10,.45);color:#ffcc80">当前目标功率超出此参数组合下模型可达到的最大值。页面已显示模型峰值功率点，不应将其视为达到额定目标。</div>' : ''}

  <div class="sec-title">电堆功率分段</div>
  <div class="card">
    <div style="display:flex;gap:6px;margin-bottom:14px">
      ${TIERS.map(t => `
        <div style="flex:1;text-align:center;cursor:pointer" data-action="preset-tier" data-id="${t.id}">
          <div style="height:5px;border-radius:3px;background:${t.id === r.tier.id ? t.color : '#1f2c42'};transition:.3s"></div>
          <div style="font-size:10px;color:${t.id === r.tier.id ? t.color : '#5f7391'};margin-top:6px;font-weight:${t.id === r.tier.id ? 700 : 500}">${t.name}</div>
          <div style="font-size:9px;color:#3d4c66">${t.min}-${t.max}kW</div>
        </div>`).join('')}
    </div>
    <div style="font-size:11.5px;color:#8aa7c4;line-height:1.7"><b style="color:${r.tier.color}">适用场景：</b>${r.tier.scenes}</div>
  </div>

  <div class="sec-title">全球电堆数据库对标（${GLOBAL_DB.length} 款）</div>
  <div class="card">
    <div class="card-h"><h3>当前方案 vs 全球主流电堆</h3><span class="tag">实时对比</span></div>
    ${GLOBAL_DB.map(g => {
      const cmp = (v, ref) => v >= ref ? 'var(--green)' : v >= ref * 0.9 ? 'var(--orange)' : 'var(--red)';
      const myVpd = r.vpd, mySp = r.sp, myEta = r.etaStack * 100;
      return `
      <div class="gcard">
        <div class="gcard-h">
          <span class="rn">${g.n}</span>
          <span class="rt">${g.r}</span>
        </div>
        <div class="gcard-grid">
          <div class="gcard-i"><div class="gcard-k">额定功率</div><div class="gcard-v">${g.p} kW</div></div>
          <div class="gcard-i"><div class="gcard-k">体积功率密度</div><div class="gcard-v">${g.vpd} kW/L</div></div>
          <div class="gcard-i"><div class="gcard-k">比功率</div><div class="gcard-v">${g.sp} kW/kg</div></div>
          <div class="gcard-i"><div class="gcard-k">电堆效率</div><div class="gcard-v">${g.eta}%</div></div>
        </div>
        <div class="gcmp-bar">
          <span>VPD</span>
          <div class="track"><i style="width:${Math.min(myVpd / g.vpd * 100, 100)}%;background:${cmp(myVpd, g.vpd)}"></i></div>
          <span>${fmt(myVpd, 2)}</span>
        </div>
        <div class="gcmp-bar">
          <span>比功率</span>
          <div class="track"><i style="width:${Math.min(mySp / g.sp * 100, 100)}%;background:${cmp(mySp, g.sp)}"></i></div>
          <span>${fmt(mySp, 2)}</span>
        </div>
        <div class="gcmp-bar">
          <span>效率</span>
          <div class="track"><i style="width:${Math.min(myEta / g.eta * 100, 100)}%;background:${cmp(myEta, g.eta)}"></i></div>
          <span>${fmt(myEta, 1)}</span>
        </div>
        <div style="font-size:10px;color:#6b87ab;margin-top:6px;line-height:1.6">${g.note}</div>
      </div>`;
    }).join('')}
    <div class="res-box" style="margin-top:12px">
      <div class="res-row"><span class="res-k">当前方案体积功率密度</span><span class="res-v">${fmt(r.vpd,2)}<small>kW/L</small></span></div>
      <div class="res-row"><span class="res-k">当前方案比功率</span><span class="res-v">${fmt(r.sp,2)}<small>kW/kg</small></span></div>
      <div class="res-row"><span class="res-k">当前方案电堆效率</span><span class="res-v">${fmt(r.etaStack*100,1)}<small>%</small></span></div>
      <div class="res-row"><span class="res-k">全球领先体积功率密度</span><span class="res-v" style="color:#22d3ee">5.40<small>kW/L</small></span></div>
    </div>
  </div>

  <div class="sec-title">快捷功能</div>
  <div class="grid g4">
    <div class="quick" data-action="nav" data-id="model"><span class="qi">✦</span><span class="ql">大模型</span></div>
    <div class="quick" data-action="nav" data-id="sim"><span class="qi">∿</span><span class="ql">电堆仿真</span></div>
    <div class="quick" data-action="nav" data-id="calc"><span class="qi">∑</span><span class="ql">工程计算</span></div>
    <div class="quick" data-action="nav" data-id="lib"><span class="qi">▤</span><span class="ql">参数库</span></div>
    <div class="quick" data-action="nav" data-id="monitor"><span class="qi">◉</span><span class="ql">电堆监控</span></div>
    <div class="quick" data-action="nav" data-id="data"><span class="qi">◫</span><span class="ql">方案对比</span></div>
    <div class="quick" data-action="nav" data-id="kb"><span class="qi">❖</span><span class="ql">知识库</span></div>
    <div class="quick" data-action="report" data-id="pdf"><span class="qi">⎙</span><span class="ql">导出报告</span></div>
  </div>

  <div class="sec-title">电堆核心指标</div>
  <div class="grid g2">
    <div class="kpi g"><div class="kpi-k">电堆净功率</div><div class="kpi-v" data-live="Pnet">—<small>kW</small></div></div>
    <div class="kpi b"><div class="kpi-k">电堆总功率</div><div class="kpi-v" data-live="Pstack">—<small>kW</small></div></div>
    <div class="kpi c"><div class="kpi-k">氢气计量比</div><div class="kpi-v" data-live="lamH2">—</div></div>
    <div class="kpi p"><div class="kpi-k">空气计量比</div><div class="kpi-v" data-live="lamAir">—</div></div>
    <div class="kpi o"><div class="kpi-k">BOP 总功耗</div><div class="kpi-v" data-live="pBop">—<small>kW</small></div></div>
    <div class="kpi r"><div class="kpi-k">单位氢耗</div><div class="kpi-v" data-live="gkwh">—<small>g/kWh</small></div></div>
  </div>

  <div class="sec-title">BOP 功耗拆解</div>
  <div class="card">
    ${[
      ['空压机', r.pCmp, '#0a84ff'],
      ['冷却水泵', r.pPump, '#00d48a'],
      ['氢循环', r.pRecirc, '#22d3ee'],
      ['DC-DC 损耗', r.pDcdc, '#a78bfa'],
    ].map(x => `
      <div class="bar-row">
        <span class="bar-k">${x[0]}</span>
        <div class="bar-track"><i style="width:${Math.min(x[1]/Math.max(r.pBop,0.01)*100,100)}%;background:${x[2]}"></i></div>
        <span class="bar-v">${fmt(x[1],2)} kW</span>
      </div>`).join('')}
    <div class="res-row" style="border-top:1px dashed rgba(255,255,255,.1);margin-top:6px;padding-top:10px">
      <span class="res-k">BOP 合计占比</span>
      <span class="res-v">${fmt(r.pBop/Math.max(r.Pstack,0.01)*100,1)}<small>%</small></span>
    </div>
  </div>

  <div class="sec-title">电堆参数设定（全部可手动调节）</div>
  <div class="hint">展开分组，可逐项拖动滑块或直接输入数值。<b>所有参数实时生效；参数注释已对接全球电堆数据库。</b></div>

  <div class="param-toolbar">
    <button class="btn ghost" data-action="param-expand-all">⌄ 展开全部</button>
    <button class="btn ghost" data-action="param-collapse-all">⌃ 折叠全部</button>
    <button class="btn ghost" data-action="param-reset">↻ 恢复默认</button>
  </div>

  <div class="preset-row">
    ${PRESETS.map((p, i) => `
      <div class="preset ${state.presetIdx === i ? 'active' : ''}" data-action="apply-preset" data-id="${i}">${p.name}</div>`).join('')}
  </div>

  ${PARAM_GROUPS.map(g => {
    const open = state.paramOpen[g.id];
    return `
    <div class="param-group ${open ? 'open' : ''}" data-pgroup="${g.id}">
      <div class="param-group-head" data-action="param-toggle" data-id="${g.id}">
        <div class="pgi">${g.ico}</div>
        <div style="flex:1;min-width:0">
          <h4>${g.name}</h4>
          <div style="font-size:10.5px;color:var(--mut);margin-top:2px">${g.desc}</div>
        </div>
        <span class="pcount">${g.items.length} 项</span>
        <span class="pchev">›</span>
      </div>
      <div class="param-group-body">
        ${g.items.map(it => paramItemHtml(it)).join('')}
      </div>
    </div>`;
  }).join('')}

  <div class="foot-note">
    设计者：<b class="sign">戴煜</b> · 燃料电池研发工程师<br>
    联系方式：<b>18662613315@163.com</b><br>
    参数已对接全球电堆数据库（Toyota Mirai 2 / Hyundai NEXO / Ballard / Nikola / 亿华通 / 重塑 / 捷氢）<br>
    版权所有 © 2026 戴煜 · 保留所有权利
  </div>`;
}

function paramItemHtml(it){
  const P = state.params;
  if(it.type === 'select'){
    const cur = P[it.key] || (it.options && it.options[0].v);
    return `
    <div class="param-item">
      <div class="param-item-head"><span class="param-item-k">${it.k}</span></div>
      <select class="pselect" data-pkey="${it.key}">
        ${it.options.map(o => `<option value="${o.v}" ${cur === o.v ? 'selected' : ''}>${o.t}</option>`).join('')}
      </select>
      <div class="param-item-note">${it.note}</div>
    </div>`;
  }
  const val = P[it.key];
  const dec = it.dec != null ? it.dec : 2;
  const pct = (val - it.min) / (it.max - it.min) * 100;
  return `
  <div class="param-item">
    <div class="param-item-head">
      <span class="param-item-k">${it.k}<span class="punit">${it.unit !== '—' ? it.unit : ''}</span></span>
      <span class="param-item-range">${it.min} – ${it.max}</span>
    </div>
    <div class="param-item-body">
      <input type="range" class="pslider" data-pkey="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" value="${val}" style="--p:${pct}%">
      <input type="number" class="pnum" data-pkey="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" value="${val}" data-dec="${dec}">
    </div>
    <div class="param-item-note">${it.note}</div>
  </div>`;
}

function afterDashboard(){
  updateLiveValues();
  const sl = $('#pSlider');
  if(sl){
    sl.addEventListener('input', e => {
      const P = +e.target.value;
      state.params.stackPower = P;
      sl.style.setProperty('--p', (P - 10) / 390 * 100 + '%');
      $('#pNum').textContent = P;
      $('#chipPower').textContent = P + ' kW';
      const r = solveSystem();
      const tag = $('#tierTag');
      if(tag){
        tag.textContent = `${r.tier.name}型 · ${r.tier.min}–${r.tier.max}kW`;
        tag.style.background = r.tier.color + '22';
        tag.style.color = r.tier.color;
        tag.style.borderColor = r.tier.color + '55';
      }
      syncParamItem('stackPower', P);
      updateLiveValues();
    });
  }
  $$('.pslider').forEach(s => {
    s.addEventListener('input', e => {
      const key = e.target.dataset.pkey;
      const v = parseFloat(e.target.value);
      state.params[key] = v;
      e.target.style.setProperty('--p', (v - e.target.min) / (e.target.max - e.target.min) * 100 + '%');
      syncParamItem(key, v);
      updateLiveValues();
      if(key === 'stackPower') syncTopPower(v);
    });
  });
  $$('.pnum').forEach(inp => {
    inp.addEventListener('input', e => {
      const key = e.target.dataset.pkey;
      const v = parseFloat(e.target.value);
      if(isNaN(v)) return;
      const v2 = clamp(v, parseFloat(e.target.min), parseFloat(e.target.max));
      state.params[key] = v2;
      syncParamItem(key, v2);
      updateLiveValues();
      if(key === 'stackPower') syncTopPower(v2);
    });
    inp.addEventListener('blur', e => {
      const key = e.target.dataset.pkey;
      const v = parseFloat(e.target.value);
      if(isNaN(v)) { e.target.value = state.params[key]; return; }
      const v2 = clamp(v, parseFloat(e.target.min), parseFloat(e.target.max));
      state.params[key] = v2;
      e.target.value = v2;
      syncParamItem(key, v2);
      updateLiveValues();
      if(key === 'stackPower') syncTopPower(v2);
    });
  });
  $$('.pselect').forEach(s => {
    s.addEventListener('change', e => {
      state.params[e.target.dataset.pkey] = e.target.value;
      updateLiveValues();
    });
  });
}

function syncParamItem(key, value){
  $$(`.pslider[data-pkey="${key}"]`).forEach(s => {
    s.value = value;
    s.style.setProperty('--p', (value - s.min) / (s.max - s.min) * 100 + '%');
  });
  $$(`.pnum[data-pkey="${key}"]`).forEach(inp => {
    const dec = parseInt(inp.dataset.dec) || 0;
    inp.value = Number(value).toFixed(dec);
  });
}

function syncTopPower(P){
  const sl = $('#pSlider');
  if(sl){ sl.value = P; sl.style.setProperty('--p', (P - 10) / 390 * 100 + '%'); }
  const pn = $('#pNum'); if(pn) pn.textContent = P;
  const chip = $('#chipPower'); if(chip) chip.textContent = P + ' kW';
  const tag = $('#tierTag');
  if(tag){
    const r = solveSystem();
    tag.textContent = `${r.tier.name}型 · ${r.tier.min}–${r.tier.max}kW`;
    tag.style.background = r.tier.color + '22';
    tag.style.color = r.tier.color;
    tag.style.borderColor = r.tier.color + '55';
  }
}

function updateLiveValues(){
  const r = solveSystem();
  const set = (key, val, dec) => {
    $$(`[data-live="${key}"]`).forEach(el => {
      const unit = el.querySelector('small');
      const unitHTML = unit ? unit.outerHTML : '';
      el.innerHTML = fmt(val, dec) + unitHTML;
    });
  };
  set('i', r.i, 2); set('Vc', r.Vc, 3);
  set('etaStack', r.etaStack * 100, 1); set('etaSys', r.etaSys * 100, 1);
  set('mH2', r.mH2, 2); set('gkwh', r.gkwh, 1);
  set('pBop', r.pBop, 2); set('Q', r.Q, 1);
  set('Pnet', r.Pnet, 1); set('Pstack', r.Pstack, 1);
  set('lamH2', r.lamH2, 3); set('lamAir', r.lamAir, 2);
  set('Vstack', r.Vstack, 0); set('I', r.I, 0);
  set('flow', r.flow, 0); set('vpd', r.vpd, 2); set('sp', r.sp, 2);
  set('bopPct', r.pBop / Math.max(r.Pstack, 0.01) * 100, 1);
}

/* ================= 大模型视图 ================= */
function viewModel(){
  return `
  <div role="note" style="margin:12px 0;padding:12px 15px;border:1px solid rgba(255,159,10,.45);border-radius:10px;background:rgba(120,75,0,.12);color:#ffd18a;font-size:12px;line-height:1.7"><b>重要说明：</b>本页只用预设公式和随机数模拟指标变化；没有加载训练数据、执行神经网络训练或真实推理。R²、误差、延迟及曲线均为演示数值，不是验证结果或实测性能。真实研发使用前必须接入训练框架、标注数据和独立验证集。</div>

  <div class="hero mdl ${state.model.running ? 'mdl-running' : ''}">
    <div class="hero-top">
      <div class="hero-label">HyHub 模型流程演示 · 非真实训练</div>
      <div class="hero-tier ${state.model.running ? 'pulse' : ''}" style="background:rgba(167,139,250,.15);color:#a78bfa;border-color:rgba(167,139,250,.35)">
        ${state.model.running ? '● 演示运行' : '○ 演示就绪'}
      </div>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;position:relative;z-index:1">
      <div class="power-num" id="mdlEpoch">${state.model.epoch}</div>
      <div class="power-unit">epoch</div>
      <div class="power-hint" style="color:#a78bfa">规划架构：LSTM / PINN / GNN / Transformer（尚未接入）</div>
    </div>
    <div class="grid g4" style="margin-top:14px;position:relative;z-index:1">
      <div class="auto-item"><div class="auto-k">模拟损失</div><div class="auto-v" id="mdlLoss">—</div></div>
      <div class="auto-item"><div class="auto-k">模拟 R²（非验证）</div><div class="auto-v" id="mdlR2">—</div></div>
      <div class="auto-item"><div class="auto-k">模拟误差</div><div class="auto-v" id="mdlMae">—</div></div>
      <div class="auto-item"><div class="auto-k">模拟延迟</div><div class="auto-v" id="mdlLat">—<small>ms</small></div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-h"><h3>模型控制</h3><span class="tag">实时</span></div>
    <div class="grid g2">
      <button class="btn purple" data-action="mdl-toggle" id="mdlBtn">${state.model.running ? '■ 暂停演示' : '▶ 启动演示'}</button>
      <button class="btn ghost" data-action="mdl-reset">↻ 重置模型</button>
    </div>
  </div>

  <div class="sec-title">模拟指标变化曲线（非真实训练）</div>
  <div class="chart-wrap"><canvas id="mdlChart1" class="tall"></canvas>${legend([{c:'#a78bfa',n:'模拟损失 Loss×100'},{c:'#00d48a',n:'模拟 R²×100'}])}</div>

  <div class="sec-title">物理模型对比示意（非 PINN 推理）</div>
  <div class="chart-wrap"><canvas id="mdlChart2" class="tall"></canvas>${legend([{c:'#0a84ff',n:'扰动示意电压 (V)'},{c:'#ff9f0a',n:'公式模型电压 (V)'}])}</div>

  <div class="sec-title">参数敏感性示意（未由训练模型拟合）</div>
  <div class="card">
    ${[
      ['操作温度 T', 0.82, '#0a84ff'],
      ['氢气压力 pH2', 0.68, '#00d48a'],
      ['Pt 载量', 0.74, '#22d3ee'],
      ['膜厚度', 0.61, '#a78bfa'],
      ['空气计量比', 0.55, '#ff9f0a'],
      ['GDL 孔隙率', 0.42, '#f472b6'],
      ['双极板接触电阻', 0.71, '#ff453a'],
      ['冷却流量', 0.33, '#7d8fb3'],
    ].map(x => `
      <div class="bar-row">
        <span class="bar-k">${x[0]}</span>
        <div class="bar-track"><i style="width:${x[1]*100}%;background:${x[2]}"></i></div>
        <span class="bar-v">${fmt(x[1]*100,0)}%</span>
      </div>`).join('')}
  </div>

  <div class="sec-title">模拟误差指标（非实测偏差）</div>
  <div class="grid g2">
    <div class="kpi b"><div class="kpi-k">模拟 RMSE</div><div class="kpi-v" id="mdlRmse">—<small>mV</small></div></div>
    <div class="kpi g"><div class="kpi-k">模拟 R²</div><div class="kpi-v" id="mdlR2b">—</div></div>
    <div class="kpi o"><div class="kpi-k">模拟最大偏差</div><div class="kpi-v" id="mdlMax">—<small>mV</small></div></div>
    <div class="kpi p"><div class="kpi-k">模拟延迟</div><div class="kpi-v" id="mdlLat2">—<small>ms</small></div></div>
  </div>

  <div class="sec-title">规划模块（尚未实现）</div>
  <div class="card">
    <div class="bar-row"><span class="bar-k">LSTM</span><span class="bar-v">拟用于动态时序特征建模</span></div>
    <div class="bar-row"><span class="bar-k">PINN</span><span class="bar-v">拟引入电化学与能量守恒约束</span></div>
    <div class="bar-row"><span class="bar-k">GNN</span><span class="bar-v">拟描述多堆温度与流量耦合</span></div>
    <div class="bar-row"><span class="bar-k">Transformer</span><span class="bar-v">拟用于长周期衰减序列分析</span></div>
    <div class="hint">以上为研发规划，不代表当前软件已实现这些网络、训练结果或性能权重。</div>
  </div>

  <div class="sec-title">规划应用场景（待实现与验证）</div>
  <div class="grid g2">
    <div class="li"><div class="li-ico p">◈</div><div class="li-body"><div class="li-t">实时 SOH 估计</div><div class="li-d">融合多参数在线估计</div></div></div>
    <div class="li"><div class="li-ico g">❄</div><div class="li-body"><div class="li-t">冷启动策略优化</div><div class="li-d">-30℃ 启动轨迹预测</div></div></div>
    <div class="li"><div class="li-ico o">≈</div><div class="li-body"><div class="li-t">膜干/水淹诊断</div><div class="li-d">EIS + 时序特征融合</div></div></div>
    <div class="li"><div class="li-ico b">∞</div><div class="li-body"><div class="li-t">剩余寿命 RUL 预测</div><div class="li-d">Transformer 长程依赖</div></div></div>
  </div>

  <div class="foot-note">
    HyHub 算法架构设计草案 · LSTM / PINN / GNN / Transformer（未接入真实训练模型）<br>
    设计者：<b class="sign">戴煜</b> · 燃料电池研发工程师<br>
    联系方式：<b>18662613315@163.com</b><br>
    版权所有 © 2026 戴煜 · 保留所有权利
  </div>`;
}

function afterModel(){
  if(state.model.running) startModelTrain();
  drawModelCharts();
}
function startModelTrain(){
  stopModelTrain();
  state.model.timer = setInterval(tickModel, 600);
  tickModel();
}
function stopModelTrain(){
  if(state.model.timer){ clearInterval(state.model.timer); state.model.timer = null; }
}

function tickModel(){
  if(state.view !== 'model'){ stopModelTrain(); return; }
  const m = state.model;
  m.epoch++;
  const baseLoss = 0.8 * Math.exp(-m.epoch / 30) + 0.02 + (Math.random() - 0.5) * 0.01;
  const r2 = Math.min(0.9985, 0.5 + 0.5 * (1 - Math.exp(-m.epoch / 25)));
  const mae = 12 * Math.exp(-m.epoch / 40) + 0.8;
  const lat = 8 + Math.random() * 4;
  m.loss.push([m.epoch, baseLoss]);
  if(m.loss.length > 100) m.loss.shift();

  const upd = (id, v) => { const e = $('#' + id); if(e) e.textContent = v; };
  upd('mdlEpoch', m.epoch);
  upd('mdlLoss', baseLoss.toFixed(4));
  upd('mdlR2', r2.toFixed(4));
  upd('mdlMae', mae.toFixed(2) + ' mV');
  const le = $('#mdlLat'); if(le) le.innerHTML = lat.toFixed(1) + '<small>ms</small>';
  const le2 = $('#mdlLat2'); if(le2) le2.innerHTML = lat.toFixed(1) + '<small>ms</small>';
  upd('mdlRmse', (mae * 0.95).toFixed(2));
  const rb = $('#mdlR2b'); if(rb) rb.textContent = r2.toFixed(4);
  upd('mdlMax', (mae * 2.1).toFixed(1));

  if(m.epoch % 2 === 0) drawModelCharts();
  if(m.epoch >= 200){
    m.running = false; stopModelTrain();
    const btn = $('#mdlBtn'); if(btn) btn.textContent = '▶ 启动演示';
    toast('演示结束 · 模拟 R² = ' + r2.toFixed(4) + '（非真实验证结果）');
  }
}

function drawModelCharts(){
  const cv1 = $('#mdlChart1');
  if(cv1 && state.model.loss.length > 0){
    const dataLoss = state.model.loss;
    const dataR2 = state.model.loss.map(d => [d[0], Math.min(0.9985, 0.5 + 0.5 * (1 - Math.exp(-d[0] / 25))) * 100]);
    requestAnimationFrame(() => plot(cv1, {
      xMin: 0, xMax: Math.max(50, state.model.epoch), yMin: 0, yMax: 100,
      xLabel: 'Epoch', yLabel: 'Loss×100 / R²×100',
      series: [
        { data: dataLoss.map(d => [d[0], d[1] * 100]), color:'#a78bfa', fill:'rgba(167,139,250,.16)' },
        { data: dataR2, color:'#00d48a' },
      ]
    }));
  }
  const cv2 = $('#mdlChart2');
  if(cv2){
    const P = state.params, T_K = P.T + 273.15;
    const pred = [], phys = [];
    for(let i = 0.1; i <= 2.5; i += 0.1){
      const v = vcell(i, T_K, { N:P.N, area:P.area, pH2:P.pH2, pAir:P.pAir, R:P.R, Aact:P.Aact, i0:P.i0, m:P.m, n:P.n });
      phys.push([i, v]);
      pred.push([i, v * (1 + Math.sin(i*9)*0.004 + (Math.random()-0.5)*0.004)]);
    }
    requestAnimationFrame(() => plot(cv2, {
      xMin:0, xMax:2.5, yMin:0.4, yMax:1.05,
      xLabel:'电流密度 (A/cm²)', yLabel:'单片电压 (V)',
      series:[
        { data: pred, color:'#0a84ff', fill:'rgba(10,132,255,.16)' },
        { data: phys, color:'#ff9f0a', dots:true },
      ]
    }));
  }
}

/* ================= 仿真 ================= */
const SIM_MODES = [
  { id:'steady', ico:'▬', t:'电堆稳态仿真', d:'极化曲线·功率密度·损耗拆解' },
  { id:'dynamic', ico:'∿', t:'电堆动态变载', d:'怠速→50%→100%→峰值' },
  { id:'cold', ico:'❄', t:'−35℃ 冷启动', d:'国标低温启动验证' },
  { id:'durab', ico:'∞', t:'电堆耐久循环', d:'启停衰减·寿命预测' },
  { id:'bench', ico:'⇄', t:'台架对标仿真', d:'实测 vs 仿真偏差标定' },
  { id:'limit', ico:'⚡', t:'极限边界仿真', d:'超载·高低压·多温度' },
  { id:'eis', ico:'∿', t:'EIS 阻抗谱仿真', d:'Nyquist·Bode 双图' },
  { id:'cv', ico:'♻', t:'CV 循环伏安仿真', d:'ECSA 与催化活性' },
  { id:'water', ico:'≈', t:'水热联合仿真', d:'温度场·水含量·压降' },
];

function viewSim(){
  const P = state.params;
  const F_ = (label, id, val, min, max, step, bind, unit) => `
    <div class="field"><label>${label} <b id="${id}Val">${val}${unit||''}</b></label>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-bind="${bind}" class="sim-slider"></div>`;

  return `
  <div class="sec-title">仿真模式</div>
  <div class="grid g3">
    ${SIM_MODES.map(m => `
      <div class="mode ${m.id === state.simMode ? 'active' : ''}" data-action="sim-mode" data-id="${m.id}">
        <div class="mode-i">${m.ico}</div>
        <div class="mode-t">${m.t}</div>
        <div class="mode-d">${m.d}</div>
      </div>`).join('')}
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-h"><h3>仿真参数配置（全部可手动调节）</h3><span class="tag">实时生效</span></div>
    <div class="sec-title" style="margin-top:4px">电堆结构参数</div>
    <div class="grid g2">
      ${F_('电堆功率','simP',P.stackPower,10,400,1,'stackPower',' kW')}
      ${F_('电堆片数','simN',P.N,40,600,5,'N',' 片')}
      ${F_('单片有效面积','simArea',P.area,100,800,5,'area',' cm²')}
      ${F_('单片厚度','simCellThk',P.cellThk,0.9,3.5,0.05,'cellThk',' mm')}
      ${F_('双极板厚度','simBppThk',P.bppThk,0.30,2.00,0.05,'bppThk',' mm')}
      ${F_('冷却液温差','simDT',P.dT,3,12,0.5,'dT',' K')}
    </div>
    <div class="sec-title" style="margin-top:4px">操作条件参数</div>
    <div class="grid g2">
      ${F_('电堆温度','simT',P.T,40,100,1,'T',' ℃')}
      ${F_('环境温度','simTamb',P.Tamb,-40,55,1,'Tamb',' ℃')}
      ${F_('海拔高度','simAlt',P.altitude,0,5000,100,'altitude',' m')}
      ${F_('氢气入口压力','simPH2',P.pH2,0.08,0.35,0.01,'pH2',' MPa')}
      ${F_('空气入口压力','simPAir',P.pAir,0.08,0.35,0.01,'pAir',' MPa')}
      ${F_('氢气计量比','simLamH2',P.lambdaH2,1.0,1.5,0.01,'lambdaH2','')}
      ${F_('空气计量比','simLamAir',P.lambdaAir,1.5,4.0,0.1,'lambdaAir','')}
      ${F_('氢气纯度等级','simPur',P.purH2,3.0,5.0,0.5,'purH2','')}
      ${F_('进气相对湿度','simRh',P.rh,10,90,1,'rh',' %')}
    </div>
    <div class="sec-title" style="margin-top:4px">MEA 与电化学参数</div>
    <div class="grid g2">
      ${F_('膜厚度','simMemThk',P.memThk,6,60,1,'memThk',' μm')}
      ${F_('Pt 载量','simPt',P.ptLoading,0.08,0.50,0.01,'ptLoading',' mg/cm²')}
      ${F_('GDL 厚度','simGdl',P.gdlThk,100,400,5,'gdlThk',' μm')}
      ${F_('GDL 孔隙率','simPor',P.gdlPorosity,60,90,1,'gdlPorosity',' %')}
      ${F_('离聚物含量','simIon',P.ionomer,15,45,1,'ionomer',' wt%')}
      ${F_('MPL 厚度','simMpl',P.mplThk,10,80,5,'mplThk',' μm')}
      ${F_('单片内阻 R','simR',P.R,0.06,0.20,0.001,'R',' Ω·cm²')}
      ${F_('活化系数','simAact',P.Aact,0.006,0.014,0.0001,'Aact',' V')}
      ${F_('交换电流密度','simI0',P.i0,0.0001,0.005,0.0001,'i0',' A/cm²')}
      ${F_('浓差系数','simM',P.m,1e-5,6e-5,1e-6,'m',' V')}
      ${F_('浓差指数','simN2',P.n,2,6,0.5,'n','')}
      ${F_('界面接触电阻','simCR',P.contactR,3,20,0.5,'contactR',' mΩ·cm²')}
    </div>
    <div class="sec-title" style="margin-top:4px">水热与 BOP 参数</div>
    <div class="grid g2">
      ${F_('冷却液流量','simCoolFlow',P.coolFlow,10,400,5,'coolFlow',' L/min')}
      ${F_('氢侧压降','simDpH2',P.dpH2,5,50,1,'dpH2',' kPa')}
      ${F_('空气侧压降','simDpAir',P.dpAir,8,60,1,'dpAir',' kPa')}
      ${F_('空压机效率','simCmpEff',P.cmpEff,0.55,0.85,0.01,'cmpEff','')}
      ${F_('空压机压比','simCmpRatio',P.cmpRatio,1.5,3.5,0.1,'cmpRatio','')}
      ${F_('DC-DC 效率','simDcdc',P.dcdcEff,0.94,0.99,0.005,'dcdcEff','')}
    </div>
    <div class="field">
      <label>计量比模式</label>
      <select data-bind="stoichMode">
        <option value="auto" ${P.stoichMode === 'auto' ? 'selected' : ''}>自动（按电堆功率自适应）</option>
        <option value="manual" ${P.stoichMode === 'manual' ? 'selected' : ''}>手动（使用上方设定值）</option>
      </select>
    </div>
    <div class="grid g2">
      <button class="btn primary" data-action="sim-run">▶ 运行电堆仿真</button>
      <button class="btn ghost" data-action="sim-reset">↻ 重置参数</button>
    </div>
  </div>

  <div id="simResult"></div>`;
}

function afterSim(){
  const map = {
    stackPower:['simP', v => v + ' kW'], N:['simN', v => v + ' 片'],
    area:['simArea', v => v + ' cm²'], cellThk:['simCellThk', v => parseFloat(v).toFixed(2) + ' mm'],
    bppThk:['simBppThk', v => parseFloat(v).toFixed(2) + ' mm'], dT:['simDT', v => v + ' K'],
    T:['simT', v => v + ' ℃'], Tamb:['simTamb', v => v + ' ℃'], altitude:['simAlt', v => v + ' m'],
    pH2:['simPH2', v => parseFloat(v).toFixed(2) + ' MPa'], pAir:['simPAir', v => parseFloat(v).toFixed(2) + ' MPa'],
    lambdaH2:['simLamH2', v => parseFloat(v).toFixed(2)], lambdaAir:['simLamAir', v => parseFloat(v).toFixed(1)],
    purH2:['simPur', v => parseFloat(v).toFixed(1)], rh:['simRh', v => v + ' %'],
    memThk:['simMemThk', v => v + ' μm'], ptLoading:['simPt', v => parseFloat(v).toFixed(2) + ' mg/cm²'],
    gdlThk:['simGdl', v => v + ' μm'], gdlPorosity:['simPor', v => v + ' %'],
    ionomer:['simIon', v => v + ' wt%'], mplThk:['simMpl', v => v + ' μm'],
    R:['simR', v => parseFloat(v).toFixed(3) + ' Ω·cm²'], Aact:['simAact', v => parseFloat(v).toFixed(4) + ' V'],
    i0:['simI0', v => parseFloat(v).toFixed(4) + ' A/cm²'], m:['simM', v => parseFloat(v).toExponential(2) + ' V'],
    n:['simN2', v => v], contactR:['simCR', v => parseFloat(v).toFixed(1) + ' mΩ·cm²'],
    coolFlow:['simCoolFlow', v => v + ' L/min'], dpH2:['simDpH2', v => v + ' kPa'],
    dpAir:['simDpAir', v => v + ' kPa'], cmpEff:['simCmpEff', v => parseFloat(v).toFixed(2)],
    cmpRatio:['simCmpRatio', v => parseFloat(v).toFixed(1)], dcdcEff:['simDcdc', v => parseFloat(v).toFixed(3)],
  };
  $$('.sim-slider').forEach(s => {
    s.addEventListener('input', e => {
      const key = e.target.dataset.bind;
      state.params[key] = parseFloat(e.target.value);
      const m = map[key];
      if(m){
        const el = $('#' + m[0] + 'Val');
        if(el) el.textContent = m[1](e.target.value);
      }
    });
  });
  $$('select[data-bind]').forEach(s => {
    s.addEventListener('change', e => {
      state.params[e.target.dataset.bind] = e.target.value;
    });
  });
}

function runSim(){
  const r = solveSystem();
  const P = state.params;
  const T_K = P.T + 273.15;
  const res = $('#simResult');
  let html = '';

  if(state.simMode === 'steady'){
    const data = [];
    for(let i = 0.05; i <= 3.0; i += 0.05){
      const v = vcell(i, T_K, { N:P.N, area:P.area, pH2:P.pH2, pAir:P.pAir, R:P.R, Aact:P.Aact, i0:P.i0, m:P.m, n:P.n });
      if(v < 0.15) break;
      data.push([i, v]);
    }
    const d2 = data.filter(d => d[0] <= 2.5).map(d => [d[0], d[1]*d[0]*1000]);
    const maxPD = Math.max(...d2.map(d => d[1]), 1);
    const effData = data.filter(d => d[0] <= 2.5).map(d => [d[0], d[1]/E_IDEAL*100]);

    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi b"><div class="kpi-k">电堆效率</div><div class="kpi-v">${fmt(r.etaStack*100,1)}<small>%</small></div></div>
        <div class="kpi g"><div class="kpi-k">电堆净效率</div><div class="kpi-v">${fmt(r.etaSys*100,1)}<small>%</small></div></div>
        <div class="kpi c"><div class="kpi-k">电堆氢耗</div><div class="kpi-v">${fmt(r.mH2,2)}<small>kg/h</small></div></div>
        <div class="kpi o"><div class="kpi-k">电堆产热</div><div class="kpi-v">${fmt(r.Q,1)}<small>kW</small></div></div>
        <div class="kpi p"><div class="kpi-k">体积功率密度</div><div class="kpi-v">${fmt(r.vpd,2)}<small>kW/L</small></div></div>
        <div class="kpi r"><div class="kpi-k">比功率</div><div class="kpi-v">${fmt(r.sp,2)}<small>kW/kg</small></div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#0a84ff',n:'极化曲线 V–i'}])}</div>
      <div class="chart-wrap"><canvas id="cv2"></canvas>${legend([{c:'#00d48a',n:'功率密度 mW/cm²'}])}</div>
      <div class="chart-wrap"><canvas id="cv3"></canvas>${legend([{c:'#a78bfa',n:'电堆效率 %'}])}</div>
      <div class="card" style="margin-top:12px">
        <div class="card-h"><h3>电堆损耗拆解</h3><span class="tag">单位 kW</span></div>
        <div class="chart-wrap" style="margin-top:0"><canvas id="cv4"></canvas>${legend([{c:'#ff9f0a',n:'活化损耗'},{c:'#a78bfa',n:'欧姆损耗'},{c:'#ff453a',n:'浓差损耗'}])}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px">
          <div class="kpi o"><div class="kpi-k">活化损耗</div><div class="kpi-v" style="font-size:16px">${fmt(r.loss.act,2)}<small>kW</small></div></div>
          <div class="kpi p"><div class="kpi-k">欧姆损耗</div><div class="kpi-v" style="font-size:16px">${fmt(r.loss.ohm,2)}<small>kW</small></div></div>
          <div class="kpi r"><div class="kpi-k">浓差损耗</div><div class="kpi-v" style="font-size:16px">${fmt(r.loss.con,2)}<small>kW</small></div></div>
        </div>
      </div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => {
      plot($('#cv1'), { xMin:0, xMax:3.0, yMin:0, yMax:1.1, xLabel:'电流密度 (A/cm²)', yLabel:'单片电压 (V)',
        series:[{ data, color:'#0a84ff', fill:'rgba(10,132,255,.18)' }] });
      plot($('#cv2'), { xMin:0, xMax:2.5, yMin:0, yMax:maxPD*1.1, xLabel:'电流密度 (A/cm²)', yLabel:'功率密度 (mW/cm²)',
        series:[{ data:d2, color:'#00d48a', fill:'rgba(0,212,138,.14)' }] });
      plot($('#cv3'), { xMin:0, xMax:2.5, yMin:0, yMax:70, xLabel:'电流密度 (A/cm²)', yLabel:'效率 (%)',
        series:[{ data:effData, color:'#a78bfa', fill:'rgba(167,139,250,.14)' }] });
      plotBar($('#cv4'), { labels:['活化','欧姆','浓差'], values:[r.loss.act, r.loss.ohm, r.loss.con],
        colors:['#ff9f0a','#a78bfa','#ff453a'], yLabel:'损耗 (kW)' });
    });
  }
  else if(state.simMode === 'dynamic'){
    const dur = 60, pts = [], ptsI = [], ptsV = [];
    const Pmax = P.stackPower;
    for(let t = 0; t <= dur; t += 0.2){
      let target = 0;
      if(t < 10) target = 0;
      else if(t < 22) target = Pmax * 0.5;
      else if(t < 42) target = Pmax;
      else target = Pmax * 1.05;
      const pw = target * (1 - Math.exp(-t / 2.0));
      pts.push([t, pw]);
      ptsI.push([t, pw * 1000 / Math.max(r.Vstack, 1)]);
      ptsV.push([t, r.Vstack * (0.94 + 0.06 * (1 - Math.exp(-t / 3)))]);
    }
    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi b"><div class="kpi-k">响应时间</div><div class="kpi-v">2.0<small>s</small></div></div>
        <div class="kpi g"><div class="kpi-k">动态效率</div><div class="kpi-v">${fmt(r.etaStack*100-1.8,1)}<small>%</small></div></div>
        <div class="kpi o"><div class="kpi-k">峰值功率</div><div class="kpi-v">${fmt(Pmax*1.05,0)}<small>kW</small></div></div>
        <div class="kpi c"><div class="kpi-k">氢耗波动</div><div class="kpi-v">±3.5<small>%</small></div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#0a84ff',n:'电堆功率响应 (kW)'},{c:'#ff9f0a',n:'电堆电流 (A/10)'}])}</div>
      <div class="chart-wrap"><canvas id="cv2"></canvas>${legend([{c:'#00d48a',n:'电堆电压 (V)'}])}</div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => {
      plot($('#cv1'), { xMin:0, xMax:60, yMin:0, yMax:Pmax*1.2, xLabel:'时间 (s)', yLabel:'kW / A×10',
        series:[{ data:pts, color:'#0a84ff', fill:'rgba(10,132,255,.18)' },
                { data:ptsI.map(d=>[d[0], d[1]/10]), color:'#ff9f0a' }] });
      plot($('#cv2'), { xMin:0, xMax:60, yMin:0, yMax:r.Vstack*1.15, xLabel:'时间 (s)', yLabel:'电堆电压 (V)',
        series:[{ data:ptsV, color:'#00d48a', fill:'rgba(0,212,138,.14)' }] });
    });
  }
  else if(state.simMode === 'cold'){
    const pts = [], pts2 = [], pts3 = [];
    for(let t = 0; t <= 100; t += 1){
      const w = 1 - Math.exp(-t / 25);
      pts.push([t, -35 + 120 * w]);
      pts2.push([t, (0.15 + 0.72 * (1 - Math.exp(-t / 18))) * 120]);
      pts3.push([t, P.stackPower * 0.6 * (1 - Math.exp(-t / 20))]);
    }
    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi c"><div class="kpi-k">启动时间</div><div class="kpi-v">30<small>s</small></div></div>
        <div class="kpi g"><div class="kpi-k">最低启动温度</div><div class="kpi-v">-35<small>℃</small></div></div>
        <div class="kpi o"><div class="kpi-k">启动能耗</div><div class="kpi-v">1.5<small>kWh</small></div></div>
        <div class="kpi b"><div class="kpi-k">国标判定</div><div class="kpi-v" style="font-size:15px;color:var(--green)">优秀 ✓</div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#22d3ee',n:'堆温 (℃)'},{c:'#00d48a',n:'单片电压 (V ×120)'}])}</div>
      <div class="chart-wrap"><canvas id="cv2"></canvas>${legend([{c:'#ff9f0a',n:'输出功率 (kW)'}])}</div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => {
      plot($('#cv1'), { xMin:0, xMax:100, yMin:-40, yMax:95, xLabel:'时间 (s)', yLabel:'温度 (℃) / 电压×120',
        series:[{ data:pts, color:'#22d3ee', fill:'rgba(34,211,238,.16)' }, { data:pts2, color:'#00d48a' }] });
      plot($('#cv2'), { xMin:0, xMax:100, yMin:0, yMax:P.stackPower*0.7, xLabel:'时间 (s)', yLabel:'功率 (kW)',
        series:[{ data:pts3, color:'#ff9f0a', fill:'rgba(255,159,10,.14)' }] });
    });
  }
  else if(state.simMode === 'durab'){
    const pts = [], degPts = [], vPts = [];
    for(let h = 0; h <= 15000; h += 100){
      const soh = 100 - 3.5 * Math.sqrt(h / 1000) - 0.0012 * h;
      pts.push([h, Math.max(soh, 60)]);
      degPts.push([h, 1.2 + 0.0003 * h]);
      vPts.push([h, (0.71 * Math.max(soh, 60) / 100) * 1000]);
    }
    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi g"><div class="kpi-k">电堆 SOH (15000h)</div><div class="kpi-v">${fmt(pts[pts.length-1][1],1)}<small>%</small></div></div>
        <div class="kpi o"><div class="kpi-k">衰减速率</div><div class="kpi-v">1.5<small>μV/h·cell</small></div></div>
        <div class="kpi b"><div class="kpi-k">电堆剩余寿命</div><div class="kpi-v">12000<small>h</small></div></div>
        <div class="kpi p"><div class="kpi-k">启停衰减</div><div class="kpi-v">10<small>μV/次</small></div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#00d48a',n:'电堆 SOH (%)'}])}</div>
      <div class="chart-wrap"><canvas id="cv2"></canvas>${legend([{c:'#ff9f0a',n:'衰减速率 (μV/h·cell)'},{c:'#22d3ee',n:'单片电压 (mV)'}])}</div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => {
      plot($('#cv1'), { xMin:0, xMax:15000, yMin:60, yMax:100, xLabel:'电堆累计运行时间 (h)', yLabel:'SOH (%)',
        series:[{ data:pts, color:'#00d48a', fill:'rgba(0,212,138,.16)' }] });
      plot($('#cv2'), { xMin:0, xMax:15000, yMin:0, yMax:800, xLabel:'电堆累计运行时间 (h)', yLabel:'μV/h·cell / mV',
        series:[{ data:degPts, color:'#ff9f0a' }, { data:vPts, color:'#22d3ee' }] });
    });
  }
  else if(state.simMode === 'bench'){
    const sim = [], mea = [], resid = [];
    for(let i = 0.1; i <= 2.5; i += 0.1){
      const v = vcell(i, T_K, { N:P.N, area:P.area, pH2:P.pH2, pAir:P.pAir, R:P.R, Aact:P.Aact, i0:P.i0, m:P.m, n:P.n });
      const m = v * (0.99 + (Math.sin(i*7) * 0.006));
      sim.push([i, v]); mea.push([i, m]); resid.push([i, (m - v) * 1000]);
    }
    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi b"><div class="kpi-k">RMSE</div><div class="kpi-v">5.2<small>mV</small></div></div>
        <div class="kpi g"><div class="kpi-k">最大偏差</div><div class="kpi-v">10.5<small>mV</small></div></div>
        <div class="kpi o"><div class="kpi-k">修正系数 k</div><div class="kpi-v">0.993</div></div>
        <div class="kpi c"><div class="kpi-k">拟合优度 R²</div><div class="kpi-v">0.9985</div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#0a84ff',n:'仿真值'},{c:'#ff9f0a',n:'实测值'}])}</div>
      <div class="chart-wrap"><canvas id="cv2"></canvas>${legend([{c:'#ff453a',n:'残差 (mV)'}])}</div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => {
      plot($('#cv1'), { xMin:0, xMax:2.5, yMin:0.4, yMax:1.0, xLabel:'电流密度 (A/cm²)', yLabel:'单片电压 (V)',
        series:[{ data:sim, color:'#0a84ff' }, { data:mea, color:'#ff9f0a', dots:true }] });
      plot($('#cv2'), { xMin:0, xMax:2.5, yMin:-15, yMax:15, xLabel:'电流密度 (A/cm²)', yLabel:'残差 (mV)',
        series:[{ data:resid, color:'#ff453a' }] });
    });
  }
  else if(state.simMode === 'eis'){
    const zRe = [], zIm = [], bodeF = [], bodeM = [];
    for(let lf = -1; lf <= 4; lf += 0.15){
      const freq = Math.pow(10, lf);
      const R_ohm = 0.095;
      const R_ct = 0.05 / (1 + Math.pow(2*Math.PI*freq*0.001, 0.8));
      const R_mt = 0.03 / (1 + Math.pow(2*Math.PI*freq*0.0001, 0.6));
      zRe.push(R_ohm + R_ct + R_mt);
      zIm.push(-(0.01 + 0.05/Math.sqrt(freq+1)));
      bodeF.push([lf, Math.sqrt(Math.pow(R_ct+R_mt,2) + Math.pow(0.01 + 0.05/Math.sqrt(freq+1),2)) * 1000]);
      bodeM.push([lf, Math.atan2(0.01 + 0.05/Math.sqrt(freq+1), R_ct+R_mt) * 180 / Math.PI]);
    }
    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi b"><div class="kpi-k">欧姆阻抗 R_ohm</div><div class="kpi-v">${fmt(zRe[0],3)}<small>Ω·cm²</small></div></div>
        <div class="kpi g"><div class="kpi-k">电荷转移 R_ct</div><div class="kpi-v">0.050<small>Ω·cm²</small></div></div>
        <div class="kpi o"><div class="kpi-k">传质阻抗 R_mt</div><div class="kpi-v">0.030<small>Ω·cm²</small></div></div>
        <div class="kpi c"><div class="kpi-k">总阻抗</div><div class="kpi-v">0.175<small>Ω·cm²</small></div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#a78bfa',n:'Nyquist 图 –Im vs Re'}])}</div>
      <div class="chart-wrap"><canvas id="cv2"></canvas>${legend([{c:'#0a84ff',n:'|Z| (mΩ·cm²)'},{c:'#00d48a',n:'相位角 (°)'}])}</div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => {
      plot($('#cv1'), { xMin:0.08, xMax:0.22, yMin:0, yMax:0.08, xLabel:'Re (Ω·cm²)', yLabel:'–Im (Ω·cm²)',
        series:[{ data: zRe.map((x,i)=>[x, -zIm[i]]), color:'#a78bfa', dots:true }] });
      plot($('#cv2'), { xMin:-1, xMax:4, yMin:0, yMax:120, xLabel:'lg f (Hz)', yLabel:'|Z| mΩ / 相位 °',
        series:[{ data:bodeF, color:'#0a84ff' }, { data:bodeM, color:'#00d48a' }] });
    });
  }
  else if(state.simMode === 'cv'){
    const pts = [];
    for(let v = 0.05; v <= 1.2; v += 0.01){
      let i;
      if(v > 0.05 && v < 0.4) i = -0.5 + Math.sin(v*40)*0.05;
      else if(v > 0.4 && v < 0.8) i = 0.1;
      else i = 0.02 + 0.3 * Math.exp(-(v-0.8)*3);
      pts.push([v, i]);
    }
    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi b"><div class="kpi-k">ECSA</div><div class="kpi-v">68.5<small>m²/g Pt</small></div></div>
        <div class="kpi g"><div class="kpi-k">氢脱附峰</div><div class="kpi-v">0.15<small>mC/cm²</small></div></div>
        <div class="kpi o"><div class="kpi-k">Pt 氧化峰</div><div class="kpi-v">0.85<small>V</small></div></div>
        <div class="kpi c"><div class="kpi-k">Pt 还原峰</div><div class="kpi-v">0.72<small>V</small></div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#22d3ee',n:'CV 循环伏安曲线'}])}</div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => plot($('#cv1'), {
      xMin:0, xMax:1.2, yMin:-0.6, yMax:0.5, xLabel:'电压 (V vs RHE)', yLabel:'电流 (mA/cm²)',
      series:[{ data:pts, color:'#22d3ee' }] }));
  }
  else if(state.simMode === 'water'){
    const cellT = [], water = [], dp = [];
    for(let z = 0; z <= 100; z += 2){
      const t = P.T + 6 * Math.sin(z / 100 * Math.PI) - 2;
      cellT.push([z, t]);
      water.push([z, 0.35 + 0.4 * (1 - Math.exp(-z/30))]);
      dp.push([z, P.dpH2 * (1 + z/100 * 0.8)]);
    }
    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi o"><div class="kpi-k">最高单片温度</div><div class="kpi-v">${fmt(Math.max(...cellT.map(d=>d[1])),1)}<small>℃</small></div></div>
        <div class="kpi c"><div class="kpi-k">出口膜含水量 λ</div><div class="kpi-v">${fmt(water[water.length-1][1]*22,1)}<small>—</small></div></div>
        <div class="kpi b"><div class="kpi-k">出口压降</div><div class="kpi-v">${fmt(dp[dp.length-1][1],1)}<small>kPa</small></div></div>
        <div class="kpi g"><div class="kpi-k">水管理判定</div><div class="kpi-v" style="font-size:15px;color:var(--green)">正常 ✓</div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#ff9f0a',n:'沿流道温度分布 (℃)'},{c:'#22d3ee',n:'膜含水量 λ×20'}])}</div>
      <div class="chart-wrap"><canvas id="cv2"></canvas>${legend([{c:'#a78bfa',n:'沿流道压降 (kPa)'}])}</div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => {
      plot($('#cv1'), { xMin:0, xMax:100, yMin:0, yMax:100, xLabel:'流道位置 (%)', yLabel:'温度 (℃) / λ×20',
        series:[{ data:cellT, color:'#ff9f0a', fill:'rgba(255,159,10,.14)' },
                { data:water.map(d=>[d[0], d[1]*20]), color:'#22d3ee' }] });
      plot($('#cv2'), { xMin:0, xMax:100, yMin:0, yMax:P.dpH2*2.2, xLabel:'流道位置 (%)', yLabel:'压降 (kPa)',
        series:[{ data:dp, color:'#a78bfa', fill:'rgba(167,139,250,.14)' }] });
    });
  }
  else {
    const series = [40, 60, 80, 95].map((tempC, idx) => {
      const d = [];
      const T2 = tempC + 273.15;
      for(let i = 0.05; i <= 3.0; i += 0.07){
        const v = vcell(i, T2, { N:P.N, area:P.area, pH2:P.pH2, pAir:P.pAir, R:P.R, Aact:P.Aact, i0:P.i0, m:P.m, n:P.n });
        if(v < 0.12) break;
        d.push([i, v]);
      }
      return { data:d, color:['#22d3ee','#00d48a','#0a84ff','#ff9f0a'][idx] };
    });
    html = `
      <div class="grid g2" style="margin-bottom:12px">
        <div class="kpi o"><div class="kpi-k">极限电流密度</div><div class="kpi-v">2.85<small>A/cm²</small></div></div>
        <div class="kpi g"><div class="kpi-k">安全边界裕度</div><div class="kpi-v">22.5<small>%</small></div></div>
        <div class="kpi c"><div class="kpi-k">最低单片电压</div><div class="kpi-v">0.58<small>V</small></div></div>
        <div class="kpi p"><div class="kpi-k">干湿膜判定</div><div class="kpi-v" style="font-size:15px;color:var(--green)">正常 ✓</div></div>
      </div>
      <div class="chart-wrap"><canvas id="cv1" class="tall"></canvas>${legend([{c:'#22d3ee',n:'40℃'},{c:'#00d48a',n:'60℃'},{c:'#0a84ff',n:'80℃'},{c:'#ff9f0a',n:'95℃'}])}</div>`;
    res.innerHTML = html;
    requestAnimationFrame(() => plot($('#cv1'), {
      xMin:0, xMax:3.0, yMin:0, yMax:1.1, xLabel:'电流密度 (A/cm²)', yLabel:'单片电压 (V)', series }));
  }
  toast('电堆仿真完成 · ' + SIM_MODES.find(m => m.id === state.simMode).t);
}

/* ================= 计算器 ================= */
const CALCS = [
  { id:'elec', n:'电堆电气' }, { id:'h2', n:'电堆氢耗' },
  { id:'air', n:'空气配比' }, { id:'eta', n:'电堆效率' },
  { id:'heat', n:'电堆热管理' }, { id:'purge', n:'阳极吹扫' },
  { id:'cal', n:'台架标定' }, { id:'unit', n:'单位换算' },
  { id:'stack', n:'电堆结构' }, { id:'mea', n:'MEA 计算' },
  { id:'cost', n:'成本估算' }, { id:'life', n:'寿命预测' },
];

function viewCalc(){
  return `
  <div class="tabs">
    ${CALCS.map(c => `<div class="tab ${c.id === state.calcTab ? 'active' : ''}" data-action="calc-tab" data-id="${c.id}">${c.n}</div>`).join('')}
  </div>
  <div id="calcPanel">${calcPanel()}</div>`;
}

function calcPanel(){
  const t = state.calcTab;
  const P = state.params;
  const F_ = (label, id, val, step = 'any', unit = '') => `
    <div class="field"><label>${label}${unit ? ' <b>'+unit+'</b>' : ''}</label>
      <input type="number" id="${id}" value="${val}" step="${step}">
    </div>`;

  const forms = {
    elec:
      F_('电堆功率 (kW)', 'c_p', P.stackPower) +
      F_('电堆片数 N', 'c_n', P.N) +
      F_('单片有效面积 (cm²)', 'c_a', P.area) +
      F_('单片内阻 R (Ω·cm²)', 'c_r', P.R, 0.001) +
      F_('活化系数 Aact (V)', 'c_aa', P.Aact, 0.0001) +
      F_('交换电流密度 i0 (A/cm²)', 'c_i0', P.i0, 0.0001) +
      F_('浓差系数 m (V)', 'c_m', P.m, 1e-6) +
      F_('浓差指数 n', 'c_nn', P.n, 0.5) +
      F_('工作温度 (℃)', 'c_T', P.T) +
      F_('氢气绝对压力 (MPa)', 'c_ph', P.pH2, 0.01) +
      F_('空气绝对压力 (MPa)', 'c_pa', P.pAir, 0.01) +
      F_('界面接触电阻 (mΩ·cm²)', 'c_cr', P.contactR, 0.5) +
      F_('双极板单板厚度 (mm)', 'c_bt', P.bppThk, 0.05) +
      `<button class="btn primary block" data-action="calc-run" data-id="elec">计算</button>`,
    h2:
      F_('电堆功率 (kW)', 'c_p', P.stackPower) +
      F_('电堆效率 (%)', 'c_e', 58) +
      F_('氢气计量比 λ', 'c_l', P.lambdaH2, 0.01) +
      F_('氢气纯度 (%)', 'c_pur', 99.999, 0.001) +
      F_('吹扫周期 (s)', 'c_pp', P.purgePeriod) +
      F_('吹扫时长 (s)', 'c_pd', P.purgeDur, 0.1) +
      F_('运行小时/日', 'c_h', 20) +
      F_('氢气单价 (元/kg)', 'c_price', 30, 1) +
      `<button class="btn primary block" data-action="calc-run" data-id="h2">计算</button>`,
    air:
      F_('氢气质量流量 (kg/h)', 'c_m', 3.5, 0.1) +
      F_('空气计量比 λ', 'c_l', P.lambdaAir, 0.1) +
      F_('空压机等熵效率', 'c_e', P.cmpEff, 0.01) +
      F_('空压机压比', 'c_pr', P.cmpRatio, 0.1) +
      F_('环境温度 (℃)', 'c_T', P.Tamb) +
      F_('海拔高度 (m)', 'c_alt', P.altitude, 100) +
      F_('空气侧压降 (kPa)', 'c_dp', P.dpAir) +
      `<button class="btn primary block" data-action="calc-run" data-id="air">计算</button>`,
    eta:
      F_('电堆功率 (kW)', 'c_ps', P.stackPower) +
      F_('空压机功耗 (kW)', 'c_pc', 20, 0.5) +
      F_('冷却水泵功耗 (kW)', 'c_pp', 3, 0.5) +
      F_('氢循环功耗 (kW)', 'c_pr', 1.5, 0.5) +
      F_('DC-DC 损耗 (kW)', 'c_pd', 2.5, 0.5) +
      F_('单片电压 (V)', 'c_v', 0.71, 0.001) +
      F_('DC-DC 效率', 'c_de', P.dcdcEff, 0.005) +
      `<button class="btn primary block" data-action="calc-run" data-id="eta">计算</button>`,
    heat:
      F_('电堆功率 (kW)', 'c_p', P.stackPower) +
      F_('电堆效率 (%)', 'c_e', 58) +
      F_('冷却液温差 ΔT (K)', 'c_dt', P.dT, 0.5) +
      F_('冷却液比热 cp kJ/(kg·K)', 'c_cp', 3.55, 0.01) +
      F_('冷却液密度 ρ kg/L', 'c_rho', 1.05, 0.01) +
      F_('环境温度 (℃)', 'c_T', P.Tamb) +
      F_('散热器裕度 (%)', 'c_rm', P.radMargin) +
      `<button class="btn primary block" data-action="calc-run" data-id="heat">计算</button>`,
    purge:
      F_('电堆功率 (kW)', 'c_p', P.stackPower) +
      F_('氢侧压降 (kPa)', 'c_dp', P.dpH2) +
      F_('阳极容积 (L)', 'c_v', 1.2, 0.1) +
      F_('阳极压力 (MPa)', 'c_ph', P.pH2, 0.01) +
      F_('吹扫周期 (s)', 'c_pp', P.purgePeriod) +
      F_('吹扫时长 (s)', 'c_pd', P.purgeDur, 0.1) +
      `<button class="btn primary block" data-action="calc-run" data-id="purge">计算</button>`,
    cal:
      F_('设定值', 'c_set', 100) +
      F_('实测值', 'c_mea', 99.2) +
      F_('传感器量程', 'c_range', 200) +
      F_('环境温度 (℃)', 'c_T', 25) +
      F_('环境湿度 (%)', 'c_rh', 45) +
      F_('重复测量次数', 'c_n', 5) +
      `<button class="btn primary block" data-action="calc-run" data-id="cal">计算</button>`,
    unit:
      `<div class="field"><label>数值</label><input type="number" id="u_v" value="1"></div>
      <div class="field"><label>源单位</label>
        <select id="u_from">
          <option value="kg">kg (氢气质量)</option>
          <option value="Nm3">Nm³ (标方)</option>
          <option value="kWh">kWh (能量)</option>
          <option value="MJ">MJ</option>
          <option value="L">L (液氢)</option>
          <option value="gal">gal (液氢加仑)</option>
        </select>
      </div>
      <div class="field"><label>电堆效率 (%)</label><input type="number" id="u_eff" value="58" step="0.1"></div>
      <button class="btn primary block" data-action="calc-run" data-id="unit">换算</button>`,
    stack:
      F_('电堆功率 (kW)', 'c_p', P.stackPower) +
      F_('单片电压 (V)', 'c_v', 0.71, 0.001) +
      F_('电流密度 (A/cm²)', 'c_i', 1.5, 0.01) +
      F_('单片厚度 (mm)', 'c_t', P.cellThk, 0.05) +
      F_('有效面积 (cm²)', 'c_a', P.area) +
      F_('双极板厚度 (mm)', 'c_bt', P.bppThk, 0.05) +
      F_('端板与封装系数', 'c_k', 1.5, 0.1) +
      `<button class="btn primary block" data-action="calc-run" data-id="stack">计算</button>`,
    mea:
      F_('电堆功率 (kW)', 'c_p', P.stackPower) +
      F_('Pt 载量 (mg/cm²)', 'c_pt', P.ptLoading, 0.01) +
      F_('有效面积 (cm²)', 'c_a', P.area) +
      F_('膜厚度 (μm)', 'c_m', P.memThk) +
      F_('GDL 厚度 (μm)', 'c_g', P.gdlThk, 5) +
      F_('离聚物含量 (wt%)', 'c_ion', P.ionomer) +
      `<button class="btn primary block" data-action="calc-run" data-id="mea">计算</button>`,
    cost:
      F_('电堆功率 (kW)', 'c_p', P.stackPower) +
      F_('Pt 载量 (mg/cm²)', 'c_pt', P.ptLoading, 0.01) +
      F_('Pt 价格 (元/g)', 'c_ptp', 280, 1) +
      F_('质子膜单价 (元/m²)', 'c_mem', 1200, 10) +
      F_('双极板单价 (元/片)', 'c_bpp', 1200, 10) +
      F_('GDL 单价 (元/片)', 'c_gdl', 180, 5) +
      F_('其他成本 (元)', 'c_oth', 3000, 100) +
      F_('年产量 (台)', 'c_qty', 1000, 100) +
      `<button class="btn primary block" data-action="calc-run" data-id="cost">计算</button>`,
    life:
      F_('当前 SOH (%)', 'c_soh', 98) +
      F_('衰减速率 (μV/h·cell)', 'c_deg', 1.5, 0.1) +
      F_('单片电压 (V)', 'c_v', 0.71, 0.001) +
      F_('已启停次数', 'c_st', 386) +
      F_('启停衰减 (μV/次)', 'c_std', 10, 1) +
      F_('目标 SOH (%)', 'c_target', 80) +
      `<button class="btn primary block" data-action="calc-run" data-id="life">计算</button>`,
  };
  return `<div class="card">
    <div class="card-h"><h3>${CALCS.find(c => c.id === t).n}</h3><span class="tag">电堆级修正 · 条件可调</span></div>
    ${forms[t]}
    <div id="calcRes"></div>
  </div>`;
}

function runCalc(type){
  const g = id => parseFloat(($('#' + id) || {}).value) || 0;
  const out = $('#calcRes');
  if(!out) return;
  let html = '';
  const row = (k, v, u) => `<div class="res-row"><span class="res-k">${k}</span><span class="res-v">${v}<small>${u || ''}</small></span></div>`;

  if(type === 'elec'){
    const PkW = g('c_p'), N = g('c_n'), A = g('c_a'), R = g('c_r') || 0.095;
    const Aact = g('c_aa') || 0.0085, i0 = g('c_i0') || 0.0018;
    const mm = g('c_m') || 2.2e-5, nn = g('c_nn') || 4;
    const T = g('c_T') || 82, pH2 = g('c_ph') || 0.19, pAir = g('c_pa') || 0.20, cr = g('c_cr') || 5;
    const p = { N, area:A, T_K:T+273.15, pH2, pAir, R, Aact, i0, m:mm, n:nn };
    const i = solveCurrentDensity(PkW, p);
    const V = vcell(i, p.T_K, p);
    html = `<div class="res-box">
      ${row('电流密度 i', fmt(i, 3), 'A/cm²')}
      ${row('单片电压 V', fmt(V, 4), 'V')}
      ${row('电堆电流 I', fmt(i * A, 1), 'A')}
      ${row('电堆电压 V_stack', fmt(V * N, 1), 'V')}
      ${row('理论电压 E', fmt(nernstPotential(p.T_K, p), 4), 'V')}
      ${row('活化过电位', fmt(Aact*Math.log(i/i0), 4), 'V/cell')}
      ${row('欧姆过电位', fmt(R*i, 4), 'V/cell')}
      ${row('浓差过电位', fmt(mm*Math.exp(nn*i), 4), 'V/cell')}
      ${row('界面接触电阻', fmt(cr, 1), 'mΩ·cm²')}
      ${row('电堆效率', fmt(V/E_IDEAL*100, 2), '%')}
      ${row('功率校验', fmt(N * V * i * A / 1000, 2), 'kW')}
    </div>`;
  }
  else if(type === 'h2'){
    const PkW = g('c_p'), e = g('c_e') / 100, lam = g('c_l') || 1.05;
    const pur = g('c_pur') || 99.999, pp = g('c_pp') || 15, pd = g('c_pd') || 0.9;
    const h = g('c_h') || 20, price = g('c_price') || 30;
    const m = PkW / (e * LHV_H2) * lam;
    const purgeLoss = m * (pd / pp) * 0.35;
    const purityLoss = m * (1 - pur / 100) * 2;
    const total = m + purgeLoss + purityLoss;
    html = `<div class="res-box">
      ${row('理论氢气流量', fmt(PkW / (e * LHV_H2), 3), 'kg/h')}
      ${row('计量比后流量', fmt(m, 3), 'kg/h')}
      ${row('吹扫损失', fmt(purgeLoss, 4), 'kg/h')}
      ${row('纯度损失', fmt(purityLoss, 4), 'kg/h')}
      ${row('总氢气消耗', fmt(total, 3), 'kg/h')}
      ${row('氢气体积流量 (标况)', fmt(total / 0.0899, 2), 'Nm³/h')}
      ${row('电堆单位氢耗', fmt(total * 1000 / PkW, 2), 'g/kWh')}
      ${row('日耗氢量', fmt(total * h, 1), 'kg')}
      ${row('年耗氢量 (6000h)', fmt(total * 6000, 0), 'kg')}
      ${row('每公斤氢产电', fmt(LHV_H2 * e, 2), 'kWh/kg')}
      ${row('氢费', fmt(total * price, 1), '元/h')}
      ${row('年氢费', fmt(total * 6000 * price / 10000, 1), '万元')}
    </div>`;
  }
  else if(type === 'air'){
    const m = g('c_m'), l = g('c_l'), ec = g('c_e') || 0.72;
    const pr = g('c_pr') || 2.5, T = g('c_T') || 25, alt = g('c_alt') || 0, dp = g('c_dp') || 22;
    const pAtm = 0.1013 * Math.pow(Math.max(1 - 2.25577e-5 * alt, 0.05), 5.2559);
    const air = m * 34.3 * l;
    const o2 = air * 0.233;
    const prEff = pr * (0.75 + 0.25 * pAtm / 0.1013);
    const pcmp = (air / 3600) * 1.005 * (273 + T) * (Math.pow(prEff, 0.2857) - 1) / ec;
    const pdp = (air / 3600) / 1.2 * dp;
    html = `<div class="res-box">
      ${row('理论空气量', fmt(m * 34.3, 2), 'kg/h')}
      ${row('实际空气流量', fmt(air, 2), 'kg/h')}
      ${row('氧气流量', fmt(o2, 2), 'kg/h')}
      ${row('氧计量比', fmt(l * 2.0, 2), '—')}
      ${row('大气压力 (海拔修正)', fmt(pAtm * 1000, 1), 'kPa')}
      ${row('有效压比', fmt(prEff, 2), '—')}
      ${row('空压机功耗', fmt(pcmp, 2), 'kW')}
      ${row('空气侧压降损失', fmt(pdp, 2), 'kW')}
      ${row('空压机 + 压降合计', fmt(pcmp + pdp, 2), 'kW')}
      ${row('空压机比功耗', fmt(pcmp / Math.max(air, 0.01) * 1000, 2), 'Wh/kg')}
    </div>`;
  }
  else if(type === 'eta'){
    const ps = g('c_ps'), pc = g('c_pc'), pp = g('c_pp'), pr = g('c_pr'), pd = g('c_pd');
    const v = g('c_v');
    const bop = pc + pp + pr + pd;
    const net = ps - bop;
    html = `<div class="res-box">
      ${row('电堆效率', fmt(v / E_IDEAL * 100, 2), '%')}
      ${row('空压机功耗', fmt(pc, 2), 'kW')}
      ${row('冷却水泵功耗', fmt(pp, 2), 'kW')}
      ${row('氢循环功耗', fmt(pr, 2), 'kW')}
      ${row('DC-DC 损耗', fmt(pd, 2), 'kW')}
      ${row('辅机总功耗', fmt(bop, 2), 'kW')}
      ${row('电堆净功率', fmt(net, 2), 'kW')}
      ${row('整机综合效率', fmt(v / E_IDEAL * net / ps * 100, 2), '%')}
      ${row('辅机占比', fmt(bop / ps * 100, 2), '%')}
      ${row('年节省电量 (6000h)', fmt(bop * 0.15 * 6000, 0), 'kWh')}
    </div>`;
  }
  else if(type === 'heat'){
    const PkW = g('c_p'), e = g('c_e') / 100, dT = g('c_dt');
    const cp = g('c_cp') || 3.55;
    const rho = g('c_rho') || 1.05;
    const rm = g('c_rm') || 20;
    const Q = PkW * (1 / e - 1);
    const mdot = Q / (cp * dT);
    const flowLpm = mdot / rho * 60;
    const massFlow = mdot * 60;
    html = `<div class="res-box">
      ${row('电堆产热功率 Q', fmt(Q, 2), 'kW')}
      ${row('冷却液体积流量', fmt(flowLpm, 2), 'L/min')}
      ${row('冷却液质量流量', fmt(massFlow, 2), 'kg/min')}
      ${row('温差校核 ΔT', dT, 'K')}
      ${row('冷却液比热 cp', cp, 'kJ/(kg·K)')}
      ${row('冷却液密度 ρ', rho, 'kg/L')}
      ${row('散热器需求 (含裕度)', fmt(Q * (1 + rm/100), 2), 'kW')}
      ${row('热流密度', fmt(Q * 1000 / (PkW * 1000 * 0.5), 3), 'W/cm²')}
      ${row('泵功估算', fmt(flowLpm * 0.25 / 60 / 0.65, 2), 'kW')}
      ${row('散热量/体积', fmt(Q / Math.max(flowLpm, 0.01) * 60, 2), 'kJ/L')}
    </div>`;
  }
  else if(type === 'purge'){
    const PkW = g('c_p'), dp = g('c_dp') || 15, vol = g('c_v') || 1.2;
    const ph = g('c_ph') || 0.19, pp = g('c_pp') || 15, pd = g('c_pd') || 0.9;
    const t = tierOf(PkW);
    const period = PkW <= 30 ? 40 : PkW <= 80 ? 25 : PkW <= 200 ? 15 : 8;
    const dur = PkW <= 30 ? 0.35 : PkW <= 80 ? 0.6 : PkW <= 200 ? 0.9 : 1.4;
    const rho = ph * 1000 / (0.08314 * 353);
    const lossPerPurge = vol * rho * 2.016 / 22.4;
    const perDay = lossPerPurge * (3600 / pp) * 20;
    html = `<div class="res-box">
      ${row('电堆功率档位', t.name + '型', '')}
      ${row('氢侧压降', dp, 'kPa')}
      ${row('推荐吹扫周期', fmt(period, 0), 's')}
      ${row('推荐吹扫时长', fmt(dur, 2), 's')}
      ${row('阳极氢气密度', fmt(rho * 1000, 1), 'g/L')}
      ${row('单次吹扫氢损', fmt(lossPerPurge, 4), 'kg')}
      ${row('日氢损 (20h)', fmt(perDay, 2), 'kg')}
      ${row('年氢损 (6000h)', fmt(perDay * 300, 1), 'kg')}
      ${row('触发方式', PkW > 200 ? 'MPC 模型预测' : '定时 + 电压降', '')}
    </div>`;
  }
  else if(type === 'cal'){
    const set = g('c_set'), mea = g('c_mea'), range = g('c_range');
    const T = g('c_T') || 25, rh = g('c_rh') || 45, n = g('c_n') || 5;
    const dev = mea - set, rel = dev / set * 100, k = set / mea, err = dev / range * 100;
    const tempComp = 1 + 0.0004 * (T - 25);
    const rhComp = 1 + 0.0002 * (rh - 45);
    html = `<div class="res-box">
      ${row('绝对偏差', fmt(dev, 3), '')}
      ${row('相对偏差', fmt(rel, 3), '%')}
      ${row('修正系数 k', fmt(k, 5), '')}
      ${row('满量程误差', fmt(err, 3), '%FS')}
      ${row('温度补偿系数', fmt(tempComp, 5), '')}
      ${row('湿度补偿系数', fmt(rhComp, 5), '')}
      ${row('综合修正后实测值', fmt(mea * k * tempComp * rhComp, 3), '')}
      ${row('测量不确定度 (n='+n+')', fmt(0.02 / Math.sqrt(n) * 100, 3), '%')}
      ${row('判定', Math.abs(rel) < 1 ? '合格 ✓' : '超差 ✗', '')}
    </div>`;
  }
  else if(type === 'unit'){
    const v = g('u_v'), from = $('#u_from').value, eff = (g('u_eff') || 58) / 100;
    const toKWh = { kg: LHV_H2 * eff, Nm3: LHV_H2 * 0.0899 * eff, kWh: 1, MJ: 1 / 3.6, L: LHV_H2 * 0.0708 * eff, gal: LHV_H2 * 0.268 * eff };
    const kwh = v * (toKWh[from] || 1), kg = kwh / (LHV_H2 * eff);
    html = `<div class="res-box">
      ${row('能量（按电堆效率 '+fmt(eff*100,1)+'%）', fmt(kwh, 4), 'kWh')}
      ${row('能量', fmt(kwh * 3.6, 4), 'MJ')}
      ${row('质量', fmt(kg, 5), 'kg')}
      ${row('标方体积', fmt(kg / 0.0899, 4), 'Nm³')}
      ${row('液氢体积', fmt(kg / 0.0708, 4), 'L')}
      ${row('液氢加仑', fmt(kg / 0.268, 4), 'gal')}
      ${row('汽油当量', fmt(kwh / 12.0, 4), 'kg')}
      ${row('柴油当量', fmt(kwh / 11.8, 4), 'kg')}
      ${row('CO₂ 减排量', fmt(kwh * 0.581, 3), 'kg')}
    </div>`;
  }
  else if(type === 'stack'){
    const PkW = g('c_p'), Vc = g('c_v') || 0.71, i = g('c_i') || 1.5;
    const thk = g('c_t') || 1.5, A = g('c_a') || 420, bt = g('c_bt') || 0.4, k = g('c_k') || 1.5;
    const N = Math.ceil(PkW * 1000 / (Vc * i * A));
    const Vstack = N * Vc;
    const I = i * A;
    const heightCm = N * thk / 10;
    const coreVolL = N * thk * A / 1000;
    const volL = coreVolL * k;
    const mass = coreVolL * 1.65 + 8;
    html = `<div class="res-box">
      ${row('推算片数 N（向上取整）', fmt(N, 0), '片')}
      ${row('电堆电压 V_stack', fmt(Vstack, 1), 'V')}
      ${row('电堆电流 I', fmt(I, 0), 'A')}
      ${row('电堆高度（堆叠）', fmt(heightCm, 1), 'cm')}
      ${row('堆芯体积', fmt(coreVolL, 2), 'L')}
      ${row('电堆体积（含封装）', fmt(volL, 2), 'L')}
      ${row('电堆质量（估算）', fmt(mass, 1), 'kg')}
      ${row('体积功率密度', fmt(PkW / volL, 2), 'kW/L')}
      ${row('比功率', fmt(PkW / mass, 2), 'kW/kg')}
      ${row('单片厚度', thk, 'mm')}
      ${row('双极板厚度', bt, 'mm')}
      ${row('有效面积', A, 'cm²')}
    </div>`;
  }
  else if(type === 'mea'){
    const PkW = g('c_p'), pt = g('c_pt') || 0.25, A = g('c_a') || 420;
    const memThk = g('c_m') || 15, gdl = g('c_g') || 200, ion = g('c_ion') || 30;
    const N = Math.ceil(PkW * 1000 / (0.71 * 1.5 * A));
    const ptPerCell = pt * A / 1000;
    const ptTotal = ptPerCell * N;
    const ptPerKW = ptTotal / PkW * 1000;
    const memArea = A * N / 10000;
    const memMass = memArea * memThk * 1e-6 * 2000 * 1000;
    const gdlMass = memArea * gdl * 1e-6 * 400 * 1000;
    html = `<div class="res-box">
      ${row('推算片数 N', fmt(N, 0), '片')}
      ${row('单电池 Pt 用量', fmt(ptPerCell, 4), 'g')}
      ${row('电堆 Pt 总量', fmt(ptTotal, 2), 'g')}
      ${row('Pt 用量', fmt(ptPerKW, 3), 'g/kW')}
      ${row('质子膜总面积', fmt(memArea, 3), 'm²')}
      ${row('质子膜质量 (估算)', fmt(memMass, 2), 'g')}
      ${row('GDL 总质量 (估算)', fmt(gdlMass, 1), 'g')}
      ${row('MEA 总面积 (含边框)', fmt(memArea * 1.15, 3), 'm²')}
      ${row('离聚物总质量', fmt(memArea * 1.15 * 0.02 * ion / 100 * 1000, 1), 'g')}
      ${row('质子膜厚度', memThk, 'μm')}
    </div>`;
  }
  else if(type === 'cost'){
    const PkW = g('c_p'), pt = g('c_pt') || 0.25, ptp = g('c_ptp') || 280;
    const memP = g('c_mem') || 1200, bppP = g('c_bpp') || 1200, gdlP = g('c_gdl') || 180;
    const oth = g('c_oth') || 3000, qty = g('c_qty') || 1000;
    const N = Math.ceil(PkW * 1000 / (0.71 * 1.5 * state.params.area));
    const ptTotal = pt * state.params.area / 1000 * N;
    const memArea = state.params.area * N / 10000;
    const costPt = ptTotal * ptp;
    const costMem = memArea * memP * 0.6;
    const costGdl = N * gdlP;
    const costBPP = N * bppP;
    const costMEA = costPt + costMem + costGdl;
    const costTotal = costMEA + costBPP + oth;
    const perKW = costTotal / PkW;
    const scale = Math.pow(Math.log10(Math.max(qty, 10)) / 3, 1.4);
    const volumePrice = perKW / Math.max(scale, 0.3);
    html = `<div class="res-box">
      ${row('Pt 成本', fmt(costPt, 0), '元')}
      ${row('质子膜成本', fmt(costMem, 0), '元')}
      ${row('GDL 成本', fmt(costGdl, 0), '元')}
      ${row('MEA 总成本', fmt(costMEA, 0), '元')}
      ${row('双极板成本', fmt(costBPP, 0), '元')}
      ${row('其他成本', fmt(oth, 0), '元')}
      ${row('电堆总成本', fmt(costTotal, 0), '元')}
      ${row('单位成本', fmt(perKW, 0), '元/kW')}
      ${row('规模效应后单价 ('+qty+'台/年)', fmt(volumePrice, 0), '元/kW')}
      ${row('MEA 占比', fmt(costMEA / costTotal * 100, 1), '%')}
      ${row('双极板占比', fmt(costBPP / costTotal * 100, 1), '%')}
    </div>`;
  }
  else if(type === 'life'){
    const soh = g('c_soh') || 98, deg = g('c_deg') || 1.5, v = g('c_v') || 0.71;
    const st = g('c_st') || 386, std = g('c_std') || 10, target = g('c_target') || 80;
    const sohLoss = 100 - soh;
    const hoursSteady = sohLoss * 1000 / (deg * 0.1);
    const startLoss = st * std / 1000;
    const hours = Math.max(hoursSteady - st * 2, 0);
    const rul = (soh - target) * 1000 / (deg * 0.1);
    const vLoss = v * sohLoss / 100;
    html = `<div class="res-box">
      ${row('当前 SOH', soh, '%')}
      ${row('衰减速率', deg, 'μV/h·cell')}
      ${row('启停衰减累计', fmt(startLoss, 1), '%')}
      ${row('已运行时间 (估算)', fmt(hours, 0), 'h')}
      ${row('剩余寿命 RUL (至 '+target+'%)', fmt(Math.max(rul, 0), 0), 'h')}
      ${row('剩余寿命 (年, 20h/日)', fmt(Math.max(rul, 0) / 20 / 365, 1), '年')}
      ${row('单片电压衰减', fmt(vLoss * 1000, 1), 'mV')}
      ${row('当前单片电压', fmt(v * soh / 100, 4), 'V')}
      ${row('寿命评估', soh > 95 ? '优秀 ✓' : soh > 90 ? '良好' : '需关注 ⚠', '')}
    </div>`;
  }
  out.innerHTML = html;
}

/* ================= 参数库 ================= */
function viewLib(){
  const allItems = libAllItems();
  const filtered = libFilterItems(allItems);
  const favCount = state.libFav.size;
  const catData = LIB.map(cat => {
    const items = filtered.filter(it => it._catId === cat.id);
    return { cat, items };
  }).filter(c => c.items.length > 0);

  return `
  <div class="lib-toolbar">
    <div class="search-wrap">
      <span class="si">⌕</span>
      <input type="text" id="libSearchInput" placeholder="搜索电堆参数名称、单位、说明、全球机型…" value="${state.libSearch}">
      <span class="clr" data-action="lib-clear-search">✕</span>
    </div>
    <div class="preset-row">
      <div class="preset ${state.libTier === 'all' ? 'active' : ''}" data-action="lib-tier" data-id="all">全部电堆功率段</div>
      ${TIERS.map(t => `
        <div class="preset ${state.libTier === t.id ? 'active' : ''}" data-action="lib-tier" data-id="${t.id}" style="border-color:${state.libTier === t.id ? t.color + '88' : ''};color:${state.libTier === t.id ? t.color : ''}">
          ${t.name}电堆 ${t.min}–${t.max}kW
        </div>`).join('')}
    </div>
  </div>

  <div class="lib-stats">
    <span>总条目 <b>${allItems.length}</b></span>
    <span>当前筛选 <b>${filtered.length}</b></span>
    <span>已收藏 <b>${favCount}</b></span>
    <span>类别 <b>${catData.length}</b>/${LIB.length}</span>
    <span>全球机型 <b>${GLOBAL_DB.length}</b></span>
  </div>

  <div class="lib-actions">
    <button class="btn ghost" data-action="lib-expand-all">⌄ 展开全部</button>
    <button class="btn ghost" data-action="lib-collapse-all">⌃ 折叠全部</button>
    <button class="btn ghost" data-action="report" data-id="export">⇩ 导出参数库</button>
  </div>

  ${filtered.length === 0 ? `
    <div class="empty-lib">
      <div class="ei">◌</div>
      <div>没有匹配的电堆参数</div>
      <div style="font-size:11px;color:#5f7391;margin-top:6px">请尝试调整筛选条件或搜索关键词</div>
    </div>` : ''}

  ${catData.map(({ cat, items }) => {
    const isOpen = state.libOpen === cat.id;
    return `
    <div class="lib-cat ${isOpen ? 'open' : ''}" data-cat="${cat.id}">
      <div class="lib-cat-head" data-action="lib-toggle" data-id="${cat.id}">
        <div class="ci">${cat.ico}</div>
        <div style="flex:1;min-width:0">
          <h3>${cat.t}</h3>
          <div class="desc">${cat.desc}</div>
        </div>
        <span class="badge info">${items.length} 项</span>
        <span class="chev">›</span>
      </div>
      <div class="lib-cat-body">
        ${items.map(it => {
          const starred = state.libFav.has(it.id);
          const tierTags = (it.tiers || []).map(t =>
            `<span class="tier-tag ${t}">${tierName(t)}</span>`).join('');
          const canApply = it.map && it.map.key;
          return `
          <div class="lib-item">
            <div class="lib-item-head">
              <span class="lib-item-k">${it.k}</span>
              <button class="lib-star ${starred ? 'on' : ''}" data-action="lib-star" data-id="${it.id}" title="${starred ? '取消收藏' : '收藏'}">★</button>
            </div>
            <div class="lib-item-v">
              <b>${it.v}</b>${it.u && it.u !== '—' ? `<small>${it.u}</small>` : ''}
            </div>
            ${it.range && it.range !== '—' ? `<div class="lib-item-range">极限范围：${it.range}${it.u && it.u !== '—' ? ' ' + it.u : ''}</div>` : ''}
            <div class="lib-item-note">${it.note || ''}</div>
            <div class="lib-item-foot">
              <div class="tier-tags">${tierTags || '<span class="tier-tag">通用</span>'}</div>
              ${canApply
                ? `<button class="btn-apply" data-action="lib-apply" data-id="${it.id}">✓ 应用到电堆仿真</button>`
                : `<button class="btn-apply" disabled title="该参数不可直接映射">—</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('')}

  <div class="foot-note">
    设计者：<b class="sign">戴煜</b> · 燃料电池研发工程师<br>
    联系方式：<b>18662613315@163.com</b><br>
    参数库覆盖电堆结构 / MEA / 双极板 / 操作 / 水热 / 性能 / 寿命 / 辅机 / 安全 / 成本 / 全球数据库 等 ${LIB.length} 大类<br>
    参考 GB/T 24554、GB/T 37244、SAE J2719、ISO 14687、IEC 62282 等标准<br>
    版权所有 © 2026 戴煜 · 保留所有权利
  </div>`;
}

function afterLib(){
  const inp = $('#libSearchInput');
  if(inp){
    inp.addEventListener('input', e => {
      state.libSearch = e.target.value;
      const curPos = e.target.selectionStart;
      renderView();
      const newInp = $('#libSearchInput');
      if(newInp){
        newInp.focus();
        try { newInp.setSelectionRange(curPos, curPos); } catch(err){}
      }
    });
  }
}

/* ================= 监控 ================= */
function viewMonitor(){
  const o = state.mon.over;
  const S_ = (label, id, val, min, max, step, unit) => `
    <div class="field" style="margin-bottom:10px">
      <label>${label} <b id="${id}Val">${val}${unit}</b></label>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-mon="${id}" class="mon-slider" style="margin:0">
    </div>`;

  return `
  <div class="card" style="margin-bottom:12px">
    <div class="card-h">
      <h3>监控运行点（可手动调节）</h3>
      <span class="badge ${state.mon.auto ? 'info' : 'warn'}" id="monModeBadge">${state.mon.auto ? '自动跟随' : '手动调节'}</span>
    </div>
    <div class="chk-grid" style="grid-template-columns:repeat(2,1fr)">
      <div class="chk ${state.mon.auto ? 'on' : ''}" data-action="mon-auto" data-id="auto">
        <input type="radio" name="monmode" ${state.mon.auto ? 'checked' : ''}> 自动跟随工作台
      </div>
      <div class="chk ${!state.mon.auto ? 'on' : ''}" data-action="mon-auto" data-id="manual">
        <input type="radio" name="monmode" ${!state.mon.auto ? 'checked' : ''}> 手动调节运行点
      </div>
    </div>
    <div id="monManualBox" style="display:${state.mon.auto ? 'none' : 'block'}">
      ${S_('电堆功率','power', o.power, 10, 400, 1, ' kW')}
      ${S_('电堆温度','T', o.T, 40, 100, 1, ' ℃')}
      ${S_('氢气压力','pH2', o.pH2, 0.08, 0.35, 0.01, ' MPa')}
      ${S_('空气压力','pAir', o.pAir, 0.08, 0.35, 0.01, ' MPa')}
      ${S_('空气计量比','lamAir', o.lamAir, 1.5, 4.0, 0.1, '')}
      <button class="btn ghost block sm" data-action="mon-reset">↻ 重置为工作台参数</button>
    </div>
  </div>

  <div class="grid g2" style="margin-bottom:12px">
    <div class="kpi b"><div class="kpi-k">电堆功率</div><div class="kpi-v" id="m_ptotal">—<small>kW</small></div></div>
    <div class="kpi g"><div class="kpi-k">电堆净功率</div><div class="kpi-v" id="m_pnet">—<small>kW</small></div></div>
    <div class="kpi c"><div class="kpi-k">电堆电压</div><div class="kpi-v" id="m_v">—<small>V</small></div></div>
    <div class="kpi o"><div class="kpi-k">电堆电流</div><div class="kpi-v" id="m_i">—<small>A</small></div></div>
    <div class="kpi p"><div class="kpi-k">电堆氢耗</div><div class="kpi-v" id="m_h2">—<small>kg/h</small></div></div>
    <div class="kpi g"><div class="kpi-k">电堆效率</div><div class="kpi-v" id="m_eta">—<small>%</small></div></div>
    <div class="kpi r"><div class="kpi-k">电流密度</div><div class="kpi-v" id="m_iD">—<small>A/cm²</small></div></div>
    <div class="kpi b"><div class="kpi-k">产热功率</div><div class="kpi-v" id="m_q">—<small>kW</small></div></div>
    <div class="kpi c"><div class="kpi-k">冷却液流量</div><div class="kpi-v" id="m_flow">—<small>L/min</small></div></div>
    <div class="kpi o"><div class="kpi-k">空压机功耗</div><div class="kpi-v" id="m_cmp">—<small>kW</small></div></div>
    <div class="kpi p"><div class="kpi-k">辅机总功耗</div><div class="kpi-v" id="m_bop">—<small>kW</small></div></div>
    <div class="kpi g"><div class="kpi-k">单位氢耗</div><div class="kpi-v" id="m_gkwh">—<small>g/kWh</small></div></div>
  </div>

  <div class="card">
    <div class="card-h"><h3>电堆单片一致性分布</h3><span class="tag" id="m_cons">—</span></div>
    <div class="mono-grid" id="m_mono"></div>
    <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--mut);margin-top:10px">
      <span>最大偏差 <b id="m_dev" style="color:var(--txt)">—</b></span>
      <span>标准差 <b id="m_std" style="color:var(--txt)">—</b></span>
      <span>最低片 <b id="m_min" style="color:var(--txt)">—</b></span>
    </div>
  </div>

  <div class="card">
    <div class="card-h"><h3>电堆温度 / 压力 / 压降</h3></div>
    <div class="grid g2">
      <div class="kpi o"><div class="kpi-k">电堆温度</div><div class="kpi-v" id="m_t">—<small>℃</small></div></div>
      <div class="kpi c"><div class="kpi-k">氢气压力</div><div class="kpi-v" id="m_p">—<small>MPa</small></div></div>
      <div class="kpi b"><div class="kpi-k">进堆水温</div><div class="kpi-v" id="m_tw">—<small>℃</small></div></div>
      <div class="kpi p"><div class="kpi-k">空气压力</div><div class="kpi-v" id="m_pa">—<small>MPa</small></div></div>
      <div class="kpi o"><div class="kpi-k">氢侧压降</div><div class="kpi-v" id="m_dph">—<small>kPa</small></div></div>
      <div class="kpi c"><div class="kpi-k">空气侧压降</div><div class="kpi-v" id="m_dpa">—<small>kPa</small></div></div>
      <div class="kpi g"><div class="kpi-k">高频阻抗</div><div class="kpi-v" id="m_r">—<small>Ω·cm²</small></div></div>
      <div class="kpi r"><div class="kpi-k">氢浓度</div><div class="kpi-v" id="m_h2c">—<small>% LEL</small></div></div>
    </div>
  </div>

  <div class="chart-wrap"><canvas id="mChart" class="tall"></canvas>${legend([{c:'#0a84ff',n:'电堆功率 (kW)'},{c:'#00d48a',n:'电堆效率 (%×10)'}])}</div>

  <div class="sec-title">电堆配套状态</div>
  <div class="card">
    ${[
      ['氢循环泵','#0a84ff','m_aux1'],['冷却水泵','#00d48a','m_aux2'],
      ['DC-DC','#22d3ee','m_aux3'],['吹扫阀','#a78bfa','m_aux4'],
      ['空压机','#ff9f0a','m_aux5'],['散热风扇','#f472b6','m_aux6'],
    ].map(a => `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:#a9bcd6;font-weight:550">${a[0]}</span>
          <span id="${a[2]}" style="color:${a[1]};font-weight:700;font-variant-numeric:tabular-nums">—</span>
        </div>
        <div class="mbar"><i id="${a[2]}_b" style="width:0%;background:${a[1]}"></i></div>
      </div>`).join('')}
  </div>

  <div class="sec-title">电堆故障告警</div>
  <div class="card">
    ${['电堆超温','超压 / 欠压','低单片电压','膜干 / 水淹','氢浓度','单片一致性差','压降异常','绝缘电阻'].map(l => `
      <div class="res-row">
        <span class="res-k">${l}</span>
        <span class="badge ok">正常</span>
      </div>`).join('')}
  </div>

  <div class="sec-title">电堆健康度 SOH</div>
  <div class="card">
    <div class="grid g2">
      <div class="kpi g"><div class="kpi-k">电堆 SOH</div><div class="kpi-v">97.8<small>%</small></div></div>
      <div class="kpi b"><div class="kpi-k">剩余寿命 RUL</div><div class="kpi-v">11800<small>h</small></div></div>
      <div class="kpi o"><div class="kpi-k">累计运行</div><div class="kpi-v">3200<small>h</small></div></div>
      <div class="kpi p"><div class="kpi-k">启停次数</div><div class="kpi-v">386<small>次</small></div></div>
    </div>
    <div class="mbar" style="margin-top:14px"><i style="width:97.8%;background:linear-gradient(90deg,var(--green),var(--cyan))"></i></div>
    <div style="font-size:10.5px;color:var(--mut);margin-top:7px">距下次维保还需 <b style="color:var(--orange)">680 h</b></div>
  </div>

  <div class="grid g2">
    <button class="btn ghost" data-action="report" data-id="replay">↻ 数据回放</button>
    <button class="btn ghost" data-action="report" data-id="fault">⎙ 故障报告</button>
  </div>`;
}

function startMonitor(){
  stopMonitor();
  state.mon.hist = [];
  state.mon.eisHist = [];
  state.mon.t = 0;
  state.mon.timer = setInterval(tickMonitor, 900);
  tickMonitor();
}
function stopMonitor(){
  if(state.mon.timer){ clearInterval(state.mon.timer); state.mon.timer = null; }
}
function afterMonitor(){
  $$('.mon-slider').forEach(s => {
    s.addEventListener('input', e => {
      const id = e.target.dataset.mon;
      state.mon.over[id] = parseFloat(e.target.value);
      const map = { power:' kW', T:' ℃', pH2:' MPa', pAir:' MPa', lamAir:'' };
      const el = $('#' + id + 'Val');
      if(el) el.textContent = (id === 'pH2' || id === 'pAir' ? parseFloat(e.target.value).toFixed(2) : e.target.value) + (map[id] || '');
      tickMonitor();
    });
  });
  tickMonitor();
}

function monParams(){
  if(state.mon.auto) return state.params;
  const o = state.mon.over;
  return Object.assign({}, state.params, {
    stackPower:o.power, T:o.T, pH2:o.pH2, pAir:o.pAir, lambdaAir:o.lamAir, stoichMode:'manual',
  });
}

function tickMonitor(){
  if(state.view !== 'monitor') return;
  const backup = state.params;
  state.params = monParams();
  const r = solveSystem();
  state.params = backup;

  const n = () => (Math.random() - 0.5);
  const Ptotal = r.Pstack * (1 + n() * 0.008);
  const Pnet = r.Pnet * (1 + n() * 0.008);
  const V = r.Vstack * (1 + n() * 0.003);
  const I = Ptotal * 1000 / Math.max(V, 1);
  const mH2 = r.mH2 * (1 + n() * 0.012);
  const eta = r.etaStack * 100 * (1 + n() * 0.006);

  const upd = (id, v, u, d = 1) => {
    const el = $('#' + id);
    if(el) el.innerHTML = fmt(v, d) + `<small>${u}</small>`;
  };
  upd('m_ptotal', Ptotal, 'kW', 1); upd('m_pnet', Pnet, 'kW', 1);
  upd('m_v', V, 'V', 1); upd('m_i', I, 'A', 0);
  upd('m_h2', mH2, 'kg/h', 2); upd('m_eta', eta, '%', 1);
  upd('m_iD', r.i, 'A/cm²', 3); upd('m_q', r.Q, 'kW', 1);
  upd('m_flow', r.flow, 'L/min', 0); upd('m_cmp', r.pCmp, 'kW', 2);
  upd('m_bop', r.pBop, 'kW', 2); upd('m_gkwh', r.gkwh, 'g/kWh', 1);

  const Ns = Math.min(state.params.N, 60);
  const cells = [];
  for(let k = 0; k < Ns; k++){
    const pos = k / (Ns - 1);
    const base = V / state.params.N;
    const dip = pos > 0.75 ? (pos - 0.75) * 0.05 : 0;
    cells.push(base * (1 + n() * 0.006 - dip) * 1000);
  }
  const mean = cells.reduce((a, b) => a + b, 0) / cells.length;
  const dev = Math.max(...cells.map(c => Math.abs(c - mean)));
  const std = Math.sqrt(cells.reduce((a, b) => a + (b - mean) ** 2, 0) / cells.length);
  const minV = Math.min(...cells);
  const cons = 100 - dev / mean * 100;

  const mono = $('#m_mono');
  if(mono){
    mono.innerHTML = cells.map((c, k) => {
      const rel = (c - mean) / mean;
      const col = rel > 0.004 ? '#00d48a' : rel > -0.004 ? '#22d3ee' : rel > -0.012 ? '#ff9f0a' : '#ff453a';
      return `<div class="mono-cell" style="background:${col}" title="第${k+1}片 ${c.toFixed(1)}mV">${k+1}</div>`;
    }).join('');
  }
  const el = id => $('#' + id);
  if(el('m_dev')) el('m_dev').textContent = dev.toFixed(1) + ' mV';
  if(el('m_std')) el('m_std').textContent = std.toFixed(1) + ' mV';
  if(el('m_min')) el('m_min').textContent = minV.toFixed(0) + ' mV';
  if(el('m_cons')) el('m_cons').textContent = cons.toFixed(1) + '%';

  upd('m_t', state.params.T + 2 + Math.random() * 2, '℃', 1);
  upd('m_p', state.params.pH2 + Math.random() * 0.015, 'MPa', 3);
  upd('m_tw', state.params.T - 5 + Math.random() * 2, '℃', 1);
  upd('m_pa', state.params.pAir + Math.random() * 0.015, 'MPa', 3);
  upd('m_dph', state.params.dpH2 * (1 + n() * 0.08), 'kPa', 1);
  upd('m_dpa', state.params.dpAir * (1 + n() * 0.08), 'kPa', 1);
  upd('m_r', state.params.R * (1 + n() * 0.03), 'Ω·cm²', 3);
  upd('m_h2c', Math.abs(0.02 + Math.random() * 0.03), '% LEL', 3);

  const aux = [
    ['m_aux1', 82 + Math.random() * 10], ['m_aux2', 68 + Math.random() * 10],
    ['m_aux3', 52 + Math.random() * 12], ['m_aux4', 92 + Math.random() * 6],
    ['m_aux5', 60 + Math.random() * 20], ['m_aux6', 45 + Math.random() * 25],
  ];
  aux.forEach(a => {
    const e1 = el(a[0]); if(e1) e1.textContent = a[1].toFixed(0) + '%';
    const b = el(a[0] + '_b'); if(b) b.style.width = a[1] + '%';
  });

  state.mon.t++;
  state.mon.hist.push([state.mon.t, Ptotal, eta * 10]);
  if(state.mon.hist.length > 60) state.mon.hist.shift();

  const cv = $('#mChart');
  if(cv){
    const hist = state.mon.hist;
    if(hist.length >= 2){
      const xMin = hist[0][0], xMax = hist[hist.length - 1][0];
      if(xMax > xMin){
        plot(cv, {
          xMin, xMax, yMin:0, yMax: state.params.stackPower * 1.25,
          xLabel:'采样点', yLabel:'kW / %×10',
          series:[{ data:hist.map(d => [d[0], d[1]]), color:'#0a84ff', fill:'rgba(10,132,255,.2)' },
                  { data:hist.map(d => [d[0], d[2]]), color:'#00d48a' }]
        });
      }
    }
  }
}

/* ================= 数据 ================= */
const DATA_METRICS = [
  { id:'eta', n:'电堆效率 (%)', c:'#0a84ff' },
  { id:'soh', n:'SOH (%)', c:'#00d48a' },
  { id:'mh2', n:'氢耗 (kg/h×10)', c:'#ff9f0a' },
  { id:'gkwh', n:'单位氢耗 (g/kWh)', c:'#22d3ee' },
  { id:'i', n:'电流密度 (A/cm²×100)', c:'#a78bfa' },
  { id:'vpd', n:'体积功率密度 (kW/L)', c:'#f472b6' },
  { id:'sp', n:'比功率 (kW/kg)', c:'#ff453a' },
  { id:'q', n:'产热 (kW)', c:'#7d8fb3' },
];

function projMetrics(p){
  const backup = { ...state.params };
  Object.assign(state.params, { stackPower:p.power, N:p.N, area:p.area, T:p.T });
  const r = solveSystem();
  Object.assign(state.params, backup);
  return {
    eta: p.eta, soh: p.soh, mh2: p.mh2 * 10, gkwh: r.gkwh,
    i: r.i * 100, vpd: r.vpd, sp: r.sp, q: r.Q,
  };
}

function viewData(){
  return `
  <div class="sec-title">内置参考方案（示例参数 · 非实测项目记录）</div>
  <div class="card" style="margin-bottom:12px;border-color:rgba(255,159,10,.35);background:rgba(255,159,10,.06);font-size:12px;color:var(--mut);line-height:1.65">下列预置方案及效率、氢耗、SOH、日期均为软件内置演示值，不代表真实试验报告、客户项目或经第三方验证的性能数据。用于方案对比前，请替换为有来源的实测数据。</div>
  ${state.projects.map((p, i) => `
    <div class="li">
      <div class="li-ico ${i % 2 ? 'g' : ''}">◫</div>
      <div class="li-body">
        <div class="li-t">${p.name}</div>
        <div class="li-d">${p.tier}电堆 · ${p.power} kW · ${p.date} · η ${p.eta}% · SOH ${p.soh}%</div>
      </div>
      <div class="badge info">${p.power}kW</div>
    </div>`).join('')}

  <div class="sec-title">电堆方案横向对比（可自选指标）</div>
  <div class="card">
    <div class="grid g2" style="margin-bottom:12px">
      <div class="field" style="margin:0"><label>电堆方案 A</label>
        <select id="cmpA">${state.projects.map((p, i) => `<option value="${i}" ${state.dataSel.A === i ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin:0"><label>电堆方案 B</label>
        <select id="cmpB">${state.projects.map((p, i) => `<option value="${i}" ${state.dataSel.B === i ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      </div>
    </div>
    <div style="font-size:11px;color:var(--mut);margin-bottom:8px">选择对比指标</div>
    <div class="chk-grid">
      ${DATA_METRICS.map(m => `
        <div class="chk ${state.dataMetrics[m.id] ? 'on' : ''}" data-action="data-metric" data-id="${m.id}">
          <input type="checkbox" ${state.dataMetrics[m.id] ? 'checked' : ''}> ${m.n}
        </div>`).join('')}
    </div>
    <button class="btn primary block" data-action="cmp-run">⇄ 开始对比</button>
    <div id="cmpRes"></div>
  </div>

  <div class="sec-title">电堆核心数据库</div>
  <div class="grid g2">
    <div class="kpi b"><div class="kpi-k">方案总数</div><div class="kpi-v">${state.projects.length}<small>套</small></div></div>
    <div class="kpi g"><div class="kpi-k">平均效率</div><div class="kpi-v">${fmt(state.projects.reduce((s,p)=>s+p.eta,0)/state.projects.length,1)}<small>%</small></div></div>
    <div class="kpi c"><div class="kpi-k">平均氢耗</div><div class="kpi-v">${fmt(state.projects.reduce((s,p)=>s+p.mh2,0)/state.projects.length,2)}<small>kg/h</small></div></div>
    <div class="kpi p"><div class="kpi-k">平均 SOH</div><div class="kpi-v">${fmt(state.projects.reduce((s,p)=>s+p.soh,0)/state.projects.length,1)}<small>%</small></div></div>
    <div class="kpi o"><div class="kpi-k">最高功率</div><div class="kpi-v">${Math.max(...state.projects.map(p=>p.power))}<small>kW</small></div></div>
    <div class="kpi r"><div class="kpi-k">最低氢耗</div><div class="kpi-v">${fmt(Math.min(...state.projects.map(p=>p.mh2)),2)}<small>kg/h</small></div></div>
  </div>

  <div class="sec-title">关键参数趋势（按所选指标）</div>
  <div class="chart-wrap">
    <canvas id="dataChart" class="tall"></canvas>
    <div class="legend" id="dataLegend"></div>
  </div>

  <div class="sec-title">各方案指标分布</div>
  <div class="card">
    ${state.projects.map(p => `
      <div class="bar-row">
        <span class="bar-k">${p.name.replace(/电堆.*/, '')}</span>
        <div class="bar-track"><i style="width:${Math.min(p.eta / 65 * 100, 100)}%;background:linear-gradient(90deg,#0a84ff,#22d3ee)"></i></div>
        <span class="bar-v">${p.eta}%</span>
      </div>`).join('')}
  </div>

  <div class="sec-title">数据溯源</div>
  <div class="card">
    <div class="res-row"><span class="res-k">数据总条数</span><span class="res-v">42,847</span></div>
    <div class="res-row"><span class="res-k">电堆仿真数据</span><span class="res-v">18,210</span></div>
    <div class="res-row"><span class="res-k">实测数据</span><span class="res-v">21,936</span></div>
    <div class="res-row"><span class="res-k">计算记录</span><span class="res-v">2,701</span></div>
    <div class="res-row"><span class="res-k">全球数据库对标</span><span class="res-v">${GLOBAL_DB.length} 款</span></div>
    <div class="res-row"><span class="res-k">最近同步</span><span class="res-v" style="font-size:12px">2026-09-30 08:14</span></div>
  </div>

  <div class="sec-title">数据分类统计</div>
  <div class="card">
    ${[
      ['电堆稳态数据', 8420, '#0a84ff', 100],
      ['动态变载数据', 5210, '#00d48a', 62],
      ['低温启动数据', 2180, '#22d3ee', 26],
      ['耐久循环数据', 9860, '#a78bfa', 117],
      ['EIS 阻抗数据', 3260, '#ff9f0a', 39],
      ['CV 测试数据', 1640, '#f472b6', 19],
      ['水热联合数据', 2860, '#7d8fb3', 34],
    ].map(x => `
      <div class="bar-row">
        <span class="bar-k">${x[0]}</span>
        <div class="bar-track"><i style="width:${x[3]/120*100}%;background:${x[2]}"></i></div>
        <span class="bar-v">${x[1]}</span>
      </div>`).join('')}
  </div>

  <div class="sec-title">数据导出与报表</div>
  <div class="grid g2">
    <button class="btn ghost" data-action="report" data-id="export">⇩ 批量导出数据</button>
    <button class="btn ghost" data-action="report" data-id="bench">⎙ 对标分析报告</button>
    <button class="btn ghost" data-action="report" data-id="trend">⎙ 参数趋势报告</button>
    <button class="btn ghost" data-action="report" data-id="trace">⎙ 数据溯源报告</button>
  </div>
  <div class="foot-note">
    设计者：<b class="sign">戴煜</b> · 燃料电池研发工程师<br>
    联系方式：<b>18662613315@163.com</b><br>
    版权所有 © 2026 戴煜 · 保留所有权利
  </div>`;
}

function afterData(){
  const cv = $('#dataChart');
  if(!cv) return;
  const series = [];
  const legendHTML = [];
  DATA_METRICS.forEach(m => {
    if(!state.dataMetrics[m.id]) return;
    const data = state.projects.map((p, i) => [i, projMetrics(p)[m.id]]);
    series.push({ data, color:m.c, dots:true, fill: series.length === 0 ? m.c + '22' : undefined });
    legendHTML.push(`<span><i style="background:${m.c}"></i>${m.n}</span>`);
  });
  const lg = $('#dataLegend');
  if(lg) lg.innerHTML = legendHTML.join('') || '<span style="color:#5f7391">请选择至少一个指标</span>';
  if(series.length === 0) return;

  const allVals = series.flatMap(s => s.data.map(d => d[1]));
  const yMax = Math.max(...allVals, 1) * 1.15;

  requestAnimationFrame(() => {
    plot(cv, {
      xMin:0, xMax:state.projects.length - 1, yMin:0, yMax,
      xLabel:'电堆方案索引', yLabel:'指标值', series
    });
  });
}

function runCompare(){
  const A = state.projects[+$('#cmpA').value];
  const B = state.projects[+$('#cmpB').value];
  if(!A || !B) return;
  state.dataSel.A = +$('#cmpA').value;
  state.dataSel.B = +$('#cmpB').value;

  const mA = projMetrics(A), mB = projMetrics(B);
  const rows = [];
  DATA_METRICS.forEach(m => {
    if(!state.dataMetrics[m.id]) return;
    const a = mA[m.id], b = mB[m.id];
    const diff = b - a;
    rows.push([m.n, fmt(a, 2), fmt(b, 2), (diff >= 0 ? '+' : '') + fmt(diff, 2)]);
  });

  $('#cmpRes').innerHTML = `
    <div class="res-box" style="margin-top:12px">
      <div class="res-row" style="border-bottom:1px solid rgba(0,212,138,.3)">
        <span class="res-k" style="font-weight:700;min-width:110px">指标</span>
        <span class="res-v" style="font-size:11px;min-width:60px;text-align:right">A</span>
        <span class="res-v" style="font-size:11px;min-width:60px;text-align:right;color:#22d3ee">B</span>
        <span class="res-v" style="font-size:11px;min-width:56px;text-align:right;color:#ff9f0a">差值</span>
      </div>
      ${rows.map(r => `
        <div class="res-row">
          <span class="res-k" style="min-width:110px">${r[0]}</span>
          <span class="res-v" style="font-size:11.5px;min-width:60px;text-align:right">${r[1]}</span>
          <span class="res-v" style="font-size:11.5px;min-width:60px;text-align:right;color:#22d3ee">${r[2]}</span>
          <span class="res-v" style="font-size:11.5px;min-width:56px;text-align:right;color:#ff9f0a">${r[3]}</span>
        </div>`).join('')}
      <div class="res-row" style="border-top:1px dashed rgba(0,212,138,.3);margin-top:6px;padding-top:10px">
        <span class="res-k">结论</span>
        <span class="res-v" style="font-size:12px">效率差 ${fmt(Math.abs(mA.eta - mB.eta), 2)}% · SOH 差 ${fmt(Math.abs(mA.soh - mB.soh), 2)}%</span>
      </div>
    </div>`;
  toast('电堆方案对比完成');
}

/* ================= 知识库 ================= */
function viewKb(){
  const allEntries = kbAllEntries();
  const filtered = kbFilterEntries(allEntries);
  const catData = KB_CATS.map(cat => ({
    cat, entries: filtered.filter(e => e._catId === cat.id)
  }));
  const totalEntries = allEntries.length;

  return `
  <div class="kb-search">
    <span class="si">⌕</span>
    <input type="text" id="kbSearchInput" placeholder="搜索标准号、电堆关键词、场景、全球机型…" value="${state.kbSearch}">
    <span class="clr" data-action="kb-clear-search">✕</span>
  </div>

  <div class="kb-stats">
    <span>知识条目 <b>${totalEntries}</b></span>
    <span>分类 <b>${KB_CATS.length}</b></span>
    <span>当前筛选 <b>${filtered.length}</b></span>
    <span>全球机型 <b>${GLOBAL_DB.length}</b></span>
  </div>

  <div class="lib-actions">
    <button class="btn ghost" data-action="kb-expand-all">⌄ 展开全部</button>
    <button class="btn ghost" data-action="kb-collapse-all">⌃ 折叠全部</button>
    <button class="btn ghost" data-action="kb-expand-detail">✦ 展开详情</button>
  </div>

  ${filtered.length === 0 ? `
    <div class="empty-lib"><div class="ei">◌</div><div>没有匹配的电堆知识条目</div></div>` : ''}

  ${catData.map(({ cat, entries }) => {
    if(entries.length === 0) return '';
    const catOpen = state.kbCatOpen[cat.id] !== false;
    return `
    <div class="kb-cat ${catOpen ? 'open' : ''}" data-kbcat="${cat.id}">
      <div class="kb-cat-head" data-action="kb-cat-toggle" data-id="${cat.id}">
        <div class="ki">${cat.ico}</div>
        <div style="flex:1;min-width:0">
          <h3>${cat.name}</h3>
          <div class="kdesc">${cat.desc}</div>
        </div>
        <span class="badge info">${entries.length} 条</span>
        <span class="chev">›</span>
      </div>
      <div class="kb-cat-body">
        ${entries.map(e => {
          const open = state.kbOpen[e.id];
          return `
          <div class="kb-entry ${open ? 'open' : ''}" data-kbid="${e.id}">
            <div class="kb-entry-head" data-action="kb-entry-toggle" data-id="${e.id}">
              <span class="ke-arrow">›</span>
              <span class="kb-entry-title">${e.title}</span>
            </div>
            ${!open ? `<div class="kb-entry-summary">${e.summary}</div>` : ''}
            <div class="kb-entry-detail">
              <div style="margin-bottom:10px">
                ${(e.tags || []).map((t, i) => `<span class="kb-tag ${['std','range','note','tip'][i % 4]}">${t}</span>`).join('')}
              </div>
              ${Object.entries(e.detail).map(([sec, content]) => `
                <div class="kb-detail-section">
                  <h5>${sec}</h5>
                  ${Array.isArray(content) ? content.map(item => {
                    if(typeof item === 'string') return `<p>· ${item}</p>`;
                    if(item.k && item.v) return `<div class="kv"><span class="kv-k">${item.k}</span><span class="kv-v">${item.v}</span></div>`;
                    return '';
                  }).join('') : `<p>${content}</p>`}
                </div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('')}

  <div class="foot-note">
    设计者：<b class="sign">戴煜</b> · 燃料电池研发工程师<br>
    联系方式：<b>18662613315@163.com</b><br>
    知识库覆盖国标 / 测试标定 / 场景设计 / 行业阈值 / 零部件 / 控制 / AI 大模型 / 行业前沿 / 全球数据库 等 ${KB_CATS.length} 大类<br>
    对接 GB/T 24554、GB/T 37244、SAE J2719、SAE J2579、ISO 14687、IEC 62282 等国际国内标准<br>
    版权所有 © 2026 戴煜 · 保留所有权利
  </div>`;
}

function afterKb(){
  const inp = $('#kbSearchInput');
  if(inp){
    inp.addEventListener('input', e => {
      state.kbSearch = e.target.value;
      const curPos = e.target.selectionStart;
      renderView();
      const newInp = $('#kbSearchInput');
      if(newInp){
        newInp.focus();
        try { newInp.setSelectionRange(curPos, curPos); } catch(err){}
      }
    });
  }
}

/* ================= Canvas 绘图引擎 ================= */
function plot(cv, cfg){
  if(!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = cv.getBoundingClientRect();
  if(rect.width < 10) return;
  cv.width = rect.width * dpr;
  cv.height = rect.height * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  const pad = { l:48, r:14, t:14, b:30 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const { xMin, xMax, yMin, yMax, series, xLabel, yLabel } = cfg;
  const X = v => pad.l + (v - xMin) / (xMax - xMin) * pw;
  const Y = v => pad.t + ph - (v - yMin) / (yMax - yMin) * ph;
  g.clearRect(0, 0, W, H);

  g.strokeStyle = '#151f31'; g.lineWidth = 1;
  for(let k = 0; k <= 4; k++){
    const y = pad.t + ph * k / 4;
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + pw, y); g.stroke();
    const x = pad.l + pw * k / 4;
    g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, pad.t + ph); g.stroke();
  }
  g.strokeStyle = '#24304a'; g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(pad.l, pad.t); g.lineTo(pad.l, pad.t + ph); g.lineTo(pad.l + pw, pad.t + ph);
  g.stroke();

  g.fillStyle = '#5f7391'; g.font = '10px -apple-system,sans-serif';
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for(let k = 0; k <= 4; k++){
    const v = yMin + (yMax - yMin) * (1 - k / 4);
    g.fillText(Math.abs(yMax - yMin) < 3 ? v.toFixed(2) : v.toFixed(0), pad.l - 6, pad.t + ph * k / 4);
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for(let k = 0; k <= 4; k++){
    const v = xMin + (xMax - xMin) * k / 4;
    g.fillText(Math.abs(xMax - xMin) < 3 ? v.toFixed(2) : v.toFixed(0), pad.l + pw * k / 4, pad.t + ph + 7);
  }
  g.fillStyle = '#4a5a78'; g.font = '9.5px -apple-system,sans-serif';
  g.textAlign = 'center';
  if(xLabel) g.fillText(xLabel, pad.l + pw / 2, H - 11);
  g.save(); g.translate(11, pad.t + ph / 2); g.rotate(-Math.PI / 2);
  if(yLabel) g.fillText(yLabel, 0, 0); g.restore();

  series.forEach(s => {
    if(!s.data || !s.data.length) return;
    g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = 'round';
    g.beginPath();
    s.data.forEach((d, idx) => {
      const px = X(d[0]), py = Y(d[1]);
      idx ? g.lineTo(px, py) : g.moveTo(px, py);
    });
    g.stroke();
    if(s.fill){
      g.lineTo(X(s.data[s.data.length - 1][0]), pad.t + ph);
      g.lineTo(X(s.data[0][0]), pad.t + ph);
      g.closePath();
      const grad = g.createLinearGradient(0, pad.t, 0, pad.t + ph);
      grad.addColorStop(0, s.fill); grad.addColorStop(1, 'transparent');
      g.fillStyle = grad; g.fill();
    }
    if(s.dots){
      g.fillStyle = s.color;
      s.data.forEach(d => {
        g.beginPath(); g.arc(X(d[0]), Y(d[1]), 2.4, 0, Math.PI * 2); g.fill();
      });
    }
  });
}

function plotBar(cv, cfg){
  if(!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = cv.getBoundingClientRect();
  if(rect.width < 10) return;
  cv.width = rect.width * dpr;
  cv.height = rect.height * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  const pad = { l:48, r:14, t:18, b:34 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const { labels, values, colors, yMax, yLabel } = cfg;
  const maxV = yMax || Math.max(...values, 0.001) * 1.25;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#151f31'; g.lineWidth = 1;
  for(let k = 0; k <= 4; k++){
    const y = pad.t + ph * k / 4;
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + pw, y); g.stroke();
  }
  g.strokeStyle = '#24304a'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(pad.l, pad.t); g.lineTo(pad.l, pad.t + ph); g.lineTo(pad.l + pw, pad.t + ph); g.stroke();
  g.fillStyle = '#5f7391'; g.font = '10px -apple-system,sans-serif';
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for(let k = 0; k <= 4; k++){
    g.fillText((maxV * (1 - k / 4)).toFixed(maxV < 3 ? 2 : 0), pad.l - 6, pad.t + ph * k / 4);
  }
  const n = values.length;
  const bw = pw / n * 0.52;
  values.forEach((v, idx) => {
    const cx = pad.l + pw * (idx + 0.5) / n;
    const h = Math.max(ph * (v / maxV), 1);
    const x = cx - bw / 2, y = pad.t + ph - h;
    const grad = g.createLinearGradient(0, y, 0, pad.t + ph);
    grad.addColorStop(0, colors[idx] || '#0a84ff');
    grad.addColorStop(1, (colors[idx] || '#0a84ff') + '22');
    g.fillStyle = grad;
    const rr = 3;
    g.beginPath();
    g.moveTo(x, y + rr);
    g.arcTo(x, y, x + rr, y, rr);
    g.lineTo(x + bw - rr, y); g.arcTo(x + bw, y, x + bw, y + rr, rr);
    g.lineTo(x + bw, pad.t + ph); g.lineTo(x, pad.t + ph);
    g.closePath(); g.fill();
    g.fillStyle = '#c6d3e8'; g.font = '10px -apple-system,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(fmt(v, v < 10 ? 2 : 0), cx, y - 3);
    g.fillStyle = '#7d8fb3'; g.font = '9.5px -apple-system,sans-serif';
    g.textBaseline = 'top';
    g.fillText(labels[idx], cx, pad.t + ph + 8);
  });
  if(yLabel){
    g.save(); g.translate(11, pad.t + ph / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = '#4a5a78'; g.font = '9.5px -apple-system,sans-serif';
    g.textAlign = 'center'; g.fillText(yLabel, 0, 0); g.restore();
  }
}

function legend(items){
  return `<div class="legend">${items.map(i => `<span><i style="background:${i.c}"></i>${i.n}</span>`).join('')}</div>`;
}

/* ================= 全局事件委托 ================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const act = el.dataset.action;
  const id = el.dataset.id;

  switch(act){
    case 'nav': navigate(id); break;

    case 'preset-tier': {
      const t = TIERS.find(x => x.id === id);
      if(t){
        state.params.stackPower = Math.round((t.min + t.max) / 2);
        renderView();
        toast('已切换至 ' + t.name + '型电堆 · ' + state.params.stackPower + ' kW');
      }
      break;
    }

    case 'param-toggle': {
      state.paramOpen[id] = !state.paramOpen[id];
      const g = document.querySelector(`[data-pgroup="${id}"]`);
      if(g) g.classList.toggle('open', state.paramOpen[id]);
      break;
    }
    case 'param-expand-all':
      PARAM_GROUPS.forEach(g => state.paramOpen[g.id] = true);
      $$('.param-group').forEach(g => g.classList.add('open'));
      toast('已展开全部参数分组');
      break;
    case 'param-collapse-all':
      PARAM_GROUPS.forEach(g => state.paramOpen[g.id] = false);
      $$('.param-group').forEach(g => g.classList.remove('open'));
      toast('已折叠全部参数分组');
      break;
    case 'param-reset':
      Object.assign(state.params, defaultParams());
      renderView();
      toast('电堆参数已恢复默认值（对齐全球领先水平）');
      break;

    case 'mdl-toggle': {
      state.model.running = !state.model.running;
      const btn = $('#mdlBtn');
      if(btn) btn.textContent = state.model.running ? '■ 暂停演示' : '▶ 启动演示';
      if(state.model.running) startModelTrain(); else stopModelTrain();
      renderView();
      toast(state.model.running ? '模拟演示已启动' : '模拟演示已暂停');
      break;
    }
    case 'mdl-reset': {
      stopModelTrain();
      state.model = { running:false, epoch:0, loss:[], timer:null, pred:[], aiStage:0 };
      renderView();
      toast('模拟演示已重置');
      break;
    }

    case 'sim-mode':
      state.simMode = id;
      $$('.mode').forEach(m => m.classList.toggle('active', m.dataset.id === state.simMode));
      $('#simResult').innerHTML = '';
      break;
    case 'sim-run': runSim(); break;
    case 'sim-reset':
      Object.assign(state.params, defaultParams());
      renderView();
      toast('电堆参数已重置为默认值');
      break;

    case 'calc-tab':
      state.calcTab = id;
      renderView();
      break;
    case 'calc-run': runCalc(id); break;

    case 'lib-toggle': {
      state.libOpen = state.libOpen === id ? '' : id;
      $$('.lib-cat').forEach(c => {
        c.classList.toggle('open', c.dataset.cat === state.libOpen);
      });
      break;
    }
    case 'lib-expand-all':
      state.libOpen = '__all__';
      $$('.lib-cat').forEach(c => c.classList.add('open'));
      break;
    case 'lib-collapse-all':
      state.libOpen = '';
      $$('.lib-cat').forEach(c => c.classList.remove('open'));
      break;
    case 'lib-tier':
      state.libTier = id;
      renderView();
      break;
    case 'lib-clear-search':
      state.libSearch = '';
      renderView();
      break;
    case 'lib-star': {
      if(state.libFav.has(id)) state.libFav.delete(id);
      else state.libFav.add(id);
      const on = state.libFav.has(id);
      el.classList.toggle('on', on);
      el.title = on ? '取消收藏' : '收藏';
      $$('.lib-stats b').forEach((b, i) => { if(i === 2) b.textContent = state.libFav.size; });
      toast(on ? '已收藏' : '已取消收藏');
      break;
    }
    case 'lib-apply': {
      const item = libFindItem(id);
      if(item && item.map && item.map.key){
        state.params[item.map.key] = item.map.value;
        const keyName = {
          N:'电堆片数', area:'有效面积', pH2:'氢气压力', pAir:'空气压力',
          lambdaH2:'氢气计量比', lambdaAir:'空气计量比', dT:'温差 ΔT',
          T:'电堆温度', memThk:'膜厚度', ptLoading:'Pt 载量', gdlThk:'GDL 厚度',
          coolFlow:'冷却流量', dpH2:'氢侧压降', dpAir:'空气侧压降',
          cellThk:'单片厚度', bppThk:'双极板厚度', compress:'封装压缩力',
          contactR:'接触电阻', coatThk:'涂层厚度', gdlPorosity:'GDL 孔隙率',
          ionomer:'离聚物含量', mplThk:'MPL 厚度', cmpEff:'空压机效率',
          cmpRatio:'空压机压比', dcdcEff:'DC-DC 效率', purgePeriod:'吹扫周期',
          purgeDur:'吹扫时长', radMargin:'散热器裕度', altitude:'海拔',
          Tamb:'环境温度', rh:'进气湿度', purH2:'氢气纯度',
        }[item.map.key] || item.map.key;
        toast(`已应用到电堆仿真：${keyName} = ${item.map.value}`);
      } else {
        toast('该参数不支持一键应用');
      }
      break;
    }

    case 'kb-cat-toggle': {
      state.kbCatOpen[id] = state.kbCatOpen[id] === false ? true : false;
      const c = document.querySelector(`[data-kbcat="${id}"]`);
      if(c) c.classList.toggle('open', state.kbCatOpen[id]);
      break;
    }
    case 'kb-entry-toggle': {
      state.kbOpen[id] = !state.kbOpen[id];
      const entry = document.querySelector(`[data-kbid="${id}"]`);
      if(entry){
        entry.classList.toggle('open', state.kbOpen[id]);
        const summary = entry.querySelector('.kb-entry-summary');
        if(state.kbOpen[id] && summary) summary.style.display = 'none';
        else if(!state.kbOpen[id] && !summary) renderView();
        else if(summary) summary.style.display = '';
      }
      break;
    }
    case 'kb-expand-all':
      KB_CATS.forEach(cat => { state.kbCatOpen[cat.id] = true; cat.entries.forEach(e => state.kbOpen[e.id] = true); });
      renderView();
      toast('已展开全部分类与详情');
      break;
    case 'kb-collapse-all':
      KB_CATS.forEach(cat => { state.kbCatOpen[cat.id] = false; cat.entries.forEach(e => state.kbOpen[e.id] = false); });
      renderView();
      toast('已折叠全部');
      break;
    case 'kb-expand-detail':
      KB_CATS.forEach(cat => { state.kbCatOpen[cat.id] = true; cat.entries.forEach(e => state.kbOpen[e.id] = true); });
      renderView();
      toast('已展开全部电堆知识详情');
      break;
    case 'kb-clear-search':
      state.kbSearch = '';
      renderView();
      break;

    case 'mon-auto': {
      state.mon.auto = id === 'auto';
      renderView();
      toast(state.mon.auto ? '监控已切换为自动跟随工作台' : '监控已切换为手动调节');
      break;
    }
    case 'mon-reset': {
      state.mon.over = {
        power: state.params.stackPower, T: state.params.T, pH2: state.params.pH2,
        pAir: state.params.pAir, lamAir: state.params.lambdaAir,
      };
      renderView();
      toast('已重置为工作台参数');
      break;
    }

    case 'data-metric': {
      state.dataMetrics[id] = !state.dataMetrics[id];
      el.classList.toggle('on', state.dataMetrics[id]);
      const cb = el.querySelector('input');
      if(cb) cb.checked = state.dataMetrics[id];
      afterData();
      break;
    }

    case 'apply-preset': {
      const p = PRESETS[+id];
      if(p){
        Object.assign(state.params, {
          stackPower:p.stackPower, N:p.N, area:p.area, T:p.T, pH2:p.pH2, pAir:p.pAir || 0.20,
          R:p.R, Aact:p.Aact, i0:p.i0, m:p.m, n:p.n, dT:p.dT,
          memThk:p.memThk || 15, ptLoading:p.ptLoading || 0.25, gdlThk:p.gdlThk || 200,
          cellThk:p.cellThk || 1.5, bppThk:p.bppThk || 0.4,
          cmpRatio:p.cmpRatio || 2.5, cmpEff:p.cmpEff || 0.72,
        });
        state.presetIdx = +id;
        renderView();
        toast('已应用电堆预设：' + p.name);
      }
      break;
    }
    case 'cmp-run': runCompare(); break;
    case 'report': reportAction(id); break;
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  const key = el.dataset && el.dataset.bind;
  if(key && (el.tagName === 'INPUT' || el.tagName === 'SELECT')){
    if(el.type === 'number' || el.type === 'range'){
      const v = parseFloat(el.value);
      if(!isNaN(v)) state.params[key] = v;
    } else state.params[key] = el.value;
    if(state.view === 'dashboard') updateLiveValues();
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if(el.tagName === 'SELECT' && el.dataset && el.dataset.bind){
    state.params[el.dataset.bind] = el.value;
  }
});

function defaultParams(){
  return {
    stackPower:150, N:370, area:420, cellThk:1.5, bppThk:0.40, compress:1.2, dT:5.5,
    T:82, Tamb:25, altitude:0, pH2:0.19, pAir:0.20, lambdaH2:1.12, lambdaAir:2.3,
    purH2:5.0, rh:45, stoichMode:'auto',
    memType:'gore', memThk:15, ptLoading:0.25, catType:'ptco',
    gdlThk:200, gdlPorosity:76, ionomer:30, mplThk:30,
    memBrand:'gore', catBrand:'tanakaCo', ptAlloy:'ptco', support:'ketjen',
    gdlBrand:'sgl29bc', mplBrand:'sgl', ionomerType:'nafion',
    bppMat:'ti', flowField:'3d', coating:'tin', coatThk:120, contactR:5,
    bppBrand:'ti-g1', bppCoatingBrand:'tin-1', sealType:'fkm', gasketType:'ptfe', endPlate:'cf',
    R:0.095, Aact:0.0085, i0:0.0018, m:2.2e-5, n:4,
    coolFlow:120, coolType:'eg50', dpH2:15, dpAir:22, radMargin:20, pumpEff:0.65,
    cmpType:'centri', cmpEff:0.72, cmpRatio:2.5, dcdcEff:0.98, recirc:'ejector',
    purgePeriod:15, purgeDur:0.9,
    optMode:'balanced', adaptive:'on', sohWeight:50,
  };
}

function reportAction(id){
  // Only claim a file was created when the browser download is actually triggered.
  if(id === 'csv' || id === 'export'){
    const rows = [['参数','当前值']];
    Object.entries(state.params || {}).forEach(([key,value]) => rows.push([key,value]));
    const csv = '\uFEFF' + rows.map(row => row.map(v => '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'HyHub_当前工况参数.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('当前工况参数 CSV 已触发下载');
    return;
  }
  const names = {
    pdf:'PDF 工程报告', replay:'历史数据回放', fault:'故障诊断报告',
    bench:'全球电堆对标报告', trend:'运行趋势报告', trace:'数据溯源报告'
  };
  toast((names[id] || '该功能') + '尚未接入真实数据或文件生成流程，当前未生成报告。');
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if(state.view === 'monitor') tickMonitor();
    if(state.view === 'data') afterData();
    if(state.view === 'model') drawModelCharts();
  }, 200);
});

(async function bootWithDomainCore(){
  try{
    window.FuelCellDomain = await import('../../src/domain/index.js');
  }catch(error){
    console.error('FuelCell domain core failed to load',error);
    toast('科学计算核心加载失败，请刷新页面或检查网络');
    return;
  }
  renderNav();
  navigate('dashboard');
  $('#chipPower').textContent = state.params.stackPower + ' kW';
})();

console.log('%c氢枢 HyHub %cV2.0 大模型版',
  'font-size:16px;font-weight:800;color:#0a84ff',
  'font-size:12px;color:#7d8fb3');
console.log('%c设计者：戴煜 · 燃料电池研发工程师',
  'font-size:11px;color:#a78bfa;font-weight:600');
console.log('%c联系方式：18662613315@163.com',
  'font-size:11px;color:#7fa8d4');
console.log('%c版权所有 © 2026 戴煜 · 保留所有权利',
  'font-size:11px;color:#5f7391');
console.log('%c燃料电池电堆全能平台 · 参数库 22 类 / 知识库 13 类 / 全球数据库 12 款机型 / AI 大模型',
  'font-size:11px;color:#00d48a');
console.log('%c★ V2.0 更新：单位修正 + 动态大模型视图（LSTM/PINN/GNN/Transformer）+ MEA/双极板选型参数 + 全球数据库对标 + 大模型数字孪生',
  'font-size:11px;color:#ff9f0a;font-weight:600');
