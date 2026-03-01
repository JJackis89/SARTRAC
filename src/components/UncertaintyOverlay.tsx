import React, { useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { ForecastData } from '../services/forecastService';

interface UncertaintyOverlayProps {
  forecastData: ForecastData | null;
  visible: boolean;
  opacity: number;
  style: 'alpha' | 'contour' | 'hatching';
}

/**
 * Uncertainty Overlay — visualises forecast confidence as it decays over time.
 *
 * Three rendering styles:
 * - **alpha**: Semi-transparent gradient haze around particle clusters
 * - **contour**: Concentric confidence bands (high → medium → low)
 * - **hatching**: SVG diagonal-line fill overlay indicating lower confidence
 *
 * Uncertainty is inferred from:
 *   1. Forecast hour (longer → higher uncertainty)
 *   2. Local particle spread (more spread → higher uncertainty)
 */
export const UncertaintyOverlay: React.FC<UncertaintyOverlayProps> = ({
  forecastData,
  visible,
  opacity,
  style,
}) => {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Compute uncertainty zones from particle distribution
  const zones = useMemo(() => {
    if (!forecastData || forecastData.isEmpty) return [];

    const particles = forecastData.particles;
    const forecastHours = forecastData.metadata?.forecast_hours ?? 72;

    // Time-based base uncertainty: 0 at hour 0, 1 at max forecast hours
    const timeFraction = Math.min(1, forecastHours / 168); // normalise to 7-day scale

    // Cluster particles into zones using a grid
    const CELL = 0.2; // ~20 km cells
    const cells = new Map<string, { lats: number[]; lons: number[] }>();

    particles.forEach((p) => {
      const gx = Math.floor(p.lon / CELL);
      const gy = Math.floor(p.lat / CELL);
      const key = `${gx},${gy}`;
      if (!cells.has(key)) cells.set(key, { lats: [], lons: [] });
      cells.get(key)!.lats.push(p.lat);
      cells.get(key)!.lons.push(p.lon);
    });

    const result: {
      lat: number;
      lon: number;
      radius: number;       // degrees
      uncertainty: number;   // 0-1
      level: 'low' | 'medium' | 'high';
      particleCount: number;
    }[] = [];

    cells.forEach((cell) => {
      const n = cell.lats.length;
      if (n < 1) return;

      const meanLat = cell.lats.reduce((a, b) => a + b, 0) / n;
      const meanLon = cell.lons.reduce((a, b) => a + b, 0) / n;

      // Spread = standard deviation of particle positions
      const stdLat = Math.sqrt(cell.lats.reduce((s, v) => s + (v - meanLat) ** 2, 0) / n);
      const stdLon = Math.sqrt(cell.lons.reduce((s, v) => s + (v - meanLon) ** 2, 0) / n);
      const spread = Math.sqrt(stdLat ** 2 + stdLon ** 2);

      // Combined uncertainty
      const spreadUncertainty = Math.min(1, spread / 0.15);
      const combined = 0.4 * timeFraction + 0.6 * spreadUncertainty;

      const level: 'low' | 'medium' | 'high' =
        combined < 0.33 ? 'low' : combined < 0.66 ? 'medium' : 'high';

      result.push({
        lat: meanLat,
        lon: meanLon,
        radius: 0.08 + spread * 3 + timeFraction * 0.1,
        uncertainty: combined,
        level,
        particleCount: n,
      });
    });

    return result;
  }, [forecastData]);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible || zones.length === 0) return;

    const group = L.layerGroup();
    layerRef.current = group;

    switch (style) {
      case 'alpha':
        renderAlpha(group, zones, opacity);
        break;
      case 'contour':
        renderContour(group, zones, opacity);
        break;
      case 'hatching':
        renderHatching(group, zones, opacity, map);
        break;
    }

    group.addTo(map);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, visible, zones, opacity, style]);

  return null;
};

type Zone = {
  lat: number;
  lon: number;
  radius: number;
  uncertainty: number;
  level: 'low' | 'medium' | 'high';
  particleCount: number;
};

const LEVEL_COLORS: Record<string, string> = {
  low: '#22c55e',    // green
  medium: '#eab308', // yellow
  high: '#ef4444',   // red
};

// ── Alpha haze ──────────────────────────────────────────────────────
function renderAlpha(group: L.LayerGroup, zones: Zone[], opacity: number) {
  zones.forEach((z) => {
    const color = LEVEL_COLORS[z.level];
    const fillOpacity = 0.08 + z.uncertainty * 0.18;

    const circle = L.circle([z.lat, z.lon], {
      radius: z.radius * 111_320, // degrees → metres
      color: 'transparent',
      fillColor: color,
      fillOpacity: fillOpacity * opacity,
      interactive: false,
    });

    circle.bindTooltip(uncertaintyTooltip(z), { direction: 'top', opacity: 0.9 });
    group.addLayer(circle);

    // Outer haze ring
    const outer = L.circle([z.lat, z.lon], {
      radius: z.radius * 111_320 * 1.5,
      color: 'transparent',
      fillColor: color,
      fillOpacity: fillOpacity * opacity * 0.3,
      interactive: false,
    });
    group.addLayer(outer);
  });
}

// ── Contour bands ───────────────────────────────────────────────────
function renderContour(group: L.LayerGroup, zones: Zone[], opacity: number) {
  const bands = [
    { fraction: 1.0, label: 'High uncertainty', dashArray: '4 4' },
    { fraction: 0.66, label: 'Medium confidence', dashArray: '8 4' },
    { fraction: 0.33, label: 'High confidence', dashArray: '' },
  ];

  zones.forEach((z) => {
    const color = LEVEL_COLORS[z.level];

    bands.forEach((band) => {
      const r = z.radius * band.fraction * 111_320;
      if (r < 500) return; // skip tiny rings

      const ring = L.circle([z.lat, z.lon], {
        radius: r,
        color,
        weight: 1.5,
        opacity: opacity * (0.4 + band.fraction * 0.4),
        fillColor: 'transparent',
        fillOpacity: 0,
        dashArray: band.dashArray,
        interactive: false,
      });
      group.addLayer(ring);
    });

    // Center label
    const labelIcon = L.divIcon({
      className: 'uncertainty-label',
      html: `<div style="
        font-size: 10px;
        font-weight: 600;
        color: ${color};
        text-shadow: 0 1px 3px rgba(0,0,0,0.7);
        white-space: nowrap;
        pointer-events: none;
      ">${z.level.toUpperCase()}</div>`,
      iconSize: [60, 14],
      iconAnchor: [30, 7],
    });

    const marker = L.marker([z.lat, z.lon], { icon: labelIcon, interactive: false });
    group.addLayer(marker);
  });
}

// ── Hatching overlay ────────────────────────────────────────────────
function renderHatching(group: L.LayerGroup, zones: Zone[], opacity: number, _map: L.Map) {
  zones.forEach((z) => {
    const color = LEVEL_COLORS[z.level];
    const spacing = z.level === 'high' ? 6 : z.level === 'medium' ? 10 : 16;

    // Use SVG pattern via a DivIcon overlay
    const size = Math.max(40, z.radius * 400);
    const patternId = `hatch-${z.lat.toFixed(3)}-${z.lon.toFixed(3)}`.replace(/[.-]/g, '_');

    const hatchIcon = L.divIcon({
      className: 'uncertainty-hatch',
      html: `
        <svg width="${size}" height="${size}" style="opacity:${opacity * 0.6}; pointer-events:none;">
          <defs>
            <pattern id="${patternId}" width="${spacing}" height="${spacing}"
                     patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="${spacing}"
                    stroke="${color}" stroke-width="1" />
            </pattern>
          </defs>
          <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}"
                  fill="url(#${patternId})" stroke="${color}" stroke-width="1"
                  stroke-dasharray="4 3" />
        </svg>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });

    const marker = L.marker([z.lat, z.lon], { icon: hatchIcon, interactive: false });
    marker.bindTooltip(uncertaintyTooltip(z), { direction: 'top', opacity: 0.9 });
    group.addLayer(marker);
  });
}

function uncertaintyTooltip(z: Zone): string {
  return `<div style="font-size:11px">
    <strong>Uncertainty: ${z.level.charAt(0).toUpperCase() + z.level.slice(1)}</strong><br/>
    Confidence: ${((1 - z.uncertainty) * 100).toFixed(0)}%<br/>
    Particles: ${z.particleCount}<br/>
    Spread radius: ${(z.radius * 111).toFixed(1)} km
  </div>`;
}

export default UncertaintyOverlay;
