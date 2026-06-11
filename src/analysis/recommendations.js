/* ============================================================================
   RECOMMENDATIONS
   Derives 1-3 highest-leverage interventions from the computed analytics.
   ============================================================================ */

function generateRecommendations() {
  // Each rec carries a priority (higher = more urgent/specific). We surface the
  // three highest-priority recs so an acute issue (load spike, recent layoff)
  // can't be buried under generic evergreen advice.
  const recs = [];
  const a = state.athlete;
  const decline = analytics.vo2DeclinePerYear;
  const data = analytics.recentZoneSeconds;
  const lr = analytics.loadRatio;
  const ratio = lr ? lr.ratio : null;
  const ef = analytics.efMonthly;
  const gait = analytics.gaitMonthly;
  const layoffs = analytics.layoffs;
  const anchor = analytics.anchor;

  // --- Acute load (highest priority when triggered) ---
  if (ratio != null && ratio > 1.4) {
    recs.push({ p: 95, title: 'Ease off the ramp', body: `Your load-spike index is ${ratio.toFixed(2)} — running volume has climbed faster than your 4-week base. Hold the next week at 60–70% of recent volume to let adaptation catch up. The masters injury curve is unforgiving, and avoiding one layoff is worth more than any single hard session.` });
  } else if (ratio != null && ratio < 0.6) {
    recs.push({ p: 70, title: 'Rebuild progressively', body: `Recent running is well below your established base — a break, illness, or deliberate taper. Ramp back at no more than ~10% per week to dodge the classic comeback injury, which is how most masters lose a season.` });
  }

  // --- Recent layoff (high priority if it happened near the end of the data) ---
  if (layoffs.length) {
    const lastLayoff = layoffs[layoffs.length - 1];
    const daysSince = (anchor - lastLayoff.to) / 86400000;
    if (daysSince < 90) {
      recs.push({ p: 88, title: 'Protect the comeback', body: `A ${lastLayoff.days}-day running gap ended only ~${Math.round(daysSince)} days before this data ends. The first 6–8 weeks back are when masters athletes re-injure: cap weekly increases at 10%, keep ~90% of running easy, and add one short strides session rather than a hard interval block until durability returns.` });
    }
  }

  // --- VO2 decline ---
  if (decline != null) {
    if (decline > 0.5) {
      recs.push({ p: 80, title: 'Reverse the VO₂max slide', body: `Decline is ~${decline.toFixed(2)} ml/kg/min/yr — faster than typical for trained masters. Two VO₂max sessions per week (4×4 min at ~90% HRmax, or 6×800 m at 5K effort) across an 8–10 week block have produced 5–15% gains in this population. Keep 48–72 h between hard days.` });
    } else if (decline > 0.2) {
      recs.push({ p: 60, title: 'Defend the VO₂max', body: `Decline (~${decline.toFixed(2)} ml/kg/min/yr) is in the normal masters range. Protecting one weekly high-intensity session — 5×3 min at ~95% HRmax or hill repeats — is what keeps the curve flat. Skipping it is the most common reason VO₂max accelerates downward after 65.` });
    } else {
      recs.push({ p: 45, title: 'Maintain — don\'t over-engineer', body: `VO₂max is essentially flat — the gold standard for masters preservation. Keep the structure that's working; the marginal return on extra intensity is now smaller than the marginal injury risk.` });
    }
  }

  // --- Efficiency Factor falling (uses the new CSV-only signal) ---
  if (ef && ef.reg && ef.series.length >= 5) {
    const pctPerYear = ef.reg.slope / ef.series[0].ef * 100;
    if (pctPerYear < -2) {
      recs.push({ p: 72, title: 'Investigate the efficiency dip', body: `Aerobic efficiency (speed per heartbeat on easy runs) is falling ~${Math.abs(pctPerYear).toFixed(1)}%/yr — earlier than race times would reveal. Rule out the cheap explanations first (more heat, more hills, creeping easy pace, low ferritin), then treat it as a cue to refresh the high-intensity stimulus.` });
    }
  }

  // --- Intensity distribution ---
  if (data) {
    const total = Object.values(data.sec).reduce((s,v)=>s+v, 0);
    const easy = (data.sec.z1 + data.sec.z2) / Math.max(1,total) * 100;
    const hard = (data.sec.z4 + data.sec.z5) / Math.max(1,total) * 100;
    if (easy < 75) {
      recs.push({ p: 65, title: 'Pull easy days easier', body: `Only ${easy.toFixed(0)}% of running time is genuinely easy — too much sits in the grey zone, where fatigue accrues without proportional adaptation. Slow easy runs 30–45 s/km. The athletes who keep this gap wide are the ones who keep their volume into their seventies.` });
    } else if (hard < 8) {
      recs.push({ p: 58, title: 'Add a deliberate hard day', body: `Easy volume is well-managed (${easy.toFixed(0)}%) but only ${hard.toFixed(0)}% is genuinely hard. With the aerobic base already in place, one weekly hard session is the highest-leverage way to defend VO₂max. Hill repeats are joint-friendly and effective.` });
    }
  }

  // --- Stride shortening → plyometrics/strides (uses the new gait signal) ---
  let strideFalling = false;
  const withStride = gait.filter(m => m.stride != null);
  if (withStride.length >= 4) {
    const dPct = (withStride[withStride.length-1].stride - withStride[0].stride) / withStride[0].stride * 100;
    if (dPct < -4) strideFalling = true;
  }
  if (strideFalling) {
    recs.push({ p: 74, title: 'Rebuild stride power', body: `Stride length is shortening — the dominant mechanism of pace loss in masters runners, and a marker of declining lower-limb power. It's also reversible: 2×/week of short hill sprints, strides (6–8 × 20 s), and explosive lifts (jump squats, calf work) restore stride without the injury risk of long interval sessions.` });
  }

  // --- Strength / sarcopenia (evergreen for masters) ---
  if (a.ageYears && a.ageYears >= 55) {
    recs.push({ p: strideFalling ? 50 : 68, title: 'Twice-weekly resistance training', body: `From 60 on, sarcopenia outpaces aerobic decline as the limiter on running longevity. Two 30-min sessions/week of compound lifts (squat, hinge, row, press) at 70–85% 1RM preserve running economy and bone density. It's the best-evidenced masters intervention that almost nobody does consistently.` });
  }

  // --- Protein (strong evidence post-60, rarely surfaced) ---
  if (a.ageYears && a.ageYears >= 55) {
    recs.push({ p: 52, title: 'Raise protein to muscle-sparing levels', body: `Older athletes have blunted muscle-protein synthesis ("anabolic resistance"), so the general 0.8 g/kg/day target is too low. Aim 1.6–2.2 g/kg/day spread across meals (~30–40 g per meal), with a serving inside the post-session recovery window. This is the nutritional half of defending against sarcopenia.` });
  }

  // --- Heat caution (older thermoregulation) ---
  recs.push({ p: 30, title: 'Respect heat more than you used to', body: `Thermoregulation and thirst response both blunt with age, so hard efforts in the heat carry more risk and less reward after 60. Shift quality sessions to cooler hours, pre-hydrate, and treat EF dips in summer as weather, not lost fitness — then heat-acclimate deliberately over 10–14 days before any warm-weather goal.` });

  // --- Annual physiological baseline (evergreen) ---
  recs.push({ p: 35, title: 'Annual physiological MOT', body: `An annual blood panel (HbA1c, lipids, ferritin, vitamin D, TSH, and for men testosterone), a DEXA scan every 2–3 years, and a lab VO₂max test give a precision baseline to steer the next decade — and catch the silent issues that quietly take down otherwise-healthy masters athletes.` });

  recs.sort((x, y) => y.p - x.p);
  return recs.slice(0, 3);
}
