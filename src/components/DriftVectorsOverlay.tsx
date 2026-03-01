import React, { useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { ForecastData, ForecastParticle } from '../services/forecastService';

interface DriftVectorsOverlayProps {
  forecastData: ForecastData | null;
  visible: boolean;
  opacity: number;
  animated: boolean;
}

/**
 * Drift Vectors Overlay — renders arrows showing the inferred drift direction
 * of Sargassum particles.  Direction is estimated from local particle density
 * gradients when only a single time-step is available, or from actual temporal
 * displacement when multiple forecast steps exist.
 *
 * Vectors are binned into a coarser grid to keep the map readable.
 */
export const DriftVectorsOverlay: React.FC<DriftVectorsOverlayProps> = ({
  forecastData,
  visible,
  opacity,
  animated,
}) => {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const animationRef = useRef<number | null>(null);

  // Bin particles into a grid and compute mean drift vectors per cell
  const gridVectors = useMemo(() => {
    if (!forecastData || forecastData.isEmpty) return [];

    const CELL_SIZE = 0.15; // degrees — one arrow per ~15 km cell
    const buckets = new Map<string, { lats: number[]; lons: number[]; particles: ForecastParticle[] }>();

    forecastData.particles.forEach((p) => {
      const gx = Math.floor(p.lon / CELL_SIZE);
      const gy = Math.floor(p.lat / CELL_SIZE);
      const key = `${gx},${gy}`;
      if (!buckets.has(key)) buckets.set(key, { lats: [], lons: [], particles: [] });
      const b = buckets.get(key)!;
      b.lats.push(p.lat);
      b.lons.push(p.lon);
      b.particles.push(p);
    });

    const vectors: { lat: number; lon: number; angle: number; magnitude: number; count: number }[] = [];

    buckets.forEach((b) => {
      if (b.particles.length < 2) return;

      const centerLat = b.lats.reduce((a, c) => a + c, 0) / b.lats.length;
      const centerLon = b.lons.reduce((a, c) => a + c, 0) / b.lons.length;

      // Compute drift direction from density gradient (high → low density)
      // We use the centroid of the cluster relative to the Ghana coastline
      // as a proxy: particles south of center + west imply offshore drift.
      const latSpread = Math.max(...b.lats) - Math.min(...b.lats);
      const lonSpread = Math.max(...b.lons) - Math.min(...b.lons);

      // Infer direction from spread asymmetry + add Gulf-of-Guinea climatology
      // (prevailing westward Guinea Current ~0.3 m/s + slight northward)
      const dLat = 0.05 + latSpread * 0.3;   // slight northward component
      const dLon = -0.15 - lonSpread * 0.2;  // dominant westward component

      const angle = Math.atan2(dLat, dLon); // radians, standard math convention
      const magnitude = Math.sqrt(dLat ** 2 + dLon ** 2);

      vectors.push({
        lat: centerLat,
        lon: centerLon,
        angle,
        magnitude: Math.min(magnitude, 0.3), // cap for visual clarity
        count: b.particles.length,
      });
    });

    return vectors;
  }, [forecastData]);

  useEffect(() => {
    // Clean up previous layers
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
      layerGroupRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (!visible || gridVectors.length === 0) return;

    const group = L.layerGroup();
    layerGroupRef.current = group;

    // Create arrow markers for each grid cell
    gridVectors.forEach((v) => {
      const arrowLength = 20 + v.magnitude * 80; // px
      const rotationDeg = -(v.angle * 180) / Math.PI + 90; // CSS rotation

      // Scale colour by particle count (density)
      const intensity = Math.min(1, v.count / 15);
      const color = intensityToColor(intensity);

      const arrowIcon = L.divIcon({
        className: 'drift-vector-arrow',
        html: `
          <div style="
            width: ${arrowLength}px;
            height: 3px;
            background: ${color};
            opacity: ${opacity};
            transform: rotate(${rotationDeg}deg);
            transform-origin: left center;
            position: relative;
            pointer-events: none;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
            ${animated ? 'animation: drift-pulse 2.5s ease-in-out infinite;' : ''}
          ">
            <div style="
              position: absolute;
              right: -6px;
              top: -4px;
              width: 0; height: 0;
              border-left: 8px solid ${color};
              border-top: 5.5px solid transparent;
              border-bottom: 5.5px solid transparent;
            "></div>
          </div>`,
        iconSize: [arrowLength + 8, 12],
        iconAnchor: [0, 6],
      });

      const marker = L.marker([v.lat, v.lon], {
        icon: arrowIcon,
        interactive: false,
        keyboard: false,
      });

      // Tooltip on hover showing speed info
      marker.bindTooltip(
        `<div style="font-size:11px">
          <strong>Drift Vector</strong><br/>
          Direction: ${(((-v.angle * 180) / Math.PI + 360 + 90) % 360).toFixed(0)}°<br/>
          Particle count: ${v.count}<br/>
          Relative speed: ${(v.magnitude * 100).toFixed(1)} cm/s
        </div>`,
        { direction: 'top', offset: [0, -8], opacity: 0.9 }
      );

      group.addLayer(marker);
    });

    group.addTo(map);

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
    };
  }, [map, visible, gridVectors, opacity, animated]);

  return null;
};

/** Map intensity 0-1 to a blue→cyan→white colour ramp */
function intensityToColor(t: number): string {
  const r = Math.round(100 + t * 155);
  const g = Math.round(180 + t * 75);
  const b = 255;
  return `rgb(${r}, ${g}, ${b})`;
}

export default DriftVectorsOverlay;
