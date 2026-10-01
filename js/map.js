// ─── Experiment #1: U.S. Wind Turbine Timeline ─────────────────────────────
//
// Turbines load live from the USGS / LBNL / ACP U.S. Wind Turbine Database
// (USWTDB) API, which is public, keyless and CORS-enabled. USGS publishes a
// new release roughly quarterly, so the map picks it up automatically.
// If the API is unreachable, a slim local snapshot is used instead.
//
(function () {
  'use strict';

  const API_URL = 'https://energy.usgs.gov/api/uswtdb/v1/turbines?select=' +
    'p_name,p_year,t_hh,t_rd,t_cap,t_model,t_state,xlong,ylat,t_retrofit,t_retro_yr';
  const SNAPSHOT_URL = 'data/uswtdb-snapshot.json';
  const STEP_MS = 650;          // playback speed: one install year per step
  const TREND_MIN_N = 20;       // years with fewer turbines are left off the trend line

  // Hub-height bins (m). Single-hue sequential ramp: taller = more emphasis.
  const BINS = [
    { max: 60,       label: '< 60 m' },
    { max: 80,       label: '60–79 m' },
    { max: 100,      label: '80–99 m' },
    { max: 120,      label: '100–119 m' },
    { max: Infinity, label: '≥ 120 m' },
  ];
  const RAMP = {
    dark:  ['#2f6688', '#3d86b0', '#4ba8d1', '#8ccbe8', '#d4effb'],
    light: ['#a9d2e6', '#6eb0d3', '#2e8ab8', '#1d6690', '#0d3b5a'],
  };
  const SERIES = {   // validated against the site's surfaces (dark #13243A, light #FFF)
    dark:  { hub: '#3D97C2', rotor: '#C98228' },
    light: { hub: '#2479A6', rotor: '#B87418' },
  };
  const TILES = {
    dark:  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  };

  // ── DOM ──
  const $ = id => document.getElementById(id);
  const el = {
    status: $('tt-status'), year: $('tt-year'), slider: $('tt-slider'), play: $('tt-play'),
    count: $('tt-count'), cap: $('tt-cap'), hh: $('tt-hh'), hhLabel: $('tt-hh-label'),
    repower: $('tt-repower'), source: $('tt-source'), legend: $('tt-legend'),
  };
  if (!$('map')) return;

  // ── Theme ──
  const root = document.documentElement;
  const mode = () => {
    const t = root.getAttribute('data-theme');
    if (t) return t === 'light' ? 'light' : 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  };
  const cssVar = name => getComputedStyle(root).getPropertyValue(name).trim();

  // ── State ──
  let turbines = [];        // normalized records, sorted by year
  let byYear = new Map();   // year → array of indices
  let markers = [];         // index → L.CircleMarker
  let years = [];           // sorted install years present
  let shownYear = null;     // year currently drawn (cumulative)
  let playing = null;
  let trendChart = null, capChart = null;
  let stats = {};           // year → { n, capKW, cumN, cumKW, hhMed, rdMed }

  // ── Map ──
  const map = L.map('map', { center: [39.5, -98.35], zoom: 4, preferCanvas: true, scrollWheelZoom: false });
  const renderer = L.canvas({ padding: 0.3, tolerance: 3 });
  let tiles = L.tileLayer(TILES[mode()], { maxZoom: 16, attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ' }).addTo(map);

  const radiusForZoom = z => (z <= 4 ? 1.8 : z === 5 ? 2.4 : z === 6 ? 3.2 : z === 7 ? 4 : 5);
  const binIndex = h => (h == null || !(h > 0)) ? -1 : BINS.findIndex(b => h < b.max);
  const colorFor = h => { const i = binIndex(h); return i < 0 ? cssVar('--muted') || '#8597AA' : RAMP[mode()][i]; };

  function styleFor(t) {
    const rp = el.repower && el.repower.checked && t.retro;
    return {
      radius: radiusForZoom(map.getZoom()),
      stroke: !!rp,
      color: rp ? (mode() === 'light' ? '#B87418' : '#E8A33D') : undefined,
      weight: rp ? 1.4 : 0,
      fillColor: colorFor(t.hh),
      fillOpacity: rp ? 0.95 : 0.85,
    };
  }

  function popupHtml(t) {
    const rows = [
      ['Model', t.model || 'N/A'],
      ['Capacity', t.cap ? `${(t.cap / 1000).toFixed(2)} MW` : 'N/A'],
      ['Hub height', t.hh ? `${t.hh} m` : 'N/A'],
      ['Rotor diameter', t.rd ? `${t.rd} m` : 'N/A'],
      ['Online', t.year],
    ];
    if (t.retro) rows.push(['Repowered', t.retroYr || 'Yes']);
    return `<strong>${escapeHtml(t.name || 'Wind project')}</strong>` +
      (t.state ? ` <span class="tt-pop-state">${t.state}</span>` : '') +
      '<table class="tt-pop">' + rows.map(([k, v]) => `<tr><td>${k}</td><td>${escapeHtml(String(v))}</td></tr>`).join('') + '</table>';
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Data loading ──
  function normalize(r) {
    return {
      name: r.p_name, year: r.p_year, hh: r.t_hh > 0 ? +r.t_hh : null, rd: r.t_rd > 0 ? +r.t_rd : null,
      cap: r.t_cap > 0 ? +r.t_cap : 0, model: r.t_model, state: r.t_state,
      lon: +r.xlong, lat: +r.ylat, retro: r.t_retrofit === 1, retroYr: r.t_retro_yr,
    };
  }

  async function loadTurbines() {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length < 1000) throw new Error('unexpected response');
      return { rows: rows.map(normalize), live: true };
    } catch (err) {
      console.warn('[Turbines] Live USWTDB API unavailable, using snapshot:', err.message);
      const res = await fetch(SNAPSHOT_URL);
      if (!res.ok) throw new Error('Turbine data unavailable');
      const snap = await res.json();
      const rows = snap.rows.map(a => {
        const o = {};
        snap.keys.forEach((k, i) => { o[k] = a[i]; });
        return normalize(o);
      });
      return { rows, live: false, asOf: snap.asOf };
    }
  }

  const median = arr => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  function buildIndex(rows) {
    const undated = rows.filter(t => !t.year).length;
    turbines = rows.filter(t => t.year && isFinite(t.lat) && isFinite(t.lon))
                   .sort((a, b) => a.year - b.year);
    byYear = new Map();
    turbines.forEach((t, i) => {
      if (!byYear.has(t.year)) byYear.set(t.year, []);
      byYear.get(t.year).push(i);
    });
    const first = turbines[0].year, last = turbines[turbines.length - 1].year;
    years = [];
    for (let y = first; y <= last; y++) years.push(y);

    let cumN = 0, cumKW = 0;
    stats = {};
    for (const y of years) {
      const idx = byYear.get(y) || [];
      const recs = idx.map(i => turbines[i]);
      const capKW = recs.reduce((s, t) => s + t.cap, 0);
      cumN += recs.length; cumKW += capKW;
      const hhs = recs.map(t => t.hh).filter(Boolean);
      const rds = recs.map(t => t.rd).filter(Boolean);
      stats[y] = {
        n: recs.length, capKW, cumN, cumKW,
        hhMed: hhs.length >= TREND_MIN_N ? median(hhs) : null,
        rdMed: rds.length >= TREND_MIN_N ? median(rds) : null,
        hhAny: median(hhs),
      };
    }
    return undated;
  }

  function buildMarkers() {
    markers = turbines.map(t => {
      const m = L.circleMarker([t.lat, t.lon], { renderer, bubblingMouseEvents: false, ...styleFor(t) });
      m.bindPopup(() => popupHtml(t), { className: 'tt-popup', maxWidth: 260 });
      return m;
    });
  }

  // ── Year changes (cumulative: everything installed in or before the year) ──
  function showYear(y) {
    y = Math.max(years[0], Math.min(years[years.length - 1], y));
    if (shownYear === null) {
      for (const yr of years) if (yr <= y) (byYear.get(yr) || []).forEach(i => markers[i].addTo(map));
    } else if (y > shownYear) {
      for (let yr = shownYear + 1; yr <= y; yr++) (byYear.get(yr) || []).forEach(i => markers[i].addTo(map));
    } else if (y < shownYear) {
      for (let yr = shownYear; yr > y; yr--) (byYear.get(yr) || []).forEach(i => markers[i].remove());
    }
    shownYear = y;
    el.slider.value = y;
    updateStats();
    updateCharts();
  }

  function updateStats() {
    const s = stats[shownYear];
    el.year.textContent = shownYear;
    el.count.textContent = s.cumN.toLocaleString();
    el.cap.textContent = `${(s.cumKW / 1e6).toFixed(1)} GW`;
    // Use the latest year (up to the selected one) with enough turbines for a meaningful median
    let hy = shownYear;
    while (hy > years[0] && !stats[hy].hhMed) hy--;
    el.hhLabel.textContent = `Median hub height, ${hy} installs`;
    el.hh.textContent = stats[hy].hhMed ? `${Math.round(stats[hy].hhMed)} m` : '—';
    el.hh.title = hy !== shownYear ? `Only ${s.n} turbine${s.n === 1 ? '' : 's'} recorded for ${shownYear} so far` : '';
    el.slider.setAttribute('aria-valuetext', `${shownYear}: ${s.cumN.toLocaleString()} turbines`);
  }

  // ── Playback ──
  function setPlaying(on) {
    if (on) {
      if (shownYear >= years[years.length - 1]) showYear(years[0]);
      el.play.textContent = '❚❚ Pause';
      el.play.setAttribute('aria-pressed', 'true');
      playing = setInterval(() => {
        if (shownYear >= years[years.length - 1]) { setPlaying(false); return; }
        showYear(shownYear + 1);
      }, STEP_MS);
    } else {
      clearInterval(playing); playing = null;
      el.play.textContent = '▶ Play';
      el.play.setAttribute('aria-pressed', 'false');
    }
  }

  // ── Charts ──
  const yearMarker = {
    id: 'yearMarker',
    afterDatasetsDraw(chart) {
      const i = years.indexOf(shownYear);
      if (i < 0) return;
      const x = chart.scales.x.getPixelForValue(i);
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = cssVar('--border-strong');
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.restore();
    }
  };

  function chartTheme() {
    return {
      text: cssVar('--muted'), grid: cssVar('--border'), surface: cssVar('--surface'),
      ...SERIES[mode()],
    };
  }

  function buildCharts() {
    const th = chartTheme();
    const labels = years.map(String);
    const common = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { color: th.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 9 }, grid: { display: false } },
        y: { ticks: { color: th.text }, grid: { color: th.grid }, border: { display: false } },
      },
    };

    trendChart?.destroy();
    trendChart = new Chart($('tt-trend').getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Median hub height', data: years.map(y => stats[y].hhMed), borderColor: th.hub, backgroundColor: th.hub,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, spanGaps: true, tension: 0.25 },
          { label: 'Median rotor diameter', data: years.map(y => stats[y].rdMed), borderColor: th.rotor, backgroundColor: th.rotor,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, spanGaps: true, tension: 0.25 },
        ],
      },
      options: {
        ...common,
        scales: { ...common.scales, y: { ...common.scales.y, ticks: { color: th.text, callback: v => `${v} m` } } },
        plugins: {
          legend: { position: 'bottom', labels: { color: th.text, boxWidth: 12, boxHeight: 2, padding: 12 } },
          tooltip: { callbacks: { label: c => c.raw == null ? null : ` ${c.dataset.label}: ${Math.round(c.raw)} m` } },
        },
      },
      plugins: [yearMarker],
    });

    capChart?.destroy();
    capChart = new Chart($('tt-cap-chart').getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'New capacity',
          data: years.map(y => +(stats[y].capKW / 1e6).toFixed(2)),
          backgroundColor: years.map(() => th.hub),
          borderRadius: { topLeft: 3, topRight: 3 }, borderSkipped: 'start',
          barPercentage: 0.9, categoryPercentage: 0.9,
        }],
      },
      options: {
        ...common,
        scales: { ...common.scales, y: { ...common.scales.y, ticks: { color: th.text, callback: v => `${v} GW` } } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: c => ` ${c.raw} GW · ${stats[years[c.dataIndex]].n.toLocaleString()} turbines`,
          } },
        },
        onClick: (_, els) => { if (els.length) { setPlaying(false); showYear(years[els[0].index]); } },
      },
      plugins: [yearMarker],
    });
  }

  function updateCharts() {
    if (!capChart) return;
    const th = chartTheme();
    // Years after the selected one fade back so the slider position reads on the chart
    capChart.data.datasets[0].backgroundColor = years.map(y => y <= shownYear ? th.hub : th.grid);
    capChart.update('none');
    trendChart.update('none');
  }

  // ── Legend ──
  function renderLegend() {
    const ramp = RAMP[mode()];
    el.legend.innerHTML = '<span class="tt-legend-title">Hub height</span>' +
      BINS.map((b, i) => `<span class="tt-legend-item"><span class="tt-swatch" style="background:${ramp[i]}"></span>${b.label}</span>`).join('') +
      `<span class="tt-legend-item"><span class="tt-swatch" style="background:${cssVar('--muted')}"></span>Unknown</span>`;
  }

  // ── Restyle (theme / zoom / repowered toggle) ──
  let restyleQueued = false;
  function restyleAll() {
    if (restyleQueued) return;
    restyleQueued = true;
    requestAnimationFrame(() => {
      restyleQueued = false;
      turbines.forEach((t, i) => markers[i].setStyle(styleFor(t)));
    });
  }

  function applyTheme() {
    tiles.setUrl(TILES[mode()]);
    renderLegend();
    restyleAll();
    if (years.length) { buildCharts(); updateCharts(); }
  }

  // ── Boot ──
  (async function init() {
    el.status.textContent = 'Loading turbines from the USGS Wind Turbine Database…';
    renderLegend();
    try {
      const { rows, live, asOf } = await loadTurbines();
      const undated = buildIndex(rows);
      buildMarkers();

      el.slider.min = years[0];
      el.slider.max = years[years.length - 1];
      el.slider.disabled = false;
      el.play.disabled = false;

      buildCharts();
      showYear(years[years.length - 1]);   // open on today's fleet

      el.status.textContent = '';
      el.status.hidden = true;
      el.source.innerHTML = (live
        ? `Loaded live from the <a href="https://energyfrontier.usgs.gov/uswtdb/" target="_blank" rel="noopener">USGS U.S. Wind Turbine Database</a> API (updated quarterly)`
        : `USGS U.S. Wind Turbine Database snapshot${asOf ? ` from ${asOf}` : ''} (live API unavailable)`) +
        ` · ${turbines.length.toLocaleString()} turbines` +
        (undated ? ` · ${undated.toLocaleString()} without an install year aren't shown` : '');
    } catch (err) {
      el.status.textContent = `Could not load turbine data: ${err.message}`;
      console.error('[Turbines]', err);
    }
  })();

  el.slider.addEventListener('input', () => { setPlaying(false); showYear(+el.slider.value); });
  el.play.addEventListener('click', () => setPlaying(!playing));
  el.repower.addEventListener('change', restyleAll);
  map.on('zoomend', restyleAll);
  new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);
})();
