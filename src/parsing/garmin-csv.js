/* ============================================================================
   GARMIN CSV PARSER
   Converts a row from the Garmin Connect Activities CSV export into the app's
   normalised activity format.
   ============================================================================ */

function normalizeCsvActivity(row) {
  if (!row.Date) return null;
  const date = new Date(row.Date.replace(' ', 'T'));
  if (isNaN(date)) return null;
  const distance_km = parseFloat(row.Distance) || 0;
  const duration_s = parseHmsToSec(row.Time);
  const moving_s = parseHmsToSec(row['Moving Time']) || duration_s;
  const ascent_m = parseInt(stripCommas(row['Total Ascent'])) || 0;
  const descent_m = parseInt(stripCommas(row['Total Descent'])) || 0;
  const pace_s_per_km = parseMmssToSec(row['Avg Pace']) || (distance_km > 0 ? moving_s / distance_km : null);
  return {
    date,
    type: (row['Activity Type'] || 'unknown').toLowerCase(),
    sport: (row['Activity Type'] || '').toUpperCase(),
    name: row.Title || '',
    distance_km,
    duration_s,
    moving_s,
    ascent_m,
    descent_m,
    pace_s_per_km,
    avg_hr: numOrNull(row['Avg HR']),
    max_hr: numOrNull(row['Max HR']),
    avg_cad: numOrNull(row['Avg Run Cadence']),
    vo2max: null,
    aerobic_te: numOrNull(row['Aerobic TE']),
    calories: parseInt(stripCommas(row.Calories)) || null,
  };
}
