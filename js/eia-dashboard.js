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
// geoId maps each API respondent code to the EIA_ID used in rto-regions.geojson.
// Two differ: CAL (not CISO) and SWPP (not SPP).
const REGIONS = {
  ISNE: { name: 'ISO New England',       short: 'ISNE', center: [-71.0, 44.5],  geoId: 'ISNE' },
  NYIS: { name: 'New York ISO',          short: 'NYIS', center: [-75.8, 43.0],  geoId: 'NYIS' },
  PJM:  { name: 'PJM Interconnection',   short: 'PJM',  center: [-79.5, 39.0],  geoId: 'PJM'  },
  MISO: { name: 'MISO',                  short: 'MISO', center: [-90.0, 40.5],  geoId: 'MISO' },
  SWPP: { name: 'Southwest Power Pool',  short: 'SPP',  center: [-99.5, 38.5],  geoId: 'SWPP' },
  ERCO: { name: 'ERCOT (Texas)',         short: 'ERCOT', center: [-99.0, 31.0], geoId: 'ERCO' },
  CISO: { name: 'California ISO',        short: 'CISO', center: [-120.0, 37.0], geoId: 'CAL'  },
  TVA:  { name: 'Tennessee Valley Authority', short: 'TVA',  center: [-86.5, 35.8], geoId: 'TVA'  },
  BPAT: { name: 'Bonneville Power Admin.', short: 'BPAT', center: [-119.0, 46.5], geoId: 'BPAT' },
  SOCO: { name: 'Southern Company',      short: 'SOCO', center: [-85.5, 32.5],  geoId: 'SOCO' },
};

// ─── Fuel config ───────────────────────────────────────────────────────────
const FUELS = {
  WND: { label: 'Wind',        color: '#22c55e' },
  SUN: { label: 'Solar',       color: '#fbbf24' },
  WAT: { label: 'Hydro',       color: '#38bdf8' },
  NUC: { label: 'Nuclear',     color: '#818cf8' },
  NG:  { label: 'Natural Gas', color: '#f97316' },
  COL: { label: 'Coal',        color: '#78716c' },
  OIL: { label: 'Petroleum',   color: '#dc2626' },
  OTH: { label: 'Other',       color: '#94a3b8' },
};

// Fuel order determines stacking / donut slice order.
// Any EIA fuel type NOT in this list (e.g. GEO, BIO, STR) gets folded into OTH
// during processing so the donut and headline always share the same denominator.
const FUEL_ORDER = ['WND', 'SUN', 'WAT', 'NUC', 'NG', 'COL', 'OIL', 'OTH'];
const RENEWABLE_FUELS = ['WND', 'SUN', 'WAT'];
const CLEAN_FUELS     = ['WND', 'SUN', 'WAT', 'NUC'];

// ─── State ─────────────────────────────────────────────────────────────────
let leafletMap = null;
let donutChart = null;
let barChart = null;
let regionLayers = {};
let processedData = {};
let activeRegion = null;
let geoFeatures = {}; // geoId → GeoJSON feature, loaded once from rto-regions.geojson

// ─── Helpers ───────────────────────────────────────────────────────────────
// Map color is based on % clean (renewable + nuclear) for better regional variation
function cleanColor(pct) {
  if (pct >= 60) return '#22c55e';
  if (pct >= 40) return '#86efac';
  if (pct >= 20) return '#fde68a';
  return '#f87171';
}

function fmtGWh(mwh) {
  return `${(mwh / 1000).toFixed(1)} GWh`;
}

function fmtPeriod(period) {
  // period format: "2025-04-15T14"
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

// ─── EIA API fetch ─────────────────────────────────────────────────────────
async function fetchEIAData() {
  const params = new URLSearchParams({
    api_key: EIA_API_KEY,
    frequency: 'hourly',
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '200'
  });
  Object.keys(REGIONS).forEach(r => params.append('facets[respondent][]', r));

  const url = `https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA returned HTTP ${res.status} — check your API key`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  if (!json.response?.data?.length) throw new Error('EIA returned no data');
  return json.response.data;
}

// ─── Data processing ───────────────────────────────────────────────────────
function processData(rows) {
  // Build: region → period → fueltype → value (MWh)
  const tree = {};
  for (const row of rows) {
    const { respondent: r, period: p, fueltype: f, value: v } = row;
    if (!REGIONS[r]) continue;
    if (!tree[r]) tree[r] = {};
    if (!tree[r][p]) tree[r][p] = {};
    tree[r][p][f] = Math.max(0, v ?? 0);
  }

  const result = {};
  for (const [region, periods] of Object.entries(tree)) {
    // Most recent period for this region
    const latestPeriod = Object.keys(periods).sort().reverse()[0];
    const rawFuels = periods[latestPeriod] ?? {};

    // Fold any unknown fuel types into OTH so the donut and headline
    // always use the same denominator (sum of FUEL_ORDER keys only).
    const fuels = {};
    for (const [f, v] of Object.entries(rawFuels)) {
      if (FUEL_ORDER.includes(f)) {
        fuels[f] = v;
      } else {
        fuels['OTH'] = (fuels['OTH'] ?? 0) + v;
      }
    }

    const total     = FUEL_ORDER.reduce((s, f) => s + (fuels[f] ?? 0), 0);
    const renewable = RENEWABLE_FUELS.reduce((s, f) => s + (fuels[f] ?? 0), 0);
    const clean     = CLEAN_FUELS.reduce((s, f) => s + (fuels[f] ?? 0), 0);

    result[region] = {
      period: latestPeriod,
      fuels,
      total,
      renewable,
      clean,
      renewablePct: total > 0 ? (renewable / total) * 100 : 0,
      cleanPct:     total > 0 ? (clean     / total) * 100 : 0,
    };
  }
  return result;
}

// ─── GeoJSON loader ────────────────────────────────────────────────────────
async function loadGeoJSON() {
  const res = await fetch('data/rto-regions.geojson?v=3');
  if (!res.ok) throw new Error(`Could not load rto-regions.geojson (HTTP ${res.status})`);
  const fc = await res.json();
  for (const feature of fc.features) {
    const id = feature.properties.EIA_ID;
    if (id) geoFeatures[id] = feature;
  }
}

// ─── Map ───────────────────────────────────────────────────────────────────
function initMap() {
  if (leafletMap) return;
  leafletMap = L.map('eia-map', { zoomControl: true, scrollWheelZoom: false })
    .setView([38.5, -96], 4);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(leafletMap);
}

function updateMap(data) {
  Object.values(regionLayers).forEach(l => l.remove());
  regionLayers = {};

  for (const [key, region] of Object.entries(REGIONS)) {
    const feature = geoFeatures[region.geoId];
    if (!feature) continue;

    const rd = data[key];
    const pct = rd?.cleanPct ?? 0;
    const color = cleanColor(pct);
    const isActive = key === activeRegion;

    const layer = L.geoJSON(feature, {
      style: {
        fillColor: color,
        fillOpacity: isActive ? 0.65 : 0.42,
        color: isActive ? '#f9fafb' : color,
        weight: isActive ? 2.5 : 1.5,
        opacity: 0.85
      }
    });

    const tip = rd
      ? `<strong>${region.name}</strong><br>${pct.toFixed(1)}% clean · ${rd.renewablePct.toFixed(1)}% renewable<br>${fmtGWh(rd.total)} total`
      : `<strong>${region.name}</strong><br>No data`;
    layer.bindTooltip(tip, { sticky: true, className: 'eia-tip' });

    layer.on('click', () => selectRegion(key));
    layer.addTo(leafletMap);
    regionLayers[key] = layer;
  }
}

// ─── Region panel ──────────────────────────────────────────────────────────
function selectRegion(key) {
  activeRegion = key;
  const region = REGIONS[key];
  const rd = processedData[key];

  // Re-style all layers
  for (const [k, layer] of Object.entries(regionLayers)) {
    const pct = processedData[k]?.cleanPct ?? 0;
    const color = cleanColor(pct);
    layer.setStyle({
      fillColor: color,
      fillOpacity: k === key ? 0.65 : 0.35,
      color: k === key ? '#f9fafb' : color,
      weight: k === key ? 2.5 : 1.5,
    });
  }

  // Update text
  document.getElementById('panel-region').textContent = region.name;
  document.getElementById('panel-period').textContent = rd ? fmtPeriod(rd.period) : '—';
  document.getElementById('panel-placeholder').style.display = 'none';

  if (!rd) {
    document.getElementById('panel-pct').textContent = '—';
    document.getElementById('panel-pct-fill').style.width = '0%';
    document.getElementById('fuel-legend').innerHTML = '';
    return;
  }

  const pct = rd.cleanPct;
  const color = cleanColor(pct);
  const pctEl = document.getElementById('panel-pct');
  pctEl.textContent = `${pct.toFixed(1)}%`;
  pctEl.style.color = color;

  document.getElementById('panel-pct-sub').textContent =
    `clean (incl. nuclear) · ${rd.renewablePct.toFixed(1)}% renewable · ${fmtGWh(rd.total)} total`;

  const fill = document.getElementById('panel-pct-fill');
  fill.style.width = `${Math.min(pct, 100)}%`;
  fill.style.background = color;

  // Donut chart
  const labels = [], values = [], colors = [];
  for (const fuelKey of FUEL_ORDER) {
    const val = rd.fuels[fuelKey] ?? 0;
    if (val <= 0) continue;
    labels.push(FUELS[fuelKey]?.label ?? fuelKey);
    values.push(val);
    colors.push(FUELS[fuelKey]?.color ?? '#94a3b8');
  }

  if (donutChart) donutChart.destroy();
  donutChart = new Chart(
    document.getElementById('donut-chart').getContext('2d'),
    {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
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
    }
  );

  // Fuel legend
  const legendEl = document.getElementById('fuel-legend');
  legendEl.innerHTML = '';
  labels.forEach((label, i) => {
    const el = document.createElement('span');
    el.className = 'fuel-item';
    el.innerHTML = `<span class="fuel-dot" style="background:${colors[i]};"></span>${label}`;
    legendEl.appendChild(el);
  });
}

// ─── Stacked bar chart ─────────────────────────────────────────────────────
function renderBarChart(data) {
  const regionKeys = Object.keys(REGIONS).filter(k => data[k]);
  const regionLabels = regionKeys.map(k => REGIONS[k].short);

  const datasets = FUEL_ORDER
    .map(fuelKey => {
      const vals = regionKeys.map(r => {
        const rd = data[r];
        if (!rd || rd.total === 0) return 0;
        return ((rd.fuels[fuelKey] ?? 0) / rd.total) * 100;
      });
      if (!vals.some(v => v > 0)) return null;
      return {
        label: FUELS[fuelKey]?.label ?? fuelKey,
        data: vals,
        backgroundColor: FUELS[fuelKey]?.color ?? '#94a3b8',
        borderWidth: 0,
      };
    })
    .filter(Boolean);

  if (barChart) barChart.destroy();
  barChart = new Chart(
    document.getElementById('bar-chart').getContext('2d'),
    {
      type: 'bar',
      data: { labels: regionLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            ticks: { color: '#9ca3af' },
            grid: { color: 'rgba(148,163,184,0.07)' }
          },
          y: {
            stacked: true,
            min: 0,
            max: 100,
            ticks: { color: '#9ca3af', callback: v => `${v}%` },
            grid: { color: 'rgba(148,163,184,0.07)' }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#9ca3af', boxWidth: 11, padding: 11, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`
            }
          }
        },
        animation: { duration: 450 }
      }
    }
  );
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
  document.getElementById('loading-msg').style.display = 'block';

  try {
    // Load GeoJSON boundaries once per page load — re-load if incomplete
    const expectedRegions = Object.keys(REGIONS).length;
    if (Object.keys(geoFeatures).length < expectedRegions) {
      await loadGeoJSON();
    }

    const raw = await fetchEIAData();
    processedData = processData(raw);

    initMap();
    updateMap(processedData);
    renderBarChart(processedData);

    document.getElementById('loading-msg').style.display = 'none';
    document.getElementById('dash-content').style.display = 'block';

    // Leaflet needs a size hint after the container becomes visible
    setTimeout(() => leafletMap && leafletMap.invalidateSize(), 60);

    // Timestamp
    const now = new Date();
    document.getElementById('last-updated').textContent =
      `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Auto-select active region (or first available)
    const target = activeRegion ?? Object.keys(REGIONS).find(k => processedData[k]);
    if (target) selectRegion(target);

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

// ─── Boot ──────────────────────────────────────────────────────────────────
loadData();
// Auto-refresh every 10 minutes (EIA data updates hourly)
setInterval(loadData, 10 * 60 * 1000);
