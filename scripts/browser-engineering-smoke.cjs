'use strict';

const { chromium } = require('playwright');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const assertNoRuntimeErrors = stage => {
    if (pageErrors.length) throw new Error(stage + ' browser runtime errors: ' + pageErrors.join(' | '));
  };

  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(250);
    const cockpitBootstrap = await page.evaluate(() => ({
      appScript: [...document.scripts].some(node => node.src.includes('engineering-workbench-v3.js')),
      scriptLoaded: typeof window.renderEngineeringWorkbench === 'function',
      navigateAvailable: typeof window.navigate === 'function',
      dashboardRoot: !!document.querySelector('#content .fc-engineering-workspace'),
      pageTitle: document.querySelector('#pageTitle')?.textContent || '',
      contentStart: document.querySelector('#content')?.innerText.slice(0,240) || ''
    }));
    if (!cockpitBootstrap.appScript || !cockpitBootstrap.scriptLoaded || !cockpitBootstrap.navigateAvailable ||
        !cockpitBootstrap.dashboardRoot) {
      throw new Error('Engineering cockpit bootstrap failed: ' + JSON.stringify({state:cockpitBootstrap,pageErrors}));
    }
    const referenceStylesheet = page.locator('link[rel="stylesheet"][href*="reference-platform-v4.css"]');
    if (await referenceStylesheet.count() !== 1) throw new Error('Reference engineering workbench stylesheet is not linked');
    const referenceCssResponse = await page.request.get(await referenceStylesheet.evaluate(node => node.href));
    const referenceCssText = await referenceCssResponse.text();
    const engineeringLayout = await page.locator('.app').evaluate(node => ({
      display: getComputedStyle(node).display,
      columns: getComputedStyle(node).gridTemplateColumns
    }));
    if (!referenceCssResponse.ok() || !referenceCssText.includes('--ref-bg:#eef3f6') ||
        engineeringLayout.display !== 'grid' || !engineeringLayout.columns.startsWith('260px')) {
      throw new Error('Reference engineering layout was not loaded/applied: ' + JSON.stringify(engineeringLayout));
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    const wideShell = await page.evaluate(() => {
      const rect = selector => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      return {
        viewport: innerWidth,
        app: rect('.app'),
        main: rect('.main'),
        content: rect('#content')
      };
    });
    if (!wideShell.app || !wideShell.main || !wideShell.content ||
        wideShell.app.width < wideShell.viewport * 0.94 ||
        wideShell.content.width < wideShell.main.width * 0.88 ||
        wideShell.content.left < wideShell.main.left ||
        wideShell.content.right > wideShell.main.right + 2) {
      throw new Error('FuelCell desktop workspace is constrained or offset instead of filling its main column: ' + JSON.stringify(wideShell));
    }

    await page.waitForFunction(() => document.querySelector('.fc-engineering-workspace'));
    const referenceWorkspace = await page.locator('#content .fc-engineering-workspace').count();
    if (referenceWorkspace !== 1) throw new Error('FuelCell reference engineering workspace is not mounted as the dashboard');
    const referenceBoot = await page.locator('script[src*="reference-shell-v4-boot.js"]').getAttribute('src');
    if (!referenceBoot || !referenceBoot.includes('v=20261022-reference-v6')) {
      throw new Error('FuelCell route-safe reference boot cache version is missing');
    }

    const skipLink = page.locator('a.skip-link[href="#main-content"]');
    if (await skipLink.count() !== 1) throw new Error('Keyboard skip-navigation link is missing');
    await page.keyboard.press('Tab');
    const firstKeyboardTarget = await page.evaluate(() => document.activeElement?.classList.contains('skip-link'));
    if (!firstKeyboardTarget) throw new Error('Skip navigation is not the first keyboard focus target');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('id') === 'main-content');

    const commandTrigger = page.locator('.w5-command-trigger');
    if (await commandTrigger.count() !== 1) throw new Error('Quick navigation trigger is missing');
    await commandTrigger.click();
    const commandDialog = page.locator('#w5-command-dialog');
    await commandDialog.waitFor({ state: 'visible' });
    const commandSemantics = await page.evaluate(() => {
      const trigger = document.querySelector('.w5-command-trigger');
      const dialog = document.querySelector('#w5-command-dialog');
      const input = document.querySelector('#w5-command-input');
      const list = document.querySelector('#w5-command-list');
      const activeId = input?.getAttribute('aria-activedescendant');
      return {
        triggerControls: trigger?.getAttribute('aria-controls'),
        dialogRole: dialog?.getAttribute('role'),
        dialogLabelledBy: dialog?.getAttribute('aria-labelledby'),
        inputControls: input?.getAttribute('aria-controls'),
        listRole: list?.getAttribute('role'),
        activeExists: !!activeId && !!document.getElementById(activeId),
        focusInside: !!dialog?.contains(document.activeElement)
      };
    });
    if (commandSemantics.triggerControls !== 'w5-command-dialog' ||
        commandSemantics.dialogRole !== 'dialog' || !commandSemantics.dialogLabelledBy ||
        commandSemantics.inputControls !== 'w5-command-list' || commandSemantics.listRole !== 'listbox' ||
        !commandSemantics.activeExists || !commandSemantics.focusInside) {
      throw new Error('Quick navigation dialog semantics or initial focus failed: ' + JSON.stringify(commandSemantics));
    }
    await page.locator('#w5-command-input').focus();
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => document.activeElement?.classList.contains('w5-command-close')))) {
      throw new Error('Quick navigation Tab sequence did not remain within the modal');
    }
    await page.keyboard.press('Shift+Tab');
    if (await page.locator('#w5-command-input').evaluate(node => document.activeElement !== node)) {
      throw new Error('Quick navigation Shift+Tab sequence did not remain within the modal');
    }
    await page.keyboard.press('Escape');
    if (await page.locator('#w5-command-dialog').isVisible() ||
        !(await page.evaluate(() => document.activeElement?.classList.contains('w5-command-trigger')))) {
      throw new Error('Quick navigation close did not restore focus to its trigger');
    }
    await page.waitForSelector('#content .fc-engineering-workspace .fc-reference-table tbody tr');
    const referenceEvidence = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('#content .fc-reference-table tbody tr')].map(row => ({
        title: row.querySelector('strong')?.textContent || '',
        source: row.querySelector('a[href]')?.href || ''
      })),
      text: document.querySelector('#content')?.innerText || ''
    }));
    if (referenceEvidence.cards.length !== 5 ||
        referenceEvidence.cards.some(card => !card.title || !/^https:\/\//.test(card.source)) ||
        referenceEvidence.text.includes('全球领先体积功率密度') ||
        referenceEvidence.text.includes('42,847') ||
        !referenceEvidence.text.includes('4.4 kW/L') ||
        !referenceEvidence.text.includes('5.4 kW/kg') ||
        !referenceEvidence.text.includes('110 kW') ||
        !referenceEvidence.text.includes('94 kW') ||
        !referenceEvidence.text.includes('117 kW') ||
        !referenceEvidence.text.includes('25,000 h') ||
        referenceEvidence.text.includes('最近同步')) {
      throw new Error('Manufacturer source-backed reference or demo-data provenance failed: ' + JSON.stringify(referenceEvidence));
    }

    await page.waitForFunction(() => !!window.FuelCellDomain &&
      document.querySelector('#sideNav .nav-item[data-id="dashboard"]') &&
      document.querySelector('#autoGrid [data-live="Vc"]'));
    const dashboard = await page.locator('#autoGrid [data-live]').allTextContents();
    if (dashboard.length < 10 || dashboard.some(value => value.trim() === '—')) {
      throw new Error('Dashboard did not render computed stack metrics: ' + JSON.stringify(dashboard));
    }

    const engineeringWorkbench = await page.evaluate(() => {
      const root = document.querySelector('#content .fc-engineering-workspace');
      const main = document.querySelector('#main-content');
      const inspector = root?.querySelector('.fc-engineering-inspector');
      const primary = root?.querySelector('.fc-engineering-primary');
      const rect = node => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, top: box.top, bottom: box.bottom };
      };
      return {
        present: !!root,
        oldPromoGone: !root?.querySelector('.dashboard-command'),
        main: rect(main),
        primary: rect(primary),
        inspector: rect(inspector),
        metricCards: root?.querySelectorAll('.fc-live-metric').length || 0,
        parameterGroups: root?.querySelectorAll('.fc-parameter-inspector .param-group').length || 0
      };
    });
    if (!engineeringWorkbench.present || !engineeringWorkbench.oldPromoGone ||
        engineeringWorkbench.metricCards !== 12 || engineeringWorkbench.parameterGroups < 4 ||
        !engineeringWorkbench.primary || !engineeringWorkbench.inspector ||
        engineeringWorkbench.inspector.left < engineeringWorkbench.primary.right - 2 ||
        engineeringWorkbench.inspector.right > engineeringWorkbench.main.right + 2) {
      throw new Error('FuelCell product-level engineering workbench structure or inspector geometry failed: ' +
        JSON.stringify(engineeringWorkbench));
    }


    const scenarioPanel = page.locator('#content .fc-scenario-compare');
    if (await scenarioPanel.count() !== 1 ||
        !(await scenarioPanel.innerText()).includes('工况方案对比') ||
        !(await scenarioPanel.innerText()).includes('本机快照')) {
      throw new Error('Engineering scenario comparison workspace did not mount with its local-data boundary');
    }
    await page.locator('#pSlider').evaluate(node => {
      node.value = '120';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => Number(document.querySelector('#pNum')?.textContent.trim()) === 120);
    await page.locator('#fcScenarioName').fill('120 kW 基准方案 A');
    await page.locator('#fcScenarioSave').click();
    await page.waitForSelector('.fc-scenario-saved-card');
    const scenarioSaved = await page.evaluate(() => ({
      name: document.querySelector('.fc-scenario-saved-card strong')?.textContent || '',
      rowCount: document.querySelectorAll('.fc-scenario-table tbody tr').length,
      currentPower: document.querySelector('[data-scenario-current="Pstack"]')?.textContent.trim() || '',
      savedPower: document.querySelector('[data-scenario-saved]')?.textContent.trim() || '',
      savedParameters: JSON.parse(localStorage.getItem('hyhub.scenario-compare.v1') || '{"scenarios":[]}').scenarios?.[0]?.params || null,
      local: JSON.parse(localStorage.getItem('hyhub.scenario-compare.v1') || '{"scenarios":[]}').scenarios?.length || 0
    }));
    if (scenarioSaved.name !== '120 kW 基准方案 A' || scenarioSaved.rowCount !== 12 ||
        !scenarioSaved.currentPower || !scenarioSaved.savedPower || scenarioSaved.local !== 1 ||
        Number(scenarioSaved.savedParameters?.stackPower) !== 120) {
      throw new Error('Scenario snapshot did not preserve a complete, locally stored set of solver outputs: ' +
        JSON.stringify(scenarioSaved));
    }
    await page.locator('#pSlider').evaluate(node => {
      node.value = '150';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const current = document.querySelector('[data-scenario-current="Pstack"]')?.textContent || '';
      const saved = document.querySelector('[data-scenario-saved]')?.textContent || '';
      return current.includes('150.00') && saved.includes('120.00');
    });
    const contrast = await page.evaluate(() => ({
      title: getComputedStyle(document.querySelector('#fc-scenario-title')).color,
      rowLabel: getComputedStyle(document.querySelector('.fc-scenario-table tbody th')).color,
      metricValue: getComputedStyle(document.querySelector('.fc-scenario-table tbody td[data-scenario-current]')).color
    }));
    if (contrast.title !== 'rgb(23, 59, 82)' ||
        contrast.rowLabel !== 'rgb(62, 91, 107)' ||
        contrast.metricValue !== 'rgb(8, 114, 126)') {
      throw new Error('Scenario comparison foreground colors were overridden by the legacy theme: ' +
        JSON.stringify(contrast));
    }
    fs.mkdirSync('artifacts', { recursive: true });
    await page.evaluate(() => document.activeElement?.blur());
    await page.locator('.fc-scenario-compare').screenshot({ path: 'artifacts/fuelcell-scenario-comparison-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileScenarioLayout = await page.evaluate(() => {
      const main = document.querySelector('.main')?.getBoundingClientRect();
      const content = document.querySelector('#content')?.getBoundingClientRect();
      const panel = document.querySelector('.fc-scenario-compare')?.getBoundingClientRect();
      const table = document.querySelector('.fc-scenario-table-wrap');
      const hint = document.querySelector('.fc-scenario-scroll-hint');
      return { viewport: innerWidth, mainWidth: main?.width, contentWidth: content?.width,
        panelLeft: panel?.left, panelRight: panel?.right, panelWidth: panel?.width,
        tableClientWidth: table?.clientWidth, tableScrollWidth: table?.scrollWidth,
        scrollHint: !!hint && getComputedStyle(hint).display !== 'none' };
    });
    if (!mobileScenarioLayout.mainWidth || mobileScenarioLayout.mainWidth < 380 ||
        !mobileScenarioLayout.contentWidth || mobileScenarioLayout.contentWidth < 360 ||
        mobileScenarioLayout.panelLeft < 0 || mobileScenarioLayout.panelRight > 391 ||
        mobileScenarioLayout.panelWidth < 340 ||
        mobileScenarioLayout.tableScrollWidth <= mobileScenarioLayout.tableClientWidth ||
        !mobileScenarioLayout.scrollHint) {
      throw new Error('Mobile scenario table does not expose its full comparison range: ' +
        JSON.stringify(mobileScenarioLayout));
    }
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.querySelector('.fc-scenario-table-wrap')?.scrollTo(0, 0);
    });
    await page.locator('.fc-scenario-compare').screenshot({ path: 'artifacts/fuelcell-scenario-comparison-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const scenarioPowerBefore = await page.locator('[data-scenario-current="Pstack"]').textContent();
    await page.locator('#pSlider').evaluate(node => {
      node.value = String(Math.min(400, Number(node.value) + 9));
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(previous => {
      const cell = document.querySelector('[data-scenario-current="Pstack"]');
      return !!cell && cell.textContent !== previous;
    }, scenarioPowerBefore);
    const savedPowerAfterEdit = await page.locator('[data-scenario-saved]').first().textContent();
    if (savedPowerAfterEdit.trim() !== scenarioSaved.savedPower) {
      throw new Error('Saved scenario snapshot changed when the live operating point was edited');
    }
    await page.locator('[data-scenario-action="remove"]').click();
    await page.waitForFunction(() =>
      !document.querySelector('.fc-scenario-saved-card') &&
      JSON.parse(localStorage.getItem('hyhub.scenario-compare.v1') || '{"scenarios":[]}').scenarios.length === 0
    );

    const oldTarget = Number(await page.locator('#pSlider').inputValue());
    await page.locator('#pSlider').evaluate((node, value) => {
      node.value = String(value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, Math.min(400, oldTarget + 7));
    await page.waitForFunction(expected => {
      const slider = document.querySelector('#pSlider');
      const readout = document.querySelector('#pNum')?.textContent.trim();
      const metric = document.querySelector('#autoGrid [data-live="Pstack"]')?.textContent || '';
      return Number(slider?.value) === expected && Number(readout) === expected && metric.trim() !== '—';
    }, Math.min(400, oldTarget + 7));
    await page.locator('#content [data-action="param-reset"]').click();
    await page.waitForFunction(() => Number(document.querySelector('#pSlider')?.value) === 150);
    const energyFlow = await page.evaluate(() => {
      const panel = document.querySelector('#content .fc-energy-panel');
      const required = ['mH2','Pstack','Vstack','I','Pnet','pCmp','pPump','pRecirc','pDcdc','Q','etaStack'];
      const values = Object.fromEntries(required.map(key => [
        key, panel?.querySelector('[data-live="' + key + '"]')?.textContent.trim() || ''
      ]));
      return { present: !!panel, heading: panel?.querySelector('h3')?.textContent || '',
        populated: required.every(key => values[key] && values[key] !== '—'), values };
    });
    if (!energyFlow.present || !energyFlow.heading.includes('能量流') || !energyFlow.populated) {
      throw new Error('Live stack energy-balance cockpit failed to render solver outputs: ' + JSON.stringify(energyFlow));
    }

    await page.locator('#sideNav .nav-item[data-id="sim"]').click();
    await page.waitForSelector('#content .mode[data-id="dynamic"]');
    // Re-fire the late startup fallback deliberately: it must not replace an
    // active simulation route with the engineering dashboard.
    await page.evaluate(() => window.dispatchEvent(new Event('load')));
    await page.waitForTimeout(240);
    const routeAfterLateLoad = await page.evaluate(() => ({
      view: typeof state !== 'undefined' ? state.view : '',
      dynamicMode: !!document.querySelector('#content .mode[data-id="dynamic"]')
    }));
    if (routeAfterLateLoad.view !== 'sim' || !routeAfterLateLoad.dynamicMode) {
      throw new Error('Late engineering shell boot overwrote the active simulation route: ' + JSON.stringify(routeAfterLateLoad));
    }
    await page.locator('#content .mode[data-id="dynamic"]').click();
    await page.locator('#content [data-action="sim-run"]').click();
    await page.waitForSelector('#simResult canvas');
    if (await page.locator('#simResult canvas').count() < 1 ||
        await page.locator('#simResult .kpi').count() < 2) {
      throw new Error('Dynamic simulation did not produce charts and engineering KPIs');
    }
    const slider = page.locator('#content .sim-slider').first();
    const oldValue = await slider.inputValue();
    await slider.evaluate((el, value) => {
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, Number(oldValue) + 5);
    const sliderLabel = await page.locator('#simPVal').textContent();
    if (!sliderLabel.includes(String(Number(oldValue) + 5))) {
      throw new Error('Simulation parameter slider did not update its visible value');
    }

    const waitForSimulationChartPaint = () => page.waitForFunction(() => {
      const canvas = document.querySelector('#simResult canvas');
      if (!canvas || canvas.width < 200 || canvas.height < 100) return false;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let inkedPixels = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) inkedPixels += 1;
      return inkedPixels > 100;
    }, null, { timeout: 10000 });

    // Prove that an edited operating point is consumed by the solver output, not just echoed in its label.
    const adjustedPower = Number(oldValue) + 5;
    await page.locator('#content [data-action="sim-run"]').click();
    await waitForSimulationChartPaint();
    await page.waitForFunction(expectedPeak => {
      const result = document.querySelector('#simResult')?.innerText || '';
      return result.includes('假设瞬态峰值') && result.includes(String(expectedPeak));
    }, Math.round(adjustedPower * 1.05));
    const adjustedCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('#simResult canvas');
      if (!canvas || canvas.width < 200 || canvas.height < 100) return { width: 0, height: 0, inkedPixels: 0 };
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let inkedPixels = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) inkedPixels += 1;
      return { width: canvas.width, height: canvas.height, inkedPixels };
    });
    if (adjustedCanvas.width < 200 || adjustedCanvas.inkedPixels < 100) {
      throw new Error('Dynamic simulation chart did not paint visible data after the operating point changed: ' + JSON.stringify(adjustedCanvas));
    }

    // Reset must restore the default operating point and the next simulation must use it.
    await page.locator('#content [data-action="sim-reset"]').click();
    await page.waitForFunction(() => {
      const slider = document.querySelector('#content .sim-slider');
      return !!slider && Number(slider.value) === 150 &&
        (document.querySelector('#simPVal')?.textContent || '').trim() === '150 kW';
    });
    await page.locator('#content [data-action="sim-run"]').click();
    await page.waitForFunction(() => (document.querySelector('#simResult')?.innerText || '')
      .includes('假设瞬态峰值') && (document.querySelector('#simResult')?.innerText || '').includes('158'));

    // Exercise every advertised simulation mode and prove each one paints a non-empty chart.
    const simulationModes = [
      ['steady', '电堆效率'],
      ['dynamic', '响应模型时间常数'],
      ['cold', '启动响应时间假设'],
      ['durab', '假设老化模型 SOH'],
      ['bench', '合成样本 RMSE'],
      ['limit', '80℃模型边界电流密度'],
      ['eis', '欧姆阻抗 R_ohm'],
      ['cv', 'ECSA'],
      ['water', '最高单片温度']
    ];
    const simulationEvidence = [];
    for (const [modeId, expectedLabel] of simulationModes) {
      await page.locator('#content .mode[data-id="' + modeId + '"]').click();
      await page.locator('#content [data-action="sim-run"]').click();
      await waitForSimulationChartPaint();
      const evidence = await page.evaluate(() => {
        const root = document.querySelector('#simResult');
        const canvases = [...(root?.querySelectorAll('canvas') || [])];
        let inkedPixels = 0;
        for (const canvas of canvases) {
          if (canvas.width < 200 || canvas.height < 100) continue;
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) inkedPixels += 1;
        }
        return {
          text: root?.innerText || '',
          canvasCount: canvases.length,
          inkedPixels,
          kpiCount: root?.querySelectorAll('.kpi').length || 0,
          boundaryNote: root?.querySelector('[role="note"]')?.innerText || ''
        };
      });
      if (!evidence.text.includes(expectedLabel) || evidence.canvasCount < 1 ||
          evidence.inkedPixels < 100 || evidence.kpiCount < 4 ||
          !evidence.boundaryNote.includes('不代表台架实测')) {
        throw new Error('Simulation mode acceptance failed for ' + modeId + ': ' + JSON.stringify({
          expectedLabel, canvasCount: evidence.canvasCount, inkedPixels: evidence.inkedPixels,
          kpiCount: evidence.kpiCount, text: evidence.text.slice(0, 500),
          boundaryNote: evidence.boundaryNote
        }));
      }
      if (modeId === 'bench' &&
          (!evidence.text.includes('合成扰动样本') || !evidence.text.includes('非实测'))) {
        throw new Error('Bench comparison did not clearly identify synthetic samples as non-measurements');
      }
      if (modeId === 'cold' && !evidence.text.includes('标准符合性判定')) {
        throw new Error('Cold-start view omitted its standard-conformance status');
      }
      if (modeId === 'durab' && !evidence.text.includes('未标定')) {
        throw new Error('Durability view omitted its uncalibrated-model disclosure');
      }
      simulationEvidence.push({ modeId, canvasCount: evidence.canvasCount, inkedPixels: evidence.inkedPixels });
    }
    if (simulationEvidence.length !== 9) throw new Error('Not all nine advertised simulation modes were exercised');

    await page.locator('#sideNav .nav-item[data-id="calc"]').click();
    await page.locator('#content [data-action="calc-run"][data-id="elec"]').click();
    await page.waitForSelector('#calcRes .res-box');
    if (await page.locator('#calcRes .res-row').count() < 8) {
      throw new Error('Electrochemical engineering calculation returned incomplete result rows');
    }
    await page.locator('#content .tab[data-action="calc-tab"][data-id="h2"]').click();
    await page.locator('#content [data-action="calc-run"][data-id="h2"]').click();
    await page.waitForFunction(() => (document.querySelector('#calcRes')?.textContent || '').includes('理论氢气流量'));

    await page.locator('#sideNav .nav-item[data-id="monitor"]').click();
    await page.waitForFunction(() => {
      const value = document.querySelector('#m_ptotal')?.textContent || '';
      return value.trim() !== '—kW' && value.trim() !== '—';
    });
    await page.locator('#content [data-action="mon-auto"][data-id="manual"]').click();
    if (await page.locator('#monManualBox').evaluate(el => getComputedStyle(el).display) === 'none') {
      throw new Error('Monitor manual operating-point controls did not open');
    }

    await page.locator('#sideNav .nav-item[data-id="data"]').click();
    if (await page.locator('#content .li').count() < 8) {
      throw new Error('Built-in comparison catalogue did not render all eight example configurations');
    }
    await page.locator('#content [data-action="cmp-run"]').click();
    if (await page.locator('#cmpRes .res-row').count() < 3) {
      throw new Error('Stack comparison did not produce a result table');
    }
    if (!(await page.locator('#content').innerText()).includes('非实测项目记录')) {
      throw new Error('Example project data must retain its non-measured-data disclosure');
    }

    await page.locator('#sideNav .nav-item[data-id="model"]').click();
    if (!(await page.locator('#content').innerText()).includes('没有加载训练数据')) {
      throw new Error('Model workspace must disclose that no real training data or inference is connected');
    }
    await page.locator('#content [data-action="mdl-toggle"]').click();
    await page.waitForFunction(() => document.querySelector('#mdlBtn')?.textContent.includes('暂停演示'));
    await page.locator('#content [data-action="mdl-toggle"]').click();
    await page.waitForFunction(() => document.querySelector('#mdlBtn')?.textContent.includes('启动演示'));

    await page.locator('#sideNav .nav-item[data-id="kb"]').click();
    await page.waitForSelector('#content .kb-entry');
    const kbCount = await page.locator('#content .kb-entry').count();
    if (kbCount < 10) throw new Error('Fuel-cell knowledge base did not render its indexed entries');

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      const nav = document.querySelector('#bottomNav');
      return {
        viewport: window.innerWidth,
        visible: !!nav && getComputedStyle(nav).display !== 'none' &&
          nav.getBoundingClientRect().width >= 300,
        items: nav ? nav.querySelectorAll('.bn-item').length : 0
      };
    });
    if (!mobile.visible || mobile.items < 8) {
      throw new Error('Mobile bottom navigation did not expose all engineering workspaces: ' + JSON.stringify(mobile));
    }
    await page.locator('#bottomNav .bn-item[data-id="sim"]').click();
    await page.waitForFunction(() => document.querySelector('#bottomNav .bn-item.active')?.dataset.id === 'sim');
    assertNoRuntimeErrors('FuelCell engineering workspace');
    console.log('HyHub browser acceptance passed: domain solver loaded, dashboard metrics computed, dynamic simulation and electrochemical/H2 calculations executed, monitor manual controls, data comparison, model-scope disclosure, knowledge base and mobile navigation passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
