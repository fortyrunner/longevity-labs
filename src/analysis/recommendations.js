/* ============================================================================
   RECOMMENDATIONS
   Derives 1-3 highest-leverage interventions from the computed analytics.
   ============================================================================ */

function generateRecommendations() {
  const recs = [];
  const a = state.athlete;
  const decline = analytics.vo2DeclinePerYear;
  const data = analytics.recentZoneSeconds;
  const acwr = analytics.acwr;
  const yearly = analytics.yearly;
  const recentY = yearly.slice(-3);
  const recentMeanKm = recentY.reduce((s,x)=>s+x.runKm, 0) / Math.max(1, recentY.length);

  if (decline != null) {
    if (decline > 0.5) {
      recs.push({
        title: 'Reverse the VO₂max slide',
        body: `The current rate of decline (~${decline.toFixed(1)} ml/kg/min/yr) is faster than typical for trained masters. Two 4×4-minute VO₂max intervals per week for an 8–10 week block have produced 5–15% improvements in this population. Combine with adequate recovery — masters need 48–72 h between hard sessions.`
      });
    } else if (decline > 0.2) {
      recs.push({
        title: 'Defend the VO₂max',
        body: `Decline is in the normal range for trained masters. To bend the curve flatter, protect one weekly high-intensity session — 5×3 min at ~95% HRmax, or 6×800m at 5K pace. Skipping this session is the single most common reason masters VO₂max accelerates downward after 65.`
      });
    } else {
      recs.push({
        title: 'Maintain — don\'t over-engineer',
        body: `VO₂max is essentially flat, which is the gold standard for masters preservation. Keep the structure that's working. Resist the urge to add intensity; the marginal returns are smaller than the marginal injury risk at this age.`
      });
    }
  }

  if (data) {
    const total = Object.values(data.sec).reduce((s,v)=>s+v, 0);
    const easy = (data.sec.z1 + data.sec.z2) / Math.max(1,total) * 100;
    const hard = (data.sec.z4 + data.sec.z5) / Math.max(1,total) * 100;
    if (easy < 75) {
      recs.push({
        title: 'Pull easy days easier',
        body: `Only ${easy.toFixed(0)}% of running time is genuinely easy. The next ten years of injury-free training depend on widening the gap between hard and easy — slow the easy runs by 30–45 s/km, even if it feels too slow at first. Masters who maintain this gap maintain volume.`
      });
    } else if (hard < 10) {
      recs.push({
        title: 'Add a deliberate hard day',
        body: `Easy volume is well-managed (${easy.toFixed(0)}%) but only ${hard.toFixed(0)}% of time is at high intensity. For a 63-year-old who has the aerobic base already in place, a once-weekly genuinely hard session is the highest-leverage way to defend VO₂max. Hill repeats are joint-friendly and effective.`
      });
    }
  }

  // Always include for athletes over 55: sarcopenia becomes the binding constraint
  if (a.ageYears && a.ageYears >= 55) {
    recs.push({
      title: 'Twice-weekly resistance training',
      body: `From 60 onward, sarcopenia (age-related muscle loss) becomes the rate-limiter for running longevity more than aerobic decline. Two 30-minute sessions per week of compound lifts (squat, deadlift, row, press, hip hinge) at 70–85% of 1RM preserves both running economy and bone density. This is the single most evidence-supported intervention for masters athletes that almost no masters athletes do consistently.`
    });
  }

  if (acwr != null && acwr > 1.4) {
    recs.push({
      title: 'Back off this week',
      body: `Acute-to-chronic load is at ${acwr.toFixed(2)} — elevated injury risk range. Pull next week's training down to 60–70% of the 28-day average to let adaptation catch up. The masters injury curve is unforgiving: a single lay-off costs months of fitness that may not fully return.`
    });
  } else if (acwr != null && acwr < 0.6) {
    recs.push({
      title: 'Rebuild progressively',
      body: `Acute load is well below the recent baseline — coming back from a break, illness, or taper. Ramp back at no more than 10% per week to avoid the classic "comeback injury".`
    });
  }

  if (recs.length < 3) {
    recs.push({
      title: 'Annual physiological MOT',
      body: `Bloods (HbA1c, lipid panel, ferritin, vitamin D, TSH, testosterone), a DEXA scan every 2–3 years, and an in-clinic VO₂max test annually. These three give you a precision baseline against which the next decade's training can be steered, and catch the silent things that take down otherwise-healthy masters athletes.`
    });
  }

  return recs.slice(0, 3);
}
