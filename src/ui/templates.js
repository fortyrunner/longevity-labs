/* ============================================================================
   UI — HTML TEMPLATES
   All screen HTML generators and event wiring. No analytics logic here —
   this module only reads state/analytics and produces markup.
   ============================================================================ */

/* ---- Landing ---- */

function landingHTML() {
  const errBlock = state.error ? `<div class="error"><strong>Couldn't read that file</strong>${state.error}</div>` : '';
  return `
    <div class="landing">
      <h1>What does the <em>next decade</em> of training look like for an athlete who has already been running for one?</h1>
      <p class="lede">Drop in a Garmin Connect export and get a clinical-grade trajectory analysis: where the VO₂max is heading, whether the training load is sustainable, and the two or three highest-leverage interventions for the next ten to fifteen years.</p>

      ${errBlock}

      <div class="drop" id="drop">
        <div class="icon">⌁</div>
        <strong>Drop your file here, or click to select</strong>
        <span class="hint">.zip (full Garmin export) or .csv (Activities export)</span>
        <input type="file" id="file-input" accept=".zip,.csv" />
      </div>

      <div class="accepts">
        <div class="accept-card">
          <div class="label">FORMAT — RECOMMENDED</div>
          <h3>Garmin "Export Your Data" .zip</h3>
          <p>Full archive from <span class="mono">Garmin Connect → Account → Manage Data → Export Your Data</span>. Yields longitudinal VO₂max, biological-age data, and the complete activity history back to your first device.</p>
        </div>
        <div class="accept-card">
          <div class="label">FORMAT — LIGHTWEIGHT</div>
          <h3>Activities .csv</h3>
          <p>The standard CSV export from <span class="mono">Garmin Connect → Activities → Export CSV</span>. Limited to the rows you've exported, but enough for volume, intensity and performance trajectory analysis.</p>
        </div>
      </div>

      <p class="footnote">All processing happens in your browser. No file leaves your device. The dashboard supports running, walking, cycling, and indoor cycling activities; other sports are recognised but excluded from cardiorespiratory analysis.</p>
    </div>
  `;
}

function wireLanding() {
  const drop = document.getElementById('drop');
  const input = document.getElementById('file-input');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });
}

/* ---- Loading ---- */

function loadingHTML() {
  return `
    <div class="loading">
      <div class="spinner"></div>
      <div class="status">${escapeHTML(state.loadStatus)}</div>
      <div class="substatus">${escapeHTML(state.loadSub)}</div>
    </div>
  `;
}

function setStatus(s, sub = '') {
  state.loadStatus = s;
  state.loadSub = sub;
  if (state.screen === 'loading') {
    const ls = document.querySelector('.loading .status');
    const lb = document.querySelector('.loading .substatus');
    if (ls) ls.textContent = s;
    if (lb) lb.textContent = sub;
  }
}

/* ---- Dashboard ---- */

let _sectionCounter = 0;
function secNo() { return '§ ' + String(++_sectionCounter).padStart(2, '0'); }

function dashboardHTML() {
  // If CSV-mode and we don't have an athlete, prompt for DOB+sex (or use what we collected)
  if (state.source === 'csv' && !state.athlete) {
    return manualProfileFormHTML();
  }
  analytics = computeAnalytics();
  _sectionCounter = 0;
  return [
    athleteHeaderHTML(),
    kpiStripHTML(),
    state.vo2Series.length ? vo2PanelHTML() : '',
    analytics.efMonthly.series.length >= 3 ? efPanelHTML() : '',
    analytics.parkrun.series.length >= 3 ? parkrunPanelHTML() : '',
    volumePanelHTML(),
    state.fitnessAgeSeries.length ? bioAgePanelHTML() : '',
    performancePanelHTML(),
    intensityPanelHTML(),
    (analytics.gaitMonthly.length >= 3 || analytics.formEconomy.monthly.length >= 3) ? formEconomyPanelHTML() : '',
    heatmapPanelHTML(),
    analytics.nutrition ? proteinPanelHTML() : '',
    projectionPanelHTML(),
    workoutMenuPanelHTML(),
    `<div style="text-align:center;margin-top:40px"><button class="reset-btn" onclick="reset()">Load a different file</button></div>`,
  ].join('');
}

function manualProfileFormHTML() {
  return `
    <div class="dash">
      <h2 class="serif" style="font-weight:400;font-size:2rem;margin-bottom:8px">A couple of details first</h2>
      <p style="color:var(--ink-2);font-size:0.95rem;max-width:560px">The CSV export doesn't include date of birth or sex. We need those to compute age-graded references and projections.</p>
      <div class="form-row">
        <div>
          <label>Date of birth</label>
          <input type="date" id="dob-input" />
        </div>
        <div>
          <label>Sex</label>
          <select id="sex-input">
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label>Resting HR (optional)</label>
          <input type="number" id="rhr-input" min="30" max="100" placeholder="e.g. 50" />
        </div>
        <div>
          <label>Weight in kg (optional)</label>
          <input type="number" id="weight-input" min="30" max="250" step="0.1" placeholder="e.g. 75" />
        </div>
        <div>
          <label>Anthropic API key (optional)</label>
          <input type="password" id="api-key-input" placeholder="sk-ant-..." autocomplete="off" />
        </div>
      </div>
      <div style="margin-top:18px">
        <button class="reset-btn" onclick="submitManualProfile()">Continue →</button>
      </div>
    </div>
  `;
}

function submitManualProfile() {
  const dob = document.getElementById('dob-input').value;
  const sex = document.getElementById('sex-input').value;
  const rhr = parseInt(document.getElementById('rhr-input').value) || null;
  const weightKg = parseFloat(document.getElementById('weight-input').value) || null;
  const apiKey = document.getElementById('api-key-input').value.trim();
  if (!dob) { alert('Please enter a date of birth.'); return; }
  if (apiKey) setApiKey(apiKey);
  state.athlete = {
    name: 'Athlete',
    sex,
    dob: new Date(dob + 'T00:00:00'),
    rhr, // surfaced in the header and used as a recovery reference
    weightG: weightKg ? weightKg * 1000 : null, // used for protein targets
  };
  state.athlete.ageYears = (Date.now() - state.athlete.dob.getTime()) / (365.25*86400*1000);
  render();
}

function athleteHeaderHTML() {
  const a = state.athlete;
  const age = a.ageYears ? a.ageYears.toFixed(1) : '—';
  const weight = a.weightG ? (a.weightG/1000).toFixed(1) : '—';
  const height = a.heightCm ? a.heightCm.toFixed(0) : '—';
  const sex = a.sex ? a.sex.charAt(0).toUpperCase() + a.sex.slice(1) : '—';
  const vo2 = state.vo2Series.length ? state.vo2Series[state.vo2Series.length - 1].value.toFixed(0) : (a.vo2maxCurrent ? a.vo2maxCurrent.toFixed(0) : null);
  const span = analytics.spanYears.toFixed(1);

  let verdictText = '';
  if (vo2 && a.ageYears) {
    const norm = vo2NormForAgeSex(a.ageYears, a.sex);
    const poss = a.sex === 'female' ? 'her' : (a.sex === 'male' ? 'his' : 'their');
    const noun = a.sex === 'female' ? 'woman' : (a.sex === 'male' ? 'man' : 'person');
    if (vo2 >= norm.p95) verdictText = `At <strong>${vo2} ml/kg/min</strong>, ${poss} VO₂max sits in the <strong>top ~5%</strong> for ${poss} age band — comparable to a fit ${noun} fifteen to twenty years younger.`;
    else if (vo2 >= norm.p80) verdictText = `At <strong>${vo2} ml/kg/min</strong>, ${poss} VO₂max sits in the <strong>top quintile</strong> for ${poss} age band.`;
    else if (vo2 >= norm.p60) verdictText = `At <strong>${vo2} ml/kg/min</strong>, ${poss} VO₂max is <strong>above average</strong> for ${poss} age band.`;
    else verdictText = `At <strong>${vo2} ml/kg/min</strong>, ${poss} VO₂max is <strong>around the median</strong> for ${poss} age band — room to develop.`;
  }

  return `
    <div class="dash">
      <div class="athlete-card">
        <div class="left">
          <div class="eyebrow">SUBJECT</div>
          <h2>${escapeHTML(a.name)}, <em>${age} y</em></h2>
          <div class="meta">
            ${sex}${height !== '—' ? ` &middot; ${height} cm &middot; ${weight} kg` : ''}${a.rhr ? ` &middot; RHR ${a.rhr} bpm` : ''}<br>
            Data window: <b>${analytics.firstDate ? analytics.firstDate.toLocaleDateString('en-GB',{month:'short',year:'numeric'}) : '—'}</b> → <b>${analytics.lastDate ? analytics.lastDate.toLocaleDateString('en-GB',{month:'short',year:'numeric'}) : '—'}</b> &middot; <b>${span} years</b>
          </div>
        </div>
        <div class="verdict">${verdictText || 'A complete trajectory is shown below.'}</div>
      </div>
  `;
}

function kpiStripHTML() {
  const a = state.athlete;
  const vo2Latest = state.vo2Series.length ? state.vo2Series[state.vo2Series.length-1].value : (a.vo2maxCurrent || null);
  const noVo2 = !vo2Latest;
  const norm = a.ageYears ? vo2NormForAgeSex(a.ageYears, a.sex) : null;
  let vo2Sub = '';
  if (vo2Latest && norm) {
    if (vo2Latest >= norm.p95) vo2Sub = `<span class="good">top 5% for age</span>`;
    else if (vo2Latest >= norm.p80) vo2Sub = `<span class="good">top 20% for age</span>`;
    else if (vo2Latest >= norm.p60) vo2Sub = `<span class="good">above average</span>`;
    else if (vo2Latest >= norm.p40) vo2Sub = `<span class="warn">around average</span>`;
    else vo2Sub = `<span class="bad">below average</span>`;
  }

  const lastYearKm = analytics.lastYearKm;
  const runningKpi = `
    <div class="kpi">
      <div class="label">Running, last 12 mo</div>
      <div class="value">${Math.round(lastYearKm)}<span class="unit">km</span></div>
      <div class="sub">${Math.round(lastYearKm/52)} km/wk avg</div>
    </div>`;

  const lr = analytics.loadRatio;
  let lrSub = '—';
  if (lr && lr.ratio != null) {
    if (lr.ratio > 1.5) lrSub = `<span class="warn">sharp ramp — watch recovery</span>`;
    else if (lr.ratio > 1.3) lrSub = `<span class="warn">building quickly</span>`;
    else if (lr.ratio < 0.7) lrSub = `<span class="warn">well below baseline</span>`;
    else lrSub = `<span class="good">steady</span>`;
  }

  const decline = analytics.vo2DeclinePerYear;
  let declineSub = '';
  if (decline != null) {
    if (decline < 0.2) declineSub = `<span class="good">essentially flat</span>`;
    else if (decline < 0.4) declineSub = `<span class="good">slower than typical</span>`;
    else if (decline < 0.7) declineSub = `<span class="warn">typical for masters</span>`;
    else declineSub = `<span class="bad">faster than typical</span>`;
  }

  // Aerobic-efficiency trend — the fallback signal for KPI2 when no VO2max data exists.
  const ef = analytics.efMonthly;
  let efPctPerYear = null, efSub = '';
  if (ef && ef.reg && ef.series.length) {
    efPctPerYear = ef.reg.slope / ef.series[0].ef * 100;
    if (efPctPerYear > 1) efSub = `<span class="good">improving</span>`;
    else if (efPctPerYear > -1) efSub = `<span class="good">stable</span>`;
    else if (efPctPerYear > -3) efSub = `<span class="warn">drifting down</span>`;
    else efSub = `<span class="bad">falling</span>`;
  }

  // KPI1: VO2max latest, or running volume when no VO2 data
  const kpi1 = noVo2 ? runningKpi : `
    <div class="kpi">
      <div class="label">VO₂max — latest</div>
      <div class="value">${vo2Latest.toFixed(0)}<span class="unit">ml·kg⁻¹·min⁻¹</span></div>
      <div class="sub">${vo2Sub}</div>
    </div>`;

  // KPI2: VO2max trend, or aerobic-efficiency trend when no VO2 data
  const kpi2 = noVo2 ? `
    <div class="kpi">
      <div class="label">Aerobic efficiency trend</div>
      <div class="value">${efPctPerYear != null ? (efPctPerYear >= 0 ? '+' : '−') + Math.abs(efPctPerYear).toFixed(1) : '—'}<span class="unit">%/yr</span></div>
      <div class="sub">${efSub}</div>
    </div>` : `
    <div class="kpi">
      <div class="label">VO₂max trend</div>
      <div class="value">${decline != null ? (decline >= 0 ? '−' : '+') + Math.abs(decline).toFixed(2) : '—'}<span class="unit">/yr</span></div>
      <div class="sub">${declineSub}</div>
    </div>`;

  // KPI3: bio age gap if available; otherwise running volume (only when KPI1
  // isn't already showing it, i.e. when VO2 data is present)
  let kpi3 = '';
  if (state.fitnessAgeSeries.length) {
    const last = state.fitnessAgeSeries[state.fitnessAgeSeries.length-1];
    const gap = last.chronoAge - last.bioAge;
    const cls = gap > 5 ? 'good' : (gap > 0 ? 'warn' : 'bad');
    kpi3 = `
      <div class="kpi">
        <div class="label">Bio age gap</div>
        <div class="value">${gap >= 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}<span class="unit">y</span></div>
        <div class="sub ${cls}">${gap >= 0 ? 'younger than calendar' : 'older than calendar'}</div>
      </div>`;
  } else if (!noVo2) {
    kpi3 = runningKpi;
  }

  // KPI4: load spike index
  const kpi4 = `
    <div class="kpi">
      <div class="label">Load spike index (EWMA)</div>
      <div class="value">${lr && lr.ratio != null ? lr.ratio.toFixed(2) : '—'}</div>
      <div class="sub">${lrSub}</div>
    </div>`;

  // KPI5: strength sessions/week
  const spw = analytics.strengthPerWeek;
  let spwSub;
  if (spw >= 2) spwSub = `<span class="good">on target</span>`;
  else if (spw >= 1) spwSub = `<span class="warn">sub-optimal</span>`;
  else spwSub = `<span class="bad">insufficient</span>`;
  const kpi5 = `
    <div class="kpi">
      <div class="label">Strength sessions/wk</div>
      <div class="value">${spw.toFixed(1)}</div>
      <div class="sub">${spwSub}</div>
    </div>`;

  return `
    <div class="kpi-strip">
      ${kpi1}
      ${kpi2}
      ${kpi3}
      ${kpi4}
      ${kpi5}
    </div>
  `;
}

function vo2PanelHTML() {
  const a = state.athlete;
  const reg = analytics.vo2Reg;
  const declineText = reg ? `${reg.slope >= 0 ? '+' : ''}${reg.slope.toFixed(2)} ml/kg/min per year (R²=${reg.r2.toFixed(2)})` : '—';
  const popDecline = 0.45; // Tanaka & Seals: ~0.4-0.5 for trained masters
  let assessment = '';
  if (reg) {
    const slope = -reg.slope; // decline rate
    if (slope < 0.2) assessment = 'essentially flat over the recorded window — exceptional preservation';
    else if (slope < popDecline * 0.8) assessment = `slower than the ~${popDecline} ml/kg/min/yr typical of trained masters athletes`;
    else if (slope < popDecline * 1.3) assessment = `in line with population norms for trained masters athletes (~${popDecline} ml/kg/min/yr)`;
    else assessment = `faster than typical for trained masters — worth investigating training load distribution and recovery`;
  }
  // Project to ages 70, 75, 80 — two scenarios. Linear extrapolation of the
  // observed slope is the optimistic case; longitudinal cohorts (Tanaka & Seals;
  // FRIEND registry) show decline accelerating beyond ~70 even in trained
  // masters, so the expected case applies 1.5× the observed slope (floor of
  // -0.45/yr) after age 70.
  let projection = '';
  if (reg && a.ageYears) {
    const lastVo2 = state.vo2Series[state.vo2Series.length-1].value;
    const slope = Math.min(reg.slope, -0.05); // never project an eternal rise
    const lateSlope = Math.min(slope * 1.5, -0.45);
    const projLinear = (target) => Math.max(12, lastVo2 + slope * (target - a.ageYears));
    const projPiecewise = (target) => {
      let v = lastVo2;
      if (target <= 70 || a.ageYears >= 70) {
        const s = a.ageYears >= 70 ? lateSlope : slope;
        return Math.max(12, lastVo2 + s * (target - a.ageYears));
      }
      v += slope * (70 - a.ageYears);
      v += lateSlope * (target - 70);
      return Math.max(12, v);
    };
    const cell = (t) => `<span class="stat">age ${t} → ${projPiecewise(t).toFixed(0)}–${projLinear(t).toFixed(0)}</span>`;
    projection = `
      <p>Projected VO₂max range (expected–optimistic):<br>
      ${cell(70)} &nbsp;${cell(75)} &nbsp;${cell(80)}</p>
      <p style="margin-top:10px;font-size:0.86rem;color:var(--ink-3)">The expected case assumes decline accelerates ~1.5× beyond age 70, as seen in longitudinal masters cohorts; the optimistic case extends the current slope. The threshold for fully-independent stair climbing and brisk walking sits around <span class="stat">17.5 ml/kg/min</span>.</p>
    `;
  }
  return `
    <section class="panel">
      <header><h3>VO₂max trajectory</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">The single best validated marker of cardiorespiratory fitness and the strongest endurance-related predictor of all-cause mortality. For masters athletes the question isn't the absolute number — it's the slope.</p>
      <div class="panel-body">
        <div class="chart-host"><div id="chart-vo2"></div></div>
        <div class="notes">
          <h4>What we're seeing</h4>
          <p>Regression slope across all recorded VO₂max values: <span class="stat">${declineText}</span></p>
          <p>This is ${assessment}.</p>
          ${projection}
        </div>
      </div>
    </section>
  `;
}

function efPanelHTML() {
  const { series, reg } = analytics.efMonthly;
  const last = series[series.length - 1];
  const first = series[0];
  const pctChange = (last.ef - first.ef) / first.ef * 100;
  let trendText, trendVerdict;
  if (reg) {
    const pctPerYear = reg.slope / first.ef * 100;
    trendText = `${pctPerYear >= 0 ? '+' : ''}${pctPerYear.toFixed(1)}% per year (R²=${reg.r2.toFixed(2)})`;
    if (pctPerYear > 1) trendVerdict = 'Aerobic efficiency is improving — you are getting more speed per heartbeat. Whatever the raw times say, the engine is developing.';
    else if (pctPerYear > -1) trendVerdict = 'Aerobic efficiency is holding steady — the hallmark of well-preserved fitness in a masters athlete.';
    else trendVerdict = 'Aerobic efficiency is drifting down. Before concluding fitness loss, rule out the usual confounders: hotter months, hillier routes, or a higher share of recovery-pace running.';
  } else {
    trendText = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}% over the window`;
    trendVerdict = 'More months of data will sharpen this trend.';
  }
  return `
    <section class="panel">
      <header><h3>Aerobic efficiency (speed per heartbeat)</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Efficiency Factor — metres per minute divided by average heart rate on easy runs — is the best longitudinal fitness signal available from activity summaries alone. It moves before race times do, and it works even when no VO₂max data is present.</p>
      <div class="panel-body">
        <div class="chart-host"><div id="chart-ef"></div></div>
        <div class="notes">
          <h4>Trend</h4>
          <p>Monthly median EF on easy runs: <span class="stat">${first.ef.toFixed(2)}</span> → <span class="stat">${last.ef.toFixed(2)}</span> &middot; trend <span class="stat">${trendText}</span></p>
          <p>${trendVerdict}</p>
          <p style="font-size:0.84rem;color:var(--ink-3)">Easy runs only (Aerobic TE &lt; 3.5, ≥3 km, valid HR), monthly median to suppress route and weather noise. Compare like months year-on-year where possible — EF dips in summer heat.</p>
        </div>
      </div>
    </section>
  `;
}

function volumePanelHTML() {
  const y = analytics.yearly;
  const span = y.length;
  const totalKm = y.reduce((s,x)=>s+x.km, 0);
  const totalHours = y.reduce((s,x)=>s+x.hours, 0);
  const recentY = y.slice(-3);
  const recentMeanKm = recentY.reduce((s,x)=>s+x.km, 0) / Math.max(1, recentY.length);
  // Detect any year-over-year drops in running volume > 25%.
  // Skip the final calendar year if it's incomplete relative to the data's own
  // end date (the export may be months old, so never trust the wall clock).
  const drops = [];
  const anchor = analytics.anchor;
  const lastDataYear = anchor.getFullYear();
  const yearComplete = (yr) => yr < lastDataYear || (yr === lastDataYear && anchor.getMonth() >= 11);
  for (let i = 1; i < y.length; i++) {
    if (!yearComplete(y[i].year)) continue;
    if (y[i-1].runKm > 100 && y[i].runKm < y[i-1].runKm * 0.75) {
      drops.push({ year: y[i].year, fromKm: y[i-1].runKm, toKm: y[i].runKm });
    }
  }
  // For the final incomplete year, compute an annualised projection so the
  // user gets a realistic pace estimate rather than a deceptively low total.
  let partialYearNote = '';
  const lastY = y[y.length - 1];
  if (lastY && !yearComplete(lastY.year)) {
    const firstDayOfYear = new Date(lastY.year, 0, 1);
    const daysElapsed = Math.max(1, (anchor - firstDayOfYear) / 86400000);
    const annualisedKm = lastY.runKm * 365 / daysElapsed;
    partialYearNote = `<p style="font-size:0.86rem;color:var(--ink-3)">${lastY.year} is partial (data to ${anchor.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}). At current pace, projected annual running: <span class="stat">${Math.round(annualisedKm)} km</span>.</p>`;
  }
  // Layoffs: gaps > 21 days between consecutive runs
  const layoffs = analytics.layoffs;
  const fmtD = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const layoffNote = layoffs.length
    ? `<p><strong>${layoffs.length} layoff${layoffs.length>1?'s':''}</strong> (no running for &gt;21 days): ${layoffs.slice(-4).map(l=>`<span class="stat">${fmtD(l.from)} → ${fmtD(l.to)} (${l.days} d)</span>`).join(' ')}${layoffs.length>4?' …':''} For masters athletes, layoff frequency predicts long-term trajectory better than any single fitness number — each one costs weeks of rebuild and some of the fitness never fully returns.</p>`
    : `<p>No layoffs longer than 21 days in the running record — for masters longevity, this consistency matters more than any single metric below.</p>`;
  return `
    <section class="panel">
      <header><h3>Training volume</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Monthly running and non-running distance, with strength sessions overlaid. Sustained volume is what builds the aerobic foundation — drops of more than ~25% year-on-year (see notes) usually flag an injury, illness, or life event worth investigating.</p>
      <div class="panel-body">
        <div class="chart-host"><div id="chart-volume"></div></div>
        <div class="notes">
          <h4>${span}-year totals</h4>
          <p>${Math.round(totalKm).toLocaleString()} km across ${Math.round(totalHours).toLocaleString()} hours of moving time. Recent three-year mean: <span class="stat">${Math.round(recentMeanKm)} km/yr</span>.</p>
          ${drops.length ? `<p><strong>${drops.length} year-on-year drop${drops.length>1?'s':''}</strong> exceeding 25%: ${drops.map(d=>`<span class="stat">${d.year} (${Math.round(d.fromKm)}→${Math.round(d.toKm)})</span>`).join(' ')}</p>` : '<p>No year-on-year drops exceeding 25% across the completed years — remarkable consistency.</p>'}
          ${layoffNote}
          ${partialYearNote}
          <p>For longevity-of-performance, the literature is consistent: maintaining roughly the same weekly volume into the seventies is the single largest predictor of preserved VO₂max in masters runners.</p>
        </div>
      </div>
    </section>
  `;
}

function bioAgePanelHTML() {
  const series = state.fitnessAgeSeries;
  const last = series[series.length-1];
  const gap = last.chronoAge - last.bioAge;
  return `
    <section class="panel">
      <header><h3>Biological age vs. calendar age</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Garmin's estimate of cardiometabolic age, derived from BMI, resting heart rate, and activity intensity history. Useful as a directional indicator — not a clinical diagnosis.</p>
      <div class="panel-body">
        <div class="chart-host"><div id="chart-bioage"></div></div>
        <div class="notes">
          <h4>Most recent reading</h4>
          <p>Calendar age <span class="stat">${last.chronoAge.toFixed(1)} y</span> &middot; estimated biological age <span class="stat">${last.bioAge.toFixed(1)} y</span> &middot; gap <span class="stat">${gap.toFixed(1)} y younger</span>.</p>
          <p>Resting HR <span class="stat">${last.rhr} bpm</span> &middot; BMI <span class="stat">${last.bmi.toFixed(1)}</span></p>
          <p style="font-size:0.84rem;color:var(--ink-3)">The dominant input here is resting heart rate. A 5-bpm rise will move biological age by 2–3 years in this model, so watch for sudden shifts more than absolute values.</p>
        </div>
      </div>
    </section>
  `;
}

function performancePanelHTML() {
  const bp = analytics.bestPerYear;
  if (!bp.length) {
    return `
      <section class="panel">
        <header><h3>Performance trajectory</h3><span class="section-no">${secNo()}</span></header>
        <p class="lede">No standard race distances (5K, 10K, half marathon, marathon) detected in the activity history.</p>
      </section>
    `;
  }
  // Build a summary table for the last 5 years
  const years = [...new Set(bp.map(b => b.year))].sort();
  const recentYears = years.slice(-5);
  const dists = ['5K','10K','HM','M'];
  const haveAG = bp.some(b => b.agPct != null);
  const tableRows = recentYears.map(y => {
    const cells = dists.map(d => {
      const r = bp.find(b => b.year === y && b.distance === d);
      if (!r) return `<td>—</td>`;
      const star = analytics.pbByDist[d] === r.time ? '<span class="pb-star"> ★</span>' : '';
      return `<td>${fmtTime(r.time)}${star}</td>`;
    }).join('');
    // Best age-grade across distances that year
    let agCell = '';
    if (haveAG) {
      const yearAG = bp.filter(b => b.year === y && b.agPct != null).map(b => b.agPct);
      agCell = `<td>${yearAG.length ? Math.max(...yearAG).toFixed(0) + '%' : '—'}</td>`;
    }
    return `<tr><td>${y}</td>${cells}${agCell}</tr>`;
  }).join('');
  const agHead = haveAG ? '<th>Best AG</th>' : '';
  const agNote = haveAG
    ? `<p style="margin-top:12px;font-size:0.84rem;color:var(--ink-3)">Age-grade (AG%) restates each time against the world-best for that age and sex, so it isolates fitness from ageing: 60%+ is good local-club standard, 70%+ regional, 80%+ national. A flat or rising AG% while raw times slow means you are <em>beating the clock of ageing</em>. Times don't control for course or weather — treat the trend.</p>`
    : `<p style="margin-top:12px;font-size:0.84rem;color:var(--ink-3)">Times do not control for course, weather, or whether the effort was a race. Treat the trend, not the individual numbers. (Add date of birth and sex to unlock age-grading.)</p>`;
  const pbNote = `<p style="margin-top:6px;font-size:0.84rem;color:var(--ink-3)"><span class="pb-star">★</span> = all-time personal best at that distance.</p>`;

  return `
    <section class="panel">
      <header><h3>Best efforts by year</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Fastest recorded effort each year at four standard distances. Counts only activities whose total distance falls within ±5% of the race mark, so it's noisier than real race results but reflects real fitness.</p>
      <div class="panel-body">
        <div class="chart-host"><div id="chart-perf"></div></div>
        <div class="notes">
          <h4>Recent best efforts</h4>
          <table class="data-table">
            <thead><tr><th>Year</th><th>5K</th><th>10K</th><th>Half</th><th>Marathon</th>${agHead}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${pbNote}
          ${agNote}
        </div>
      </div>
    </section>
  `;
}

function intensityPanelHTML() {
  const data = analytics.recentZoneSeconds;
  if (!data) {
    return `
      <section class="panel">
        <header><h3>Intensity distribution</h3><span class="section-no">${secNo()}</span></header>
        <p class="lede">Need either heart-rate data or lactate threshold to compute zones. Skipping this panel.</p>
      </section>
    `;
  }
  const total = Object.values(data.sec).reduce((s,v)=>s+v, 0);
  const pct = (k) => total > 0 ? (data.sec[k]/total*100) : 0;
  const easy = pct('z1') + pct('z2');
  const hard = pct('z4') + pct('z5');
  const ratio = easy.toFixed(0) + ' / ' + hard.toFixed(0);
  let verdict = '';
  if (easy > 78 && hard > 8) verdict = `Distribution is close to the 80/20 polarised model favoured for long-term endurance — a healthy balance.`;
  else if (easy > 85 && hard < 10) verdict = `Volume sits heavily in easy aerobic — excellent for base, but a deficit of high-intensity work tends to predict VO₂max stagnation in masters athletes.`;
  else if (easy < 70) verdict = `Too much time in the moderate-to-hard tempo zone ("grey zone") — fatigue accumulates without the proportional aerobic adaptation. Worth shifting some sessions clearly easier and others clearly harder.`;
  else verdict = `Intensity mix is broadly appropriate.`;

  let maxhrNote = '';
  if (data.maxhr) {
    if (data.maxhrSource === 'estimated') maxhrNote = ` &middot; max HR estimated from observed activity data (top recorded values): ${Math.round(data.maxhr)} bpm`;
    else maxhrNote = ` &middot; predicted max ${Math.round(data.maxhr)}`;
  }

  return `
    <section class="panel">
      <header><h3>Intensity distribution &mdash; last 12 months</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">For preserving VO₂max into the seventies, the polarised model — ~80% strictly easy, ~20% genuinely hard, almost nothing in the middle — has the strongest evidence in masters populations.</p>
      <div class="panel-body">
        <div class="chart-host"><div id="chart-zones"></div></div>
        <div class="notes">
          <h4>Easy / Hard ratio</h4>
          <p><span class="stat">${ratio}</span> &middot; total ${(total/3600).toFixed(0)} hours of HR-tracked running</p>
          <p>${verdict}</p>
          <p style="font-size:0.84rem;color:var(--ink-3)">Zones derived from lactate-threshold HR (<span class="stat">${Math.round(data.lthr)} bpm</span>${maxhrNote}) using Friel-style boundaries. Each run is bucketed by its <em>average</em> HR, which understates interval work — ${data.teCorrections ? `${data.teCorrections} session${data.teCorrections>1?'s were':' was'} reclassified as hard via Aerobic TE` : 'no Aerobic-TE corrections were needed here'}. Read this as directional, not exact.</p>
        </div>
      </div>
    </section>
  `;
}

function formEconomyPanelHTML() {
  const g = analytics.gaitMonthly;
  const fe = analytics.formEconomy;
  const withStride = g.filter(m => m.stride != null);
  let strideText = '', strideVerdict = '';
  if (withStride.length >= 3) {
    const s0 = withStride[0], s1 = withStride[withStride.length - 1];
    const dStride = (s1.stride - s0.stride) / s0.stride * 100;
    strideText = `<p>Mean stride length: <span class="stat">${s0.stride.toFixed(2)} m</span> → <span class="stat">${s1.stride.toFixed(2)} m</span> (${dStride>=0?'+':''}${dStride.toFixed(1)}%)</p>`;
    if (dStride < -4) strideVerdict = 'Stride length is shortening. In masters runners this — not cadence — is the dominant mechanism of pace decline, and it tracks losses in lower-limb power and elasticity. It is also the most addressable: it responds to strength work, plyometrics, and strides.';
    else if (dStride > 4) strideVerdict = 'Stride length is lengthening — typically a sign of improving power or a return to fitness after a base period.';
    else strideVerdict = 'Stride length is stable, which is a good sign that lower-limb power is being preserved.';
  }

  let cadText = '';
  const withCad = fe.monthly.filter(m => m.cad != null);
  if (withCad.length >= 2) {
    const c0 = withCad[0], c1 = withCad[withCad.length - 1];
    cadText = `<p>Mean cadence: <span class="stat">${c0.cad.toFixed(0)} spm</span> → <span class="stat">${c1.cad.toFixed(0)} spm</span> <span style="color:var(--ink-3)">(170–180 spm typically considered optimal)</span></p>`;
  }

  let cadenceTrendText = '';
  if (fe.cadenceTrend === 'rising') cadenceTrendText = 'Cadence is trending up — often a sign of improving neuromuscular efficiency, though it can also reflect a higher share of faster running.';
  else if (fe.cadenceTrend === 'falling') cadenceTrendText = 'Cadence is trending down — worth watching alongside stride length, since the combination usually signals fatigue or declining lower-limb power.';
  else if (fe.cadenceTrend === 'stable') cadenceTrendText = 'Cadence is stable, sitting close to the range generally associated with efficient running form.';

  let gctText = '';
  const withGct = fe.monthly.filter(m => m.gct != null);
  if (fe.hasGct && withGct.length >= 2) {
    const gctLast = withGct[withGct.length - 1].gct;
    gctText = `<p>Latest ground contact time: <span class="stat">${gctLast.toFixed(0)} ms</span> — ${gctLast < 260 ? 'within the &lt;260 ms target' : 'above the ~260 ms target'}</p>`;
  }

  let voVrText = '';
  if (fe.voAvgCm != null || fe.vrPct != null) {
    const parts = [];
    if (fe.voAvgCm != null) parts.push(`vertical oscillation <span class="stat">${fe.voAvgCm.toFixed(1)} cm</span>`);
    if (fe.vrPct != null) parts.push(`vertical ratio <span class="stat">${fe.vrPct.toFixed(1)}%</span>`);
    voVrText = `<p>Average ${parts.join(' &middot; ')} across the data window.</p>`;
  }

  const gctNote = !fe.hasGct
    ? `<p style="font-size:0.84rem;color:var(--ink-3)">Ground contact time, vertical oscillation and vertical ratio require a full Garmin zip export — not present in the CSV export.</p>`
    : '';

  return `
    <section class="panel">
      <header><h3>Running form &amp; economy</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Speed is cadence × stride length, but how efficiently that speed is produced — ground contact time, vertical oscillation, vertical ratio — shifts with both fitness and age. Watching these together separates "running differently" from "running worse."</p>
      <div class="panel-body">
        <div class="chart-host"><div id="chart-form-economy"></div></div>
        <div class="notes">
          <h4>Trend</h4>
          ${cadText}
          ${gctText}
          ${strideText}
          ${voVrText}
          ${cadenceTrendText ? `<p>${cadenceTrendText}</p>` : ''}
          ${strideVerdict ? `<p>${strideVerdict}</p>` : ''}
          ${gctNote}
          <p style="font-size:0.84rem;color:var(--ink-3)">Monthly means across all runs; influenced by pace mix, so compare easy-month to easy-month.</p>
        </div>
      </div>
    </section>
  `;
}

function parkrunPanelHTML() {
  const p = analytics.parkrun;
  const last = p.series[p.series.length - 1];
  const recent = p.series.slice(-8);
  const rollingLast = p.rolling[p.rolling.length - 1];
  const fmtD = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const rows = recent.map((s, i) => {
    const isPR = s.time === p.pr;
    const idx = p.series.length - recent.length + i;
    const roll = p.rolling[idx];
    return `<tr><td>${fmtD(s.date)}</td><td>${s.distance_km.toFixed(1)} km</td><td>${fmtTime(s.time)}${isPR ? ' <span class="pb-star">★</span>' : ''}</td><td>${roll != null ? fmtTime(roll) : '—'}</td></tr>`;
  }).join('');
  return `
    <section class="panel">
      <header><h3>parkrun series</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Auto-detected from activity titles containing "parkrun". Because the course, distance and conditions repeat almost exactly week to week, this is a cleaner longitudinal fitness signal than one-off race results — a regular, low-stakes biomarker rather than just a race result.</p>
      <div class="panel-body">
        <div class="chart-host"><div id="chart-parkrun"></div></div>
        <div class="notes">
          <h4>Recent results</h4>
          <p>${p.series.length} results recorded &middot; PR <span class="stat pb-star">${fmtTime(p.pr)} ★</span>${rollingLast != null ? ` &middot; rolling 4-result average <span class="stat">${fmtTime(rollingLast)}</span>` : ''}</p>
          <table class="data-table">
            <thead><tr><th>Date</th><th>Distance</th><th>Time</th><th>4-result avg</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:12px;font-size:0.84rem;color:var(--ink-3)"><span class="pb-star">★</span> = personal record. Most recent: ${fmtD(last.date)}, ${fmtTime(last.time)}.</p>
        </div>
      </div>
    </section>
  `;
}

function heatmapPanelHTML() {
  const h = analytics.heatmap;
  const weeks = [];
  for (let w = 0; w < 52; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(h.start);
      date.setDate(date.getDate() + w * 7 + d);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const cat = h.days.get(key) || 'rest';
      week.push({ date, cat });
    }
    weeks.push(week);
  }
  const cells = weeks.map(week => week.map(c =>
    `<div class="heatmap-cell ${c.cat}" title="${c.date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}: ${c.cat}"></div>`
  ).join('')).join('');
  const months = weeks.map((week, i) => {
    const isFirstWeekOfMonth = i === 0 || week[0].date.getMonth() !== weeks[i-1][0].date.getMonth();
    return `<div class="heatmap-month-label">${isFirstWeekOfMonth ? week[0].date.toLocaleDateString('en-GB', { month: 'short' }) : ''}</div>`;
  }).join('');
  return `
    <section class="panel">
      <header><h3>Training consistency</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Every day over the last year, coloured by activity type. Consistency — not any single hard session — is what compounds into the trajectories elsewhere on this page.</p>
      <div class="panel-body full">
        <div>
          <div class="heatmap-months">${months}</div>
          <div class="heatmap-grid">${cells}</div>
          <div class="heatmap-legend">
            <span><i class="heatmap-cell run"></i> Running</span>
            <span><i class="heatmap-cell strength"></i> Strength</span>
            <span><i class="heatmap-cell rest"></i> Rest / other</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function proteinPanelHTML() {
  const n = analytics.nutrition;
  const a = state.athlete;
  const masters = a.ageYears != null && a.ageYears >= 55;
  const cols = [
    { key: 'meat', label: 'Meat-eater' },
    { key: 'vegetarian', label: 'Vegetarian' },
    { key: 'vegan', label: 'Vegan' },
  ].map(d => {
    const plan = n.plans[d.key];
    const rows = plan.items.map(it => `
      <li><span>${it.count} × ${it.portion}</span><span class="stat">${it.count * it.proteinG} g</span></li>
    `).join('');
    return `
      <div class="protein-col">
        <h4>${d.label}</h4>
        <ul class="protein-list">${rows}</ul>
        <div class="protein-total">≈ <span class="stat">${plan.total} g</span> protein/day</div>
      </div>
    `;
  }).join('');

  return `
    <section class="panel">
      <header><h3>Protein — example day by diet</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Based on a bodyweight of <span class="stat">${n.weightKg.toFixed(1)} kg</span>${masters ? ' and the higher masters-athlete requirement' : ''}, the recommended intake is <span class="stat">${Math.round(n.target.low)}–${Math.round(n.target.high)} g/day</span>. Each column below is one way to reach the top of that range using foods that are cheap, widely available, and easy to repeat daily — swap freely within a column to taste.</p>
      <div class="protein-grid">${cols}</div>
      <p class="footnote">Protein values are typical figures per serving and vary by brand and preparation. General guidance, not individualised dietetic advice — aim to spread intake across at least 3-4 meals (~30-40 g each), with one serving close to a training session.</p>
    </section>
  `;
}

function projectionPanelHTML() {
  // Build 1-3 recommendations from the analytics
  const recs = generateRecommendations();
  return `
    <section class="panel">
      <header><h3>Highest-leverage interventions, next 10–15 years</h3><span class="section-no">${secNo()}</span></header>
      <p class="lede">Synthesising VO₂max trajectory, training load, and intensity distribution into the small number of changes most likely to compound over the coming decade.</p>
      <div class="reco-grid">
        ${recs.map((r, i) => `
          <div class="reco">
            <div class="num">${String(i+1).padStart(2,'0')}</div>
            <h4>${r.title}</h4>
            <p>${r.body}</p>
          </div>
        `).join('')}
      </div>
    </section>
    </div>
  `;
}

function fmtTime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds/3600);
  const m = Math.floor((seconds%3600)/60);
  const s = Math.round(seconds%60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function wireDashboard() {
  // No interactive wiring required at the moment
}

/* ---- Session menu ---- */
function workoutMenuPanelHTML() {
  const a = state.athlete;
  const age = a && a.ageYears ? a.ageYears : 0;
  const lr = analytics.loadRatio;
  const highLoad = lr && lr.ratio > 1.3;
  const spw = analytics.strengthPerWeek;
  const ef = analytics.efMonthly;
  const data = analytics.recentZoneSeconds;

  let efTrendPctPerYear = 0;
  if (ef && ef.reg && ef.series.length >= 4 && ef.series[0].ef) {
    efTrendPctPerYear = ef.reg.slope / ef.series[0].ef * 100;
  }

  let strideFalling = false, strideDeltaPct = 0;
  const withStride = analytics.gaitMonthly.filter(m => m.stride != null);
  if (withStride.length >= 4) {
    strideDeltaPct = (withStride[withStride.length - 1].stride - withStride[0].stride) / withStride[0].stride * 100;
    if (strideDeltaPct < -4) strideFalling = true;
  }

  const vo2Declining = analytics.vo2DeclinePerYear != null && analytics.vo2DeclinePerYear > 0.3;
  const efDeclining = efTrendPctPerYear < -2;

  // ── Running: always exactly 3 ───────────────────────────────────────────────

  const easyWhy = highLoad
    ? `Load-spike index is ${lr.ratio.toFixed(2)} — recovery runs protect adaptation and prevent the breakdown that ends masters seasons.`
    : `Easy volume is the single largest predictor of preserved VO₂max into the seventies. The session to never skip.`;
  const easyRun = {
    type: 'run', title: 'Easy aerobic run', duration: '40 min', why: easyWhy,
    steps: [
      '5 min walk/jog warm-up',
      '30 min at fully conversational pace (Z1–Z2, ~70–75% HRmax)',
      '5 min walk cool-down',
    ],
  };

  const vo2Why = vo2Declining
    ? `VO₂max is declining at ${analytics.vo2DeclinePerYear.toFixed(1)} ml/kg/min/yr — 4×4 min at ~90% HRmax is the most evidence-backed countermeasure in masters runners.`
    : efDeclining
      ? `Aerobic efficiency is drifting ${Math.abs(efTrendPctPerYear).toFixed(1)}%/yr — 4×4 sessions are the most direct lever before this compounds into pace loss that easy mileage cannot fix.`
      : `The evidence for preserving VO₂max after 60 points consistently here: two sessions per week across an 8–10 week block produces 5–15% gains in trained masters runners.`;
  const vo2Session = {
    type: 'run', title: 'VO₂max intervals', duration: '45 min', why: vo2Why,
    steps: [
      '10 min easy jog warm-up',
      '4 × 4 min at ~90% HRmax — hard but controlled, not flat-out',
      '3 min easy jog recovery between each effort',
      '7 min easy cool-down',
    ],
  };

  const anWhy = strideFalling
    ? `Stride length has shortened ${Math.abs(strideDeltaPct).toFixed(0)}% — maximal-speed reps rebuild the fast-twitch recruitment and stretch-reflex that easy running cannot access.`
    : `Short maximal efforts preserve the fast-twitch fibres that atrophy fastest with age and that no amount of easy or threshold running can substitute for.`;
  const anaerobicSession = {
    type: 'run', title: 'Anaerobic speed reps', duration: '35 min', why: anWhy,
    steps: [
      '10 min easy jog + 4 × 20 sec strides warm-up',
      '8 × 30 sec at near-maximal effort (~95–100% HRmax)',
      '90 sec walk/jog recovery between each rep',
      '5 min easy cool-down',
    ],
  };

  // ── Strength: always exactly 2 ──────────────────────────────────────────────

  const strengthWhy = spw < 0.5
    ? `No strength sessions in the last 12 months — the single biggest gap in this programme. Muscle loss compounds faster than aerobic decline after 60.`
    : spw < 2
      ? `Averaging ${spw.toFixed(1)} sessions/week — a second weekly session adds the protective stimulus consistently tied to running longevity and bone density.`
      : `On target at ${spw.toFixed(1)} sessions/week. Maintain the compound stimulus for muscle mass, bone density, and running economy.`;
  const compoundStrength = {
    type: 'lift', title: 'Compound strength', duration: '50 min', why: strengthWhy,
    steps: [
      '5 min mobility warm-up',
      'Goblet squat  3 × 8 @ 70–80% effort',
      'Romanian deadlift  3 × 8',
      'Single-arm dumbbell row  3 × 10 / side',
      'Push-up or dumbbell press  3 × 10',
      'Calf raise  3 × 15 (3 sec eccentric)',
      '5 min stretching',
    ],
  };

  const secondStrength = strideFalling ? {
    type: 'lift', title: 'Power & plyometrics', duration: '35 min',
    why: `Stride length has shortened — explosive work rebuilds the fast-twitch and stretch-reflex contribution that compound lifting alone cannot restore.`,
    steps: [
      '5 min jog warm-up',
      'Broad jump or box jump  3 × 5 (full recovery between sets)',
      'Jump squat  3 × 6 @ bodyweight',
      'Pogos (two-footed quick hops)  3 × 15 sec',
      '6 × 10 sec hill sprints (walk back recovery)',
      '5 min easy cool-down',
    ],
  } : {
    type: 'lift', title: 'Running-specific strength', duration: '30 min',
    why: `Single-leg and hip-stability work addresses functional gaps that compound training alone misses — and that masters runners most often present with when injury risk rises.`,
    steps: [
      'Single-leg Romanian deadlift  3 × 8 / side',
      'Hip thrust  3 × 12',
      'Clamshell with resistance band  3 × 15 / side',
      'Copenhagen adductor plank  3 × 20 sec / side',
      'Single-leg calf raise  3 × 15 / side (slow eccentric)',
    ],
  };

  const sessions = [easyRun, vo2Session, anaerobicSession, compoundStrength, secondStrength];

  const cards = sessions.map(s => {
    const steps = s.steps.map(st => `<li>${escapeHTML(st)}</li>`).join('');
    const typeLabel = s.type === 'run' ? 'Running' : 'Strength';
    return `
      <div class="workout-card workout-card--${s.type}">
        <span class="workout-badge workout-badge--${s.type}">${typeLabel}</span>
        <div class="workout-title">${escapeHTML(s.title)}</div>
        <div class="workout-duration">${escapeHTML(s.duration)}</div>
        <p class="workout-why">${s.why}</p>
        <ol class="workout-steps">${steps}</ol>
      </div>`;
  }).join('');

  return `
    <section class="panel">
      <header>
        <h3>Session menu</h3>
        <span class="section-no">${secNo()}</span>
      </header>
      <p class="lede">Three running and two strength sessions — 30–60 minutes each — chosen for this athlete's current data and structured around the adaptations longevity research most consistently prioritises at this age.</p>
      <div class="workout-grid">${cards}</div>
    </section>`;
}
