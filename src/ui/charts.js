/* ============================================================================
   UI — CHART RENDERING
   All ApexCharts visualisations. Reads from state and the analytics object.
   ApexCharts is loaded via CDN in html-shell.html and mounts into the
   <div id="chart-*"> placeholders rendered by templates.js.
   ============================================================================ */

/* Convert a Date to a decimal year (e.g. 2024-07-01 ≈ 2024.50).
   Lets us use a plain numeric x-axis everywhere instead of a date/time axis. */
function dateToYear(d) {
  const y = d.getFullYear();
  const startOfYear = new Date(y, 0, 1).getTime();
  const startOfNext = new Date(y + 1, 0, 1).getTime();
  return y + (d.getTime() - startOfYear) / (startOfNext - startOfYear);
}

function yearLabel(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* y-axis label formatter — without this ApexCharts can pick absurd
   precisions (e.g. "1.000000000000") for axes with a narrow data range. */
function fixed(decimals) {
  return v => Number(v).toFixed(decimals);
}

/* Shared chart-level config. `chartExtra` merges into the `chart` object
   (e.g. { stacked: true, type: 'bar' }). */
function baseChart(type, chartExtra = {}) {
  return {
    chart: {
      type,
      height: 280,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      foreColor: '#44403C',
      toolbar: { show: false },
      animations: { enabled: false },
      parentHeightOffset: 0,
      ...chartExtra,
    },
    grid: { borderColor: '#E7E2D5' },
    dataLabels: { enabled: false },
  };
}

/* Shared x-axis config for charts plotted against decimal years */
function yearAxis(extra = {}) {
  return {
    type: 'numeric',
    tickAmount: 8,
    labels: { formatter: yearLabel },
    ...extra,
  };
}

function mountChart(id, options) {
  const el = document.getElementById(id);
  if (!el) return;
  const chart = new ApexCharts(el, options);
  chart.render();
  state.charts.push(chart);
}

function renderCharts() {
  if (state.source === 'csv' && !state.athlete) return;
  if (state.vo2Series.length) renderVo2Chart();
  if (analytics.efMonthly.series.length >= 3) renderEfChart();
  renderVolumeChart();
  if (state.fitnessAgeSeries.length) renderBioAgeChart();
  if (analytics.bestPerYear.length) renderPerfChart();
  if (analytics.recentZoneSeconds) renderZoneChart();
  if (analytics.gaitMonthly.length >= 3) renderGaitChart();
}

function renderVo2Chart() {
  const a = state.athlete;
  const norm = a.ageYears ? vo2NormForAgeSex(a.ageYears, a.sex) : null;
  const points = state.vo2Series.map(v => [dateToYear(v.date), v.value]);
  const reg = analytics.vo2Reg;
  const yFirst = dateToYear(state.vo2Series[0].date);
  const yLast  = dateToYear(state.vo2Series[state.vo2Series.length - 1].date);
  const regLine = [
    [yFirst, reg.intercept],
    [yLast,  reg.intercept + reg.slope * (yLast - yFirst)],
  ];

  const series = [
    { name: 'VO₂max readings', data: points },
    { name: 'Linear trend', data: regLine },
  ];
  const colors = ['rgba(28,25,23,0.55)', '#8B2635'];
  const widths  = [0, 2];
  const dashes  = [0, 0];
  const markers = [2, 0];

  if (norm) {
    const refs = [
      { y: norm.p95, c: 'rgba(92,122,90,0.4)',    label: 'Top 5%'    },
      { y: norm.p80, c: 'rgba(92,122,90,0.3)',    label: 'Top 20%'   },
      { y: norm.p60, c: 'rgba(120,113,108,0.35)', label: 'Above avg' },
      { y: norm.p40, c: 'rgba(184,117,61,0.35)',  label: 'Average'   },
    ];
    for (const r of refs) {
      series.push({ name: r.label, data: [[yFirst, r.y], [yLast, r.y]] });
      colors.push(r.c);
      widths.push(1);
      dashes.push(4);
      markers.push(0);
    }
  }

  mountChart('chart-vo2', {
    ...baseChart('line'),
    series,
    colors,
    stroke: { width: widths, dashArray: dashes, curve: 'straight' },
    markers: { size: markers, hover: { size: 4 } },
    legend: { show: false },
    tooltip: { shared: false, intersect: false },
    xaxis: yearAxis(),
    yaxis: { title: { text: 'ml·kg⁻¹·min⁻¹' }, labels: { formatter: fixed(1) } },
  });
}

function renderVolumeChart() {
  const y = analytics.yearly;
  mountChart('chart-volume', {
    ...baseChart('bar', { stacked: true }),
    series: [
      { name: 'Running (km)', data: y.map(x => Math.round(x.runKm)) },
      { name: 'Other (km)', data: y.map(x => Math.round(Math.max(0, x.km - x.runKm))) },
    ],
    colors: ['#1F3A5F', '#A8A29E'],
    plotOptions: { bar: { borderRadius: 1, borderRadiusApplication: 'end' } },
    legend: { position: 'bottom' },
    xaxis: { categories: y.map(x => String(x.year)) },
    yaxis: { title: { text: 'km' }, labels: { formatter: fixed(0) } },
  });
}

function renderEfChart() {
  const { series: monthly, reg } = analytics.efMonthly;
  const series = [
    { name: 'Monthly EF (easy runs)', type: 'area', data: monthly.map(m => [dateToYear(m.date), m.ef]) },
  ];
  const colors  = ['#5C7A5A'];
  const widths  = [2];
  const dashes  = [0];
  const markers = [2.5];
  const fills   = [0.08];

  if (reg) {
    const y0 = dateToYear(monthly[0].date);
    const y1 = dateToYear(monthly[monthly.length - 1].date);
    series.push({ name: 'Trend', type: 'line', data: [[y0, reg.intercept], [y1, reg.intercept + reg.slope * (y1 - y0)]] });
    colors.push('#8B2635');
    widths.push(1.5);
    dashes.push(5);
    markers.push(0);
    fills.push(0);
  }

  mountChart('chart-ef', {
    ...baseChart('line'),
    series,
    colors,
    stroke: { width: widths, dashArray: dashes, curve: 'smooth' },
    markers: { size: markers },
    fill: { type: 'solid', opacity: fills },
    legend: { show: false },
    xaxis: yearAxis(),
    yaxis: { title: { text: 'm·min⁻¹ / bpm' }, labels: { formatter: fixed(2) } },
  });
}

function renderGaitChart() {
  const g = analytics.gaitMonthly;
  const series = [];
  const colors = [];
  const widths = [];
  const dashes = [];
  const yaxis = [];

  if (g.some(m => m.stride != null)) {
    series.push({
      name: 'Stride length (m)',
      data: g.filter(m => m.stride != null).map(m => [dateToYear(m.date), m.stride]),
    });
    colors.push('#B8753D');
    widths.push(2);
    dashes.push(0);
    yaxis.push({ seriesName: 'Stride length (m)', title: { text: 'stride (m)' }, labels: { formatter: fixed(2) } });
  }
  if (g.some(m => m.cad != null)) {
    series.push({
      name: 'Cadence (spm)',
      data: g.filter(m => m.cad != null).map(m => [dateToYear(m.date), m.cad]),
    });
    colors.push('#1F3A5F');
    widths.push(1.5);
    dashes.push(4);
    yaxis.push({ seriesName: 'Cadence (spm)', opposite: true, title: { text: 'cadence (spm)' }, labels: { formatter: fixed(0) } });
  }

  mountChart('chart-gait', {
    ...baseChart('line'),
    series,
    colors,
    stroke: { width: widths, dashArray: dashes, curve: 'smooth' },
    markers: { size: 0 },
    legend: { position: 'bottom' },
    xaxis: yearAxis(),
    yaxis,
  });
}

function renderBioAgeChart() {
  const monthly = downsampleByMonth(state.fitnessAgeSeries);
  mountChart('chart-bioage', {
    ...baseChart('line'),
    series: [
      { name: 'Calendar age', data: monthly.map(m => [dateToYear(m.date), m.chronoAge]) },
      { name: 'Biological age (Garmin)', data: monthly.map(m => [dateToYear(m.date), m.bioAge]) },
    ],
    colors: ['#78716C', '#8B2635'],
    stroke: { width: [1.5, 2], dashArray: [3, 0], curve: 'smooth' },
    markers: { size: 0 },
    legend: { position: 'bottom' },
    xaxis: yearAxis(),
    yaxis: { title: { text: 'years' }, labels: { formatter: fixed(1) } },
  });
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
  const dists = ['5K', '10K', 'HM', 'M'];
  const colorMap = { '5K': '#1F3A5F', '10K': '#5C7A5A', 'HM': '#B8753D', 'M': '#8B2635' };
  const series = [];
  const colors = [];
  for (const d of dists) {
    const data = analytics.bestPerYear
      .filter(b => b.distance === d)
      .map(b => [b.year, b.time / 60]); // minutes
    if (data.length) {
      series.push({ name: d, data });
      colors.push(colorMap[d]);
    }
  }
  mountChart('chart-perf', {
    ...baseChart('line'),
    series,
    colors,
    stroke: { width: 2, curve: 'smooth' },
    markers: { size: 3 },
    legend: { position: 'bottom' },
    xaxis: { type: 'numeric', title: { text: 'year' }, labels: { formatter: fixed(0) } },
    yaxis: { title: { text: 'minutes' }, labels: { formatter: fixed(1) } },
  });
}

function renderZoneChart() {
  const data = analytics.recentZoneSeconds;
  const total = Object.values(data.sec).reduce((s,v)=>s+v,0);
  const pct = k => total > 0 ? (data.sec[k]/total*100) : 0;
  mountChart('chart-zones', {
    ...baseChart('bar'),
    series: [{ name: '% of running time', data: ['z1','z2','z3','z4','z5'].map(pct) }],
    colors: ['#5C7A5A','#84A082','#B8753D','#A03A30','#8B2635'],
    plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 1 } },
    legend: { show: false },
    xaxis: {
      categories: ['Z1 Easy', 'Z2 Steady', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO₂max'],
      title: { text: '% of HR-tracked running time' },
      labels: { formatter: v => `${fixed(0)(v)}%` },
    },
    tooltip: { y: { formatter: v => `${fixed(1)(v)}%` } },
  });
}
