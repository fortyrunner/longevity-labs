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
  manualProfile: null, // { dob, sex } when supplied for CSV-only mode
  athlete: null,
  activities: [],
  vo2Series: [],
  fitnessAgeSeries: [],
  source: null, // 'csv' | 'zip'
  charts: [], // active ApexCharts instances for teardown
  narrative: { status: 'idle', text: '', error: '' }, // idle | loading | done | error
};

// Shared cache for the last computed analytics result.
// Set by dashboardHTML() in templates.js, consumed by charts.js and recommendations.js.
let analytics = null;

function render() {
  // Destroy any existing chart instances first
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

  if (state.screen === 'dashboard' && getApiKey() && state.narrative.status === 'idle') {
    state.narrative.status = 'loading';
    generateNarrative();
  }
}

function updateFooterCounts() {
  const el = document.getElementById('data-counts');
  if (state.screen === 'dashboard') {
    el.textContent = `${state.activities.length} activities · ${state.vo2Series.length} VO₂ records · ${state.fitnessAgeSeries.length} bio-age days`;
  } else {
    el.textContent = '';
  }
}

function reset() {
  Object.assign(state, {
    screen: 'landing', loadStatus: '', loadSub: '',
    error: null, athlete: null, activities: [], vo2Series: [],
    fitnessAgeSeries: [], source: null, manualProfile: null,
    narrative: { status: 'idle', text: '', error: '' },
  });
  render();
}

/* ---- AI Narrative actions (wired from onclick handlers in templates.js) ---- */
function saveApiKeyAndGenerate() {
  const input = document.getElementById('narrative-key-input');
  const key = input ? input.value.trim() : '';
  if (!key) return;
  setApiKey(key);
  generateNarrative();
}

function regenerateNarrative() {
  generateNarrative(true);
}

function changeApiKey() {
  clearApiKey();
  state.narrative = { status: 'idle', text: '', error: '' };
  patchNarrativePanel();
}

/* ---- Boot ---- */
window.reset = reset;
window.submitManualProfile = submitManualProfile;
window.saveApiKeyAndGenerate = saveApiKeyAndGenerate;
window.regenerateNarrative = regenerateNarrative;
window.changeApiKey = changeApiKey;
render();
