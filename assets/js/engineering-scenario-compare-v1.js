/* HyHub engineering scenario comparison.
   Saves local, solver-derived operating-point snapshots; no server upload and no measured-data claim. */
(function () {
  'use strict';

  const STORAGE_KEY = 'hyhub.scenario-compare.v1';
  const MAX_SCENARIOS = 4;
  const PARAM_KEYS = ['stackPower', 'N', 'area', 'T', 'pH2', 'pAir', 'R', 'Aact', 'i0', 'm', 'n'];
  const METRICS = [
    { key: 'i', label: '电流密度', unit: 'A/cm²', digits: 3 },
    { key: 'Vc', label: '单片电压', unit: 'V', digits: 3 },
    { key: 'Vstack', label: '电堆电压', unit: 'V', digits: 1 },
    { key: 'I', label: '电堆电流', unit: 'A', digits: 1 },
    { key: 'Pstack', label: '电堆输出功率', unit: 'kW', digits: 2 },
    { key: 'Pnet', label: '净输出功率', unit: 'kW', digits: 2 },
    { key: 'etaStackPct', label: '电堆效率', unit: '%', digits: 2 },
    { key: 'etaSysPct', label: '系统效率', unit: '%', digits: 2 },
    { key: 'pBop', label: '辅机总功耗', unit: 'kW', digits: 2 },
    { key: 'mH2', label: '氢气供给量', unit: 'kg/h', digits: 3 },
    { key: 'Q', label: '产热功率估算', unit: 'kW', digits: 2 },
    { key: 'flow', label: '冷却液流量', unit: 'L/min', digits: 2 }
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function readSnapshots() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{"schema":1,"scenarios":[]}');
      if (!parsed || parsed.schema !== 1 || !Array.isArray(parsed.scenarios)) return [];
      return parsed.scenarios.filter(function (item) {
        return item && typeof item.id === 'string' && typeof item.name === 'string' &&
          item.name.length > 0 && item.params && item.outputs &&
          PARAM_KEYS.every(function (key) { return Number.isFinite(Number(item.params[key])); }) &&
          METRICS.every(function (metric) { return Number.isFinite(Number(item.outputs[metric.key])); });
      }).slice(0, MAX_SCENARIOS);
    } catch (error) {
      return [];
    }
  }

  let scenarios = readSnapshots();
  let idCounter = 0;
  let refreshTimer = null;

  function makeSnapshot(name) {
    const solved = solveSystem();
    const params = {};
    PARAM_KEYS.forEach(function (key) { params[key] = Number(state.params[key]); });
    const outputs = {
      i: solved.i,
      Vc: solved.Vc,
      Vstack: solved.Vstack,
      I: solved.I,
      Pstack: solved.Pstack,
      Pnet: solved.Pnet,
      etaStackPct: solved.etaStack * 100,
      etaSysPct: solved.etaSys * 100,
      pBop: solved.pBop,
      mH2: solved.mH2,
      Q: solved.Q,
      flow: solved.flow
    };
    return {
      id: String(Date.now()) + '-' + String(++idCounter),
      name: name,
      createdAt: new Date().toISOString(),
      params: params,
      outputs: outputs
    };
  }

  function parameterSummary(snapshot) {
    const p = snapshot.params;
    return Number(p.stackPower).toFixed(0) + ' kW · ' +
      Number(p.N).toFixed(0) + ' 片 · ' +
      Number(p.area).toFixed(0) + ' cm² · ' +
      Number(p.T).toFixed(0) + ' ℃';
  }

  function formatMetric(metric, snapshot) {
    const value = Number(snapshot.outputs[metric.key]);
    return Number.isFinite(value) ? value.toFixed(metric.digits) : '—';
  }

  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间未知' :
      date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function tableHtml(current) {
    const columns = [{ id: 'current', title: '当前工况', meta: parameterSummary(current), snapshot: current }]
      .concat(scenarios.map(function (scenario) {
        return { id: scenario.id, title: scenario.name, meta: parameterSummary(scenario), snapshot: scenario };
      }));
    const head = columns.map(function (column) {
      return '<th scope="col" class="' + (column.id === 'current' ? 'is-current' : '') + '">' +
        '<strong>' + escapeHtml(column.title) + '</strong><small>' + escapeHtml(column.meta) + '</small>' +
        (column.id === 'current' ? '<em>LIVE · SOLVER</em>' : '<em>' + escapeHtml(dateLabel(column.snapshot.createdAt)) + '</em>') +
        '</th>';
    }).join('');
    const rows = METRICS.map(function (metric) {
      const cells = columns.map(function (column) {
        const selector = column.id === 'current' ? ' data-scenario-current="' + metric.key + '"' :
          ' data-scenario-saved="' + escapeHtml(column.id) + '"';
        return '<td' + selector + '>' + formatMetric(metric, column.snapshot) +
          '<small>' + escapeHtml(metric.unit) + '</small></td>';
      }).join('');
      return '<tr data-metric="' + metric.key + '"><th scope="row">' + escapeHtml(metric.label) +
        '</th>' + cells + '</tr>';
    }).join('');
    return '<div class="fc-scenario-table-wrap" role="region" aria-label="当前工况与已保存方案指标对比" tabindex="0">' +
      '<table class="fc-scenario-table"><thead><tr><th scope="col">工程指标</th>' + head +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function panelHtml() {
    const current = makeSnapshot('当前工况');
    const cards = scenarios.length ? '<div class="fc-scenario-saved-list" aria-label="已保存的本机工况方案">' +
      scenarios.map(function (scenario) {
        return '<article class="fc-scenario-saved-card"><div><strong>' + escapeHtml(scenario.name) +
          '</strong><small>' + escapeHtml(parameterSummary(scenario)) + '</small><small>保存于 ' +
          escapeHtml(dateLabel(scenario.createdAt)) + '</small></div><button type="button" class="fc-scenario-remove" ' +
          'data-scenario-action="remove" data-scenario-id="' + escapeHtml(scenario.id) +
          '" aria-label="删除方案 ' + escapeHtml(scenario.name) + '">移除</button></article>';
      }).join('') + '</div>' :
      '<div class="fc-scenario-empty"><strong>还没有保存的对比方案</strong><span>先调整功率、片数、面积或操作温度，再保存工况。当前工况会实时更新，可与历史快照并排检查。</span></div>';
    const atLimit = scenarios.length >= MAX_SCENARIOS;
    return '<section class="fc-work-panel fc-scenario-compare" aria-labelledby="fc-scenario-title">' +
      '<div class="fc-section-heading"><div><span class="fc-panel-kicker">SCENARIO ENGINEERING · LOCAL SNAPSHOTS</span>' +
      '<h3 id="fc-scenario-title">工况方案对比</h3><p>把参数组合与求解器结果成对保存，比较净功率、效率、氢耗、产热与冷却负荷；不覆盖原工况。</p></div>' +
      '<span class="fc-source-chip">本机快照 · 非实测</span></div>' +
      '<div class="fc-scenario-toolbar"><label for="fcScenarioName">方案名称</label>' +
      '<input id="fcScenarioName" type="text" maxlength="36" placeholder="例如：低温 100 kW / 高压方案" ' +
      'aria-describedby="fcScenarioHelp"><button type="button" id="fcScenarioSave" data-scenario-action="save" ' +
      (atLimit ? 'disabled' : '') + '>保存当前工况</button>' +
      (scenarios.length ? '<button type="button" class="fc-scenario-clear" data-scenario-action="clear">清空快照</button>' : '') +
      '<small id="fcScenarioHelp">最多保存 ' + MAX_SCENARIOS + ' 组，仅存于当前浏览器。</small></div>' +
      cards + tableHtml(current) +
      '<p class="fc-scenario-disclaimer">对比结果实时求解当前输入；已保存列为保存时刻的模型输出快照。模型仍含经验近似，所有数据均非台架实测，不能单凭此表判定真实系统性能。</p>' +
      '</section>';
  }

  function refreshPanel() {
    const panel = document.querySelector('#content .fc-scenario-compare');
    if (!panel) return;
    panel.outerHTML = panelHtml();
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, scenarios: scenarios }));
      return true;
    } catch (error) {
      if (typeof toast === 'function') toast('本机存储不可用，方案未保存');
      return false;
    }
  }

  function renderWithScenarioPanel() {
    const html = originalRenderer.apply(this, arguments);
    return html.replace('</main>', panelHtml() + '</main>');
  }

  const originalRenderer = window.renderEngineeringWorkbench;
  if (typeof originalRenderer === 'function') {
    window.renderEngineeringWorkbench = renderWithScenarioPanel;
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-scenario-action]');
    if (!button) return;
    const action = button.getAttribute('data-scenario-action');
    if (action === 'save') {
      const input = document.getElementById('fcScenarioName');
      const name = input ? input.value.trim() : '';
      if (!name) {
        if (typeof toast === 'function') toast('请先填写方案名称');
        else if (input) input.focus();
        return;
      }
      if (scenarios.length >= MAX_SCENARIOS) {
        if (typeof toast === 'function') toast('最多保存 ' + MAX_SCENARIOS + ' 组方案，请先移除旧快照');
        return;
      }
      scenarios.push(makeSnapshot(name.slice(0, 36)));
      if (persist()) refreshPanel();
      return;
    }
    if (action === 'remove') {
      const id = button.getAttribute('data-scenario-id');
      scenarios = scenarios.filter(function (scenario) { return scenario.id !== id; });
      persist();
      refreshPanel();
      return;
    }
    if (action === 'clear') {
      scenarios = [];
      persist();
      refreshPanel();
    }
  });

  document.addEventListener('input', function (event) {
    if (!event.target.matches('#pSlider, .pslider, .pnum, .pselect')) return;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      refreshTimer = null;
      refreshPanel();
    }, 50);
  });
  document.addEventListener('change', function (event) {
    if (!event.target.matches('#pSlider, .pslider, .pnum, .pselect')) return;
    refreshPanel();
  });
})();