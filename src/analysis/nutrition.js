/* ============================================================================
   NUTRITION — PROTEIN TARGETS & FOOD SUGGESTIONS
   Derives a daily protein target from bodyweight and age, then builds an
   example day's worth of common foods that reach that target for three
   dietary patterns. Informational only — not individualised dietetic advice.
   ============================================================================ */

// g protein per kg bodyweight per day.
// General endurance athletes: ISSN position stand, ~1.2-1.6 g/kg/day.
// Masters (55+): anabolic resistance pushes the effective target to
// ~1.6-2.2 g/kg/day (consistent with the protein recommendation text).
const PROTEIN_G_PER_KG = {
  general: { low: 1.2, high: 1.6 },
  masters: { low: 1.6, high: 2.2 },
};

function computeProteinTarget(weightKg, ageYears) {
  const band = (ageYears != null && ageYears >= 55) ? PROTEIN_G_PER_KG.masters : PROTEIN_G_PER_KG.general;
  return {
    low: weightKg * band.low,
    high: weightKg * band.high,
  };
}

// Each plan is ordered with the most commonly available staples first.
// `portion` is a realistic single serving; `proteinG` is the protein it
// supplies; `max` caps how many of that serving appear in one example day.
const PROTEIN_FOOD_PLANS = {
  meat: [
    { portion: 'Chicken breast, cooked (100 g)', proteinG: 31, max: 2 },
    { portion: 'Milk (250 ml glass)', proteinG: 8, max: 3 },
    { portion: 'Mixed nuts (30 g handful)', proteinG: 6, max: 2 },
    { portion: 'Mixed seeds — pumpkin/sunflower (30 g)', proteinG: 8, max: 2 },
    { portion: 'Egg, large', proteinG: 6, max: 3 },
    { portion: 'Greek yoghurt (170 g pot)', proteinG: 17, max: 2 },
    { portion: 'Salmon or tuna, cooked (100 g)', proteinG: 22, max: 1 },
    { portion: 'Cottage cheese (100 g)', proteinG: 11, max: 1 },
  ],
  vegetarian: [
    { portion: 'Milk (250 ml glass)', proteinG: 8, max: 3 },
    { portion: 'Mixed nuts (30 g handful)', proteinG: 6, max: 2 },
    { portion: 'Mixed seeds — pumpkin/sunflower (30 g)', proteinG: 8, max: 2 },
    { portion: 'Greek yoghurt (170 g pot)', proteinG: 17, max: 2 },
    { portion: 'Egg, large', proteinG: 6, max: 3 },
    { portion: 'Cottage cheese (100 g)', proteinG: 11, max: 2 },
    { portion: 'Tofu, firm (100 g)', proteinG: 12, max: 2 },
    { portion: 'Lentils, cooked (150 g)', proteinG: 13, max: 2 },
    { portion: 'Peanut butter (2 tbsp)', proteinG: 8, max: 2 },
  ],
  vegan: [
    { portion: 'Soy milk, fortified (250 ml)', proteinG: 7, max: 3 },
    { portion: 'Mixed nuts (30 g handful)', proteinG: 6, max: 2 },
    { portion: 'Mixed seeds — pumpkin/chia/hemp (30 g)', proteinG: 9, max: 2 },
    { portion: 'Tofu, firm (100 g)', proteinG: 12, max: 2 },
    { portion: 'Tempeh (100 g)', proteinG: 19, max: 2 },
    { portion: 'Lentils, cooked (150 g)', proteinG: 13, max: 2 },
    { portion: 'Chickpeas, cooked (150 g)', proteinG: 13, max: 2 },
    { portion: 'Peanut butter (2 tbsp)', proteinG: 8, max: 2 },
    { portion: 'Plant protein shake (1 scoop)', proteinG: 20, max: 1 },
    { portion: 'Oats, dry (50 g)', proteinG: 7, max: 1 },
  ],
};

// Round-robin through the plan, adding one serving at a time, until the
// target is reached or every food has hit its daily cap.
function buildProteinPlan(targetG, planItems) {
  const items = planItems.map(it => ({ ...it, count: 0 }));
  let total = 0;
  let added = true;
  while (total < targetG && added) {
    added = false;
    for (const it of items) {
      if (total >= targetG) break;
      if (it.count < it.max) {
        it.count++;
        total += it.proteinG;
        added = true;
      }
    }
  }
  return { items: items.filter(it => it.count > 0), total };
}

function computeNutrition() {
  const a = state.athlete;
  if (!a || !a.weightG) return null;
  const weightKg = a.weightG / 1000;
  const target = computeProteinTarget(weightKg, a.ageYears);
  const plans = {};
  for (const [diet, items] of Object.entries(PROTEIN_FOOD_PLANS)) {
    plans[diet] = buildProteinPlan(target.high, items);
  }
  return { weightKg, target, plans };
}
