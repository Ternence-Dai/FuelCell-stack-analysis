'use strict';

const { chromium } = require('playwright');

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
    const contextScript = await page.locator('script[src*="workspace-v5-context.js"]').getAttribute('src');
    if (!contextScript || !contextScript.includes('v=20261021-mutationobserver-fix-v1')) {
      throw new Error('Workspace observer fix cache-busting URL is missing: ' + contextScript);
    }
    await page.waitForFunction(() => !!window.FuelCellDomain &&
      document.querySelector('#sideNav .nav-item[data-id="dashboard"]') &&
      document.querySelector('#autoGrid [data-live="Vc"]'));
    const dashboard = await page.locator('#autoGrid [data-live]').allTextContents();
    if (dashboard.length < 10 || dashboard.some(value => value.trim() === '—')) {
      throw new Error('Dashboard did not render computed stack metrics: ' + JSON.stringify(dashboard));
    }

    await page.locator('#sideNav .nav-item[data-id="sim"]').click();
    await page.waitForSelector('#content .mode[data-id="dynamic"]');
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
