import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// ── Types ───────────────────────────────────────────────────────────

export interface DetectionPoint {
  lat: number;
  lon: number;
  value: number;
  source: string;
  date: string;
}

export interface DetectionData {
  points: DetectionPoint[];
  date: string;
  totalPoints: number;
}

interface DetectionPointsOverlayProps {
  detectionData: DetectionData | null;
  visible: boolean;
  opacity: number;
}

// Satellite-yellow icon for detection points (distinct from forecast heatmap)
function createDetectionIcon(value: number): L.DivIcon {
  const size = Math.max(6, Math.min(14, 6 + value * 8));
  const alpha = Math.max(0.5, Math.min(1, 0.5 + value * 0.5));
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:rgba(250,204,21,${alpha});
      border:1.5px solid rgba(255,255,255,0.7);
      box-shadow:0 0 6px rgba(250,204,21,0.6);
    "></div>`,
  });
}

// ── Component ───────────────────────────────────────────────────────

export const DetectionPointsOverlay: React.FC<DetectionPointsOverlayProps> = ({
  detectionData,
  visible,
  opacity,
}) => {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    return () => {
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map]);

  useEffect(() => {
    // Remove existing layer
    if (layerRef.current && map) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible || !detectionData || detectionData.points.length === 0 || !map) {
      return;
    }

    const group = L.layerGroup();

    detectionData.points.forEach((pt) => {
      const marker = L.marker([pt.lat, pt.lon], {
        icon: createDetectionIcon(pt.value),
        interactive: true,
      });

      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:12px;min-width:140px">
          <div style="font-weight:600;margin-bottom:4px;color:#facc15">Satellite Detection</div>
          <div><b>Chlor-a:</b> ${pt.value.toFixed(2)} mg/m³</div>
          <div><b>Source:</b> ${pt.source}</div>
          <div><b>Date:</b> ${pt.date}</div>
          <div><b>Lat:</b> ${pt.lat.toFixed(4)}</div>
          <div><b>Lon:</b> ${pt.lon.toFixed(4)}</div>
        </div>`,
        { className: 'detection-popup' }
      );

      group.addLayer(marker);
    });

    // Apply opacity to the group container
    group.addTo(map);
    const container = (group as any)._container || (group as any).getPane?.()?.querySelector?.('.leaflet-marker-pane');
    if (container) {
      container.style.opacity = String(opacity);
    }

    layerRef.current = group;
  }, [map, visible, detectionData, opacity]);

  return null;
};

export default DetectionPointsOverlay;
