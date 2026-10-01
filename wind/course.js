/* =========================================================
   Intro to Wind Energy: course data + page rendering
   ---------------------------------------------------------
   EDIT THIS SECTION EACH TERM. Leave a url as null and the item
   shows as "coming soon" instead of a dead link.
   ========================================================= */
var COURSE = {
  term: 'Spring 2027',
  campus: 'Highland',
  start: null,            // Monday of Week 1, e.g. '2027-01-18'. While null, no dates are shown.
  email: null,            // e.g. 'jconover@austincc.edu'
  officeHours: null,      // e.g. 'Tue/Thu 4:00–5:00 pm, HLC 3.214'
  syllabusUrl: null,      // e.g. 'files/syllabus.pdf'

  units: [
    ['Unit I · Foundations', [1, 2]],
    ['Unit II · The Resource and the Machine', [3, 4, 5, 6, 7]],
    ['Unit III · Developing a Project', [8, 9, 10, 11, 12]],
    ['Unit IV · Delivering a Project', [13, 14, 15]],
    ['Synthesis', [16]]
  ],

  // slides / notes: url or null.  readings: [title, url-or-null]
  weeks: {
    1:  { title: 'Orientation & energy fundamentals', slides: null, notes: null, readings: [['Syllabus', null]] },
    2:  { title: 'History & the industry today', slides: null, notes: null, readings: [['LBNL Wind Market Report: summary', 'https://eta-publications.lbl.gov/research-areas/land-based-wind-market-report'], ['U.S. Turbine Timeline', '../sandbox.html']] },
    3:  { title: 'The wind resource', slides: null, notes: null, readings: [['Wind resource basics', null]] },
    4:  { title: 'Resource assessment', slides: null, notes: null, readings: [['Global Wind Atlas walkthrough', null]] },
    5:  { title: 'Turbine technology I', slides: null, notes: null, readings: [['Turbine anatomy', null]] },
    6:  { title: 'Turbine technology II', slides: null, notes: null, readings: [['Power curve sheets', null]] },
    7:  { title: 'Energy production', slides: null, notes: null, readings: [['Loss stack example', null]] },
    8:  { title: 'Midterm · Siting fundamentals', slides: null, notes: null, readings: [['Midterm study guide', null]] },
    9:  { title: 'GIS lab (QGIS)', slides: null, notes: null, readings: [['QGIS install guide', null]] },
    10: { title: 'Layout & wake effects', slides: null, notes: null, readings: [['Wake Effect Sandbox', '../wake-simulator.html']] },
    11: { title: 'Permitting', slides: null, notes: null, readings: [['FAA OE/AAA walkthrough', null]] },
    12: { title: 'Land, leases & community', slides: null, notes: null, readings: [['Case 1 packet', null]] },
    13: { title: 'Interconnection & the market', slides: null, notes: null, readings: [['Grid Mix Dashboard', '../eia-dashboard.html']] },
    14: { title: 'Project economics · Debate', slides: null, notes: null, readings: [['Debate brief template', null]] },
    15: { title: 'Construction, O&M & careers', slides: null, notes: null, readings: [['Case 2 packet', null]] },
    16: { title: 'Presentations · Final exam', slides: null, notes: null, readings: [['Final study guide', null]] }
  },

  glossary: [
    ['AEP', 'Annual energy production, MWh/yr.'],
    ['Betz limit', 'Max share of wind power a rotor can capture: 59.3%.'],
    ['Capacity factor', 'Actual output ÷ output at full power all year.'],
    ['Curtailment', 'Grid operator orders output reduced.'],
    ['FAA Form 7460-1', 'Notice of proposed construction filed with the FAA for each turbine.'],
    ['Hub height', 'Height of the rotor center above ground.'],
    ['IEC class', 'Wind speed and turbulence a turbine is rated for.'],
    ['Interconnection queue', 'Projects waiting for grid studies and approval to connect.'],
    ['LCOE', 'Lifetime cost ÷ lifetime energy, $/MWh.'],
    ['Loss stack', 'Losses subtracted from gross energy: wake, availability, electrical, curtailment.'],
    ['P50 / P90', 'Energy estimates with a 50% / 90% chance of being exceeded.'],
    ['Power curve', 'Turbine output at each wind speed.'],
    ['PPA', 'Long-term contract to sell a project’s power at a set price.'],
    ['Setback', 'Required distance from a turbine to homes, roads, property lines.'],
    ['Specific power', 'Rated power ÷ rotor swept area, W/m².'],
    ['Wake loss', 'Energy lost by turbines sitting in upwind turbines’ slower air.'],
    ['Weibull distribution', 'Curve describing how often each wind speed occurs.'],
    ['Wind shear', 'Change in wind speed with height.']
  ]
};

/* ================= Rendering (no edits needed below) ================= */
(function () {
  var C = COURSE, $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var link = function (label, url, cls) {
    return url ? '<a href="' + esc(url) + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(label) + '</a>'
               : '<span class="pending">' + esc(label) + '</span>';
  };
  var btn = function (label, url, primary) {
    return url ? '<a class="c-btn' + (primary ? ' primary' : '') + '" href="' + esc(url) + '">' + label + '</a>'
               : '<span class="c-btn off" title="Coming soon">' + label + '</span>';
  };
  var start = C.start ? new Date(C.start + 'T00:00:00') : null;
  var fmt = function (d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  var dates = function (n) {
    if (!start) return '';
    var a = new Date(start); a.setDate(a.getDate() + (n - 1) * 7);
    var b = new Date(a); b.setDate(b.getDate() + 4);
    return fmt(a) + '–' + fmt(b);
  };
  var currentWeek = function () {
    var q = parseInt(new URLSearchParams(location.search).get('week'), 10);
    if (q >= 1 && q <= 16) return { n: q, preview: true };
    if (!start) return { n: 0 };
    var n = Math.floor((Date.now() - start.getTime()) / (7 * 864e5)) + 1;
    return { n: n };
  };

  // Header pieces shared by all course pages
  document.querySelectorAll('[data-course-meta]').forEach(function (el) { el.textContent = 'ACC · ' + C.term + ' · ' + C.campus; });

  // ---- This Week page ----
  if ($('weekCard')) {
    var cw = currentWeek(), n = cw.n;
    if (n >= 1 && n <= 16) {
      var w = C.weeks[n];
      $('wNum').textContent = 'Week ' + n;
      $('wDates').textContent = dates(n) ? ' · ' + dates(n) : '';
      $('wTitle').textContent = w.title;
      $('wBar').style.width = (n / 16 * 100) + '%';
      $('wBtns').innerHTML = btn('Slides', w.slides, true) + ' ' + btn('Notes', w.notes);
      $('wNext').innerHTML = n < 16 ? 'Next week: <b>' + esc(C.weeks[n + 1].title) + '</b>' : 'Last week of the semester.';
      $('wRead').innerHTML = w.readings.length
        ? w.readings.map(function (r) { return '<li>' + link(r[0], r[1]) + '</li>'; }).join('')
        : '<li class="small">Nothing assigned</li>';
      if (cw.preview) $('previewNote').hidden = false;
    } else {
      // Before the semester starts (or after it ends)
      var before = n < 1;
      $('weekCard').style.gridTemplateColumns = '1fr';
      $('weekCard').innerHTML =
        '<div class="main"><div class="wk-kick"><b>' + esc(C.term) + '</b></div>' +
        '<div class="wk-title">' + (before ? 'Class hasn’t started yet' : 'The semester is over') + '</div>' +
        '<p class="small">' + (before ? 'Week 1: ' + esc(C.weeks[1].title) + '. ' : '') +
        'See the <a href="schedule.html">full schedule</a>' + (before ? ' or <a href="?week=1">preview Week 1</a>.' : '.') + '</p></div>';
    }
    $('cEmail').innerHTML = C.email ? '<a href="mailto:' + esc(C.email) + '">' + esc(C.email) + '</a>' : '<span class="pending">ACC email</span>';
    $('cHours').innerHTML = C.officeHours ? esc(C.officeHours) : '<span class="pending">TBD</span>';
    $('cSyllabus').innerHTML = link('Syllabus', C.syllabusUrl);
  }

  // ---- Schedule page ----
  if ($('units')) {
    var cur = currentWeek().n;
    $('units').innerHTML = C.units.map(function (u) {
      return '<div class="unit"><div class="label">' + esc(u[0]) + '</div><div class="rows">' +
        u[1].map(function (k) {
          var w = C.weeks[k], d = dates(k);
          var items = [link('Slides', w.slides), link('Notes', w.notes)].concat(w.readings.map(function (r) { return link(r[0], r[1]); }));
          return '<details' + (k === cur ? ' class="cur" open' : '') + ' id="wk-' + k + '"><summary><span class="n">' + k + '</span>' +
            '<span><span class="t">' + esc(w.title) + '</span>' + (d ? '<span class="d">' + d + '</span>' : '') + '</span></summary>' +
            '<div class="det">' + items.join('') + '</div></details>';
        }).join('') + '</div></div>';
    }).join('');
  }

  // ---- Resources page: glossary ----
  if ($('gloss')) {
    var render = function (q) {
      q = (q || '').toLowerCase();
      var hits = C.glossary.filter(function (g) { return (g[0] + ' ' + g[1]).toLowerCase().indexOf(q) > -1; });
      $('gloss').innerHTML = hits.length
        ? hits.map(function (g) { return '<div><b>' + esc(g[0]) + '</b>' + esc(g[1]) + '</div>'; }).join('')
        : '<div class="small">No match.</div>';
    };
    $('gSearch').addEventListener('input', function (e) { render(e.target.value); });
    render('');
  }
})();
