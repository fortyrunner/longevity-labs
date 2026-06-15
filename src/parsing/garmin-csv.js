/* ============================================================================
   GARMIN CSV PARSER
   Converts a row from the Garmin Connect Activities CSV export into the app's
   normalised activity format.
   ============================================================================ */

function normalizeCsvActivity(row) {
  if (!row.Date) return null;
  const date = new Date(row.Date.replace(' ', 'T'));
  if (isNaN(date)) return null;
  // Garmin CSV uses "Treadmill Running"; zip uses "treadmill_running". Normalise to underscores.
  const type = (row['Activity Type'] || 'unknown').toLowerCase().trim().replace(/\s+/g, '_');
  const distance_km = parseFloat(row.Distance) || 0;
  const duration_s = parseHmsToSec(row.Time);
  const moving_s = parseHmsToSec(row['Moving Time']) || duration_s;
  const ascent_m = parseInt(stripCommas(row['Total Ascent'])) || 0;
  const descent_m = parseInt(stripCommas(row['Total Descent'])) || 0;
  // For cycling, the "Avg Pace" column is actually speed (km/h) — never parse it as mm:ss.
  const paceParseable = !/cycling|biking|rowing|swim/.test(type);
  const pace_s_per_km = (paceParseable ? parseMmssToSec(row['Avg Pace']) : null)
    || (distance_km > 0 ? moving_s / distance_km : null);
  return {
    date,
    type,
    sport: type.toUpperCase(),
    name: row.Title || '',
    distance_km,
    duration_s,
    moving_s,
    ascent_m,
    descent_m,
    pace_s_per_km,
    avg_hr: numOrNull(row['Avg HR']),
    max_hr: numOrNull(row['Max HR']),
    avg_cad: numOrNull(row['Avg Run Cadence']), // CSV already reports total steps/min
    avg_stride_m: numOrNull(row['Avg Stride Length']),
    avg_gct_ms: null,
    avg_vo_cm: null,
    avg_vr_pct: null,
    steps: null,
    vo2max: null,
    aerobic_te: numOrNull(row['Aerobic TE']),
    calories: parseInt(stripCommas(row.Calories)) || null,
  };
}
