/* ============================================================================
   DATA ANALYSIS
   Pure computations over the normalised activity and series data in state.
   No DOM or rendering — returns plain objects consumed by the UI module.
   ============================================================================ */

const CARDIO_TYPES = new Set(['running','cycling','indoor_cycling','virtual_cycling','treadmill_running','trail_running','road_biking','mountain_biking','indoor_running']);
const RUN_TYPES = new Set(['running','treadmill_running','trail_running','indoor_running']);

function isRun(a) { return RUN_TYPES.has(a.type); }
function isCardio(a) { return CARDIO_TYPES.has(a.type); }

function computeAnalytics() {
  const acts = state.activities;
  const ath = state.athlete;
  const out = {};

  // Date span — anchor all "recency" windows to the LAST ACTIVITY, not the wall
  // clock, so a months-old export doesn't read as detraining.
  out.firstDate = acts.length ? acts[0].date : null;
  out.lastDate = acts.length ? acts[acts.length - 1].date : null;
  out.spanYears = (out.lastDate && out.firstDate) ? ((out.lastDate - out.firstDate) / (365.25 * 86400 * 1000)) : 0;
  const now = out.lastDate ? out.lastDate.getTime() : Date.now();
  out.anchor = new Date(now);

  // Yearly aggregates
  const byYear = {};
  for (const a of acts) {
    const y = a.date.getFullYear();
    if (!byYear[y]) byYear[y] = { year: y, count: 0, km: 0, hours: 0, runKm: 0, runHours: 0, runCount: 0, ascent: 0 };
    byYear[y].count += 1;
    byYear[y].km += a.distance_km;
    byYear[y].hours += a.moving_s / 3600;
    byYear[y].ascent += a.ascent_m;
    if (isRun(a)) {
      byYear[y].runKm += a.distance_km;
      byYear[y].runHours += a.moving_s / 3600;
      byYear[y].runCount += 1;
    }
  }
  out.yearly = Object.values(byYear).sort((x, y) => x.year - y.year);

  // VO2max stats
  if (state.vo2Series.length) {
    const runVo2 = state.vo2Series.filter(v => v.sport !== 'CYCLING');
    out.vo2First = runVo2[0];
    out.vo2Last = runVo2[runVo2.length - 1];
    const t0 = out.vo2First.date.getTime();
    const points = runVo2.map(v => ({ x: (v.date.getTime() - t0)/(365.25*86400*1000), y: v.value }));
    out.vo2Reg = linReg(points);
    out.vo2DeclinePerYear = -out.vo2Reg.slope;
  }

  // Best efforts at standard distances per year (running), with age grading
  const distMarks = [
    { name: '5K',  min: 4.95, max: 5.20 },
    { name: '10K', min: 9.90, max: 10.40 },
    { name: 'HM',  min: 21.00, max: 21.50 },
    { name: 'M',   min: 41.50, max: 42.50 },
  ];
  const bestByYearDist = {};
  for (const a of acts) {
    if (!isRun(a) || !a.duration_s) continue;
    for (const d of distMarks) {
      if (a.distance_km >= d.min && a.distance_km <= d.max) {
        const y = a.date.getFullYear();
        const key = `${y}|${d.name}`;
        if (!bestByYearDist[key] || a.duration_s < bestByYearDist[key].time) {
          bestByYearDist[key] = { year: y, distance: d.name, time: a.duration_s, date: a.date };
        }
      }
    }
  }
  out.bestPerYear = Object.values(bestByYearDist);
  // Age grade each best effort using the athlete's age on the day
  if (ath && ath.dob) {
    for (const b of out.bestPerYear) {
      const ageAtRace = (b.date - ath.dob) / (365.25 * 86400 * 1000);
      b.agPct = ageGradePct(b.time, b.distance, ageAtRace, ath.sex);
    }
  }

  // Recent intensity distribution (last 12 months of running before the anchor)
  const recent = acts.filter(a => isRun(a) && a.avg_hr && a.moving_s && a.date.getTime() > now - 365.25*86400*1000);
  out.recentZoneSeconds = computeZoneSeconds(recent, ath);

  // Training-load spike index: EWMA acute (7-day τ) vs chronic (28-day τ)
  // running hours over the 120 days before the anchor. The classic rolling
  // ACWR is contested (Impellizzeri et al. 2020) — treat this as a spike
  // indicator, not an injury-risk oracle.
  out.loadRatio = computeEwmaLoadRatio(acts, now);

  // 12-month rolling km (before anchor)
  out.lastYearKm = acts.filter(a => isRun(a) && (now - a.date.getTime()) < 365.25*86400*1000 && a.date.getTime() <= now)
    .reduce((s, a) => s + a.distance_km, 0);

  // Layoff detection: gaps > 21 days between consecutive runs
  out.layoffs = [];
  const runs = acts.filter(isRun);
  for (let i = 1; i < runs.length; i++) {
    const gapDays = (runs[i].date - runs[i-1].date) / 86400000;
    if (gapDays > 21) out.layoffs.push({ from: runs[i-1].date, to: runs[i].date, days: Math.round(gapDays) });
  }

  // Efficiency Factor: speed (m/min) ÷ avg HR on genuinely easy runs, monthly median.
  // The best CSV-only longitudinal aerobic-fitness signal.
  out.efMonthly = computeEfficiencyFactor(runs);

  // Biomechanics: monthly mean cadence + stride length on runs
  out.gaitMonthly = computeGaitTrend(runs);

  return out;
}

function computeEwmaLoadRatio(acts, nowMs) {
  const DAYS = 120;
  const daily = new Array(DAYS).fill(0); // hours of running per day, oldest → newest
  const start = nowMs - (DAYS - 1) * 86400000;
  let any = false;
  for (const a of acts) {
    if (!isRun(a)) continue;
    const idx = Math.floor((a.date.getTime() - start) / 86400000);
    if (idx >= 0 && idx < DAYS) { daily[idx] += a.moving_s / 3600; any = true; }
  }
  if (!any) return null;
  const la = 2 / (7 + 1), lc = 2 / (28 + 1);
  let acute = 0, chronic = 0;
  for (const h of daily) {
    acute = la * h + (1 - la) * acute;
    chronic = lc * h + (1 - lc) * chronic;
  }
  return {
    ratio: chronic > 0.02 ? acute / chronic : null,
    acuteHrsWk: acute * 7,
    chronicHrsWk: chronic * 7,
  };
}

function computeEfficiencyFactor(runs) {
  const byMonth = {};
  for (const a of runs) {
    if (!a.avg_hr || a.avg_hr < 90 || !a.moving_s || a.distance_km < 3) continue;
    // "Easy" filter: Aerobic TE below threshold-session territory when available,
    // otherwise HR below ~80% of predicted max.
    let easy;
    if (a.aerobic_te != null) easy = a.aerobic_te > 0.5 && a.aerobic_te < 3.5;
    else {
      const ath = state.athlete;
      const maxhr = ath && ath.ageYears ? predictedMaxHR(ath.ageYears, ath.sex) : null;
      easy = maxhr ? a.avg_hr < 0.8 * maxhr : false;
    }
    if (!easy) continue;
    const speedMPerMin = (a.distance_km * 1000) / (a.moving_s / 60);
    const ef = speedMPerMin / a.avg_hr;
    if (ef < 0.5 || ef > 3.5) continue; // junk guard
    const k = a.date.getFullYear() + '-' + String(a.date.getMonth() + 1).padStart(2, '0');
    if (!byMonth[k]) byMonth[k] = { date: new Date(a.date.getFullYear(), a.date.getMonth(), 15), vals: [] };
    byMonth[k].vals.push(ef);
  }
  const series = Object.values(byMonth)
    .filter(m => m.vals.length >= 2)
    .map(m => ({ date: m.date, ef: median(m.vals), n: m.vals.length }))
    .sort((a, b) => a.date - b.date);
  let reg = null;
  if (series.length >= 4) {
    const t0 = series[0].date.getTime();
    reg = linReg(series.map(s => ({ x: (s.date.getTime() - t0) / (365.25 * 86400000), y: s.ef })));
  }
  return { series, reg };
}

function computeGaitTrend(runs) {
  const byMonth = {};
  for (const a of runs) {
    const cad = a.avg_cad && a.avg_cad > 120 && a.avg_cad < 230 ? a.avg_cad : null;
    const stride = a.avg_stride_m && a.avg_stride_m > 0.5 && a.avg_stride_m < 2.2 ? a.avg_stride_m : null;
    if (!cad && !stride) continue;
    const k = a.date.getFullYear() + '-' + String(a.date.getMonth() + 1).padStart(2, '0');
    if (!byMonth[k]) byMonth[k] = { date: new Date(a.date.getFullYear(), a.date.getMonth(), 15), cad: [], stride: [] };
    if (cad) byMonth[k].cad.push(cad);
    if (stride) byMonth[k].stride.push(stride);
  }
  return Object.values(byMonth)
    .map(m => ({
      date: m.date,
      cad: m.cad.length ? m.cad.reduce((s, v) => s + v, 0) / m.cad.length : null,
      stride: m.stride.length ? m.stride.reduce((s, v) => s + v, 0) / m.stride.length : null,
    }))
    .sort((a, b) => a.date - b.date);
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function linReg(pts) {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  let sx=0, sy=0, sxx=0, sxy=0, syy=0;
  for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x*p.x; sxy += p.x*p.y; syy += p.y*p.y; }
  const meanX = sx/n, meanY = sy/n;
  const slope = (sxy - n*meanX*meanY) / (sxx - n*meanX*meanX);
  const intercept = meanY - slope*meanX;
  const ssTot = syy - n*meanY*meanY;
  let ssRes = 0; for (const p of pts) { const yh = slope*p.x + intercept; ssRes += (p.y - yh)**2; }
  const r2 = ssTot > 0 ? 1 - ssRes/ssTot : 0;
  return { slope, intercept, r2 };
}

function computeZoneSeconds(acts, athlete) {
  // Use 5-zone Karvonen-style boundaries from LTHR if known, else age-predicted
  let lthr = athlete && athlete.lthr ? athlete.lthr : null;
  let maxhr = null;
  if (athlete && athlete.dob) {
    const age = (Date.now() - athlete.dob.getTime())/(365.25*86400*1000);
    maxhr = predictedMaxHR(age, athlete.sex); // Tanaka / Gulati
  }
  if (!lthr && !maxhr) return null;
  if (!lthr && maxhr) lthr = maxhr * 0.89;
  // Friel-style running zones from LTHR
  const z = {
    z1: { lo: 0,           hi: lthr * 0.85 },
    z2: { lo: lthr * 0.85, hi: lthr * 0.89 },
    z3: { lo: lthr * 0.89, hi: lthr * 0.94 },
    z4: { lo: lthr * 0.94, hi: lthr * 1.00 },
    z5: { lo: lthr * 1.00, hi: 999         },
  };
  const sec = { z1:0, z2:0, z3:0, z4:0, z5:0 };
  let teCorrections = 0;
  for (const a of acts) {
    const hr = a.avg_hr;
    if (!hr || !a.moving_s) continue;
    let zone = null;
    for (const [k, b] of Object.entries(z)) {
      if (hr >= b.lo && hr < b.hi) { zone = k; break; }
    }
    if (!zone) continue;
    // Session-average HR hides interval work: a 6×800m session can average
    // into Z2-Z3. If Garmin scored the session's Aerobic TE ≥ 4.0
    // ("highly improving"), it contained genuinely hard work — count it Z4.
    if (a.aerobic_te != null && a.aerobic_te >= 4.0 && (zone === 'z1' || zone === 'z2' || zone === 'z3')) {
      zone = 'z4';
      teCorrections++;
    }
    sec[zone] += a.moving_s;
  }
  return { sec, lthr, maxhr, teCorrections };
}

/* Age-graded VO2max norms, ml/kg/min.
   Source: ACSM/Cooper Institute health-related percentiles, generalised. */
function vo2NormForAgeSex(age, sex) {
  const male = [
    [40, { p20: 33, p40: 38, p60: 44, p80: 50, p95: 57 }],
    [50, { p20: 30, p40: 35, p60: 40, p80: 46, p95: 53 }],
    [60, { p20: 26, p40: 31, p60: 36, p80: 42, p95: 49 }],
    [70, { p20: 22, p40: 26, p60: 31, p80: 37, p95: 45 }],
    [80, { p20: 19, p40: 23, p60: 27, p80: 33, p95: 40 }],
    [999,{ p20: 16, p40: 19, p60: 23, p80: 28, p95: 35 }],
  ];
  const female = [
    [40, { p20: 28, p40: 32, p60: 37, p80: 42, p95: 49 }],
    [50, { p20: 25, p40: 29, p60: 33, p80: 38, p95: 45 }],
    [60, { p20: 22, p40: 26, p60: 30, p80: 34, p95: 41 }],
    [70, { p20: 19, p40: 22, p60: 26, p80: 31, p95: 37 }],
    [80, { p20: 17, p40: 20, p60: 23, p80: 27, p95: 33 }],
    [999,{ p20: 15, p40: 17, p60: 20, p80: 24, p95: 29 }],
  ];
  const table = (sex === 'female') ? female : male;
  for (const [cap, norm] of table) if (age < cap) return norm;
  return table[table.length - 1][1];
}

/* Age-predicted max HR: Tanaka (men / mixed), Gulati (women). */
function predictedMaxHR(age, sex) {
  return sex === 'female' ? 206 - 0.88 * age : 208 - 0.7 * age;
}

/* ----------------------------------------------------------------------------
   WMA-style age grading for road running.
   Open-class standards (s) and age factors interpolated from a compact table
   approximating the WMA 2020/2023 road factors. Good to ~±1–2 AG points,
   which is plenty for trend analysis (we care about the slope, not the digit).
   AG% = (open standard ÷ age factor) ÷ actual time × 100.
   ---------------------------------------------------------------------------- */
const AG_OPEN_STANDARDS = {
  male:   { '5K': 765,  '10K': 1584, 'HM': 3450, 'M': 7235 },
  female: { '5K': 853,  '10K': 1726, 'HM': 3772, 'M': 7796 },
};
const AG_FACTOR_TABLE = [ // [age, factor]; ≤30 → 1.0
  [30, 1.0000], [35, 0.9852], [40, 0.9626], [45, 0.9314], [50, 0.8959],
  [55, 0.8591], [60, 0.8208], [65, 0.7811], [70, 0.7390], [75, 0.6928],
  [80, 0.6406], [85, 0.5805], [90, 0.5118],
];
function ageFactor(age) {
  const t = AG_FACTOR_TABLE;
  if (age <= t[0][0]) return 1.0;
  if (age >= t[t.length-1][0]) return t[t.length-1][1];
  for (let i = 1; i < t.length; i++) {
    if (age <= t[i][0]) {
      const [a0, f0] = t[i-1], [a1, f1] = t[i];
      return f0 + (f1 - f0) * (age - a0) / (a1 - a0);
    }
  }
  return t[t.length-1][1];
}
function ageGradePct(timeSec, dist, ageAtRace, sex) {
  const std = AG_OPEN_STANDARDS[sex === 'female' ? 'female' : 'male'][dist];
  if (!std || !timeSec || !ageAtRace) return null;
  const ageStandard = std / ageFactor(ageAtRace);
  return ageStandard / timeSec * 100;
}
