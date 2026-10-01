// ─── EIA Grid Mix Dashboard ────────────────────────────────────────────────
//
// Get a FREE API key (just an email, no billing) at:
//   https://www.eia.gov/opendata/register.php
//
// The key is safe to expose in a static site — EIA data is fully public and
// the key is rate-limited, read-only, and free to replace if needed.
//
const EIA_API_KEY = 'RKQFhW6AWE23RK3UIYcqENb85wB8xJDs7lNg1hUx';

// ─── Region definitions ────────────────────────────────────────────────────
// Each map region is one or more EIA balancing authorities (BAs). Region
// numbers are the sum of their member BAs. Boundaries live in
// data/grid-regions.geojson (dissolved) and data/grid-bas.geojson (per BA),
// both built from Electricity Maps' open zone boundaries.
const REGIONS = {
  ISNE: { name: 'ISO New England',            short: 'ISNE',    members: ['ISNE'] },
  NYIS: { name: 'New York ISO',               short: 'NYISO',   members: ['NYIS'] },
  PJM:  { name: 'PJM Interconnection',        short: 'PJM',     members: ['PJM'] },
  MISO: { name: 'MISO',                       short: 'MISO',    members: ['MISO'] },
  SWPP: { name: 'Southwest Power Pool',       short: 'SPP',     members: ['SWPP'] },
  ERCO: { name: 'ERCOT (Texas)',              short: 'ERCOT',   members: ['ERCO'] },
  CISO: { name: 'California ISO',             short: 'CAISO',   members: ['CISO'] },
  TVA:  { name: 'Tennessee Valley Authority', short: 'TVA',     members: ['TVA'] },
  SOCO: { name: 'Southern Company',           short: 'SOCO',    members: ['SOCO'] },
  BPAT: { name: 'Bonneville Power Admin.',    short: 'BPA',     members: ['BPAT'] },
  PNW:  { name: 'Pacific Northwest (other)',  short: 'PNW',
          members: ['AVA', 'CHPD', 'DOPD', 'GCPD', 'PACW', 'PGE', 'PSEI', 'SCL', 'TPWR'] },
  RMGB: { name: 'Rockies & Great Basin',      short: 'Rockies',
          members: ['IPCO', 'NEVP', 'NWMT', 'PACE', 'PSCO', 'WACM', 'WAUW'] },
  DSW:  { name: 'Desert Southwest',           short: 'DSW',
          members: ['AZPS', 'SRP', 'TEPC', 'PNM', 'EPE', 'WALC'] },
  CALO: { name: 'California (non-CAISO)',     short: 'CA other',
          members: ['BANC', 'IID', 'LDWP', 'TIDC'] },
  CARO: { name: 'Carolinas',                  short: 'Carolinas',
          members: ['DUK', 'CPLE', 'CPLW', 'SCEG', 'SC'] },
  FLA:  { name: 'Florida',                    short: 'Florida',
          members: ['FPL', 'FPC', 'TEC', 'JEA', 'FMPP', 'TAL', 'GVL', 'SEC', 'HST'] },
  CENO: { name: 'Central (other)',            short: 'Central',
          members: ['LGEE', 'AECI', 'SPA'] },
};

// BA code → region key
const BA_GROUP = {};
for (const [g, r] of Object.entries(REGIONS)) r.members.forEach(m => { BA_GROUP[m] = g; });
const ALL_BAS = Object.keys(BA_GROUP);

// ─── Fuel config ───────────────────────────────────────────────────────────
// Fuel colors are checked for color-blind separation against the site's light
// and dark surfaces, in this stacking order. Solar + storage reuses the solar
// hue with diagonal hatching so it reads as "solar, plus something".
const FUELS = {
  WND: { label: 'Wind',              light: '#008300', dark: '#008300' },
  SUN: { label: 'Solar',             light: '#eda100', dark: '#c98500' },
  SNB: { label: 'Solar + storage',   light: '#eda100', dark: '#c98500', hatch: true },
  WAT: { label: 'Hydro',             light: '#2a78d6', dark: '#3987e5' },
  BAT: { label: 'Battery & storage', light: '#e87ba4', dark: '#d55181' },
  NUC: { label: 'Nuclear',           light: '#4a3aa7', dark: '#9085e9' },
  NG:  { label: 'Natural Gas',       light: '#eb6834', dark: '#d95926' },
  COL: { label: 'Coal',              light: '#8a857d', dark: '#a8a39b' },
  OIL: { label: 'Petroleum',         light: '#e34948', dark: '#e66767' },
  OTH: { label: 'Other',             light: '#b5b2aa', dark: '#8b95a1' },
};

// EIA codes that map onto a different display bucket.
// PS = pumped storage, UES = unknown energy storage → grouped with batteries.
// Anything else not in FUEL_ORDER (GEO, BIO, …) folds into OTH.
const FUEL_ALIAS = { PS: 'BAT', UES: 'BAT' };

const FUEL_ORDER      = ['WND', 'SUN', 'SNB', 'WAT', 'BAT', 'NUC', 'NG', 'COL', 'OIL', 'OTH'];
const RENEWABLE_FUELS = ['WND', 'SUN', 'SNB', 'WAT'];
const CLEAN_FUELS     = ['WND', 'SUN', 'SNB', 'WAT', 'NUC'];
// Storage only counts its discharge (charging hours report negative values and
// are clamped to 0). It isn't counted as clean, since it re-releases grid power.

// Clean-energy share is a magnitude → one hue (green), stepped by lightness.
// On the dark map, cleaner = brighter; on the light map, cleaner = deeper.
const CLEAN_RAMP = {
  dark:  ['#1d4433', '#24794a', '#35b46a', '#9cf0bb'],
  light: ['#c6ead5', '#86cfa4', '#34a063', '#13703d'],
};
const CLEAN_BINS = [
  { min: 0,  label: '<20%' }, { min: 20, label: '20–40%' },
  { min: 40, label: '40–60%' }, { min: 60, label: '≥60%' },
];
const TILES = {
  dark:  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
};

// ─── Theme helpers (follows the site's light/dark toggle) ─────────────────
const rootEl = document.documentElement;
function themeMode() {
  const t = rootEl.getAttribute('data-theme');
  if (t) return t === 'light' ? 'light' : 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
const cssVar = name => getComputedStyle(rootEl).getPropertyValue(name).trim();

const hatchCache = {};
function fuelColor(key, { forCanvas = true } = {}) {
  const f = FUELS[key], mode = themeMode(), base = f[mode];
  if (!f.hatch) return base;
  if (!forCanvas) {
    return `repeating-linear-gradient(135deg, ${base} 0 3px, ${cssVar('--surface')} 3px 5px)`;
  }
  const id = mode + base;
  if (!hatchCache[id]) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 8, 8);
    x.strokeStyle = cssVar('--surface'); x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke();
    hatchCache[id] = x.createPattern(c, 'repeat');
  }
  return hatchCache[id];
}

// ─── State ─────────────────────────────────────────────────────────────────
let leafletMap = null;
let tileLayer = null;
let donutChart = null;
let barChart = null;
let regionLayers = {};   // region key → L.GeoJSON
let baLayers = {};       // BA code → L.GeoJSON
let regionGeo = null;    // FeatureCollection
let baGeo = null;        // FeatureCollection
let baData = {};         // BA code → processed
let regionData = {};     // region key → processed (summed)
let baNames = {};        // BA code → full name from EIA
let view = 'regions';    // 'regions' | 'bas'
let focusGroup = '';     // region key the BA view is zoomed to ('' = all)
let selRegion = null;
let selBA = null;

// ─── Helpers ───────────────────────────────────────────────────────────────
// Map color is based on % clean (renewable + nuclear) for better regional variation
function cleanColor(pct) {
  const ramp = CLEAN_RAMP[themeMode()];
  for (let i = CLEAN_BINS.length - 1; i >= 0; i--) if (pct >= CLEAN_BINS[i].min) return ramp[i];
  return ramp[0];
}
const colorFor = d => (d && d.total > 0) ? cleanColor(d.cleanPct) : cssVar('--muted');

function fmtGWh(mwh) {
  return mwh >= 1000 ? `${(mwh / 1000).toFixed(1)} GWh` : `${Math.round(mwh)} MWh`;
}

function fmtPeriod(period) {
  // period format: "2025-04-15T14" (UTC)
  if (!period) return '';
  try {
    const [datePart, hourPart] = period.split('T');
    const d = new Date(`${datePart}T${hourPart.padStart(2, '0')}:00:00Z`);
    return d.toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    });
  } catch { return period; }
}

function utcHourStamp(d) {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

const baLabel = code => baNames[code] ? `${baNames[code]}` : code;

// ─── EIA API fetch (paginated) ─────────────────────────────────────────────
async function fetchEIAData() {
  const start = utcHourStamp(new Date(Date.now() - 30 * 3600 * 1000));
  const PAGE = 5000;
  let offset = 0, rows = [], total = Infinity;

  while (offset < total && offset < 30000) {
    const params = new URLSearchParams({
      api_key: EIA_API_KEY,
      frequency: 'hourly',
      'data[0]': 'value',
      'sort[0][column]': 'period',
      'sort[0][direction]': 'desc',
      start,
      offset: String(offset),
      length: String(PAGE),
    });
    ALL_BAS.forEach(r => params.append('facets[respondent][]', r));

    const url = `https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EIA returned HTTP ${res.status} — check your API key`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    const page = json.response?.data ?? [];
    total = Number(json.response?.total ?? 0);
    rows = rows.concat(page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  if (!rows.length) throw new Error('EIA returned no data');
  return rows;
}

// ─── Data processing ───────────────────────────────────────────────────────
function summarize(fuels, period) {
  const total     = FUEL_ORDER.reduce((s, f) => s + (fuels[f] ?? 0), 0);
  const renewable = RENEWABLE_FUELS.reduce((s, f) => s + (fuels[f] ?? 0), 0);
  const clean     = CLEAN_FUELS.reduce((s, f) => s + (fuels[f] ?? 0), 0);
  return {
    period, fuels, total, renewable, clean,
    renewablePct: total > 0 ? (renewable / total) * 100 : 0,
    cleanPct:     total > 0 ? (clean     / total) * 100 : 0,
  };
}

function processData(rows) {
  // BA → period → raw fueltype → MWh
  const tree = {};
  for (const row of rows) {
    const { respondent: r, period: p, fueltype: f } = row;
    if (!BA_GROUP[r]) continue;
    if (row['respondent-name']) baNames[r] = row['respondent-name'];
    const v = Number(row.value);
    (tree[r] ??= {})[p] ??= {};
    tree[r][p][f] = Number.isFinite(v) ? v : 0;
  }

  const bas = {};
  for (const [ba, periods] of Object.entries(tree)) {
    // Use the most recent *complete* hour: the newest hour that reports as many
    // fuel types as this BA ever reports (the newest hour is often partial).
    const keys = Object.keys(periods).sort().reverse();
    const maxCount = Math.max(...keys.map(k => Object.keys(periods[k]).length));
    const period = keys.find(k => Object.keys(periods[k]).length >= maxCount) ?? keys[0];

    const fuels = {};
    for (const [f, v] of Object.entries(periods[period])) {
      const key = FUEL_ALIAS[f] ?? (FUEL_ORDER.includes(f) ? f : 'OTH');
      fuels[key] = (fuels[key] ?? 0) + v;
    }
    for (const k of Object.keys(fuels)) fuels[k] = Math.max(0, fuels[k]);
    bas[ba] = summarize(fuels, period);
  }

  const regions = {};
  for (const [g, r] of Object.entries(REGIONS)) {
    const members = r.members.filter(m => bas[m] && bas[m].total > 0);
    if (!members.length) continue;
    const fuels = {};
    for (const m of members) {
      for (const [f, v] of Object.entries(bas[m].fuels)) fuels[f] = (fuels[f] ?? 0) + v;
    }
    // Report the oldest member hour so the timestamp is never overstated
    const period = members.map(m => bas[m].period).sort()[0];
    regions[g] = { ...summarize(fuels, period), reporting: members.length };
  }
  return { bas, regions };
}

// ─── GeoJSON loader ────────────────────────────────────────────────────────
async function loadGeoJSON() {
  const [r1, r2] = await Promise.all([
    fetch('data/grid-regions.geojson?v=1'),
    fetch('data/grid-bas.geojson?v=1'),
  ]);
  if (!r1.ok || !r2.ok) throw new Error('Could not load grid boundary files');
  regionGeo = await r1.json();
  baGeo = await r2.json();
}

// ─── Map ───────────────────────────────────────────────────────────────────
function initMap() {
  if (leafletMap) return;
  leafletMap = L.map('eia-map', { zoomControl: true, scrollWheelZoom: false })
    .setView([38.5, -96], 4);

  // Esri Gray Canvas (dark or light to match the site theme) — no API key required
  tileLayer = L.tileLayer(TILES[themeMode()], {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
  }).addTo(leafletMap);
}

function styleFor(d, { active = false, dim = false } = {}) {
  const color = colorFor(d);
  const noData = !(d && d.total > 0);
  if (dim) {
    // Out-of-focus BAs fade back so the zoomed region stands out
    const m = cssVar('--muted');
    return { fillColor: m, fillOpacity: 0.06, color: m, weight: 0.6, opacity: 0.3, dashArray: null };
  }
  return {
    fillColor: color,
    fillOpacity: noData ? 0.25 : (active ? 0.85 : 0.68),
    color: active ? cssVar('--text') : color,
    weight: active ? 2.5 : (view === 'bas' ? 1 : 1.5),
    opacity: 0.85,
    dashArray: noData ? '4 3' : null,
  };
}

function tipFor(name, d, extra = '') {
  if (!d || !(d.total > 0)) return `<strong>${name}</strong><br>No fuel-mix data reported${extra}`;
  return `<strong>${name}</strong><br>${d.cleanPct.toFixed(1)}% clean · ${d.renewablePct.toFixed(1)}% renewable<br>${fmtGWh(d.total)} this hour${extra}`;
}

function drawLayers() {
  Object.values(regionLayers).forEach(l => l.remove());
  Object.values(baLayers).forEach(l => l.remove());
  regionLayers = {};
  baLayers = {};

  if (view === 'regions') {
    for (const feature of regionGeo.features) {
      const key = feature.properties.id;
      const region = REGIONS[key];
      if (!region) continue;
      const d = regionData[key];
      const layer = L.geoJSON(feature, { style: styleFor(d, { active: key === selRegion }) });
      const n = region.members.length;
      const extra = n > 1 ? `<br><span class="eia-tip-sub">${n} balancing authorities · click to explore</span>` : '';
      layer.bindTooltip(tipFor(region.name, d, extra), { sticky: true, className: 'eia-tip' });
      layer.on('click', () => selectRegion(key));
      layer.addTo(leafletMap);
      regionLayers[key] = layer;
    }
  } else {
    for (const feature of baGeo.features) {
      const code = feature.properties.id;
      const g = BA_GROUP[code];
      if (!g) continue;
      const d = baData[code];
      const dim = focusGroup && g !== focusGroup;
      const layer = L.geoJSON(feature, { style: styleFor(d, { active: code === selBA, dim }) });
      const extra = `<br><span class="eia-tip-sub">${code} · ${REGIONS[g].name}</span>`;
      layer.bindTooltip(tipFor(baLabel(code), d, extra), { sticky: true, className: 'eia-tip' });
      layer.on('click', () => {
        if (focusGroup && g !== focusGroup) { setFocus(g); }
        selectBA(code);
      });
      layer.addTo(leafletMap);
      baLayers[code] = layer;
    }
  }
}

function restyle() {
  if (view === 'regions') {
    for (const [k, l] of Object.entries(regionLayers)) {
      l.setStyle(styleFor(regionData[k], { active: k === selRegion }));
    }
  } else {
    for (const [c, l] of Object.entries(baLayers)) {
      const dim = focusGroup && BA_GROUP[c] !== focusGroup;
      l.setStyle(styleFor(baData[c], { active: c === selBA, dim }));
      if (c === selBA) l.bringToFront();
    }
  }
}

function zoomToFocus() {
  if (!leafletMap) return;
  if (!focusGroup) { leafletMap.flyTo([38.5, -96], 4, { duration: 0.6 }); return; }
  const feats = baGeo.features.filter(f => BA_GROUP[f.properties.id] === focusGroup);
  const b = L.geoJSON({ type: 'FeatureCollection', features: feats }).getBounds();
  if (b.isValid()) leafletMap.flyToBounds(b, { padding: [24, 24], maxZoom: 7, duration: 0.6 });
}

// ─── View switching ────────────────────────────────────────────────────────
function setView(next, { group = null } = {}) {
  view = next;
  document.querySelectorAll('.map-tab').forEach(t => {
    const on = t.dataset.view === view;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  document.getElementById('focus-wrap').style.display = view === 'bas' ? 'flex' : 'none';

  if (view === 'bas') {
    if (group !== null) focusGroup = group;
    document.getElementById('focus-select').value = focusGroup;
  }
  drawLayers();
  renderBarChart();

  if (view === 'regions') {
    leafletMap.flyTo([38.5, -96], 4, { duration: 0.6 });
    selectRegion(selRegion ?? firstWithData(Object.keys(REGIONS), regionData));
  } else {
    zoomToFocus();
    const pool = focusGroup ? REGIONS[focusGroup].members : ALL_BAS;
    const keep = selBA && pool.includes(selBA) ? selBA : null;
    selectBA(keep ?? biggest(pool));
  }
}

function setFocus(group) {
  focusGroup = group;
  document.getElementById('focus-select').value = group;
  restyle();
  renderBarChart();
  zoomToFocus();
}

const firstWithData = (keys, data) => keys.find(k => data[k]?.total > 0) ?? keys[0];
const biggest = pool => [...pool].sort((a, b) => (baData[b]?.total ?? 0) - (baData[a]?.total ?? 0))[0];

// ─── Detail panel ──────────────────────────────────────────────────────────
function renderPanel({ eyebrow, title, d, note, action }) {
  document.getElementById('panel-eyebrow').textContent = eyebrow;
  document.getElementById('panel-region').textContent = title;
  document.getElementById('panel-period').textContent = d ? `as of ${fmtPeriod(d.period)}` : '—';
  document.getElementById('panel-placeholder').style.display = 'none';
  document.getElementById('panel-note').innerHTML = note ?? '';

  const actEl = document.getElementById('panel-action');
  actEl.style.display = action ? 'inline-flex' : 'none';
  if (action) { actEl.textContent = action.label; actEl.onclick = action.onClick; }

  const pctEl = document.getElementById('panel-pct');
  const fill = document.getElementById('panel-pct-fill');
  const legendEl = document.getElementById('fuel-legend');

  if (!d || !(d.total > 0)) {
    pctEl.textContent = '—';
    pctEl.style.color = '';
    document.getElementById('panel-pct-sub').textContent = 'No fuel-mix data reported to EIA for this area';
    fill.style.width = '0%';
    legendEl.innerHTML = '';
    if (donutChart) { donutChart.destroy(); donutChart = null; }
    return;
  }

  const color = cleanColor(d.cleanPct);
  pctEl.textContent = `${d.cleanPct.toFixed(1)}%`;
  document.getElementById('panel-pct-sub').textContent =
    `clean (incl. nuclear) · ${d.renewablePct.toFixed(1)}% renewable · ${fmtGWh(d.total)} this hour`;
  fill.style.width = `${Math.min(d.cleanPct, 100)}%`;
  fill.style.background = color;

  const labels = [], values = [], colors = [];
  for (const k of FUEL_ORDER) {
    const v = d.fuels[k] ?? 0;
    if (v <= 0) continue;
    labels.push(FUELS[k].label); values.push(v); colors.push(k);
  }

  if (donutChart) donutChart.destroy();
  donutChart = new Chart(document.getElementById('donut-chart').getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors.map(k => fuelColor(k)),
      borderColor: cssVar('--surface'), borderWidth: 2 }] },
    options: {
      cutout: '64%',
      animation: { duration: 380 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const tot = ctx.dataset.data.reduce((a, b) => a + b, 0);
              return ` ${ctx.label}: ${((ctx.raw / tot) * 100).toFixed(1)}% (${fmtGWh(ctx.raw)})`;
            }
          }
        }
      }
    }
  });

  legendEl.innerHTML = '';
  labels.forEach((label, i) => {
    const el = document.createElement('span');
    el.className = 'fuel-item';
    el.innerHTML = `<span class="fuel-dot" style="background:${fuelColor(colors[i], { forCanvas: false })};"></span>${label}`;
    legendEl.appendChild(el);
  });
}

function selectRegion(key) {
  if (!key) return;
  selRegion = key;
  restyle();
  const r = REGIONS[key];
  const d = regionData[key];
  const n = r.members.length;
  let note = '';
  if (n > 1) {
    const rep = d?.reporting ?? 0;
    note = `Combines ${n} balancing authorities` + (rep < n ? ` (${rep} report fuel mix)` : '');
  }
  renderPanel({
    eyebrow: 'Selected region',
    title: r.name,
    d,
    note,
    action: n > 1
      ? { label: 'Explore balancing authorities →', onClick: () => setView('bas', { group: key }) }
      : { label: 'View on balancing authority map →', onClick: () => { selBA = r.members[0]; setView('bas', { group: key }); } },
  });
}

function selectBA(code) {
  if (!code) return;
  selBA = code;
  restyle();
  const g = BA_GROUP[code];
  renderPanel({
    eyebrow: 'Selected balancing authority',
    title: baLabel(code),
    d: baData[code],
    note: `${code} · part of <strong>${REGIONS[g].name}</strong>`,
    action: { label: '← Back to regions', onClick: () => { selRegion = g; setView('regions'); } },
  });
}

// ─── Stacked bar chart ─────────────────────────────────────────────────────
function renderBarChart() {
  let keys, labels, data, title;
  if (view === 'regions') {
    keys = Object.keys(REGIONS).filter(k => regionData[k]);
    labels = keys.map(k => REGIONS[k].short);
    data = regionData;
    title = 'Generation Mix by Region';
  } else {
    const pool = focusGroup ? REGIONS[focusGroup].members : ALL_BAS;
    keys = pool.filter(k => baData[k]?.total > 0)
               .sort((a, b) => baData[b].total - baData[a].total);
    if (!focusGroup) keys = keys.slice(0, 20);
    labels = keys;
    data = baData;
    title = focusGroup
      ? `Generation Mix — ${REGIONS[focusGroup].name}`
      : 'Generation Mix — 20 Largest Balancing Authorities';
  }
  document.getElementById('bar-title').textContent = title;

  const datasets = FUEL_ORDER.map(f => {
    const vals = keys.map(k => data[k].total ? ((data[k].fuels[f] ?? 0) / data[k].total) * 100 : 0);
    if (!vals.some(v => v > 0)) return null;
    return { label: FUELS[f].label, data: vals, backgroundColor: fuelColor(f),
             borderColor: cssVar('--bg'), borderWidth: { top: 1, bottom: 0, left: 0, right: 0 } };
  }).filter(Boolean);

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('bar-chart').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_, els) => {
        if (!els.length) return;
        const k = keys[els[0].index];
        view === 'regions' ? selectRegion(k) : selectBA(k);
      },
      scales: {
        x: { stacked: true, ticks: { color: cssVar('--muted'), autoSkip: false, maxRotation: 50 }, grid: { display: false } },
        y: { stacked: true, min: 0, max: 100, border: { display: false }, ticks: { color: cssVar('--muted'), callback: v => `${v}%` }, grid: { color: cssVar('--border') } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { color: cssVar('--text-2'), boxWidth: 11, padding: 11, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: items => {
              const k = keys[items[0].dataIndex];
              return view === 'regions' ? REGIONS[k].name : `${baLabel(k)} (${k})`;
            },
            label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`
          }
        }
      },
      animation: { duration: 450 }
    }
  });
}

// ─── Controls ──────────────────────────────────────────────────────────────
function initControls() {
  const sel = document.getElementById('focus-select');
  if (sel.options.length <= 1) {
    for (const [k, r] of Object.entries(REGIONS)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = r.name;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      setFocus(sel.value);
      const pool = sel.value ? REGIONS[sel.value].members : ALL_BAS;
      selectBA(biggest(pool));
    });
    document.querySelectorAll('.map-tab').forEach(t =>
      t.addEventListener('click', () => { if (t.dataset.view !== view) setView(t.dataset.view); }));
  }
}

// ─── Main load / refresh ───────────────────────────────────────────────────
async function loadData() {
  // Gate on unconfigured key
  if (EIA_API_KEY === 'YOUR_EIA_API_KEY_HERE') {
    document.getElementById('setup-msg').style.display = 'block';
    document.getElementById('loading-msg').style.display = 'none';
    return;
  }

  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  document.getElementById('error-msg').style.display = 'none';
  document.getElementById('setup-msg').style.display = 'none';
  const firstLoad = !leafletMap;
  if (firstLoad) document.getElementById('loading-msg').style.display = 'block';

  try {
    if (!regionGeo || !baGeo) await loadGeoJSON();

    const raw = await fetchEIAData();
    ({ bas: baData, regions: regionData } = processData(raw));

    document.getElementById('loading-msg').style.display = 'none';
    document.getElementById('dash-content').style.display = 'block';
    initMap();
    initControls();
    // Leaflet needs a size hint after the container becomes visible
    setTimeout(() => leafletMap && leafletMap.invalidateSize(), 60);

    drawLayers();
    renderBarChart();
    if (view === 'regions') selectRegion(selRegion ?? firstWithData(Object.keys(REGIONS), regionData));
    else selectBA(selBA ?? biggest(focusGroup ? REGIONS[focusGroup].members : ALL_BAS));

    const now = new Date();
    document.getElementById('last-updated').textContent =
      `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  } catch (err) {
    document.getElementById('loading-msg').style.display = 'none';
    const errEl = document.getElementById('error-msg');
    errEl.style.display = 'block';
    errEl.textContent = `Could not load data: ${err.message}`;
    console.error('[EIA Dashboard]', err);
  } finally {
    btn.disabled = false;
  }
}

// ─── Map legend & theme changes ──────────────────────────────────────────
function renderMapLegend() {
  const ramp = CLEAN_RAMP[themeMode()];
  const el = document.getElementById('map-legend');
  if (!el) return;
  el.innerHTML = '<span>% Clean energy (renewable + nuclear):</span>' +
    CLEAN_BINS.map((b, i) => `<span class="map-legend-item"><span class="map-swatch" style="background:${ramp[i]};"></span>${b.label}</span>`).join('') +
    '<span class="map-legend-item"><span class="map-swatch map-swatch--none"></span>No fuel data</span>';
}

function applyTheme() {
  renderMapLegend();
  if (!leafletMap) return;
  tileLayer.setUrl(TILES[themeMode()]);
  restyle();
  renderBarChart();
  if (view === 'regions') selectRegion(selRegion); else selectBA(selBA);
}
new MutationObserver(applyTheme).observe(rootEl, { attributes: true, attributeFilter: ['data-theme'] });
window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);

// ─── Boot ──────────────────────────────────────────────────────────────────
renderMapLegend();
loadData();
// Auto-refresh every 10 minutes (EIA data updates hourly)
setInterval(loadData, 10 * 60 * 1000);
