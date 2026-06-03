/* ============================================================================
   UI — HTML TEMPLATES
   All screen HTML generators and event wiring. No analytics logic here —
   this module only reads state/analytics and produces markup.
   ============================================================================ */

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

function updateFooterCounts() {
  const el = document.getElementById('data-counts');
  if (state.screen === 'dashboard') {
    el.textContent = `${state.activities.length} activities · ${state.vo2Series.length} VO₂ records · ${state.fitnessAgeSeries.length} bio-age days`;
  } else {
    el.textContent = '';
  }
}

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

/* ---- Dashboard ---- */

function dashboardHTML() {
  if (state.source === 'csv' && !state.athlete) {
    return manualProfileFormHTML();
  }
  analytics = computeAnalytics();
  return [
    athleteHeaderHTML(),
    kpiStripHTML(),
    state.vo2Series.length ? vo2PanelHTML() : '',
    volumePanelHTML(),
    state.fitnessAgeSeries.length ? bioAgePanelHTML() : '',
    performancePanelHTML(),
    intensityPanelHTML(),
    projectionPanelHTML(),
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
  if (!dob) { alert('Please enter a date of birth.'); return; }
  state.athlete = {
    name: 'Athlete',
    sex,
    dob: new Date(dob + 'T00:00:00'),
    rhr,
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
    const norm = vo2NormForAgeSexMale(a.ageYears);
    if (vo2 >= norm.p95) verdictText = `At <strong>${vo2} ml/kg/min</strong>, his VO₂max sits in the <strong>top ~5%</strong> for his age band — comparable to a fit man fifteen to twenty years younger.`;
    else if (vo2 >= norm.p80) verdictText = `At <strong>${vo2} ml/kg/min</strong>, his VO₂max sits in the <strong>top quintile</strong> for his age band.`;
    else if (vo2 >= norm.p60) verdictText = `At <strong>${vo2} ml/kg/min</strong>, his VO₂max is <strong>above average</strong> for his age band.`;
    else verdictText = `At <strong>${vo2} ml/kg/min</strong>, his VO₂max is <strong>around the median</strong> for his age band — room to develop.`;
  }

  return `
    <div class="dash">
      <div class="athlete-card">
        <div class="left">
          <div class="eyebrow">SUBJECT</div>
          <h2>${escapeHTML(a.name)}, <em>${age} y</em></h2>
          <div class="meta">
            ${sex}${height !== '—' ? ` &middot; ${height} cm &middot; ${weight} kg` : ''}<br>
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
  const norm = a.ageYears ? vo2NormForAgeSexMale(a.ageYears) : null;
  let vo2Sub = '';
  if (vo2Latest && norm) {
    if (vo2Latest >= norm.p95) vo2Sub = `<span class="good">top 5% for age</span>`;
    else if (vo2Latest >= norm.p80) vo2Sub = `<span class="good">top 20% for age</span>`;
    else if (vo2Latest >= norm.p60) vo2Sub = `<span class="good">above average</span>`;
    else if (vo2Latest >= norm.p40) vo2Sub = `<span class="warn">around average</span>`;
    else vo2Sub = `<span class="bad">below average</span>`;
  }

  let bioGapKpi = '';
  if (state.fitnessAgeSeries.length) {
    const last = state.fitnessAgeSeries[state.fitnessAgeSeries.length-1];
    const gap = last.chronoAge - last.bioAge;
    const cls = gap > 5 ? 'good' : (gap > 0 ? 'warn' : 'bad');
    bioGapKpi = `
      <div class="kpi">
        <div class="label">Bio age gap</div>
        <div class="value">${gap >= 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}<span class="unit">y</span></div>
        <div class="sub ${cls}">${gap >= 0 ? 'younger than calendar' : 'older than calendar'}</div>
      </div>`;
  }

  const lastYearKm = analytics.lastYearKm;
  const acwr = analytics.acwr;
  let acwrSub = '—';
  if (acwr != null) {
    if (acwr > 1.5) acwrSub = `<span class="bad">overreaching range</span>`;
    else if (acwr > 1.3) acwrSub = `<span class="warn">elevated</span>`;
    else if (acwr < 0.7) acwrSub = `<span class="warn">detraining</span>`;
    else acwrSub = `<span class="good">sustainable</span>`;
  }

  const decline = analytics.vo2DeclinePerYear;
  let declineSub = '';
  if (decline != null) {
    if (decline < 0.2) declineSub = `<span class="good">essentially flat</span>`;
    else if (decline < 0.4) declineSub = `<span class="good">slower than typical</span>`;
    else if (decline < 0.7) declineSub = `<span class="warn">typical for masters</span>`;
    else declineSub = `<span class="bad">faster than typical</span>`;
  }

  return `
    <div class="kpi-strip">
      <div class="kpi">
        <div class="label">VO₂max — latest</div>
        <div class="value">${vo2Latest ? vo2Latest.toFixed(0) : '—'}<span class="unit">ml·kg⁻¹·min⁻¹</span></div>
        <div class="sub">${vo2Sub}</div>
      </div>
      <div class="kpi">
        <div class="label">VO₂max trend</div>
        <div class="value">${decline != null ? (decline >= 0 ? '−' : '+') + Math.abs(decline).toFixed(2) : '—'}<span class="unit">/yr</span></div>
        <div class="sub">${declineSub}</div>
      </div>
      ${bioGapKpi || `
      <div class="kpi">
        <div class="label">Running, last 12 mo</div>
        <div class="value">${Math.round(lastYearKm)}<span class="unit">km</span></div>
        <div class="sub">${Math.round(lastYearKm/52)} km/wk avg</div>
      </div>`}
      <div class="kpi">
        <div class="label">Load — acute : chronic</div>
        <div class="value">${acwr != null ? acwr.toFixed(2) : '—'}</div>
        <div class="sub">${acwrSub}</div>
      </div>
    </div>
  `;
}

function vo2PanelHTML() {
  const a = state.athlete;
  const reg = analytics.vo2Reg;
  const declineText = reg ? `${reg.slope >= 0 ? '+' : ''}${reg.slope.toFixed(2)} ml/kg/min per year (R²=${reg.r2.toFixed(2)})` : '—';
  const popDecline = 0.45;
  let assessment = '';
  if (reg) {
    const slope = -reg.slope;
    if (slope < 0.2) assessment = 'essentially flat over the recorded window — exceptional preservation';
    else if (slope < popDecline * 0.8) assessment = `slower than the ~${popDecline} ml/kg/min/yr typical of trained masters athletes`;
    else if (slope < popDecline * 1.3) assessment = `in line with population norms for trained masters athletes (~${popDecline} ml/kg/min/yr)`;
    else assessment = `faster than typical for trained masters — worth investigating training load distribution and recovery`;
  }
  let projection = '';
  if (reg && a.ageYears) {
    const lastVo2 = state.vo2Series[state.vo2Series.length-1].value;
    const proj = (target) => Math.max(15, lastVo2 + reg.slope * (target - a.ageYears));
    projection = `
      <p>If the current slope continues, projected VO₂max:<br>
      <span class="stat">age 70 → ${proj(70).toFixed(0)}</span>
      &nbsp;<span class="stat">age 75 → ${proj(75).toFixed(0)}</span>
      &nbsp;<span class="stat">age 80 → ${proj(80).toFixed(0)}</span></p>
      <p style="margin-top:10px;font-size:0.86rem;color:var(--ink-3)">The threshold for fully-independent stair climbing and brisk walking sits around <span class="stat">17.5 ml/kg/min</span>. On the current trajectory this is decades away.</p>
    `;
  }
  return `
    <section class="panel">
      <header><h3>VO₂max trajectory</h3><span class="section-no">§ 01</span></header>
      <p class="lede">The single best validated marker of cardiorespiratory fitness and the strongest endurance-related predictor of all-cause mortality. For masters athletes the question isn't the absolute number — it's the slope.</p>
      <div class="panel-body">
        <div class="chart-host"><canvas id="chart-vo2"></canvas></div>
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

function volumePanelHTML() {
  const y = analytics.yearly;
  const span = y.length;
  const totalKm = y.reduce((s,x)=>s+x.km, 0);
  const totalHours = y.reduce((s,x)=>s+x.hours, 0);
  const recentY = y.slice(-3);
  const recentMeanKm = recentY.reduce((s,x)=>s+x.km, 0) / Math.max(1, recentY.length);
  const drops = [];
  const today = new Date();
  const thisYear = today.getFullYear();
  const yearComplete = (yr) => yr < thisYear || (yr === thisYear && today.getMonth() >= 11);
  for (let i = 1; i < y.length; i++) {
    if (!yearComplete(y[i].year)) continue;
    if (y[i-1].runKm > 100 && y[i].runKm < y[i-1].runKm * 0.75) {
      drops.push({ year: y[i].year, fromKm: y[i-1].runKm, toKm: y[i].runKm });
    }
  }
  let partialYearNote = '';
  const lastY = y[y.length - 1];
  if (lastY && !yearComplete(lastY.year)) {
    const firstDayOfYear = new Date(lastY.year, 0, 1);
    const daysElapsed = Math.max(1, (today - firstDayOfYear) / 86400000);
    const annualisedKm = lastY.runKm * 365 / daysElapsed;
    partialYearNote = `<p style="font-size:0.86rem;color:var(--ink-3)">${lastY.year} is partial (${Math.round(daysElapsed)} days elapsed). At current pace, projected annual running: <span class="stat">${Math.round(annualisedKm)} km</span>.</p>`;
  }
  return `
    <section class="panel">
      <header><h3>Annual training volume</h3><span class="section-no">§ 02</span></header>
      <p class="lede">Sustained volume is what builds the aerobic foundation. Drops of more than ~25% year-on-year usually flag an injury, illness, or life event worth investigating.</p>
      <div class="panel-body">
        <div class="chart-host"><canvas id="chart-volume"></canvas></div>
        <div class="notes">
          <h4>${span}-year totals</h4>
          <p>${Math.round(totalKm).toLocaleString()} km across ${Math.round(totalHours).toLocaleString()} hours of moving time. Recent three-year mean: <span class="stat">${Math.round(recentMeanKm)} km/yr</span>.</p>
          ${drops.length ? `<p><strong>${drops.length} year-on-year drop${drops.length>1?'s':''}</strong> exceeding 25%: ${drops.map(d=>`<span class="stat">${d.year} (${Math.round(d.fromKm)}→${Math.round(d.toKm)})</span>`).join(' ')}</p>` : '<p>No year-on-year drops exceeding 25% across the completed years — remarkable consistency.</p>'}
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
      <header><h3>Biological age vs. calendar age</h3><span class="section-no">§ 03</span></header>
      <p class="lede">Garmin's estimate of cardiometabolic age, derived from BMI, resting heart rate, and activity intensity history. Useful as a directional indicator — not a clinical diagnosis.</p>
      <div class="panel-body">
        <div class="chart-host"><canvas id="chart-bioage"></canvas></div>
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
        <header><h3>Performance trajectory</h3><span class="section-no">§ 04</span></header>
        <p class="lede">No standard race distances (5K, 10K, half marathon, marathon) detected in the activity history.</p>
      </section>
    `;
  }
  const years = [...new Set(bp.map(b => b.year))].sort();
  const recentYears = years.slice(-5);
  const dists = ['5K','10K','HM','M'];
  const tableRows = recentYears.map(y => {
    const cells = dists.map(d => {
      const r = bp.find(b => b.year === y && b.distance === d);
      return `<td>${r ? fmtTime(r.time) : '—'}</td>`;
    }).join('');
    return `<tr><td>${y}</td>${cells}</tr>`;
  }).join('');

  return `
    <section class="panel">
      <header><h3>Best efforts by year</h3><span class="section-no">§ 04</span></header>
      <p class="lede">Fastest recorded effort each year at four standard distances. Counts only activities whose total distance falls within ±5% of the race mark, so it's noisier than real race results but reflects real fitness.</p>
      <div class="panel-body">
        <div class="chart-host"><canvas id="chart-perf"></canvas></div>
        <div class="notes">
          <h4>Recent best efforts</h4>
          <table class="data-table">
            <thead><tr><th>Year</th><th>5K</th><th>10K</th><th>Half</th><th>Marathon</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          <p style="margin-top:12px;font-size:0.84rem;color:var(--ink-3)">Times do not control for course, weather, or whether the effort was a race. Treat the trend, not the individual numbers.</p>
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
        <header><h3>Intensity distribution</h3><span class="section-no">§ 05</span></header>
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

  return `
    <section class="panel">
      <header><h3>Intensity distribution &mdash; last 12 months</h3><span class="section-no">§ 05</span></header>
      <p class="lede">For preserving VO₂max into the seventies, the polarised model — ~80% strictly easy, ~20% genuinely hard, almost nothing in the middle — has the strongest evidence in masters populations.</p>
      <div class="panel-body">
        <div class="chart-host"><canvas id="chart-zones"></canvas></div>
        <div class="notes">
          <h4>Easy / Hard ratio</h4>
          <p><span class="stat">${ratio}</span> &middot; total ${(total/3600).toFixed(0)} hours of HR-tracked running</p>
          <p>${verdict}</p>
          <p style="font-size:0.84rem;color:var(--ink-3)">Zones derived from lactate-threshold HR (<span class="stat">${Math.round(data.lthr)} bpm</span>${data.maxhr ? ` &middot; Tanaka-predicted max ${Math.round(data.maxhr)}` : ''}) using Friel-style boundaries.</p>
        </div>
      </div>
    </section>
  `;
}

function projectionPanelHTML() {
  const recs = generateRecommendations();
  return `
    <section class="panel">
      <header><h3>Highest-leverage interventions, next 10–15 years</h3><span class="section-no">§ 06</span></header>
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
