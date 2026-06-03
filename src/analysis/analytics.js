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

  out.firstDate = acts.length ? acts[0].date : null;
  out.lastDate = acts.length ? acts[acts.length - 1].date : null;
  out.spanYears = (out.lastDate && out.firstDate) ? ((out.lastDate - out.firstDate) / (365.25 * 86400 * 1000)) : 0;

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

  // VO2max stats and linear regression
  if (state.vo2Series.length) {
    const runVo2 = state.vo2Series.filter(v => v.sport !== 'CYCLING');
    out.vo2First = runVo2[0];
    out.vo2Last = runVo2[runVo2.length - 1];
    const t0 = out.vo2First.date.getTime();
    const points = runVo2.map(v => ({ x: (v.date.getTime() - t0)/(365.25*86400*1000), y: v.value }));
    out.vo2Reg = linReg(points);
    out.vo2DeclinePerYear = -out.vo2Reg.slope;
  }

  // Best efforts at standard distances per year (running only)
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

  // Recent intensity distribution (last 12 months of running with HR data)
  const recent = acts.filter(a => isRun(a) && a.avg_hr && a.moving_s && a.date.getTime() > Date.now() - 365.25*86400*1000);
  out.recentZoneSeconds = computeZoneSeconds(recent, ath);

  // Acute:chronic load (running, last 7 days vs last 28 days, hours)
  const now = Date.now();
  const acute = acts.filter(a => isRun(a) && (now - a.date.getTime()) < 7*86400*1000)
    .reduce((s, a) => s + a.moving_s/3600, 0);
  const chronic = acts.filter(a => isRun(a) && (now - a.date.getTime()) < 28*86400*1000)
    .reduce((s, a) => s + a.moving_s/3600, 0) / 4;
  out.acuteHours = acute;
  out.chronicHours = chronic;
  out.acwr = chronic > 0 ? acute / chronic : null;

  // 12-month rolling running km
  out.lastYearKm = acts.filter(a => isRun(a) && (now - a.date.getTime()) < 365.25*86400*1000)
    .reduce((s, a) => s + a.distance_km, 0);

  return out;
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
    maxhr = 208 - 0.7 * age; // Tanaka formula
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
  for (const a of acts) {
    const hr = a.avg_hr;
    if (!hr || !a.moving_s) continue;
    for (const [k, b] of Object.entries(z)) {
      if (hr >= b.lo && hr < b.hi) { sec[k] += a.moving_s; break; }
    }
  }
  return { sec, lthr, maxhr };
}

/* Age-graded VO2max norms — males, ml/kg/min.
   Source: ACSM/Cooper Institute health-related percentiles, generalised. */
function vo2NormForAgeSexMale(age) {
  if (age < 40)  return { p20: 33, p40: 38, p60: 44, p80: 50, p95: 57 };
  if (age < 50)  return { p20: 30, p40: 35, p60: 40, p80: 46, p95: 53 };
  if (age < 60)  return { p20: 26, p40: 31, p60: 36, p80: 42, p95: 49 };
  if (age < 70)  return { p20: 22, p40: 26, p60: 31, p80: 37, p95: 45 };
  if (age < 80)  return { p20: 19, p40: 23, p60: 27, p80: 33, p95: 40 };
  return           { p20: 16, p40: 19, p60: 23, p80: 28, p95: 35 };
}
