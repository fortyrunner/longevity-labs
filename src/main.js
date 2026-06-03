/* ============================================================================
   MAIN — STATE & ROUTING
   Central app state, render loop, and lifecycle. All other modules are
   stateless and read from / write to the state object declared here.
   ============================================================================ */

const state = {
  screen: 'landing',  // landing | loading | dashboard
  loadStatus: '',
  loadSub: '',
  error: null,
  manualProfile: null,
  athlete: null,
  activities: [],
  vo2Series: [],
  fitnessAgeSeries: [],
  source: null,       // 'csv' | 'zip'
  charts: [],         // active Chart.js instances, destroyed on each re-render
};

// Shared cache for the last computed analytics result.
// Set by dashboardHTML() in templates.js, consumed by charts.js and recommendations.js.
let analytics = null;

function render() {
  state.charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  state.charts = [];
  const view = document.getElementById('view');
  if (state.screen === 'landing') view.innerHTML = landingHTML();
  else if (state.screen === 'loading') view.innerHTML = loadingHTML();
  else if (state.screen === 'dashboard') {
    view.innerHTML = dashboardHTML();
    requestAnimationFrame(renderCharts);
  }
  if (state.screen === 'landing') wireLanding();
  if (state.screen === 'dashboard') wireDashboard();
  updateFooterCounts();
}

function reset() {
  Object.assign(state, {
    screen: 'landing', loadStatus: '', loadSub: '',
    error: null, athlete: null, activities: [], vo2Series: [],
    fitnessAgeSeries: [], source: null, manualProfile: null
  });
  render();
}

/* ---- Boot ---- */
window.reset = reset;
window.submitManualProfile = submitManualProfile;
render();
