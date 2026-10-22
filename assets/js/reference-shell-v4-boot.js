/* Reference shell v4: promote the validated engineering workbench to the default dashboard. */
(function () {
  'use strict';
  function mount() {
    const target = document.getElementById('content');
    if (!target || typeof window.renderEngineeringWorkbench !== 'function') return false;
    const html = window.renderEngineeringWorkbench();
    if (!html) return false;
    target.innerHTML = html;
    target.dataset.referenceMounted = 'v4';
    const slider = document.getElementById('pSlider');
    if (slider) {
      slider.addEventListener('input', function () {
        const nextPower = Number(this.value);
        if (typeof state !== 'undefined' && state.params) state.params.stackPower = nextPower;
        if (typeof syncTopPower === 'function') syncTopPower(nextPower);
        if (typeof updateLiveValues === 'function') updateLiveValues();
      });
    }
    return true;
  }
  function scheduleMount() {
    window.setTimeout(mount, 0);
    window.setTimeout(mount, 120);
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