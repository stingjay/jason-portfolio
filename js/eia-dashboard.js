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
// Simplified polygons tracing actual state/RTO boundary lines.
// Most RTO borders follow state lines so these are state-outline approximations.
// Coordinates: [longitude, latitude]
const REGIONS = {
  ISNE: {
    // CT, RI, MA, VT, NH, ME
    name: 'ISO New England',
    short: 'ISNE',
    center: [-71.0, 44.5],
    coords: [
      [-73.7, 41.0],  // SW — CT/NY coast
      [-72.1, 41.0],  // CT south coast
      [-71.8, 41.3],  // CT/RI
      [-71.2, 41.5],  // RI south
      [-69.9, 42.1],  // Cape Cod / MA coast
      [-70.0, 43.1],  // NH/MA seacoast
      [-70.8, 43.5],  // NH coast
      [-70.7, 44.0],  // SW Maine
      [-67.0, 47.1],  // Downeast Maine coast
      [-67.0, 47.5],  // ME/NB border NE corner
      [-69.2, 47.5],  // ME/QC border
      [-71.1, 45.3],  // NH/QC corner
      [-72.0, 45.0],  // VT/QC border
      [-73.3, 45.0],  // VT/NY/QC corner
      [-73.3, 43.6],  // VT/NY border
      [-73.7, 42.7],  // MA/NY/CT corner
      [-73.7, 41.0]   // close
    ]
  },
  NYIS: {
    // New York state
    name: 'New York ISO',
    short: 'NYIS',
    center: [-75.8, 43.0],
    coords: [
      [-79.8, 41.9],  // SW — PA/OH border / Lake Erie
      [-74.7, 41.0],  // NJ/NY border (Delaware River area)
      [-74.0, 40.5],  // NYC — southern tip
      [-72.0, 41.0],  // Long Island east end
      [-72.0, 41.1],
      [-73.7, 41.0],  // CT/NY coast
      [-73.7, 42.7],  // MA/NY
      [-73.3, 43.6],  // VT/NY
      [-73.3, 45.0],  // VT/NY/QC corner
      [-76.5, 44.9],  // ON/NY — St. Lawrence
      [-79.3, 43.4],  // Niagara / Lake Ontario
      [-79.8, 43.0],  // Lake Erie / Niagara
      [-79.8, 41.9]   // close
    ]
  },
  PJM: {
    // PA, NJ, DE, MD, DC, VA, WV, OH, and parts of IN/IL/KY/MI/NC
    name: 'PJM Interconnection',
    short: 'PJM',
    center: [-79.5, 39.0],
    coords: [
      [-83.5, 41.8],  // N — OH Lake Erie shore
      [-79.8, 41.9],  // PA/OH/NY corner
      [-74.7, 41.0],  // NJ/NY border
      [-74.0, 40.5],  // NYC / NJ
      [-74.0, 39.0],  // NJ south coast
      [-75.0, 38.0],  // DE/VA coast
      [-75.7, 37.2],  // VA coast
      [-76.5, 36.5],  // VA/NC border east
      [-80.0, 36.5],  // VA/NC/TN border
      [-82.7, 37.3],  // VA/WV/KY
      [-84.8, 37.5],  // KY/TN — PJM western edge
      [-84.8, 38.5],  // KY/IN — PJM/MISO border
      [-83.5, 41.8]   // close
    ]
  },
  MISO: {
    // ND, SD (E), MN, WI, MI, IA, IL, IN (W), MO, AR, LA, MS
    name: 'MISO',
    short: 'MISO',
    center: [-90.0, 40.5],
    coords: [
      [-104.0, 49.0], // NW — ND/MT/Canada
      [-82.0, 49.0],  // NE — MI/Canada (Sault Ste. Marie area)
      [-82.7, 42.5],  // MI east (Detroit area) — Lake Erie
      [-84.8, 38.5],  // IN/OH — MISO/PJM border
      [-87.5, 36.5],  // IL/KY/TN border
      [-89.5, 35.0],  // MS — following border south
      [-89.5, 29.0],  // Gulf Coast — New Orleans area
      [-94.0, 29.5],  // W Louisiana / TX border
      [-94.0, 33.5],  // AR/TX/OK — MISO south edge
      [-94.0, 36.5],  // MO/OK border (Joplin area)
      [-97.0, 36.5],  // OK/KS — MISO/SPP border
      [-97.0, 49.0],  // ND/Canada — MISO/SPP border north
      [-104.0, 49.0]  // close
    ]
  },
  SPP: {
    // KS, NE, OK, western SD/ND, TX panhandle (E), parts of AR/MO/LA
    name: 'Southwest Power Pool',
    short: 'SPP',
    center: [-99.5, 38.5],
    coords: [
      [-104.0, 49.0], // NW — ND/MT/Canada
      [-97.0, 49.0],  // NE — ND Canada / MISO border
      [-97.0, 36.5],  // S — OK/KS / MISO border
      [-94.0, 36.5],  // SE corner where MISO meets SPP
      [-94.0, 33.5],  // SPP south — AR/OK/TX
      [-100.0, 33.5], // TX panhandle / ERCO-SPP boundary
      [-103.0, 36.5], // TX panhandle NW corner
      [-104.0, 36.5], // NM/CO/TX corner
      [-104.0, 49.0]  // close
    ]
  },
  ERCO: {
    // Most of Texas (panhandle east served by SPP; El Paso served by WECC)
    name: 'ERCOT (Texas)',
    short: 'ERCO',
    center: [-99.0, 31.0],
    coords: [
      [-103.0, 36.5], // NW panhandle (SPP/ERCO boundary)
      [-100.0, 36.5], // Panhandle east
      [-100.0, 33.5], // Lubbock area — SPP/ERCO boundary
      [-94.0, 33.5],  // NE TX — AR/LA/TX corner
      [-94.0, 29.9],  // E TX coast
      [-93.8, 29.7],
      [-97.2, 26.0],  // S tip — Brownsville / Rio Grande
      [-99.5, 26.4],  // Laredo area
      [-104.0, 29.7], // Big Bend / Del Rio
      [-106.5, 31.8], // El Paso — WECC boundary
      [-104.0, 32.0],
      [-103.0, 36.5]  // close
    ]
  },
  CISO: {
    // California — roughly the state outline
    name: 'California ISO',
    short: 'CISO',
    center: [-120.0, 37.0],
    coords: [
      [-124.3, 41.8], // NW — OR/CA coast
      [-120.0, 42.0], // NE — OR/NV/CA corner
      [-119.3, 38.9], // NV border mid
      [-116.1, 36.2], // NV/AZ/CA corner (south Nevada)
      [-114.6, 35.1], // AZ/CA border (Parker Dam area)
      [-114.7, 32.7], // AZ/CA/Mexico corner
      [-117.1, 32.5], // Mexico / San Diego
      [-117.3, 33.1], // SD coast
      [-118.5, 34.0], // LA coast
      [-119.7, 34.4], // Point Conception
      [-120.7, 35.2], // SLO coast
      [-121.9, 36.6], // Monterey
      [-122.4, 37.8], // San Francisco
      [-122.6, 38.1], // Marin
      [-123.7, 39.1], // Mendocino
      [-124.2, 40.4], // Humboldt
      [-124.3, 41.8]  // close
    ]
  }
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

// Fuel order determines stacking / donut slice order
const FUEL_ORDER = ['WND', 'SUN', 'WAT', 'NUC', 'NG', 'COL', 'OIL', 'OTH'];
const RENEWABLE_FUELS = ['WND', 'SUN', 'WAT'];

// ─── State ─────────────────────────────────────────────────────────────────
let leafletMap = null;
let donutChart = null;
let barChart = null;
let regionLayers = {};
let processedData = {};
let activeRegion = null;

// ─── Helpers ───────────────────────────────────────────────────────────────
function renewableColor(pct) {
  if (pct >= 50) return '#22c55e';
  if (pct >= 30) return '#86efac';
  if (pct >= 15) return '#fde68a';
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
    const fuels = periods[latestPeriod] ?? {};

    const total = Object.values(fuels).reduce((s, v) => s + v, 0);
    const renewable = RENEWABLE_FUELS.reduce((s, f) => s + (fuels[f] ?? 0), 0);

    result[region] = {
      period: latestPeriod,
      fuels,
      total,
      renewable,
      renewablePct: total > 0 ? (renewable / total) * 100 : 0,
    };
  }
  return result;
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
    const rd = data[key];
    const pct = rd?.renewablePct ?? 0;
    const color = renewableColor(pct);
    const isActive = key === activeRegion;

    const layer = L.geoJSON({
      type: 'Feature',
      properties: { key },
      geometry: {
        type: 'Polygon',
        coordinates: [region.coords]
      }
    }, {
      style: {
        fillColor: color,
        fillOpacity: isActive ? 0.65 : 0.42,
        color: isActive ? '#f9fafb' : color,
        weight: isActive ? 2.5 : 1.5,
        opacity: 0.85
      }
    });

    const tip = rd
      ? `<strong>${region.name}</strong><br>${pct.toFixed(1)}% renewable<br>${fmtGWh(rd.total)} total`
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
    const pct = processedData[k]?.renewablePct ?? 0;
    const color = renewableColor(pct);
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

  const pct = rd.renewablePct;
  const color = renewableColor(pct);
  const pctEl = document.getElementById('panel-pct');
  pctEl.textContent = `${pct.toFixed(1)}%`;
  pctEl.style.color = color;

  document.getElementById('panel-pct-sub').textContent =
    `renewable — ${fmtGWh(rd.renewable)} of ${fmtGWh(rd.total)}`;

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
