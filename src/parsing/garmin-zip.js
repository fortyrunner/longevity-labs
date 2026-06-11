/* ============================================================================
   GARMIN ZIP PARSERS
   Converts raw Garmin export JSON into the app's normalised activity format.
   ============================================================================ */

async function readJsonEntry(zip, entry) {
  const bytes = await zip.extract(entry.name);
  const txt = new TextDecoder('utf-8').decode(bytes);
  return JSON.parse(txt);
}

function buildAthleteFromZip(profile, bioProfile) {
  const out = {
    name: profile ? (profile.firstName || profile.userName || 'Athlete') : 'Athlete',
    sex: profile && profile.gender ? profile.gender.toLowerCase() : null,
    dob: profile && profile.birthDate ? new Date(profile.birthDate + 'T00:00:00') : null,
    heightCm: bioProfile && bioProfile[0] ? bioProfile[0].height : null,
    weightG: bioProfile && bioProfile[0] ? bioProfile[0].weight : null,
    vo2maxCurrent: bioProfile && bioProfile[0] ? bioProfile[0].vo2Max : null,
    lthr: bioProfile && bioProfile[0] ? bioProfile[0].lactateThresholdHeartRate : null,
    activityClass: bioProfile && bioProfile[0] ? bioProfile[0].activityClass : null,
  };
  if (out.dob) {
    const now = new Date();
    out.ageYears = (now - out.dob) / (365.2425 * 86400 * 1000);
  }
  return out;
}

/* Convert raw Garmin export units to display units.
   distance: cm → km. duration: ms → s. elevation: cm → m. */
function normalizeZipActivity(a) {
  if (!a.startTimeLocal && !a.startTimeGmt) return null;
  const ts = a.startTimeLocal || a.startTimeGmt;
  const date = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  if (isNaN(date)) return null;
  const distance_km = (a.distance || 0) / 100000;
  const duration_s = (a.duration || 0) / 1000;
  const moving_s = (a.movingDuration || a.duration || 0) / 1000;
  const ascent_m = (a.elevationGain || 0) / 100;
  const descent_m = (a.elevationLoss || 0) / 100;
  const pace_s_per_km = distance_km > 0 ? moving_s / distance_km : null;
  return {
    date,
    type: (a.activityType || 'unknown').toLowerCase(),
    sport: (a.sportType || '').toUpperCase(),
    name: a.name || '',
    distance_km,
    duration_s,
    moving_s,
    ascent_m,
    descent_m,
    pace_s_per_km,
    avg_hr: a.avgHr || null,
    max_hr: a.maxHr || null,
    avg_cad: a.avgRunCadence ? a.avgRunCadence * 2 : null,
    avg_stride_m: a.avgStrideLength ? a.avgStrideLength / 100 : null,
    vo2max: a.vO2MaxValue || null,
    aerobic_te: a.aerobicTrainingEffect || null,
    calories: a.calories || null,
  };
}
