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
    console.log('ForecastOverlay useEffect triggered:', { 
      visible, 
      hasData: !!forecastData, 
      isEmpty: forecastData?.isEmpty,
      renderMode,
      particleCount: forecastData?.particles?.length
    });

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
        console.log('Adding new layer to map');
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

// Create smooth continuous heatmap using leaflet.heat
function createSmoothHeatmap(forecastData: ForecastData, opacity: number): L.Layer {
  // Prepare heat map data points with enhanced density calculation
  const heatPoints: [number, number, number][] = [];
  
  // Calculate local density around each particle for more realistic intensity values
  const particles = forecastData.particles;
  
  particles.forEach((particle) => {
    // Calculate local particle density (particles within 5km radius)
    const searchRadius = 0.045; // ~5km in degrees
    let nearbyCount = 0;
    
    particles.forEach(otherParticle => {
      const distance = Math.sqrt(
        Math.pow(particle.lat - otherParticle.lat, 2) + 
        Math.pow(particle.lon - otherParticle.lon, 2)
      );
      if (distance <= searchRadius) {
        nearbyCount++;
      }
    });
    
    // Base intensity proportional to local density
    const baseIntensity = Math.min(1.0, nearbyCount / 10); // Normalize to 0-1
    
    // Create a more sophisticated spreading pattern for continuous coverage
    const spreadRadius = 0.025; // ~2.5km spread in degrees
    const numRings = 3;
    const pointsPerRing = 8;
    
    // Central point with full intensity
    heatPoints.push([particle.lat, particle.lon, baseIntensity]);
    
    // Create concentric rings around each particle
    for (let ring = 1; ring <= numRings; ring++) {
      const ringRadius = (spreadRadius * ring) / numRings;
      const ringIntensity = baseIntensity * Math.exp(-ring * 0.8); // Exponential decay
      
      for (let i = 0; i < pointsPerRing; i++) {
        const angle = (i / pointsPerRing) * 2 * Math.PI;
        const lat = particle.lat + Math.cos(angle) * ringRadius;
        const lon = particle.lon + Math.sin(angle) * ringRadius;
        heatPoints.push([lat, lon, ringIntensity]);
      }
    }
    
    // Add additional random points for natural variability
    for (let i = 0; i < 5; i++) {
      const randomAngle = Math.random() * 2 * Math.PI;
      const randomRadius = Math.random() * spreadRadius;
      const lat = particle.lat + Math.cos(randomAngle) * randomRadius;
      const lon = particle.lon + Math.sin(randomAngle) * randomRadius;
      heatPoints.push([lat, lon, baseIntensity * 0.4]);
    }
  });

  // Create heat layer with parameters optimized for oceanographic visualization
  const heatLayer = L.heatLayer(heatPoints, {
    radius: 40,      // Larger radius for better coverage
    blur: 30,        // High blur for smooth transitions
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

// Create interpolated grid surface
function createInterpolatedGrid(forecastData: ForecastData, opacity: number, showGridCells: boolean): L.Layer {
  // Calculate bounds of all particles with padding
  const lats = forecastData.particles.map(p => p.lat);
  const lons = forecastData.particles.map(p => p.lon);
  const minLat = Math.min(...lats) - 0.08;
  const maxLat = Math.max(...lats) + 0.08;
  const minLon = Math.min(...lons) - 0.08;
  const maxLon = Math.max(...lons) + 0.08;

  // Create high-resolution interpolated grid for smooth surfaces
  const gridResolution = 0.008; // ~800m resolution for fine detail
  const gridPoints: [number, number, number][] = [];

  for (let lat = minLat; lat <= maxLat; lat += gridResolution) {
    for (let lon = minLon; lon <= maxLon; lon += gridResolution) {
      // Calculate interpolated density using enhanced algorithm
      const density = calculateInterpolatedDensity(lat, lon, forecastData.particles);
      
      if (density > 0.05) { // Lower threshold for better coverage
        gridPoints.push([lat, lon, density]);
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

// Calculate interpolated density using enhanced inverse distance weighting
function calculateInterpolatedDensity(lat: number, lon: number, particles: any[]): number {
  let weightedSum = 0;
  let weightSum = 0;
  const maxDistance = 0.06; // Increased influence distance (~6km)
  
  // First pass: calculate local particle density
  let localParticleCount = 0;
  particles.forEach(particle => {
    const distance = Math.sqrt(
      Math.pow(lat - particle.lat, 2) + 
      Math.pow(lon - particle.lon, 2)
    );
    if (distance < maxDistance) {
      localParticleCount++;
    }
  });

  // Second pass: apply sophisticated weighting
  particles.forEach(particle => {
    const distance = Math.sqrt(
      Math.pow(lat - particle.lat, 2) + 
      Math.pow(lon - particle.lon, 2)
    );

    if (distance < maxDistance) {
      // Multi-scale influence: combine distance-based and density-based weighting
      const distanceWeight = Math.exp(-distance * 25); // Strong distance decay
      const densityBoost = Math.min(2.0, localParticleCount / 5); // Boost areas with more particles
      const combinedWeight = distanceWeight * densityBoost;
      
      weightedSum += combinedWeight;
      weightSum += combinedWeight;
    }
  });

  // Normalize and apply enhancement for realistic oceanographic patterns
  const rawDensity = weightSum > 0 ? weightedSum / weightSum : 0;
  
  // Apply sigmoid function for more realistic density distribution
  const enhancedDensity = 1 / (1 + Math.exp(-8 * (rawDensity - 0.5)));
  
  return Math.min(1.0, enhancedDensity);
}