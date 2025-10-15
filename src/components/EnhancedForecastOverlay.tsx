import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { ForecastData } from '../services/forecastService';
import { satelliteService, SatelliteObservation, HybridForecastData } from '../services/satelliteService';

// Extend Leaflet types for heatLayer
declare module 'leaflet' {
  function heatLayer(points: any[], options?: any): L.Layer;
}

interface EnhancedForecastOverlayProps {
  forecastData: ForecastData | null;
  visible: boolean;
  opacity: number;
  renderMode?: 'native' | 'smooth' | 'hybrid';
  showGridCells?: boolean;
  showSatelliteData?: boolean; // New prop for satellite integration
  enhancedAccuracy?: boolean;  // New prop to enable satellite enhancement
}

export const EnhancedForecastOverlay: React.FC<EnhancedForecastOverlayProps> = ({
  forecastData,
  visible,
  opacity,
  renderMode = 'hybrid', // Default to hybrid mode
  showGridCells = false,
  showSatelliteData = true,
  enhancedAccuracy = true
}) => {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  const satelliteLayerRef = useRef<L.Layer | null>(null);
  const [hybridData, setHybridData] = useState<HybridForecastData | null>(null);
  // const [isLoadingSatellite, setIsLoadingSatellite] = useState(false);
  // const [satelliteError, setSatelliteError] = useState<string | null>(null);

  // Initialize satellite service
  useEffect(() => {
    if (enhancedAccuracy) {
      satelliteService.initialize().catch(console.error);
    }
  }, [enhancedAccuracy]);

  // Generate hybrid forecast when data changes
  useEffect(() => {
    if (!forecastData || !enhancedAccuracy || renderMode !== 'hybrid') {
      setHybridData(null);
      return;
    }

    const generateHybridForecast = async () => {
      // setIsLoadingSatellite(true);
      // setSatelliteError(null);
      
      try {
        const hybrid = await satelliteService.createHybridForecast(
          forecastData.particles,
          forecastData.date,
          [-4.5, 3.0, 2.5, 7.0] // Ghana bounds
        );
        setHybridData(hybrid);
        console.log('Hybrid forecast generated:', {
          modelParticles: hybrid.modelParticles.length,
          satelliteObservations: hybrid.satelliteObservations.length,
          hybridDensity: hybrid.hybridDensity.length,
          accuracy: hybrid.metadata.modelAccuracy
        });
      } catch (error) {
        console.error('Failed to generate hybrid forecast:', error);
        // setSatelliteError('Failed to load satellite data');
        setHybridData(null);
      } finally {
        // setIsLoadingSatellite(false);
      }
    };

    generateHybridForecast();
  }, [forecastData, enhancedAccuracy, renderMode]);

  // Clean up layers when component unmounts
  useEffect(() => {
    return () => {
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current);
      }
      if (satelliteLayerRef.current && map) {
        map.removeLayer(satelliteLayerRef.current);
      }
    };
  }, [map]);

  // Update layers when data or settings change
  useEffect(() => {
    console.log('EnhancedForecastOverlay useEffect triggered:', { 
      visible, 
      hasData: !!forecastData, 
      isEmpty: forecastData?.isEmpty,
      renderMode,
      hasHybridData: !!hybridData,
      particleCount: forecastData?.particles?.length,
      satelliteCount: hybridData?.satelliteObservations?.length
    });

    // Remove existing layers
    if (layerRef.current && map) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (satelliteLayerRef.current && map) {
      map.removeLayer(satelliteLayerRef.current);
      satelliteLayerRef.current = null;
    }

    if (!visible || !forecastData || forecastData.isEmpty || !map) {
      return;
    }

    try {
      if (renderMode === 'hybrid' && hybridData && !hybridData.isEmpty) {
        // Create hybrid visualization
        layerRef.current = createHybridVisualization(hybridData, opacity);
        
        // Optionally show satellite observation points
        if (showSatelliteData && hybridData.satelliteObservations.length > 0) {
          satelliteLayerRef.current = createSatelliteObservationLayer(hybridData.satelliteObservations, opacity);
        }
      } else if (renderMode === 'smooth') {
        // Create smooth continuous heatmap (original implementation)
        layerRef.current = createSmoothHeatmap(forecastData, opacity);
      } else {
        // Create native grid with interpolation (original implementation)
        layerRef.current = createInterpolatedGrid(forecastData, opacity, showGridCells);
      }

      if (layerRef.current) {
        console.log('Adding forecast layer to map');
        map.addLayer(layerRef.current);
        makeLayerNonInteractive(layerRef.current);
      }

      if (satelliteLayerRef.current) {
        console.log('Adding satellite observation layer to map');
        map.addLayer(satelliteLayerRef.current);
        makeLayerNonInteractive(satelliteLayerRef.current);
      }

    } catch (error) {
      console.error('Failed to create forecast layer:', error);
    }

  }, [map, visible, forecastData, opacity, renderMode, showGridCells, hybridData, showSatelliteData]);

  return null; // All rendering handled through Leaflet layers
};

// Create hybrid visualization combining model and satellite data
function createHybridVisualization(hybridData: HybridForecastData, opacity: number): L.Layer {
  const heatPoints: [number, number, number][] = [];
  
  // Convert hybrid density points to heat map format
  hybridData.hybridDensity.forEach(point => {
    // Confidence-weighted intensity
    const intensity = point.density * point.confidence;
    heatPoints.push([point.lat, point.lon, intensity]);
  });

  console.log(`Creating hybrid visualization with ${heatPoints.length} enhanced density points`);

  // Create heat layer with enhanced gradient for hybrid mode
  const hybridLayer = L.heatLayer(heatPoints, {
    radius: 35,      // Optimized radius for hybrid data
    blur: 25,        // Balanced blur for satellite-model fusion
    maxZoom: 18,
    max: 1.0,
    minOpacity: opacity * 0.08,
    opacity: opacity,
    // Enhanced gradient showing confidence levels
    gradient: {
      0.0: '#0f172a',  // Dark slate for very low confidence
      0.1: '#1e3a8a',  // Deep blue for low density
      0.3: '#0ea5e9',  // Light blue for moderate density  
      0.5: '#10b981',  // Green for satellite-validated areas
      0.7: '#facc15',  // Yellow for high density
      0.85: '#f97316', // Orange for very high density
      1.0: '#dc2626'   // Red for extreme density
    }
  });

  return hybridLayer;
}

// Create satellite observation point layer
function createSatelliteObservationLayer(observations: SatelliteObservation[], opacity: number): L.Layer {
  const layerGroup = L.layerGroup();
  
  observations.forEach(obs => {
    // Color based on satellite type and confidence
    const color = getSatelliteColor(obs);
    const radius = Math.max(3, obs.confidence * 8); // Size based on confidence
    
    const marker = L.circleMarker([obs.lat, obs.lon], {
      radius,
      fillColor: color,
      color: '#ffffff',
      weight: 1,
      opacity: opacity,
      fillOpacity: opacity * 0.7,
      interactive: false
    });
    
    // Add tooltip with satellite information
    marker.bindTooltip(`
      <div style="font-size: 12px;">
        <strong>${obs.satelliteName}</strong><br/>
        ${obs.indexType}: ${obs.sargassumIndex.toFixed(3)}<br/>
        Confidence: ${(obs.confidence * 100).toFixed(0)}%<br/>
        Time: ${obs.timestamp.toLocaleString()}
      </div>
    `, {
      permanent: false,
      direction: 'top',
      className: 'satellite-tooltip'
    });
    
    layerGroup.addLayer(marker);
  });
  
  console.log(`Created satellite observation layer with ${observations.length} points`);
  return layerGroup;
}

// Get color for satellite observation based on type and value
function getSatelliteColor(obs: SatelliteObservation): string {
  const intensity = obs.sargassumIndex;
  
  // Different color schemes for different satellite types
  if (obs.satelliteName.includes('VIIRS')) {
    // Blue-purple scheme for VIIRS
    if (intensity > 0.06) return '#8b5cf6'; // High purple
    if (intensity > 0.04) return '#a855f7'; // Medium purple
    if (intensity > 0.02) return '#c084fc'; // Light purple
    return '#ddd6fe'; // Very light purple
  } else if (obs.satelliteName.includes('OLCI')) {
    // Green scheme for OLCI
    if (intensity > 0.04) return '#059669'; // High green
    if (intensity > 0.02) return '#10b981'; // Medium green
    if (intensity > 0.01) return '#34d399'; // Light green
    return '#86efac'; // Very light green
  } else {
    // Orange scheme for other satellites
    if (intensity > 0.05) return '#ea580c'; // High orange
    if (intensity > 0.03) return '#f97316'; // Medium orange
    if (intensity > 0.015) return '#fb923c'; // Light orange
    return '#fed7aa'; // Very light orange
  }
}

// Make layer non-interactive to avoid interfering with map panning
function makeLayerNonInteractive(layer: L.Layer): void {
  const layerAny = layer as any;
  layerAny.options.interactive = false;
  layerAny.options.bubblingMouseEvents = false;
  
  // Override event handlers
  layer.on = function() { return this; };
  layerAny.off = function() { return this; };

  // Additional event handling for canvas/SVG elements
  if (layerAny.getElement && layerAny.getElement()) {
    const element = layerAny.getElement();
    if (element) {
      element.style.pointerEvents = 'none';
    }
  }
  
  if (layerAny.getCanvas && layerAny.getCanvas()) {
    const canvas = layerAny.getCanvas();
    if (canvas) {
      canvas.style.pointerEvents = 'none';
    }
  }
}

// Original implementations preserved for backward compatibility
function createSmoothHeatmap(forecastData: ForecastData, opacity: number): L.Layer {
  const heatPoints: [number, number, number][] = [];
  
  const waterParticles = forecastData.particles.filter(particle => 
    isInWater(particle.lat, particle.lon)
  );
  
  const particles = waterParticles;
  
  particles.forEach((particle) => {
    const searchRadius = 0.045;
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
    
    const baseIntensity = Math.min(1.0, nearbyCount / 10);
    const spreadRadius = 0.025;
    const numRings = 3;
    const pointsPerRing = 8;
    
    heatPoints.push([particle.lat, particle.lon, baseIntensity]);
    
    for (let ring = 1; ring <= numRings; ring++) {
      const ringRadius = (spreadRadius * ring) / numRings;
      const ringIntensity = baseIntensity * Math.exp(-ring * 0.8);
      
      for (let i = 0; i < pointsPerRing; i++) {
        const angle = (i / pointsPerRing) * 2 * Math.PI;
        const lat = particle.lat + Math.cos(angle) * ringRadius;
        const lon = particle.lon + Math.sin(angle) * ringRadius;
        
        if (isInWater(lat, lon)) {
          heatPoints.push([lat, lon, ringIntensity]);
        }
      }
    }
    
    for (let i = 0; i < 5; i++) {
      const randomAngle = Math.random() * 2 * Math.PI;
      const randomRadius = Math.random() * spreadRadius;
      const lat = particle.lat + Math.cos(randomAngle) * randomRadius;
      const lon = particle.lon + Math.sin(randomAngle) * randomRadius;
      
      if (isInWater(lat, lon)) {
        heatPoints.push([lat, lon, baseIntensity * 0.4]);
      }
    }
  });

  const heatLayer = L.heatLayer(heatPoints, {
    radius: 40,
    blur: 30,
    maxZoom: 18,
    max: 1.0,
    minOpacity: opacity * 0.05,
    opacity: opacity,
    gradient: {
      0.0: '#1e3a8a',
      0.25: '#0ea5e9',
      0.5: '#facc15',
      0.75: '#f97316',
      1.0: '#dc2626'
    }
  });

  return heatLayer;
}

function createInterpolatedGrid(forecastData: ForecastData, opacity: number, showGridCells: boolean): L.Layer {
  const lats = forecastData.particles.map(p => p.lat);
  const lons = forecastData.particles.map(p => p.lon);
  const minLat = Math.min(...lats) - 0.08;
  const maxLat = Math.max(...lats) + 0.08;
  const minLon = Math.min(...lons) - 0.08;
  const maxLon = Math.max(...lons) + 0.08;

  const gridResolution = 0.008;
  const gridPoints: [number, number, number][] = [];

  for (let lat = minLat; lat <= maxLat; lat += gridResolution) {
    for (let lon = minLon; lon <= maxLon; lon += gridResolution) {
      if (isInWater(lat, lon)) {
        const density = calculateInterpolatedDensity(lat, lon, forecastData.particles);
        
        if (density > 0.05) {
          gridPoints.push([lat, lon, density]);
        }
      }
    }
  }

  const gridLayer = L.heatLayer(gridPoints, {
    radius: showGridCells ? 12 : 20,
    blur: showGridCells ? 8 : 15,
    maxZoom: 18,
    max: 1.0,
    minOpacity: opacity * 0.1,
    opacity: opacity,
    gradient: {
      0.0: '#1e3a8a',
      0.25: '#0ea5e9',
      0.5: '#facc15',
      0.75: '#f97316',
      1.0: '#dc2626'
    }
  });

  return gridLayer;
}

// Helper functions preserved from original implementation
function isInWater(lat: number, lon: number): boolean {
  if (lat < 4.0) return true;
  if (lat > 6.0) return false;
  
  const coastLat = getGhanaCoastlineLatitude(lon);
  const NEARSHORE_BUFFER = 0.018;
  return lat < (coastLat - NEARSHORE_BUFFER);
}

function getGhanaCoastlineLatitude(lon: number): number {
  const coastPoints = [
    { lon: -3.0, lat: 5.05 },
    { lon: -2.0, lat: 5.15 },
    { lon: -1.0, lat: 5.35 },
    { lon: -0.5, lat: 5.45 },
    { lon: 0.0, lat: 5.55 },
    { lon: 0.5, lat: 5.60 },
    { lon: 1.0, lat: 5.50 },
    { lon: 1.5, lat: 5.40 }
  ];
  
  for (let i = 0; i < coastPoints.length - 1; i++) {
    const p1 = coastPoints[i];
    const p2 = coastPoints[i + 1];
    
    if (lon >= p1.lon && lon <= p2.lon) {
      const ratio = (lon - p1.lon) / (p2.lon - p1.lon);
      return p1.lat + ratio * (p2.lat - p1.lat);
    }
  }
  
  if (lon < coastPoints[0].lon) return coastPoints[0].lat;
  return coastPoints[coastPoints.length - 1].lat;
}

function calculateInterpolatedDensity(lat: number, lon: number, particles: any[]): number {
  let weightedSum = 0;
  let weightSum = 0;
  const maxDistance = 0.06;
  
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

  particles.forEach(particle => {
    const distance = Math.sqrt(
      Math.pow(lat - particle.lat, 2) + 
      Math.pow(lon - particle.lon, 2)
    );

    if (distance < maxDistance) {
      const distanceWeight = Math.exp(-distance * 25);
      const densityBoost = Math.min(2.0, localParticleCount / 5);
      const combinedWeight = distanceWeight * densityBoost;
      
      weightedSum += combinedWeight;
      weightSum += combinedWeight;
    }
  });

  const rawDensity = weightSum > 0 ? weightedSum / weightSum : 0;
  const enhancedDensity = 1 / (1 + Math.exp(-8 * (rawDensity - 0.5)));
  
  return Math.min(1.0, enhancedDensity);
}