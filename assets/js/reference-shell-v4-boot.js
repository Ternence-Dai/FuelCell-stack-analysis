/* Reference shell v4: promote the validated engineering workbench to the default dashboard. */
(function () {
  'use strict';
  function mount() {
    const target = document.getElementById('content');
    // The legacy router owns every non-dashboard view. Delayed startup/load
    // callbacks may only mount the cockpit while the dashboard is active.
    if (!target || typeof state === 'undefined' || state.view !== 'dashboard' ||
        typeof window.renderEngineeringWorkbench !== 'function') return false;
    const html = window.renderEngineeringWorkbench();
    if (!html) return false;
    target.innerHTML = html;
    target.dataset.referenceMounted = 'v4';
    // Rendering the reference shell replaces the legacy dashboard DOM. Re-run
    // the original dashboard lifecycle so solver values and parameter handlers
    // are rebound to the newly mounted nodes instead of leaving placeholder dashes.
    if (typeof window.afterDashboard === 'function') {
      window.afterDashboard();
    } else if (typeof window.updateLiveValues === 'function') {
      window.updateLiveValues();
    }
    return true;
  }
  function scheduleMount(attempt) {
    const tries = Number(attempt) || 0;
    if (window.FuelCellDomain && typeof window.renderEngineeringWorkbench === 'function') {
      window.setTimeout(mount, 0);
      window.setTimeout(mount, 120);
      return;
    }
    if (tries < 120) window.setTimeout(() => scheduleMount(tries + 1), 50);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else scheduleMount();
  window.addEventListener('load', scheduleMount, { once: true });
  document.addEventListener('click', event => {
    const nav = event.target.closest('#sideNav .nav-item');
    if (!nav) return;
    const key = nav.dataset.id || nav.dataset.page || nav.dataset.action || '';
    if (/dashboard|home/i.test(key)) scheduleMount();
  });
})();