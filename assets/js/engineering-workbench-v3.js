/* HyHub engineering workbench v3.
   Rebuilds the dashboard around the solver, energy balance, and parameter inspector.
   Existing calculation functions and live-value keys remain the source of truth. */
(function () {
  'use strict';

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
    });
  }

  function metricCard(item) {
    return '<article class="fc-live-metric">' +
      '<span>' + item[0] + '</span>' +
      '<strong data-live="' + item[1] + '">—<small>' + item[2] + '</small></strong>' +
      '<small>' + item[3] + '</small></article>';
  }

  window.renderEngineeringWorkbench = function () {
    const result = solveSystem();
    const target = Number(state.params.stackPower);
    const sliderPct = (target - 10) / 390 * 100;
    const metrics = [
      ['电流密度','i','A/cm²','活性面积口径'],
      ['单片电压','Vc','V','单电池平均值'],
      ['电堆效率','etaStack','%','模型效率'],
      ['氢气消耗','mH2','kg/h','氢气进料模型值'],
      ['电堆电压','Vstack','V','串联堆总压'],
      ['电堆电流','I','A','串联堆电流'],
      ['体积功率密度','vpd','kW/L','堆体积口径'],
      ['质量比功率','sp','kW/kg','堆质量口径'],
      ['产热功率','Q','kW','效率反算估计'],
      ['冷却流量','flow','L/min','模型流量'],
      ['净功率','Pnet','kW','扣除辅机后的输出'],
      ['辅机占比','bopPct','%','相对电堆总功率']
    ];
    const powerLosses = [
      ['空压机', result.pCmp, 'pCmp', '#2b9bc3'],
      ['冷却水泵', result.pPump, 'pPump', '#20a58b'],
      ['氢循环', result.pRecirc, 'pRecirc', '#8878ce'],
      ['DC-DC 损耗', result.pDcdc, 'pDcdc', '#cf9a42']
    ];
    const tierButtonsHtml = TIERS.map(function (tier) {
      const selected = tier.id === result.tier.id;
      return '<button type="button" class="fc-tier-option ' + (selected ? 'active' : '') +
        '" data-action="preset-tier" data-id="' + safe(tier.id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
        '<i style="background:' + safe(tier.color) + '"></i><span>' + safe(tier.name) +
        '</span><small>' + safe(tier.min) + '–' + safe(tier.max) + ' kW</small></button>';
    }).join('');
    const presetButtonsHtml = PRESETS.map(function (preset, index) {
      return '<button type="button" class="fc-preset ' + (state.presetIdx === index ? 'active' : '') +
        '" data-action="apply-preset" data-id="' + index + '">' + safe(preset.name) + '</button>';
    }).join('');
    const parameterGroupsHtml = PARAM_GROUPS.map(function (group) {
      const open = !!state.paramOpen[group.id];
      return '<section class="param-group ' + (open ? 'open' : '') + '" data-pgroup="' + safe(group.id) + '">' +
        '<button type="button" class="param-group-head" data-action="param-toggle" data-id="' + safe(group.id) +
        '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="pgi">' + safe(group.ico) + '</span><span class="fc-param-group-copy"><b>' + safe(group.name) +
        '</b><small>' + safe(group.desc) + '</small></span><span class="pcount">' + group.items.length +
        ' 项</span><span class="pchev">›</span></button>' +
        '<div class="param-group-body">' + group.items.map(function (item) { return paramItemHtml(item); }).join('') +
        '</div></section>';
    }).join('');
    return '<section class="fc-engineering-workspace" aria-label="燃料电池电堆工程控制台">' +
      '<header class="fc-workspace-head"><div>' +
        '<div class="fc-breadcrumb">ENGINEERING / STACK MODEL / OPERATING POINT</div>' +
        '<h2>电堆工程控制台</h2>' +
        '<p>以工况求解为中心组织能量平衡、关键性能、参数检查和制造商公开规格。当前数值来自本地公式模型，不代表台架实测。</p>' +
      '</div><div class="fc-workspace-status"><span class="fc-status-pill"><i></i>本地模型 · 只读</span>' +
        '<span class="fc-status-caption">未连接真实台架</span></div></header>' +

      '<section class="fc-command-deck" aria-label="工况设定与求解摘要">' +
        '<div class="fc-setpoint-panel"><div class="fc-panel-kicker">OPERATING POINT</div>' +
          '<div class="fc-setpoint-title">目标电堆功率</div>' +
          '<div class="fc-power-readout"><strong id="pNum">' + safe(target) + '</strong><span>kW</span></div>' +
          '<div class="fc-setpoint-meta"><span>目标扫描范围 10–400 kW</span>' +
            '<span id="tierTag" class="fc-tier-tag" style="background:' + safe(result.tier.color) + '22;color:' + safe(result.tier.color) +
            ';border-color:' + safe(result.tier.color) + '66">' + safe(result.tier.name) + '型 · ' + safe(result.tier.min) + '–' + safe(result.tier.max) + ' kW</span></div>' +
          '<label class="fc-slider-label" for="pSlider">调整目标工况</label>' +
          '<input type="range" id="pSlider" min="10" max="400" step="1" value="' + safe(target) + '" style="--p:' + sliderPct + '%" aria-label="目标电堆功率（千瓦）">' +
          '<div class="fc-slider-scale"><span>10</span><span>100</span><span>200</span><span>300</span><span>400 kW</span></div>' +
        '</div>' +
        '<div class="fc-live-panel"><div class="fc-panel-heading"><div><span class="fc-panel-kicker">SOLVER OUTPUT</span><h3>工况计算结果</h3></div>' +
          '<span class="fc-derived-label">MODEL-DERIVED · NOT MEASURED</span></div>' +
          '<div class="fc-live-metrics" id="autoGrid">' + metrics.map(metricCard).join('') + '</div></div>' +
      '</section>' +

      (result.powerLimited ? '<div class="fc-model-warning" role="alert">目标功率超过当前参数组合的模型峰值。页面显示模型可行峰值工况，不代表达到额定目标。</div>' :
       result.powerFloorLimited ? '<div class="fc-model-warning" role="alert">目标功率低于求解器扫描范围内的最低可行功率。当前结果使用最低扫描工况；请勿将其解释为目标功率已实现。</div>' :
       result.netPowerDeficit ? '<div class="fc-model-warning" role="alert">辅机总功耗不低于电堆输出，当前模型没有正净输出；系统效率按 0 计。</div>' : '') +

      '<div class="fc-engineering-grid"><main class="fc-engineering-primary">' +
        '<section class="fc-work-panel fc-energy-panel" aria-labelledby="fc-energy-title">' +
          '<div class="fc-section-heading"><div><span class="fc-panel-kicker">SYSTEM ENERGY BALANCE</span><h3 id="fc-energy-title">电堆能量流与辅机负载</h3>' +
          '<p>由当前求解器工况生成；功率口径和模型假设随结果一起展示。</p></div><span class="fc-source-chip">本地公式计算</span></div>' +
          '<div class="fc-power-flow__track">' +
            '<article class="fc-flow-node fc-flow-reactants"><span class="fc-flow-label">反应物供给</span><strong>H₂ / Air</strong>' +
              '<div class="fc-flow-value" data-live="mH2">—<small>kg H₂ / h</small></div><small>氢气进料模型值</small></article>' +
            '<div class="fc-flow-connector" aria-hidden="true"><i></i><span>电化学反应</span></div>' +
            '<article class="fc-flow-node fc-flow-stack"><span class="fc-flow-label">STACK · 电堆</span>' +
              '<strong class="fc-flow-primary" data-live="Pstack">—<small>kW</small></strong>' +
              '<div class="fc-flow-pair"><span>电压 <b data-live="Vstack">—<small>V</small></b></span><span>电流 <b data-live="I">—<small>A</small></b></span></div></article>' +
            '<div class="fc-flow-connector" aria-hidden="true"><i></i><span>功率分配</span></div>' +
            '<article class="fc-flow-node fc-flow-output"><span class="fc-flow-label">净电功率 · 可用输出</span>' +
              '<strong class="fc-flow-primary" data-live="Pnet">—<small>kW</small></strong><small>扣除模型中的辅机与 DC-DC 损耗</small></article>' +
          '</div>' +
          '<div class="fc-flow-losses"><div class="fc-flow-loss"><span>空压机</span><b data-live="pCmp">—<small>kW</small></b></div>' +
            '<div class="fc-flow-loss"><span>冷却水泵</span><b data-live="pPump">—<small>kW</small></b></div>' +
            '<div class="fc-flow-loss"><span>氢循环</span><b data-live="pRecirc">—<small>kW</small></b></div>' +
            '<div class="fc-flow-loss"><span>DC-DC 损耗</span><b data-live="pDcdc">—<small>kW</small></b></div>' +
            '<div class="fc-flow-loss fc-flow-heat"><span>电堆产热估算</span><b data-live="Q">—<small>kW</small></b></div>' +
            '<div class="fc-flow-loss fc-flow-eff"><span>电堆效率</span><b data-live="etaStack">—<small>%</small></b></div></div>' +
        '</section>' +

        '<section class="fc-results-grid" aria-label="关键工程结果">' + coreMetricCards() + '</section>' +

        '<section class="fc-work-panel fc-bop-panel" aria-labelledby="fc-bop-title">' +
          '<div class="fc-section-heading"><div><span class="fc-panel-kicker">BALANCE OF PLANT</span><h3 id="fc-bop-title">辅机功耗分配</h3>' +
          '<p>分项基于当前模型工况，比例仅在同一工况内比较。</p></div><strong class="fc-bop-total">' + fmt(result.pBop,2) + ' kW</strong></div>' +
          '<div class="fc-bop-rows">' + powerLosses.map(function (item) { return '<div class="fc-bop-row" data-bop="' + item[2] + '">' +
            '<span>' + item[0] + '</span><div><i style="width:' + Math.min(item[1]/Math.max(result.pBop,0.01)*100,100) + '%;background:' + item[3] + '"></i></div>' +
            '<b data-live="' + item[2] + '">' + fmt(item[1],2) + '<small> kW</small></b></div>'; }).join('') +
          '</div><div class="fc-bop-foot"><span>辅机功耗占电堆输出</span><strong>' + fmt(result.pBop/Math.max(result.Pstack,0.01)*100,1) + '%</strong></div></section>' +

        '<section class="fc-work-panel fc-reference-panel" aria-labelledby="fc-reference-title">' +
          '<div class="fc-section-heading"><div><span class="fc-panel-kicker">PUBLISHED REFERENCE DATA</span>' +
          '<h3 id="fc-reference-title">制造商公开规格库 <span class="fc-reference-count">' + GLOBAL_DB.length + ' 条</span></h3>' +
          '<p>只展示公开来源明确披露的字段；净功率、堆功率与系统边界不混合排名。</p></div><span class="fc-source-chip">逐条来源链接</span></div>' +
          '<div class="fc-reference-table-wrap"><table class="fc-reference-table"><thead><tr><th>产品 / 来源</th><th>产品边界</th><th>公开功率口径</th><th>净系统输出</th><th>单电池数</th><th>体积功率密度</th><th>重量功率密度</th><th>质量 / 寿命</th><th>原厂来源</th></tr></thead>' +
          '<tbody>' + referenceRows() + '</tbody></table></div>' +
          '<p class="fc-reference-disclaimer">比较前请核对 gross / net、额定工况、系统边界与测试标准。来源未披露的参数保持空缺，不推算、不用于模型校准。</p>' +
        '</section>' +
      '</main>' +

      '<aside class="fc-engineering-inspector" aria-label="模型参数与工况设置">' +
        '<section class="fc-inspector-card fc-profile-card"><div class="fc-panel-kicker">STACK CLASSIFICATION</div><h3>电堆功率区间</h3>' +
          '<div class="fc-tier-track">' + tierButtonsHtml + '</div>' +
          '<p class="fc-tier-description"><b>当前区间：</b>' + safe(result.tier.scenes) + '</p>' +
          '<div class="fc-preset-label">快速工况预设</div><div class="fc-preset-grid">' + presetButtonsHtml + '</div></section>' +
        '<section class="fc-inspector-card fc-parameter-inspector"><div class="fc-inspector-title"><div>' +
          '<div class="fc-panel-kicker">MODEL PARAMETERS</div><h3>模型参数检查器</h3>' +
          '<p>按物理子系统分组调整。变更只作用于本地模型工况，不会写入台架。</p></div></div>' +
          '<div class="fc-parameter-toolbar"><button class="btn ghost" data-action="param-expand-all">展开全部</button>' +
          '<button class="btn ghost" data-action="param-collapse-all">折叠全部</button><button class="btn ghost" data-action="param-reset">恢复默认</button></div>' +
          parameterGroups() + '</section>' +
      '</aside></div>' +

      '<footer class="fc-workspace-footer"><span>模型计算 · 公开规格可追溯 · 非台架实测</span>' +
        '<nav aria-label="工程模块快捷入口"><button type="button" data-action="nav" data-id="sim">动态仿真</button>' +
        '<button type="button" data-action="nav" data-id="calc">工程计算</button><button type="button" data-action="nav" data-id="monitor">运行监控</button>' +
        '<button type="button" data-action="nav" data-id="data">方案对比</button><button type="button" data-action="nav" data-id="lib">参数库</button>' +
        '<button type="button" data-action="nav" data-id="kb">知识库</button></nav></footer></div>';
  };

  function coreMetricCards() {
    const values = [
      ['净输出功率','Pnet','kW','扣除辅机后的输出'],
      ['电堆总功率','Pstack','kW','求解器输出'],
      ['氢气计量比','lamH2','','当前工况'],
      ['空气计量比','lamAir','','当前工况'],
      ['辅机总功耗','pBop','kW','压缩机 / 泵 / 循环 / DC-DC'],
      ['单位氢耗','gkwh','g/kWh','按净输出功率计算']
    ];
    return values.map(function (item) {
      return '<article class="fc-result-card"><span>' + item[0] + '</span><strong data-live="' + item[1] + '">—<small>' +
        item[2] + '</small></strong><small>' + item[3] + '</small></article>';
    }).join('');
  }

  function tierButtons() {
    return TIERS.map(function (tier) {
      const active = tier.id === solveSystem().tier.id;
      return '<button type="button" class="fc-tier-option ' + (active ? 'active' : '') +
        '" data-action="preset-tier" data-id="' + safe(tier.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        '<i style="background:' + safe(tier.color) + '"></i><span>' + safe(tier.name) + '</span><small>' +
        safe(tier.min) + '–' + safe(tier.max) + ' kW</small></button>';
    }).join('');
  }

  function presetButtons() {
    return PRESETS.map(function (preset,index) {
      return '<button type="button" class="fc-preset ' + (state.presetIdx === index ? 'active' : '') +
        '" data-action="apply-preset" data-id="' + index + '">' + safe(preset.name) + '</button>';
    }).join('');
  }

  function parameterGroups() {
    return PARAM_GROUPS.map(function (group) {
      const open = !!state.paramOpen[group.id];
      return '<section class="param-group ' + (open ? 'open' : '') + '" data-pgroup="' + safe(group.id) + '">' +
        '<button type="button" class="param-group-head" data-action="param-toggle" data-id="' + safe(group.id) +
        '" aria-expanded="' + (open ? 'true' : 'false') + '"><span class="pgi">' + safe(group.ico) +
        '</span><span class="fc-param-group-copy"><b>' + safe(group.name) + '</b><small>' + safe(group.desc) +
        '</small></span><span class="pcount">' + group.items.length + ' 项</span><span class="pchev">›</span></button>' +
        '<div class="param-group-body">' + group.items.map(function (item) { return paramItemHtml(item); }).join('') +
        '</div></section>';
    }).join('');
  }

  function referenceRows() {
    return GLOBAL_DB.map(function (item) {
      const power = safe(item.p) + ' kW' + (item.powerLabel ? ' · ' + safe(item.powerLabel) : '');
      const netPower = item.netPower == null ? '未披露' :
        safe(item.netPower) + ' kW' + (item.netPowerLabel ? ' · ' + safe(item.netPowerLabel) : '');
      const massLife = [
        item.massNote || (item.systemMassKg == null ? '' : safe(item.systemMassKg) + ' kg'),
        item.serviceLifeHours == null ? '' : safe(Number(item.serviceLifeHours).toLocaleString('en-US')) + ' h（厂商标称系统寿命）'
      ].filter(Boolean).join(' / ') || '未披露';
      return '<tr><td><strong>' + safe(item.n) + '</strong><small>' + safe(item.sourceDate) + '</small></td>' +
        '<td>' + safe(item.productScope) + '</td><td>' + power + '</td><td>' + netPower + '</td>' +
        '<td>' + (item.N == null ? '未披露' : safe(item.N) + ' 片') + '</td>' +
        '<td>' + (item.vpd == null ? '未披露' : safe(item.vpd) + ' kW/L') + '</td>' +
        '<td>' + (item.sp == null ? '未披露' : safe(item.sp) + ' kW/kg') + '</td>' +
        '<td>' + safe(massLife) + '</td>' +
        '<td><a href="' + safe(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' +
        safe(item.sourceLabel) + ' ↗</a></td></tr>';
    }).join('');
  }

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
    });
  }

  const originalAfterDashboard = window.afterDashboard;
  if (typeof originalAfterDashboard === 'function') {
    window.afterDashboard = function () {
      originalAfterDashboard();
      const updateBars = function () {
        const result = solveSystem();
        const total = Math.max(Number(result.pBop) || 0, 0.01);
        [['pCmp',result.pCmp],['pPump',result.pPump],['pRecirc',result.pRecirc],['pDcdc',result.pDcdc]].forEach(function (entry) {
          const row = document.querySelector('.fc-bop-row[data-bop="' + entry[0] + '"]');
          if (!row) return;
          const bar = row.querySelector('i');
          if (bar) bar.style.width = Math.max(0,Math.min(100,(Number(entry[1]) || 0)/total*100)) + '%';
        });
        document.querySelectorAll('.fc-tier-option').forEach(function (button) {
          const active = button.dataset.id === result.tier.id;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      };
      const slider = document.getElementById('pSlider');
      if (slider) slider.addEventListener('input', updateBars);
      document.querySelectorAll('.pslider,.pnum,.pselect').forEach(function (control) {
        control.addEventListener('input', updateBars);
        control.addEventListener('change', updateBars);
      });
      document.querySelectorAll('[data-action="apply-preset"],[data-action="preset-tier"],[data-action="param-reset"]').forEach(function (button) {
        button.addEventListener('click', function () { window.setTimeout(updateBars,0); });
      });
      updateBars();
    };
  }

  // The original application boots asynchronously after importing the domain solver.
  // Let that validated boot call navigate('dashboard') using this renderer override.
})();