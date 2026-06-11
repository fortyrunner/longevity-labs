/* ============================================================================
   DATA ACQUISITION — LOADERS
   Orchestrates file reading, delegates parsing, and populates app state.
   ============================================================================ */

async function handleFile(file) {
  state.error = null;
  state.screen = 'loading';
  setStatus('Reading file…', file.name);
  render();
  try {
    const name = file.name.toLowerCase();
    if (name.endsWith('.zip')) {
      await loadZip(file);
    } else if (name.endsWith('.csv')) {
      await loadCsv(file);
    } else {
      throw new Error('Unsupported file type. Use .zip or .csv.');
    }
    await new Promise(r => setTimeout(r, 100));
    state.screen = 'dashboard';
    render();
  } catch (err) {
    console.error(err);
    state.error = err.message || String(err);
    state.screen = 'landing';
    render();
  }
}

async function loadZip(file) {
  setStatus('Reading archive…', 'Indexing zip contents');
  const buf = await file.arrayBuffer();
  const zip = await readZip(buf);

  // Identify the files we care about
  const profileEntry = zip.entries.find(e => /DI-Connect-User\/user_profile\.json$/.test(e.name));
  const bioProfileEntry = zip.entries.find(e => /userBioMetricProfileData\.json$/.test(e.name));
  const fitnessAgeEntry = zip.entries.find(e => /fitnessAgeData\.json$/.test(e.name));
  const summarizedEntries = zip.entries.filter(e => /summarizedActivities\.json$/.test(e.name));
  const vo2Entries = zip.entries.filter(e => /ActivityVo2Max_\d+_\d+_\d+\.json$/.test(e.name));

  if (!summarizedEntries.length) throw new Error('No summarizedActivities files found inside the zip. Is this a full Garmin "Export Your Data" archive?');

  // Profile
  setStatus('Reading athlete profile…', '');
  const profile = profileEntry ? await readJsonEntry(zip, profileEntry) : null;
  const bioProfile = bioProfileEntry ? await readJsonEntry(zip, bioProfileEntry) : null;
  state.athlete = buildAthleteFromZip(profile, bioProfile);

  // Activities
  setStatus('Reading activity history…', `${summarizedEntries.length} archive(s)`);
  const acts = [];
  for (let i = 0; i < summarizedEntries.length; i++) {
    const e = summarizedEntries[i];
    setStatus('Reading activity history…', `${i+1}/${summarizedEntries.length}: ${humanSize(e.uncompSize)}`);
    const json = await readJsonEntry(zip, e);
    const arr = (json && json[0] && json[0].summarizedActivitiesExport) || [];
    for (const a of arr) {
      const n = normalizeZipActivity(a);
      if (n) acts.push(n);
    }
    await yieldFrame();
  }
  acts.sort((x, y) => x.date - y.date);
  state.activities = acts;

  // VO2max series — UNION of dedicated files + per-activity vO2MaxValue.
  // Garmin's dedicated VO2max storage was retired around 2024 on some firmwares,
  // so per-activity values are essential for continuous coverage.
  setStatus('Building VO₂max trajectory…', `${vo2Entries.length} record file(s)`);
  const vo2ByDay = new Map(); // key 'YYYY-MM-DD' → { date, value, sport, source }
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  // Pass 1: dedicated files (highest priority, keep first value per day)
  for (const e of vo2Entries) {
    try {
      const json = await readJsonEntry(zip, e);
      if (Array.isArray(json)) {
        for (const r of json) {
          if (r.vo2MaxValue && r.calendarDate) {
            const k = r.calendarDate;
            if (!vo2ByDay.has(k)) {
              vo2ByDay.set(k, {
                date: new Date(r.calendarDate + 'T00:00:00Z'),
                value: r.vo2MaxValue,
                sport: r.sport || 'GENERIC',
                source: 'dedicated',
              });
            }
          }
        }
      }
    } catch (err) { /* skip bad files */ }
    await yieldFrame();
  }
  // Pass 2: backfill from per-activity vO2MaxValue on days without a dedicated reading
  for (const a of acts) {
    if (!a.vo2max || !isRun(a)) continue;
    const k = dayKey(a.date);
    if (!vo2ByDay.has(k)) {
      vo2ByDay.set(k, {
        date: a.date,
        value: a.vo2max,
        sport: 'RUNNING',
        source: 'activity',
      });
    }
  }
  const vo2 = Array.from(vo2ByDay.values()).sort((x, y) => x.date - y.date);
  state.vo2Series = vo2;

  // Fitness age series
  if (fitnessAgeEntry) {
    setStatus('Reading biological-age series…', '');
    try {
      const json = await readJsonEntry(zip, fitnessAgeEntry);
      if (Array.isArray(json)) {
        state.fitnessAgeSeries = json
          .filter(r => r.asOfDateGmt && r.currentBioAge)
          .map(r => ({
            date: new Date(r.asOfDateGmt),
            bioAge: r.currentBioAge,
            chronoAge: r.chronologicalAge,
            rhr: r.rhr,
            bmi: r.bmi,
            biometricVo2: r.biometricVo2Max,
          }))
          .sort((x, y) => x.date - y.date);
      }
    } catch (err) { /* skip */ }
  }

  state.source = 'zip';
  setStatus('Done', `${acts.length} activities`);
}

async function loadCsv(file) {
  setStatus('Parsing CSV…', file.name);
  const text = await file.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    console.warn('CSV parse warnings:', parsed.errors.slice(0, 3));
  }
  const acts = parsed.data.map(normalizeCsvActivity).filter(Boolean);
  acts.sort((x, y) => x.date - y.date);
  state.activities = acts;
  state.vo2Series = [];   // CSV doesn't carry VO2max in standard export
  state.fitnessAgeSeries = [];
  state.athlete = null;   // Will prompt user for DOB+sex on the dashboard
  state.source = 'csv';
  setStatus('Done', `${acts.length} activities`);
}
