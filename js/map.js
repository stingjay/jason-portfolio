// Leaflet + TimeDimension map for US wind turbines

// Create the map with time dimension enabled
var map = L.map("map", {
  center: [39.5, -98.35], // rough center of the U.S.
  zoom: 4,
  scrollWheelZoom: true,
  timeDimension: true,
  timeDimensionControl: true,
  timeDimensionControlOptions: {
    autoPlay: false,
    loopButton: true,
    timeSliderDragUpdate: true,
    speedSlider: true
  }
});

// Base layer
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

// Path to your GeoJSON file inside /data
var geojsonUrl = "data/uswtdb.geojson";

// Build popup HTML for each turbine
function buildPopup(props) {
  var lines = [];

  if (props.p_name) {
    lines.push("<strong>" + props.p_name + "</strong>");
  }
  if (props.t_model) {
    lines.push("Model: " + props.t_model);
  }
  if (props.t_cap != null) {
    lines.push("Capacity: " + props.t_cap + " MW");
  }
  if (props.t_hh != null) {
    lines.push("Hub height: " + props.t_hh + " m");
  }
  if (props.date_cod) {
    lines.push("COD: " + props.date_cod);
  }

  return lines.join("<br>");
}

// Load the turbines GeoJSON
fetch(geojsonUrl)
  .then(function (response) {
    if (!response.ok) {
      throw new Error("Failed to load GeoJSON: " + response.statusText);
    }
    return response.json();
  })
  .then(function (data) {
    // Ensure each feature has a time property based on date_cod
    if (Array.isArray(data.features)) {
      data.features.forEach(function (feature) {
        if (feature.properties && feature.properties.date_cod) {
          // TimeDimension reads this as the event time
          feature.properties.time = feature.properties.date_cod;
        }
      });
    }

    // Base GeoJSON layer styled by hub height
    var turbinesLayer = L.geoJSON(data, {
      pointToLayer: function (feature, latlng) {
        var props = feature.properties || {};
        var hubHeight = props.t_hh;

        // Simple radius scaling by hub height
        var radius = 4;
        if (hubHeight && !isNaN(hubHeight)) {
          radius = Math.max(3, Math.min(9, hubHeight / 20));
        }

        return L.circleMarker(latlng, {
          radius: radius,
          color: "#006d77",      // outline
          weight: 1,
          fillColor: "#00b4d8",  // fill
          fillOpacity: 0.85
        });
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopup(feature.properties || {}));
      }
    });

    // Wrap in a TimeDimension layer so turbines appear on their COD date
    var timedTurbines = L.timeDimension.layer.geoJson(turbinesLayer, {
      updateTimeDimension: true,
      addlastPoint: false,
      // duration: null → each turbine stays visible after its COD
      duration: null
    });

    timedTurbines.addTo(map);
  })
  .catch(function (err) {
    console.error("Error loading turbines GeoJSON:", err);
  });
