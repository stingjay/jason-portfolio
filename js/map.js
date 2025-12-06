// =====================================================
// 1. Map with TimeDimension enabled
// =====================================================
var map = L.map("map", {
  center: [39.5, -98.35],
  zoom: 4,
  timeDimension: true,
  timeDimensionControl: true,
  timeDimensionControlOptions: {
  autoPlay: false,
  loopButton: true,
  timeSliderDragUpdate: true,
  speedSlider: true,
  playerOptions: {
    transitionTime: 200   // 5 fps
  }
}

});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

// (Removed the blue sanity marker)

// =====================================================
// 2. Load turbines and wire COD dates into TimeDimension
// =====================================================
fetch("data/uswtdb.geojson")
  .then(r => r.json())
  .then(data => {
    if (!data.features || !data.features.length) {
      console.warn("No features in GeoJSON.");
      return;
    }

    console.log("Loaded turbines:", data.features.length);

    var times = [];

    data.features.forEach(function (feature) {
      var p = feature.properties || {};
      // Prefer date_iso, fall back to date_cod
      var rawDate = p.date_iso || p.date_cod;
      if (!rawDate) return;

      // rawDate is "YYYY-MM-DD" in your data
      var iso;
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        iso = rawDate + "T00:00:00Z";
      } else {
        var d = new Date(rawDate);
        if (isNaN(d)) return;
        iso = d.toISOString();
      }

      p.time = iso; // TimeDimension field

      if (!times.includes(iso)) {
        times.push(iso);
      }
    });

    if (!times.length) {
      console.warn("No valid time values found in date_iso/date_cod.");
    }

    times.sort();
    console.log("Time range:", times[0], "to", times[times.length - 1]);
    map.timeDimension.setAvailableTimes(times.join(","), "iso8601");
    map.timeDimension.setCurrentTime(new Date(times[0]).getTime());

    // Helper: choose color based on hub height (m)
    function colorForHubHeight(h) {
      if (h == null || isNaN(h)) return "#bdbdbd";  // unknown
      if (h < 60) return "#9d4edd";                 // short
      if (h < 80) return "#4cc9f0";                 // medium
      if (h < 100) return "#00f5d4";                // tall
      return "#ff9f1c";                             // very tall / modern
    }

    // Base turbine layer
    var turbines = L.geoJSON(data, {
      pointToLayer: function (feature, latlng) {
        var p = feature.properties || {};

        // Radius scaled by hub height (with sane bounds)
        var hubHeight = p.t_hh;
        var radius = 4;
        if (hubHeight && !isNaN(hubHeight)) {
          radius = 2 + hubHeight / 30;
          radius = Math.max(3, Math.min(12, radius));
        }

        var fillColor = colorForHubHeight(hubHeight);

        return L.circleMarker(latlng, {
          radius: radius,
          color: "#1b3a4b",
          weight: 0.5,
          fillColor: fillColor,
          fillOpacity: 0.85
        });
      },
      onEachFeature: function (feature, layer) {
        var p = feature.properties || {};
        layer.bindPopup(
          "<strong>" + (p.p_name || "Turbine") + "</strong><br>" +
          "Model: " + (p.t_model || "N/A") + "<br>" +
          "Capacity: " + (p.t_cap != null ? p.t_cap + " MW" : "N/A") + "<br>" +
          "Hub Height: " + (p.t_hh != null ? p.t_hh + " m" : "N/A") + "<br>" +
          "COD: " + (p.date_cod || p.date_iso || "N/A")
        );
      }
    });

    // Wrap with TimeDimension; we already set availableTimes manually
    var timedTurbines = L.timeDimension.layer.geoJson(turbines, {
      timeField: "time",
      updateTimeDimension: false,
      addlastPoint: false,
      duration: null // stays visible after their COD
    });

    timedTurbines.addTo(map);

    // =====================================================
    // 3. Legend for hub height
    // =====================================================
    var legend = L.control({ position: "topright" }); // moved away from slider

    legend.onAdd = function () {
      var div = L.DomUtil.create("div", "legend");
      var grades = [
        { label: "< 60 m", color: "#9d4edd" },
        { label: "60–79 m", color: "#4cc9f0" },
        { label: "80–99 m", color: "#00f5d4" },
        { label: "≥ 100 m", color: "#ff9f1c" },
        { label: "Unknown", color: "#bdbdbd" }
      ];

      div.innerHTML = "<strong>Hub Height (m)</strong><br>";
      grades.forEach(function (g) {
        div.innerHTML +=
          '<span class="legend-color" style="background:' + g.color + '"></span>' +
          g.label + "<br>";
      });
      return div;
    };

    legend.addTo(map);
  })
  .catch(function (err) {
    console.error("GeoJSON error:", err);
  });
