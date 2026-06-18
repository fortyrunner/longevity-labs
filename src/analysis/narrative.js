/* ============================================================================
   AI NARRATIVE
   Builds a statistical summary (no raw activity data) from `analytics` and
   `state.athlete`, and calls the Anthropic API directly from the browser
   using a user-supplied key stored in localStorage. Generates one short
   clinical-style paragraph, cached locally so unchanged data doesn't trigger
   repeat billing on reload.
   ============================================================================ */

const NARRATIVE_API_KEY_STORAGE = 'agegrade_anthropic_key';
const NARRATIVE_CACHE_STORAGE = 'agegrade_narrative_cache';
const NARRATIVE_MODEL = 'claude-sonnet-4-6';

function getApiKey() {
  try { return (localStorage.getItem(NARRATIVE_API_KEY_STORAGE) || '').trim(); } catch (e) { return ''; }
}

function setApiKey(key) {
  try {
    if (key) localStorage.setItem(NARRATIVE_API_KEY_STORAGE, key);
    else localStorage.removeItem(NARRATIVE_API_KEY_STORAGE);
  } catch (e) { /* localStorage unavailable — key just won't persist */ }
}

function clearApiKey() {
  setApiKey('');
  try { localStorage.removeItem(NARRATIVE_CACHE_STORAGE); } catch (e) {}
}

/* Small non-cryptographic string hash (32-bit FNV-ish), used only to detect
   when the underlying stats summary has changed since the last cached run. */
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h.toString(36);
}

/* Pure statistical summary sent to the model — no raw activity arrays, per
   the v0.2 spec ("Only statistical summaries... are sent"). Fields are
   omitted entirely when the underlying data isn't available, so the model
   never has to reason about nulls. */
function buildNarrativeSummary() {
  const a = state.athlete;
  const s = {};

  if (a && a.ageYears != null) s.ageYears = Math.round(a.ageYears * 10) / 10;
  if (a && a.sex) s.sex = a.sex;
  s.dataSpanYears = Math.round(analytics.spanYears * 10) / 10;

  if (analytics.vo2Last) {
    s.vo2max = { latest: Math.round(analytics.vo2Last.value * 10) / 10 };
    if (analytics.vo2DeclinePerYear != null) s.vo2max.trendPerYear = Math.round(analytics.vo2DeclinePerYear * 100) / 100;
  }

  if (analytics.efMonthly && analytics.efMonthly.reg) {
    const pctPerYear = analytics.efMonthly.reg.slope / analytics.efMonthly.series[0].ef * 100;
    s.aerobicEfficiencyTrendPctPerYear = Math.round(pctPerYear * 10) / 10;
  }

  s.runningLast12moKm = Math.round(analytics.lastYearKm);

  if (analytics.loadRatio && analytics.loadRatio.ratio != null) {
    s.loadSpikeIndex = Math.round(analytics.loadRatio.ratio * 100) / 100;
  }

  s.strengthSessionsPerWeek = Math.round(analytics.strengthPerWeek * 10) / 10;

  if (analytics.recentZoneSeconds) {
    const sec = analytics.recentZoneSeconds.sec;
    const total = Object.values(sec).reduce((sum, v) => sum + v, 0);
    if (total > 0) {
      s.intensitySplit = {
        easyPct: Math.round((sec.z1 + sec.z2) / total * 100),
        hardPct: Math.round((sec.z4 + sec.z5) / total * 100),
      };
    }
  }

  if (analytics.bestPerYear.length) {
    const dists = ['5K', '10K', 'HM', 'M'];
    const bestEfforts = {};
    for (const d of dists) {
      const matches = analytics.bestPerYear.filter(b => b.distance === d);
      if (!matches.length) continue;
      const latest = matches.reduce((acc, b) => (b.year > acc.year ? b : acc));
      bestEfforts[d] = { year: latest.year, timeSec: latest.time };
      if (latest.agPct != null) bestEfforts[d].agePct = Math.round(latest.agPct);
      if (analytics.pbByDist[d] === latest.time) bestEfforts[d].allTimeBest = true;
    }
    if (Object.keys(bestEfforts).length) s.bestEfforts = bestEfforts;
  }

  if (analytics.parkrun.series.length >= 3) {
    const p = analytics.parkrun;
    const last = p.series[p.series.length - 1];
    const rollingLast = p.rolling[p.rolling.length - 1];
    s.parkrun = { count: p.series.length, prSec: p.pr, mostRecentSec: last.time };
    if (rollingLast != null) s.parkrun.rollingAvgSec = Math.round(rollingLast);
  }

  if (analytics.formEconomy) {
    const fe = analytics.formEconomy;
    const fEco = {};
    if (fe.cadenceTrend) fEco.cadenceTrend = fe.cadenceTrend;
    if (fe.monthly.length) {
      const last = fe.monthly[fe.monthly.length - 1];
      if (last.cad != null) fEco.cadenceSpm = Math.round(last.cad);
      if (last.gct != null) fEco.groundContactTimeMs = Math.round(last.gct);
    }
    if (fe.voAvgCm != null) fEco.verticalOscillationCm = Math.round(fe.voAvgCm * 10) / 10;
    if (fe.vrPct != null) fEco.verticalRatioPct = Math.round(fe.vrPct * 10) / 10;
    if (Object.keys(fEco).length) s.formEconomy = fEco;
  }

  if (state.fitnessAgeSeries.length) {
    const last = state.fitnessAgeSeries[state.fitnessAgeSeries.length - 1];
    s.bioAgeGapYears = Math.round((last.chronoAge - last.bioAge) * 10) / 10;
  }

  s.layoffCount = analytics.layoffs.length;

  return s;
}

function buildNarrativePrompt(summary) {
  const system = `You are a sports-science analyst writing for "AgeGrade Labs", a dashboard that gives masters endurance athletes (40+) a clinical-grade trajectory analysis of their training data. Write in the same voice as the rest of the dashboard: precise, evidence-based, never generic motivational fluff, and always framed around the athlete's next 10-15 years of healthy training.

Given a JSON summary of one athlete's statistics, write a SINGLE paragraph of 150-220 words that:
- Opens with the single most important signal in the data (positive or negative).
- Connects two or three of the provided metrics into a coherent narrative about where this athlete's trajectory is heading.
- Where relevant, notes what masters-athlete research would predict for someone in this position.
- Ends with the single highest-leverage thing to focus on next.

Do not use markdown, headings, or bullet points — plain prose only. Do not repeat raw JSON field names verbatim, translate them into prose. Frame this as analysis, not direct medical advice. If a field is absent, simply don't mention it — never apologise for missing data.`;
  return { system, userText: JSON.stringify(summary) };
}

/* Generates (or retrieves a cached) narrative and patches #ai-narrative-body
   directly — deliberately avoids a full render() so charts aren't re-mounted.
   `force` bypasses the cache (used by the "Regenerate" button). */
async function generateNarrative(force = false) {
  const key = getApiKey();
  if (!key) return;

  const summary = buildNarrativeSummary();
  const hash = simpleHash(NARRATIVE_MODEL + '|' + JSON.stringify(summary));

  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(NARRATIVE_CACHE_STORAGE) || 'null');
      if (cached && cached.hash === hash && cached.text) {
        state.narrative = { status: 'done', text: cached.text, error: '' };
        patchNarrativePanel();
        return;
      }
    } catch (e) { /* ignore corrupt cache */ }
  }

  state.narrative = { status: 'loading', text: '', error: '' };
  patchNarrativePanel();

  try {
    const { system, userText } = buildNarrativePrompt(summary);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: NARRATIVE_MODEL,
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userText }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const msg = errBody && errBody.error && errBody.error.message ? errBody.error.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!text) throw new Error('Empty response from model.');
    try { localStorage.setItem(NARRATIVE_CACHE_STORAGE, JSON.stringify({ hash, text })); } catch (e) {}
    state.narrative = { status: 'done', text, error: '' };
  } catch (err) {
    state.narrative = { status: 'error', text: '', error: err.message || String(err) };
  }
  patchNarrativePanel();
}

function patchNarrativePanel() {
  const el = document.getElementById('ai-narrative-body');
  if (el) el.innerHTML = aiNarrativeBodyHTML();
}
