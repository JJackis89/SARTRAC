import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface BathymetryOverlayProps {
  visible: boolean;
  opacity: number;
}

/**
 * Bathymetry Overlay — renders ocean depth contours for the Ghana continental
 * shelf region.  Uses locally-defined isobaths (100 m, 200 m, 500 m, 1000 m)
 * derived from GEBCO / ETOPO data for the Gulf of Guinea.
 *
 * The contour polylines are rendered as styled dashed lines with depth labels.
 * A subtle shaded-relief fill is added between contour bands.
 */
export const BathymetryOverlay: React.FC<BathymetryOverlayProps> = ({
  visible,
  opacity,
}) => {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible) return;

    const group = L.layerGroup();
    layerRef.current = group;

    // ── Shaded relief fill bands ──────────────────────────────────
    DEPTH_BANDS.forEach((band) => {
      const polygon = L.polygon(band.coords, {
        color: 'transparent',
        fillColor: band.color,
        fillOpacity: band.fillOpacity * opacity,
        interactive: false,
      });
      group.addLayer(polygon);
    });

    // ── Contour polylines ─────────────────────────────────────────
    CONTOURS.forEach((contour) => {
      const line = L.polyline(contour.coords, {
        color: contour.color,
        weight: contour.weight,
        opacity: opacity * 0.7,
        dashArray: contour.dashArray,
        interactive: false,
      });

      // Depth labels along the line
      if (contour.coords.length > 1) {
        const midIdx = Math.floor(contour.coords.length / 2);
        const midPt = contour.coords[midIdx];

        const labelIcon = L.divIcon({
          className: 'bathymetry-label',
          html: `<div style="
            font-size: 9px;
            font-weight: 600;
            color: ${contour.color};
            text-shadow: 0 0 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6);
            white-space: nowrap;
            pointer-events: none;
            opacity: ${opacity};
          ">${contour.depth}m</div>`,
          iconSize: [36, 14],
          iconAnchor: [18, 7],
        });

        const marker = L.marker(midPt, { icon: labelIcon, interactive: false });
        group.addLayer(marker);
      }

      line.bindTooltip(`Depth: ${contour.depth} m`, { sticky: true, opacity: 0.85 });
      group.addLayer(line);
    });

    // ── Shelf-edge annotation ─────────────────────────────────────
    const shelfLabel = L.divIcon({
      className: 'bathymetry-shelf-label',
      html: `<div style="
        font-size: 10px;
        font-style: italic;
        color: rgba(94, 234, 212, ${opacity * 0.6});
        text-shadow: 0 0 6px rgba(0,0,0,0.7);
        white-space: nowrap;
        pointer-events: none;
      ">Continental Shelf Edge</div>`,
      iconSize: [130, 14],
      iconAnchor: [65, 7],
    });

    group.addLayer(L.marker([4.3, -0.8], { icon: shelfLabel, interactive: false }));
    group.addTo(map);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, visible, opacity]);

  return null;
};

// ── Ghana continental-shelf isobaths ────────────────────────────────
// Approximated from GEBCO gridded bathymetry for the Gulf of Guinea
// between ~3.5°W to 1.5°E, ~3.5°N to 5.8°N.

interface Contour {
  depth: number;
  color: string;
  weight: number;
  dashArray: string;
  coords: L.LatLngTuple[];
}

const CONTOURS: Contour[] = [
  {
    depth: 100,
    color: 'rgba(94, 234, 212, 0.8)',
    weight: 1.5,
    dashArray: '',
    coords: [
      [5.02, -3.00], [4.96, -2.60], [4.88, -2.20], [4.82, -1.80],
      [4.92, -1.40], [5.08, -1.00], [5.18, -0.60], [5.28, -0.20],
      [5.36, 0.20],  [5.40, 0.60],  [5.32, 1.00],  [5.24, 1.40],
    ],
  },
  {
    depth: 200,
    color: 'rgba(56, 189, 248, 0.7)',
    weight: 1.5,
    dashArray: '6 4',
    coords: [
      [4.90, -3.00], [4.82, -2.60], [4.72, -2.20], [4.65, -1.80],
      [4.74, -1.40], [4.90, -1.00], [5.00, -0.60], [5.10, -0.20],
      [5.18, 0.20],  [5.22, 0.60],  [5.14, 1.00],  [5.06, 1.40],
    ],
  },
  {
    depth: 500,
    color: 'rgba(99, 102, 241, 0.6)',
    weight: 1.2,
    dashArray: '4 6',
    coords: [
      [4.65, -3.00], [4.56, -2.60], [4.44, -2.20], [4.36, -1.80],
      [4.46, -1.40], [4.58, -1.00], [4.68, -0.60], [4.78, -0.20],
      [4.86, 0.20],  [4.90, 0.60],  [4.82, 1.00],  [4.74, 1.40],
    ],
  },
  {
    depth: 1000,
    color: 'rgba(139, 92, 246, 0.5)',
    weight: 1.0,
    dashArray: '3 8',
    coords: [
      [4.35, -3.00], [4.26, -2.60], [4.14, -2.20], [4.06, -1.80],
      [4.16, -1.40], [4.28, -1.00], [4.38, -0.60], [4.48, -0.20],
      [4.56, 0.20],  [4.60, 0.60],  [4.52, 1.00],  [4.44, 1.40],
    ],
  },
];

// Shaded fill bands between contour depths
interface DepthBand {
  color: string;
  fillOpacity: number;
  coords: L.LatLngTuple[];
}

const DEPTH_BANDS: DepthBand[] = [
  {
    // 0-100m band (lightest)
    color: 'rgba(94, 234, 212, 0.12)',
    fillOpacity: 0.10,
    coords: [
      // Shore line (approximate)
      [5.10, -3.00], [5.06, -2.60], [5.00, -2.20], [4.95, -1.80],
      [5.10, -1.40], [5.30, -1.00], [5.42, -0.60], [5.50, -0.20],
      [5.55, 0.20],  [5.58, 0.60],  [5.48, 1.00],  [5.38, 1.40],
      // 100m contour reversed
      [5.24, 1.40], [5.32, 1.00], [5.40, 0.60], [5.36, 0.20],
      [5.28, -0.20], [5.18, -0.60], [5.08, -1.00], [4.92, -1.40],
      [4.82, -1.80], [4.88, -2.20], [4.96, -2.60], [5.02, -3.00],
    ],
  },
  {
    // 100-200m band
    color: 'rgba(56, 189, 248, 0.10)',
    fillOpacity: 0.08,
    coords: [
      // 100m contour
      [5.02, -3.00], [4.96, -2.60], [4.88, -2.20], [4.82, -1.80],
      [4.92, -1.40], [5.08, -1.00], [5.18, -0.60], [5.28, -0.20],
      [5.36, 0.20],  [5.40, 0.60],  [5.32, 1.00],  [5.24, 1.40],
      // 200m contour reversed
      [5.06, 1.40], [5.14, 1.00], [5.22, 0.60], [5.18, 0.20],
      [5.10, -0.20], [5.00, -0.60], [4.90, -1.00], [4.74, -1.40],
      [4.65, -1.80], [4.72, -2.20], [4.82, -2.60], [4.90, -3.00],
    ],
  },
  {
    // 200-500m band
    color: 'rgba(99, 102, 241, 0.08)',
    fillOpacity: 0.06,
    coords: [
      // 200m contour
      [4.90, -3.00], [4.82, -2.60], [4.72, -2.20], [4.65, -1.80],
      [4.74, -1.40], [4.90, -1.00], [5.00, -0.60], [5.10, -0.20],
      [5.18, 0.20],  [5.22, 0.60],  [5.14, 1.00],  [5.06, 1.40],
      // 500m contour reversed
      [4.74, 1.40], [4.82, 1.00], [4.90, 0.60], [4.86, 0.20],
      [4.78, -0.20], [4.68, -0.60], [4.58, -1.00], [4.46, -1.40],
      [4.36, -1.80], [4.44, -2.20], [4.56, -2.60], [4.65, -3.00],
    ],
  },
  {
    // 500-1000m band (darkest)
    color: 'rgba(139, 92, 246, 0.06)',
    fillOpacity: 0.05,
    coords: [
      // 500m
      [4.65, -3.00], [4.56, -2.60], [4.44, -2.20], [4.36, -1.80],
      [4.46, -1.40], [4.58, -1.00], [4.68, -0.60], [4.78, -0.20],
      [4.86, 0.20],  [4.90, 0.60],  [4.82, 1.00],  [4.74, 1.40],
      // 1000m reversed
      [4.44, 1.40], [4.52, 1.00], [4.60, 0.60], [4.56, 0.20],
      [4.48, -0.20], [4.38, -0.60], [4.28, -1.00], [4.16, -1.40],
      [4.06, -1.80], [4.14, -2.20], [4.26, -2.60], [4.35, -3.00],
    ],
  },
];

export default BathymetryOverlay;
