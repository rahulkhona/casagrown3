/**
 * CommunityMap — Native (iOS/Android) implementation using Leaflet in a WebView.
 *
 * Renders the EXACT same Leaflet map as the web version, inside a WebView.
 * This approach guarantees visual parity with web because it uses the same
 * Leaflet library, the same tile provider, and h3-js runs inside the WebView's
 * JavaScript engine (V8/JSC), not Hermes.
 *
 * The WebView HTML is self-contained — Leaflet CSS/JS and h3-js are loaded
 * from CDNs. Once react-native-webview is linked (one-time native rebuild),
 * all map rendering updates are pure JavaScript and fully OTA-updatable.
 */
import { useMemo } from 'react'
import { View, Text as RNText, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import type { CommunityMapProps } from './CommunityMapTypes'

/**
 * Generate self-contained HTML that renders a Leaflet map with hex zone polygons.
 * Loads Leaflet + h3-js from CDN. The HTML runs in the WebView's JS engine,
 * so h3-js works perfectly (no Hermes WASM limitations).
 */
function generateMapHTML(
  resolveData: CommunityMapProps['resolveData'],
  showLabels: boolean,
  selectedNeighborH3Indices: string[] = [],
): string {
  const { primary, neighbors, resolved_location, hex_boundaries } = resolveData
  const lat = resolved_location.lat
  const lng = resolved_location.lng

  // If we have hex_boundaries from the server, pass them directly
  // Otherwise, the HTML will compute them using h3-js in the WebView
  const hexBoundariesJSON = hex_boundaries ? JSON.stringify(hex_boundaries) : 'null'

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/h3-js@4.1.0/dist/h3-js.umd.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; touch-action: none; pointer-events: none; -webkit-user-select: none; user-select: none; }
    #map { width: 100%; height: 100%; pointer-events: none; touch-action: none; }
    .hex-label {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
    }
    .hex-label::before { display: none !important; }
    .leaflet-control-zoom { display: none !important; }
    .leaflet-control-attribution {
      font-size: 8px !important;
      background: rgba(255,255,255,0.6) !important;
    }
    /* Disable all Leaflet interactive layers */
    .leaflet-interactive { pointer-events: none !important; }
    .leaflet-grab { cursor: default !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function() {
      try {
        var lat = ${lat};
        var lng = ${lng};
        var primaryH3 = "${primary.h3_index}";
        var primaryName = ${JSON.stringify(primary.name)};
        var neighbors = ${JSON.stringify(neighbors)};
        var selectedNeighbors = ${JSON.stringify(selectedNeighborH3Indices)};
        var hexBoundaries = ${hexBoundariesJSON};

        // Initialize map
        var map = L.map('map', {
          center: [lat, lng],
          zoom: 14,
          zoomControl: false,
          scrollWheelZoom: false,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          attributionControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        // Get hex boundaries — use server-provided or compute via h3-js
        function getHexBoundary(h3Index) {
          if (hexBoundaries && hexBoundaries[h3Index]) {
            return hexBoundaries[h3Index];
          }
          if (typeof h3 !== 'undefined' && h3.cellToBoundary) {
            return h3.cellToBoundary(h3Index);
          }
          return [];
        }

        function getHexCenter(h3Index) {
          if (typeof h3 !== 'undefined' && h3.cellToLatLng) {
            return h3.cellToLatLng(h3Index);
          }
          // Compute from boundary centroid
          var boundary = getHexBoundary(h3Index);
          if (!boundary.length) return [lat, lng];
          var sLat = 0, sLng = 0;
          boundary.forEach(function(p) { sLat += p[0]; sLng += p[1]; });
          return [sLat / boundary.length, sLng / boundary.length];
        }

        // Get all H3 indices to render
        var allIndices = [primaryH3];
        if (typeof h3 !== 'undefined' && h3.gridDisk) {
          var disk = h3.gridDisk(primaryH3, 1);
          allIndices = disk;
        } else if (hexBoundaries) {
          allIndices = Object.keys(hexBoundaries);
        }

        var primaryBounds = [];

        // Draw hex polygons
        allIndices.forEach(function(idx) {
          var boundary = getHexBoundary(idx);
          if (!boundary || boundary.length === 0) return;

          var isPrimary = idx === primaryH3;
          var isSelected = selectedNeighbors.indexOf(idx) !== -1;
          var isFilled = isPrimary || isSelected;
          var latlngs = boundary.map(function(p) { return [p[0], p[1]]; });
          if (isPrimary) primaryBounds = latlngs;

          var polygon = L.polygon(latlngs, {
            fillColor: isFilled ? '#166534' : '#bbf7d0',
            fillOpacity: isFilled ? 0.4 : 0.2,
            color: isFilled ? '#15803d' : '#4ade80',
            weight: isFilled ? 3 : 2,
            dashArray: isFilled ? null : '6 4',
          }).addTo(map);

          // Zone labels
          ${showLabels ? `
          var center = getHexCenter(idx);
          var name = isPrimary ? primaryName : '';
          if (!isPrimary) {
            for (var i = 0; i < neighbors.length; i++) {
              if (neighbors[i].h3_index === idx) {
                name = neighbors[i].name;
                break;
              }
            }
          }
          if (name) {
            L.marker(center, {
              icon: L.divIcon({
                className: 'hex-label',
                html: '<span style="font-size:' + (isPrimary ? '12' : '10') + 'px;font-weight:' + (isPrimary ? '700' : '500') + ';color:' + (isPrimary ? '#166534' : '#15803d') + ';text-shadow:0 0 3px white,0 0 3px white;white-space:nowrap;">' + name + '</span>',
                iconSize: null,
                iconAnchor: [50, 8],
              })
            }).addTo(map);
          }
          ` : ''}
        });

        // User location marker (blue dot)
        L.circleMarker([lat, lng], {
          radius: 7,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          color: 'white',
          weight: 3,
        }).addTo(map);

        // Fit map to primary hex — tight enough to see boundaries clearly
        if (primaryBounds.length > 0) {
          map.fitBounds(primaryBounds, { padding: [30, 30] });
        }

      } catch(e) {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-family:system-ui;">' + e.message + '</div>';
      }
    })();
  </script>
</body>
</html>`
}

export default function CommunityMap({
  resolveData,
  height = 280,
  showLabels = true,
  selectedNeighborH3Indices = [],
}: CommunityMapProps) {
  const location = resolveData.resolved_location
  const communityName = resolveData.primary.name
  const communityCity = (resolveData.primary as { city?: string })?.city || ''

  // If location is at 0,0 (stub data), show a simple fallback
  if (location.lat === 0 && location.lng === 0) {
    return (
      <View style={[styles.fallback, { height }]}>
        <RNText style={styles.fallbackIcon}>📍</RNText>
        <RNText style={styles.fallbackTitle}>{communityName}</RNText>
        {communityCity ? <RNText style={styles.fallbackCity}>{communityCity}</RNText> : null}
        <RNText style={styles.fallbackSubtext}>Community Zone</RNText>
      </View>
    )
  }

  // Key forces WebView to re-mount when community data changes
  // Key includes selected neighbors so WebView re-mounts when selection changes
  const selectedKey = selectedNeighborH3Indices.join(',')
  const mapKey = `${resolveData.primary.h3_index}-${location.lat}-${location.lng}-${selectedKey}`

  const html = useMemo(
    () => generateMapHTML(resolveData, showLabels, selectedNeighborH3Indices),
    [resolveData, showLabels, selectedNeighborH3Indices]
  )

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      <WebView
        key={mapKey}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        nestedScrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // iOS-specific: prevent WebView from becoming first responder
        allowsInlineMediaPlayback={true}
        allowsBackForwardNavigationGestures={false}
        textInteractionEnabled={false}
        // Prevent WebView's internal gesture recognizers from firing
        containerStyle={{ pointerEvents: 'none' }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    backgroundColor: '#e8f5e9',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fallback: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  fallbackIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#166534',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  fallbackCity: {
    fontSize: 14,
    color: '#15803d',
    marginTop: 2,
  },
  fallbackSubtext: {
    fontSize: 12,
    color: '#4ade80',
    marginTop: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
})
