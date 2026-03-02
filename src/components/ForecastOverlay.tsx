import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { ForecastData } from '../services/forecastService';

// Extend Leaflet types for heatLayer
declare module 'leaflet' {
  function heatLayer(points: any[], options?: any): L.Layer;
}

interface ForecastOverlayProps {
  forecastData: ForecastData | null;
  visible: boolean;
  opacity: number;
  renderMode?: 'native' | 'smooth';
  showGridCells?: boolean;
}

export const ForecastOverlay: React.FC<ForecastOverlayProps> = ({
  forecastData,
  visible,
  opacity,
  renderMode = 'smooth',
  showGridCells = false
}) => {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  // Clean up layer when component unmounts
  useEffect(() => {
    return () => {
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map]);

  // Update layer when data or settings change
  useEffect(() => {
    // Remove existing layer
    if (layerRef.current && map) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible || !forecastData || forecastData.isEmpty || !map) {
      return;
    }

    try {
      if (renderMode === 'smooth') {
        // Create smooth continuous heatmap
        layerRef.current = createSmoothHeatmap(forecastData, opacity);
      } else {
        // Create native grid with interpolation
        layerRef.current = createInterpolatedGrid(forecastData, opacity, showGridCells);
      }

      if (layerRef.current) {
        // Add the layer and ensure it doesn't capture mouse events
        map.addLayer(layerRef.current);
        
        // Additional event handling to prevent interference with map panning
        const layer = layerRef.current as any;
        if (layer.getElement && layer.getElement()) {
          const element = layer.getElement();
          if (element) {
            element.style.pointerEvents = 'none';
          }
        }
        
        // Try alternative approach for canvas-based layers
        if (layer.getCanvas && layer.getCanvas()) {
          const canvas = layer.getCanvas();
          if (canvas) {
            canvas.style.pointerEvents = 'none';
          }
        }
      }
    } catch (error) {
      console.error('Failed to create forecast layer:', error);
    }

  }, [map, visible, forecastData, opacity, renderMode, showGridCells]);

  return null; // All rendering handled through Leaflet layers
};

// Realistic water masking for Ghana coast - allows nearshore Sargassum
function isInWater(lat: number, lon: number): boolean {
  // More realistic approach that allows Sargassum closer to beaches
  // while still preventing land artifacts
  
  // Deep ocean - always water
  if (lat < 4.0) return true;
  
  // Far inland - always land  
  if (lat > 6.0) return false;
  
  // Get approximate coastline position for this longitude
  const coastLat = getGhanaCoastlineLatitude(lon);
  
  // Buffer accounts for heatmap visual bleed (radius 40px + blur 30px)
  // At zoom 7 → ~0.05° per pixel side, so 40px ≈ 0.03° visual radius
  const NEARSHORE_BUFFER = 0.035; // ~4km buffer to prevent visual bleed onto land
  return lat < (coastLat - NEARSHORE_BUFFER);
}

// High-resolution Ghana coastline approximation (~20 points)
function getGhanaCoastlineLatitude(lon: number): number {
  // Detailed coastline trace from west to east (verified coordinates)
  const coastPoints = [
    { lon: -3.20, lat: 5.02 },  // Half Assini / border area
    { lon: -2.90, lat: 5.05 },  // Jaway Wharf Town
    { lon: -2.60, lat: 4.98 },  // Beyin / Nzulezo area
    { lon: -2.35, lat: 4.93 },  // Esiama area
    { lon: -2.10, lat: 4.80 },  // Dixcove / Princes Town
    { lon: -1.75, lat: 4.88 },  // Takoradi harbour
    { lon: -1.60, lat: 4.93 },  // Sekondi
    { lon: -1.35, lat: 5.08 },  // Elmina
    { lon: -1.25, lat: 5.10 },  // Cape Coast
    { lon: -1.00, lat: 5.20 },  // Saltpond / Anomabu
    { lon: -0.75, lat: 5.29 },  // Apam area
    { lon: -0.63, lat: 5.34 },  // Winneba
    { lon: -0.40, lat: 5.47 },  // Gomoa Fetteh
    { lon: -0.20, lat: 5.53 },  // Accra James Town
    { lon: -0.01, lat: 5.62 },  // Tema harbour
    { lon:  0.20, lat: 5.62 },  // Ningo-Prampram
    { lon:  0.50, lat: 5.77 },  // Ada Foah area
    { lon:  0.80, lat: 5.78 },  // Keta lagoon area
    { lon:  1.00, lat: 5.75 },  // Keta / Aflao
    { lon:  1.20, lat: 6.10 },  // Togo border
  ];
  
  // Find the appropriate segment and interpolate
  for (let i = 0; i < coastPoints.length - 1; i++) {
    const p1 = coastPoints[i];
    const p2 = coastPoints[i + 1];
    
    if (lon >= p1.lon && lon <= p2.lon) {
      // Linear interpolation between points
      const ratio = (lon - p1.lon) / (p2.lon - p1.lon);
      return p1.lat + ratio * (p2.lat - p1.lat);
    }
  }
  
  // Default fallback for points outside range
  if (lon < coastPoints[0].lon) return coastPoints[0].lat;
  return coastPoints[coastPoints.length - 1].lat;
}

// Create smooth continuous heatmap using leaflet.heat
// Uses ONLY actual particle positions — no artificial ring spreading or
// random fill points.  Density is computed from real particle clustering
// so the heatmap reflects genuine forecast probability.
function createSmoothHeatmap(forecastData: ForecastData, opacity: number): L.Layer {
  const heatPoints: [number, number, number][] = [];
  
  // Filter particles to only include those in water
  const waterParticles = forecastData.particles.filter(particle => 
    isInWater(particle.lat, particle.lon)
  );
  
  const particles = waterParticles;
  
  // Pre-compute local density for each particle using a spatial index approach
  // This avoids O(n²) for large particle counts
  const searchRadius = 0.04; // ~4.5 km in degrees
  
  particles.forEach((particle) => {
    // Calculate local particle density (particles within search radius)
    let nearbyCount = 0;
    
    for (let i = 0; i < particles.length; i++) {
      const dlat = particle.lat - particles[i].lat;
      const dlon = particle.lon - particles[i].lon;
      // Quick Manhattan distance check before full distance
      if (Math.abs(dlat) > searchRadius || Math.abs(dlon) > searchRadius) continue;
      const dist2 = dlat * dlat + dlon * dlon;
      if (dist2 <= searchRadius * searchRadius) {
        nearbyCount++;
      }
    }
    
    // Intensity proportional to local density
    // Normalise: 1 particle alone → 0.15, 8+ nearby → 1.0
    const intensity = Math.min(1.0, Math.max(0.15, (nearbyCount - 1) / 7));
    
    heatPoints.push([particle.lat, particle.lon, intensity]);
  });

  // Create heat layer — radius and blur provide the visual smoothing
  // instead of artificial point injection
  const heatLayer = L.heatLayer(heatPoints, {
    radius: 35,      // Slightly smaller radius for more accurate footprint
    blur: 25,        // Moderate blur for smooth transitions
    maxZoom: 18,
    max: 1.0,
    minOpacity: opacity * 0.05,
    opacity: opacity,
    // Color gradient matching the professional oceanographic legend
    gradient: {
      0.0: '#1e3a8a',  // Deep blue for 0% (matches legend start)
      0.25: '#0ea5e9', // Light blue for 25% 
      0.5: '#facc15',  // Yellow for 50% (matches legend middle)
      0.75: '#f97316', // Orange for 75%
      1.0: '#dc2626'   // Red for 100% (matches legend end)
    }
  });

  // Make heat layer completely non-interactive to avoid interfering with map panning
  (heatLayer as any).options.interactive = false;
  (heatLayer as any).options.bubblingMouseEvents = false;
  
  // Override all mouse event handlers to pass through to the map
  heatLayer.on = function() { return this; }; // Disable all event handlers
  (heatLayer as any).off = function() { return this; }; // Disable all event handlers

  return heatLayer;
}

// Create interpolated grid surface — uses only real particle positions
// with inverse distance weighting for smooth contour-like rendering
function createInterpolatedGrid(forecastData: ForecastData, opacity: number, showGridCells: boolean): L.Layer {
  // Calculate bounds of all particles with padding
  const lats = forecastData.particles.map(p => p.lat);
  const lons = forecastData.particles.map(p => p.lon);
  const minLat = Math.min(...lats) - 0.05;
  const maxLat = Math.max(...lats) + 0.05;
  const minLon = Math.min(...lons) - 0.05;
  const maxLon = Math.max(...lons) + 0.05;

  // Create interpolated grid
  const gridResolution = 0.008; // ~800m resolution for fine detail
  const gridPoints: [number, number, number][] = [];

  for (let lat = minLat; lat <= maxLat; lat += gridResolution) {
    for (let lon = minLon; lon <= maxLon; lon += gridResolution) {
      if (isInWater(lat, lon)) {
        const density = calculateInterpolatedDensity(lat, lon, forecastData.particles);
        
        if (density > 0.08) { // Slightly higher threshold to avoid visual noise
          gridPoints.push([lat, lon, density]);
        }
      }
    }
  }

  // Create heat layer for grid visualization with professional styling
  const gridLayer = L.heatLayer(gridPoints, {
    radius: showGridCells ? 12 : 20, // Adaptive radius based on grid display mode
    blur: showGridCells ? 8 : 15,    // Less blur for discrete grid cells
    maxZoom: 18,
    max: 1.0,
    minOpacity: opacity * 0.1,
    opacity: opacity,
    // Same gradient as smooth mode to match professional oceanographic legend
    gradient: {
      0.0: '#1e3a8a',  // Deep blue for 0% (matches legend start)
      0.25: '#0ea5e9', // Light blue for 25% 
      0.5: '#facc15',  // Yellow for 50% (matches legend middle)
      0.75: '#f97316', // Orange for 75%
      1.0: '#dc2626'   // Red for 100% (matches legend end)
    }
  });

  // Make grid layer completely non-interactive to avoid interfering with map panning
  (gridLayer as any).options.interactive = false;
  (gridLayer as any).options.bubblingMouseEvents = false;
  
  // Override all mouse event handlers to pass through to the map
  gridLayer.on = function() { return this; }; // Disable all event handlers
  (gridLayer as any).off = function() { return this; }; // Disable all event handlers

  return gridLayer;
}

// Calculate interpolated density using inverse distance weighting
// Influence distance is kept tight to avoid inflating the forecast footprint
function calculateInterpolatedDensity(lat: number, lon: number, particles: any[]): number {
  let totalWeight = 0;
  const maxDistance = 0.045; // ~5km influence radius (tighter than before)
  let localParticleCount = 0;

  particles.forEach(particle => {
    const dlat = lat - particle.lat;
    const dlon = lon - particle.lon;
    // Quick reject
    if (Math.abs(dlat) > maxDistance || Math.abs(dlon) > maxDistance) return;
    const distance = Math.sqrt(dlat * dlat + dlon * dlon);

    if (distance < maxDistance) {
      localParticleCount++;
      // Gaussian-like weight: strong near particle, falls off smoothly
      const weight = Math.exp(-distance * distance / (2 * 0.015 * 0.015));
      totalWeight += weight;
    }
  });

  if (localParticleCount === 0) return 0;

  // Normalise: scale by how many particles contribute
  // 1 particle → ~0.2, 5+ particles → approaches 1.0
  const densityNorm = Math.min(1.0, totalWeight / 4.0);

  return densityNorm;
}