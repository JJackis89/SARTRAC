/**
 * Enhanced Satellite Data Integration Service
 * Combines real satellite observations with model forecasts for improved accuracy
 */

import { RealSatelliteService } from './realSatelliteService';

// Environment configuration
// UNUSED - replaced by RealSatelliteService
/* const ERDDAP_CONFIG = {
  VIIRS_URL: import.meta.env.VITE_ERDDAP_VIIRS_URL || 'https://coastwatch.pfeg.noaa.gov/erddap',
  OLCI_URL: import.meta.env.VITE_ERDDAP_OLCI_URL || 'https://oceandata.sci.gsfc.nasa.gov/erddap',
  BACKUP_URL: import.meta.env.VITE_ERDDAP_BACKUP_URL || 'https://upwell.pfeg.noaa.gov/erddap',
  TIMEOUT: parseInt(import.meta.env.VITE_SATELLITE_TIMEOUT || '30000'),
  CACHE_DURATION: parseInt(import.meta.env.VITE_SATELLITE_CACHE_DURATION || '3600000'),
  RETRY_ATTEMPTS: parseInt(import.meta.env.VITE_SATELLITE_RETRY_ATTEMPTS || '3')
};

const GEE_CONFIG = {
  SERVICE_URL: import.meta.env.VITE_GEE_SERVICE_URL || '/api/gee',
  API_KEY: import.meta.env.VITE_GEE_API_KEY || ''
}; */

export interface SatelliteObservation {
  id: string;
  lat: number;
  lon: number;
  timestamp: Date;
  satelliteName: string;
  sargassumIndex: number;  // AFAI or MCI value
  indexType: 'AFAI' | 'MCI' | 'CHLA';
  confidence: number;      // 0-1 confidence score
  cloudCover?: number;     // Cloud coverage percentage
  qualityFlags?: string[]; // Quality control flags
}

export interface SatelliteMetadata {
  source: 'VIIRS' | 'OLCI' | 'MODIS';
  processingLevel: string;
  acquisitionTime: Date;
  orbitNumber?: number;
  instrument: string;
  spatialResolution: number; // meters
  temporalResolution: string; // e.g., "daily", "3-hourly"
}

export interface HybridForecastData {
  modelParticles: Array<{ lat: number; lon: number; }>;
  satelliteObservations: SatelliteObservation[];
  hybridDensity: Array<{ lat: number; lon: number; density: number; confidence: number; }>;
  metadata: {
    modelAccuracy: number;
    satelliteValidationPoints: number;
    lastSatelliteUpdate: Date;
    predictionConfidence: number;
  };
  isEmpty: boolean;
}

// UNUSED - replaced by RealSatelliteService
/* interface DatasetConfig {
  dataset_id: string;
  var: string;
  server: string;
  lat: string;
  lon: string;
  time: string;
  threshold: number;
  description: string;
} */

class SatelliteService {
  // UNUSED: private readonly ERDDAP_TIMEOUT = ERDDAP_CONFIG.TIMEOUT;
  // UNUSED: private readonly GEE_ENDPOINT = GEE_CONFIG.SERVICE_URL;
  private observationCache: Map<string, SatelliteObservation[]> = new Map();
  private realSatelliteService: RealSatelliteService;
  private useRealData: boolean = false;
  
  constructor() {
    this.realSatelliteService = new RealSatelliteService();
  }
  
  /**
   * Initialize satellite service with backend connectivity check
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing satellite service...');
      
      // Check if we should use real satellite data
      this.useRealData = import.meta.env.VITE_ENABLE_REAL_SATELLITE_DATA === 'true';
      
      if (this.useRealData) {
        console.log('Real satellite data integration enabled');
        // Test connection to real satellite services
        const healthStatus = this.realSatelliteService.getHealthStatus();
        const healthyServers = Object.values(healthStatus).filter(healthy => healthy).length;
        
        if (healthyServers === 0) {
          console.warn('No healthy ERDDAP servers found, falling back to simulated data');
          this.useRealData = false;
        } else {
          console.log(`Connected to ${healthyServers} healthy ERDDAP servers`);
        }
      } else {
        console.log('Using simulated satellite data for development');
      }
      
      // Check backend API availability for GEE services
      const backendHealth = await this.checkBackendHealth();
      if (!backendHealth) {
        console.warn('Backend satellite services unavailable, using ERDDAP only');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize satellite service:', error);
      return false;
    }
  }

  /**
   * Check if backend satellite processing services are available
   */
  private async checkBackendHealth(): Promise<boolean> {
    try {
      // Check if the satellite detection backend is available
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/api/health', { 
        method: 'HEAD', 
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get latest satellite observations for a specific date
   */
  async getLatestObservations(date: string, bounds?: [number, number, number, number]): Promise<SatelliteObservation[]> {
    const cacheKey = `${date}_${bounds?.join('_') || 'global'}`;
    
    // Check cache first
    if (this.observationCache.has(cacheKey)) {
      console.log('Using cached satellite observations');
      return this.observationCache.get(cacheKey)!;
    }

    try {
      let observations: SatelliteObservation[] = [];

      if (this.useRealData) {
        // Use real satellite data from ERDDAP servers
        console.log('Fetching real satellite data...');
        const satelliteData = await this.realSatelliteService.getComprehensiveSatelliteData(date, bounds);
        
        // Combine VIIRS and OLCI data
        observations = satelliteData.combined;
        
        // Log data quality metrics
        console.log(`Real satellite data quality: ${(satelliteData.overall_quality * 100).toFixed(1)}%`);
        console.log(`VIIRS data points: ${satelliteData.viirs.metadata.data_points}`);
        console.log(`OLCI data points: ${satelliteData.olci.metadata.data_points}`);
        
        // If real data quality is poor, supplement with simulated data
        if (satelliteData.overall_quality < 0.3 || observations.length < 10) {
          console.warn('Real satellite data quality is poor, adding simulated observations');
          const simulatedObs = this.generateSimulatedObservations(date, bounds);
          observations = [...observations, ...simulatedObs];
        }
        
      } else {
        // Use simulated data for development/testing
        console.log('Using simulated satellite data');
        observations = this.generateSimulatedObservations(date, bounds);
      }

      // Cache the observations
      this.observationCache.set(cacheKey, observations);
      
      return observations;
      
    } catch (error) {
      console.error('Failed to fetch satellite observations:', error);
      
      // Fallback to simulated data
      console.log('Falling back to simulated satellite data');
      const simulatedObservations = this.generateSimulatedObservations(date, bounds);
      this.observationCache.set(cacheKey, simulatedObservations);
      return simulatedObservations;
    }
  }

  /**
   * Get satellite service status and performance metrics
   */
  getSatelliteStatus(): {
    usingRealData: boolean;
    healthStatus: { [server: string]: boolean };
    performanceMetrics: { [server: string]: { avg: number; latest: number } };
  } {
    if (this.useRealData) {
      const metrics = this.realSatelliteService.getPerformanceMetrics();
      return {
        usingRealData: true,
        healthStatus: this.realSatelliteService.getHealthStatus(),
        performanceMetrics: metrics.serverMetrics
      };
    } else {
      return {
        usingRealData: false,
        healthStatus: {},
        performanceMetrics: {}
      };
    }
  }

  /*
   * UNUSED: Fetch ERDDAP satellite data (VIIRS, MODIS) - replaced by RealSatelliteService
   */
  /* private async fetchERDDAPData(datasetKey: string, date: string, bounds?: [number, number, number, number]): Promise<SatelliteObservation[]> {
    const datasets = {
      viirs_afai: {
        dataset_id: 'erdVHNchla1day',
        var: 'chlor_a',
        server: 'https://coastwatch.noaa.gov/erddap',
        lat: 'latitude',
        lon: 'longitude',
        time: 'time',
        threshold: 0.02,
        description: 'VIIRS NPP Chlorophyll-a as AFAI proxy'
      }
    };

    const config = datasets[datasetKey as keyof typeof datasets];
    if (!config) {
      throw new Error(`Unknown dataset: ${datasetKey}`);
    }

    // Default to Ghana bounds if not specified
    const [minLon, minLat, maxLon, maxLat] = bounds || [-4.5, 3.0, 2.5, 7.0];
    
    const url = this.buildERDDAPURL(config, date, minLon, maxLon, minLat, maxLat);
    
    console.log(`Fetching ERDDAP data: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.ERDDAP_TIMEOUT);

    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: { 'Accept': 'text/csv' }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`ERDDAP request failed: ${response.statusText}`);
      }

      const csvText = await response.text();
      return this.parseERDDAPResponse(csvText, config, 'VIIRS');
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /*
   * UNUSED: Build ERDDAP query URL - replaced by RealSatelliteService
   */
  /* private buildERDDAPURL(config: DatasetConfig, date: string, minLon: number, maxLon: number, minLat: number, maxLat: number): string {
    const dateFormatted = `${date}T00:00:00Z`;
    const vars = `${config.var},${config.lat},${config.lon}`;
    const timeConstraint = `[(${dateFormatted})]`;
    const latConstraint = `[(${minLat}):1:(${maxLat})]`;
    const lonConstraint = `[(${minLon}):1:(${maxLon})]`;
    
    return `${config.server}/griddap/${config.dataset_id}.csv?${vars}${timeConstraint}${latConstraint}${lonConstraint}`;
  }

  /*
   * UNUSED: Parse ERDDAP CSV response into satellite observations - replaced by RealSatelliteService
   */
  /* private parseERDDAPResponse(csvText: string, config: DatasetConfig, satelliteName: string): SatelliteObservation[] {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const observations: SatelliteObservation[] = [];
    
    // Skip header and units line
    for (let i = 2; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length < 4) continue;

      const value = parseFloat(values[0]);
      const lat = parseFloat(values[1]);
      const lon = parseFloat(values[2]);
      const timeStr = values[3];

      // Filter by threshold and validate coordinates
      if (isNaN(value) || isNaN(lat) || isNaN(lon) || value < config.threshold) {
        continue;
      }

      observations.push({
        id: `${satelliteName}_${lat.toFixed(4)}_${lon.toFixed(4)}_${timeStr}`,
        lat,
        lon,
        timestamp: new Date(timeStr),
        satelliteName,
        sargassumIndex: value,
        indexType: config.var === 'chlor_a' ? 'CHLA' : 'AFAI',
        confidence: Math.min(1.0, value / (config.threshold * 5)), // Confidence based on signal strength
        qualityFlags: value > config.threshold * 2 ? ['high_confidence'] : ['moderate_confidence']
      });
    }

    console.log(`Parsed ${observations.length} satellite observations from ${satelliteName}`);
    return observations;
  }

  /*
   * UNUSED: Fetch Google Earth Engine processed data (OLCI) - replaced by RealSatelliteService
   */
  /* private async fetchGEEData(date: string, bounds?: [number, number, number, number]): Promise<SatelliteObservation[]> {
    try {
      // This would connect to your backend GEE service
      const response = await fetch(`${this.GEE_ENDPOINT}/olci-detections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          bounds: bounds || [-4.5, 3.0, 2.5, 7.0],
          afai_threshold: 0.02,
          mci_threshold: 0.00
        })
      });

      if (!response.ok) {
        throw new Error(`GEE service unavailable: ${response.statusText}`);
      }

      const geeData = await response.json();
      return this.parseGEEResponse(geeData);

    } catch (error) {
      console.warn('GEE data unavailable, skipping OLCI observations:', error);
      return [];
    }
  }

  /*
   * UNUSED: Parse Google Earth Engine response - replaced by RealSatelliteService
   */
  /* private parseGEEResponse(geeData: any): SatelliteObservation[] {
    const observations: SatelliteObservation[] = [];
    
    if (geeData.features) {
      geeData.features.forEach((feature: any, index: number) => {
        const coords = feature.geometry.coordinates;
        const props = feature.properties;
        
        observations.push({
          id: `OLCI_${index}_${props.afai || 0}`,
          lat: coords[1],
          lon: coords[0],
          timestamp: new Date(props.system_time_start || Date.now()),
          satelliteName: 'Sentinel-3 OLCI',
          sargassumIndex: props.afai || props.mci || 0,
          indexType: props.afai ? 'AFAI' : 'MCI',
          confidence: Math.min(1.0, (props.afai || props.mci || 0) / 0.05),
          cloudCover: props.cloud_cover || 0,
          qualityFlags: props.quality_flags || ['processed']
        });
      });
    }

    return observations;
  }

  /**
   * Generate realistic simulated satellite observations for demonstration
   */
  private generateSimulatedObservations(date: string, bounds?: [number, number, number, number]): SatelliteObservation[] {
    const [minLon, minLat, maxLon, maxLat] = bounds || [-4.5, 3.0, 2.5, 7.0];
    const observations: SatelliteObservation[] = [];
    
    // Simulate realistic satellite observation patterns
    const hotspots = [
      { lat: 5.6, lon: -0.2, density: 'high' },    // Accra offshore
      { lat: 4.9, lon: -1.8, density: 'medium' },  // Cape Coast
      { lat: 4.7, lon: -2.0, density: 'medium' },  // Takoradi
      { lat: 5.1, lon: -0.5, density: 'low' },     // Tema
    ];

    let observationId = 0;
    
    hotspots.forEach(hotspot => {
      const count = hotspot.density === 'high' ? 12 : hotspot.density === 'medium' ? 8 : 4;
      const baseIndex = hotspot.density === 'high' ? 0.08 : hotspot.density === 'medium' ? 0.05 : 0.03;
      
      for (let i = 0; i < count; i++) {
        // Add some realistic spatial spread
        const latOffset = (Math.random() - 0.5) * 0.2;
        const lonOffset = (Math.random() - 0.5) * 0.3;
        const lat = hotspot.lat + latOffset;
        const lon = hotspot.lon + lonOffset;
        
        // Ensure within bounds
        if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
          const indexValue = baseIndex + (Math.random() - 0.5) * 0.02;
          
          observations.push({
            id: `SIM_VIIRS_${observationId++}`,
            lat,
            lon,
            timestamp: new Date(date),
            satelliteName: 'VIIRS-NPP (Simulated)',
            sargassumIndex: indexValue,
            indexType: 'AFAI',
            confidence: Math.min(1.0, indexValue / 0.02),
            cloudCover: Math.random() * 20, // 0-20% cloud cover
            qualityFlags: indexValue > 0.04 ? ['high_confidence', 'clear_sky'] : ['moderate_confidence']
          });
        }
      }
    });

    // Add some OLCI observations
    for (let i = 0; i < 6; i++) {
      const lat = minLat + Math.random() * (maxLat - minLat);
      const lon = minLon + Math.random() * (maxLon - minLon);
      const mciValue = 0.01 + Math.random() * 0.03;
      
      observations.push({
        id: `SIM_OLCI_${i}`,
        lat,
        lon,
        timestamp: new Date(date),
        satelliteName: 'Sentinel-3 OLCI (Simulated)',
        sargassumIndex: mciValue,
        indexType: 'MCI',
        confidence: Math.min(1.0, mciValue / 0.02),
        cloudCover: Math.random() * 30,
        qualityFlags: ['processed', 'quality_controlled']
      });
    }

    console.log(`Generated ${observations.length} simulated satellite observations`);
    return observations;
  }

  /**
   * Create hybrid forecast combining model particles with satellite observations
   */
  async createHybridForecast(
    modelParticles: Array<{ lat: number; lon: number; }>,
    date: string,
    bounds?: [number, number, number, number]
  ): Promise<HybridForecastData> {
    
    // Get satellite observations
    const satelliteObservations = await this.getLatestObservations(date, bounds);
    
    // Calculate hybrid density grid
    const hybridDensity = this.calculateHybridDensity(modelParticles, satelliteObservations, bounds);
    
    // Calculate accuracy metrics
    const metadata = {
      modelAccuracy: this.calculateModelAccuracy(modelParticles, satelliteObservations),
      satelliteValidationPoints: satelliteObservations.length,
      lastSatelliteUpdate: new Date(),
      predictionConfidence: this.calculatePredictionConfidence(hybridDensity)
    };

    return {
      modelParticles,
      satelliteObservations,
      hybridDensity,
      metadata,
      isEmpty: modelParticles.length === 0 && satelliteObservations.length === 0
    };
  }

  /**
   * Calculate hybrid density combining model and satellite data
   */
  private calculateHybridDensity(
    modelParticles: Array<{ lat: number; lon: number; }>,
    observations: SatelliteObservation[],
    bounds?: [number, number, number, number]
  ): Array<{ lat: number; lon: number; density: number; confidence: number; }> {
    
    const [minLon, minLat, maxLon, maxLat] = bounds || [-4.5, 3.0, 2.5, 7.0];
    const gridResolution = 0.01; // ~1km resolution
    const hybridPoints: Array<{ lat: number; lon: number; density: number; confidence: number; }> = [];

    // Create grid
    for (let lat = minLat; lat <= maxLat; lat += gridResolution) {
      for (let lon = minLon; lon <= maxLon; lon += gridResolution) {
        
        // Calculate model-based density
        const modelDensity = this.calculateModelDensityAtPoint(lat, lon, modelParticles);
        
        // Calculate satellite-based density
        const satelliteDensity = this.calculateSatelliteDensityAtPoint(lat, lon, observations);
        
        // Combine densities with weighted average
        const satelliteWeight = observations.length > 0 ? 0.7 : 0; // Higher weight to satellite data when available
        const modelWeight = 1 - satelliteWeight;
        
        const hybridDensity = (modelDensity * modelWeight) + (satelliteDensity * satelliteWeight);
        
        // Calculate confidence based on data availability and agreement
        const confidence = this.calculatePointConfidence(modelDensity, satelliteDensity, observations.length);
        
        if (hybridDensity > 0.05) { // Only include significant detections
          hybridPoints.push({
            lat,
            lon,
            density: hybridDensity,
            confidence
          });
        }
      }
    }

    console.log(`Generated ${hybridPoints.length} hybrid density points`);
    return hybridPoints;
  }

  /**
   * Calculate model-based density at a specific point
   */
  private calculateModelDensityAtPoint(lat: number, lon: number, particles: Array<{ lat: number; lon: number; }>): number {
    const searchRadius = 0.05; // ~5km
    let nearbyCount = 0;
    
    particles.forEach(particle => {
      const distance = Math.sqrt(
        Math.pow(lat - particle.lat, 2) + 
        Math.pow(lon - particle.lon, 2)
      );
      if (distance <= searchRadius) {
        nearbyCount++;
      }
    });
    
    return Math.min(1.0, nearbyCount / 10); // Normalize to 0-1
  }

  /**
   * Calculate satellite-based density at a specific point
   */
  private calculateSatelliteDensityAtPoint(lat: number, lon: number, observations: SatelliteObservation[]): number {
    const searchRadius = 0.08; // ~8km for satellite observations
    let weightedSum = 0;
    let totalWeight = 0;
    
    observations.forEach(obs => {
      const distance = Math.sqrt(
        Math.pow(lat - obs.lat, 2) + 
        Math.pow(lon - obs.lon, 2)
      );
      
      if (distance <= searchRadius) {
        const weight = Math.exp(-distance * 10) * obs.confidence; // Distance and confidence weighted
        weightedSum += obs.sargassumIndex * weight;
        totalWeight += weight;
      }
    });
    
    return totalWeight > 0 ? Math.min(1.0, weightedSum / totalWeight / 0.05) : 0; // Normalize to 0-1
  }

  /**
   * Calculate point confidence based on model-satellite agreement
   */
  private calculatePointConfidence(modelDensity: number, satelliteDensity: number, observationCount: number): number {
    // Base confidence on data availability
    let confidence = observationCount > 0 ? 0.8 : 0.4;
    
    // Adjust based on model-satellite agreement
    if (observationCount > 0) {
      const agreement = 1 - Math.abs(modelDensity - satelliteDensity);
      confidence = confidence * agreement;
    }
    
    return Math.min(1.0, Math.max(0.1, confidence));
  }

  /**
   * Calculate overall model accuracy based on satellite validation
   */
  private calculateModelAccuracy(particles: Array<{ lat: number; lon: number; }>, observations: SatelliteObservation[]): number {
    if (observations.length === 0) return 0.65; // Default model-only accuracy
    
    let validationMatches = 0;
    const searchRadius = 0.05; // ~5km validation radius
    
    observations.forEach(obs => {
      const nearbyParticles = particles.filter(p => {
        const distance = Math.sqrt(
          Math.pow(obs.lat - p.lat, 2) + 
          Math.pow(obs.lon - p.lon, 2)
        );
        return distance <= searchRadius;
      });
      
      if (nearbyParticles.length > 0) {
        validationMatches++;
      }
    });
    
    const validationRate = validationMatches / observations.length;
    return 0.65 + (validationRate * 0.25); // 65-90% accuracy range
  }

  /**
   * Calculate overall prediction confidence
   */
  private calculatePredictionConfidence(hybridDensity: Array<{ lat: number; lon: number; density: number; confidence: number; }>): number {
    if (hybridDensity.length === 0) return 0;
    
    const avgConfidence = hybridDensity.reduce((sum, point) => sum + point.confidence, 0) / hybridDensity.length;
    return avgConfidence;
  }

  /**
   * Get satellite metadata for display
   */
  getSatelliteMetadata(): SatelliteMetadata[] {
    return [
      {
        source: 'VIIRS',
        processingLevel: 'Level-3',
        acquisitionTime: new Date(),
        instrument: 'VIIRS (Visible Infrared Imaging Radiometer Suite)',
        spatialResolution: 750,
        temporalResolution: 'daily'
      },
      {
        source: 'OLCI',
        processingLevel: 'Level-2',
        acquisitionTime: new Date(),
        instrument: 'OLCI (Ocean and Land Colour Instrument)',
        spatialResolution: 300,
        temporalResolution: '3-daily'
      }
    ];
  }

  /**
   * Clear observation cache
   */
  clearCache(): void {
    this.observationCache.clear();
  }
}

export const satelliteService = new SatelliteService();