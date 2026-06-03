/* ============================================================================
   UI — CHART RENDERING
   All Chart.js visualisations. Reads from state and the analytics object.
   Swap this file to change the charting library without touching anything else.
   ============================================================================ */

function isMobile() { return window.matchMedia && window.matchMedia('(max-width: 640px)').matches; }

function renderCharts() {
  if (state.source === 'csv' && !state.athlete) return;
  Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
  Chart.defaults.font.size = isMobile() ? 10 : 11;
  Chart.defaults.color = '#44403C';
  Chart.defaults.borderColor = '#E7E2D5';

  if (state.vo2Series.length) renderVo2Chart();
  renderVolumeChart();
  if (state.fitnessAgeSeries.length) renderBioAgeChart();
  if (analytics.bestPerYear.length) renderPerfChart();
  if (analytics.recentZoneSeconds) renderZoneChart();
}

function renderVo2Chart() {
  const ctx = document.getElementById('chart-vo2');
  if (!ctx) return;
  const a = state.athlete;
  const norm = a.ageYears ? vo2NormForAgeSexMale(a.ageYears) : null;
  const points = state.vo2Series.map(v => ({ x: v.date, y: v.value }));
  const reg = analytics.vo2Reg;
  const firstT = state.vo2Series[0].date.getTime();
  const lastT = state.vo2Series[state.vo2Series.length-1].date.getTime();
  const regLine = [
    { x: new Date(firstT), y: reg.intercept },
    { x: new Date(lastT), y: reg.intercept + reg.slope * ((lastT - firstT)/(365.25*86400*1000)) }
  ];
  const datasets = [
    {
      label: 'VO₂max readings',
      data: points,
      borderColor: 'rgba(28,25,23,0.18)',
      backgroundColor: 'rgba(28,25,23,0.55)',
      pointRadius: 2,
      pointHoverRadius: 4,
      showLine: false,
      type: 'line',
    },
    {
      label: 'Linear trend',
      data: regLine,
      borderColor: '#8B2635',
      backgroundColor: 'transparent',
      pointRadius: 0,
      borderWidth: 2,
      type: 'line',
      tension: 0,
    },
  ];
  state.charts.push(new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      aspectRatio: 1.7,
      plugins: { legend: { display: false }, tooltip: { mode: 'nearest', intersect: false } },
      scales: {
        x: { type: 'time', time: { unit: 'year' }, grid: { color: '#E7E2D5' } },
        y: { title: { display: true, text: 'ml·kg⁻¹·min⁻¹' }, grid: { color: '#E7E2D5' } },
      },
    },
  }));
  if (norm) drawVo2ReferenceLines(ctx, norm);
}

function drawVo2ReferenceLines(canvas, norm) {
  const ch = state.charts[state.charts.length-1];
  const firstT = state.vo2Series[0].date;
  const lastT = state.vo2Series[state.vo2Series.length-1].date;
  const refs = [
    { y: norm.p95, c: 'rgba(92,122,90,0.4)', label: `Top 5%` },
    { y: norm.p80, c: 'rgba(92,122,90,0.3)', label: `Top 20%` },
    { y: norm.p60, c: 'rgba(120,113,108,0.35)', label: `Above avg` },
    { y: norm.p40, c: 'rgba(184,117,61,0.35)', label: `Average` },
  ];
  refs.forEach(r => {
    ch.data.datasets.push({
      label: r.label,
      data: [{ x: firstT, y: r.y }, { x: lastT, y: r.y }],
      borderColor: r.c,
      borderDash: [4, 4],
      borderWidth: 1,
      pointRadius: 0,
      type: 'line',
      tension: 0,
    });
  });
  ch.update();
}

function makeBandAnnotation() { return null; }
function makeLineAnnotation() { return null; }

function renderVolumeChart() {
  const ctx = document.getElementById('chart-volume');
  if (!ctx) return;
  const y = analytics.yearly;
  state.charts.push(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: y.map(x => x.year),
      datasets: [
        {
          label: 'Running (km)',
          data: y.map(x => Math.round(x.runKm)),
          backgroundColor: '#1F3A5F',
          borderRadius: 1,
        },
        {
          label: 'Other (km)',
          data: y.map(x => Math.round(Math.max(0, x.km - x.runKm))),
          backgroundColor: '#A8A29E',
          borderRadius: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      aspectRatio: 1.7,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: isMobile() ? 8 : 12 } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, maxRotation: isMobile() ? 60 : 0, minRotation: isMobile() ? 60 : 0 } },
        y: { stacked: true, title: { display: !isMobile(), text: 'km' }, grid: { color: '#E7E2D5' } },
      },
    },
  }));
}

function renderBioAgeChart() {
  const ctx = document.getElementById('chart-bioage');
  if (!ctx) return;
  const monthly = downsampleByMonth(state.fitnessAgeSeries);
  state.charts.push(new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Calendar age',
          data: monthly.map(m => ({ x: m.date, y: m.chronoAge })),
          borderColor: '#78716C',
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [3, 3],
        },
        {
          label: 'Biological age (Garmin)',
          data: monthly.map(m => ({ x: m.date, y: m.bioAge })),
          borderColor: '#8B2635',
          backgroundColor: 'rgba(139,38,53,0.05)',
          pointRadius: 0,
          borderWidth: 2,
          fill: false,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      aspectRatio: 1.7,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { type: 'time', time: { unit: 'month' }, grid: { color: '#E7E2D5' } },
        y: { title: { display: true, text: 'years' }, grid: { color: '#E7E2D5' } },
      },
    },
  }));
}

function downsampleByMonth(series) {
  const m = {};
  for (const r of series) {
    const k = r.date.getUTCFullYear() + '-' + (r.date.getUTCMonth()+1);
    if (!m[k]) m[k] = { date: new Date(Date.UTC(r.date.getUTCFullYear(), r.date.getUTCMonth(), 15)), sum: {bioAge:0, chronoAge:0, rhr:0, bmi:0}, n: 0 };
    m[k].sum.bioAge += r.bioAge;
    m[k].sum.chronoAge += r.chronoAge;
    m[k].sum.rhr += r.rhr;
    m[k].sum.bmi += r.bmi;
    m[k].n += 1;
  }
  return Object.values(m).map(x => ({
    date: x.date,
    bioAge: x.sum.bioAge / x.n,
    chronoAge: x.sum.chronoAge / x.n,
    rhr: x.sum.rhr / x.n,
    bmi: x.sum.bmi / x.n,
  })).sort((a,b)=>a.date-b.date);
}

function renderPerfChart() {
  const ctx = document.getElementById('chart-perf');
  if (!ctx) return;
  const dists = ['5K', '10K', 'HM', 'M'];
  const colors = { '5K': '#1F3A5F', '10K': '#5C7A5A', 'HM': '#B8753D', 'M': '#8B2635' };
  const datasets = dists.map(d => {
    const data = analytics.bestPerYear
      .filter(b => b.distance === d)
      .map(b => ({ x: b.year, y: b.time / 60 }));
    return {
      label: d,
      data,
      borderColor: colors[d],
      backgroundColor: colors[d],
      pointRadius: 3,
      borderWidth: 2,
      tension: 0.2,
      fill: false,
    };
  }).filter(ds => ds.data.length);
  state.charts.push(new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      aspectRatio: 1.7,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'year' }, ticks: { callback: v => v.toFixed(0) }, grid: { color: '#E7E2D5' } },
        y: { title: { display: true, text: 'minutes' }, grid: { color: '#E7E2D5' } },
      },
    },
  }));
}

function renderZoneChart() {
  const ctx = document.getElementById('chart-zones');
  if (!ctx) return;
  const data = analytics.recentZoneSeconds;
  const total = Object.values(data.sec).reduce((s,v)=>s+v,0);
  const pct = k => total > 0 ? (data.sec[k]/total*100) : 0;
  state.charts.push(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Z1 Easy', 'Z2 Steady', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO₂max'],
      datasets: [
        {
          label: '% of running time',
          data: ['z1','z2','z3','z4','z5'].map(pct),
          backgroundColor: ['#5C7A5A','#84A082','#B8753D','#A03A30','#8B2635'],
          borderRadius: 1,
        }
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      aspectRatio: 1.7,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: '% of HR-tracked running time' }, ticks: { callback: v => v + '%' }, grid: { color: '#E7E2D5' } },
        y: { grid: { display: false } },
      },
    },
  }));
}
