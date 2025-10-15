/**
 * Real-time Satellite Data Integration Service
 * Connects to live ERDDAP servers for VIIRS and OLCI data
 */

import { SatelliteObservation } from './satelliteService';
import { DataQualityValidator, ValidationResult } from './dataQualityValidator';
import { satelliteCache, CacheStats } from './satelliteDataCache';
import { satelliteBatcher, StreamChunk } from './satelliteRequestBatcher';
import { AccuracyValidator, ModelPrediction, ValidationResult as AccuracyValidationResult } from './accuracyValidator';

// Import configuration from environment
const ERDDAP_CONFIG = {
  VIIRS_URL: import.meta.env.VITE_ERDDAP_VIIRS_URL || 'https://coastwatch.pfeg.noaa.gov/erddap',
  OLCI_URL: import.meta.env.VITE_ERDDAP_OLCI_URL || 'https://oceandata.sci.gsfc.nasa.gov/erddap',
  BACKUP_URL: import.meta.env.VITE_ERDDAP_BACKUP_URL || 'https://upwell.pfeg.noaa.gov/erddap',
  TIMEOUT: parseInt(import.meta.env.VITE_SATELLITE_TIMEOUT || '30000'),
  CACHE_DURATION: parseInt(import.meta.env.VITE_SATELLITE_CACHE_DURATION || '3600000'),
  RETRY_ATTEMPTS: parseInt(import.meta.env.VITE_SATELLITE_RETRY_ATTEMPTS || '3'),
  API_KEY: import.meta.env.VITE_ERDDAP_API_KEY || ''
};

// Production ERDDAP endpoints and configurations
const ERDDAP_ENDPOINTS = {
  NOAA_COASTWATCH: {
    base_url: 'https://coastwatch.pfeg.noaa.gov/erddap',
    datasets: {
      viirs_chla: {
        id: 'erdVHNchla1day',
        variable: 'chla',
        description: 'VIIRS Chlorophyll-a daily composite',
        resolution: '4km',
        quality_flags: 'l2_flags'
      },
      viirs_sst: {
        id: 'erdVHNsst1day', 
        variable: 'sst',
        description: 'VIIRS Sea Surface Temperature',
        resolution: '4km'
      }
    }
  },
  NASA_OCEANDATA: {
    base_url: 'https://oceandata.sci.gsfc.nasa.gov/erddap',
    datasets: {
      olci_chla: {
        id: 'S3A_OL_2_WFR_chla',
        variable: 'CHL_OC4ME',
        description: 'Sentinel-3A OLCI Chlorophyll-a',
        resolution: '300m',
        quality_flags: 'WQSF'
      },
      modis_chla: {
        id: 'erdMH1chla1day',
        variable: 'chlor_a', 
        description: 'MODIS Aqua Chlorophyll-a',
        resolution: '4km'
      }
    }
  },
  BACKUP_SERVERS: [
    'https://upwell.pfeg.noaa.gov/erddap',
    'https://coastwatch.noaa.gov/erddap',
    'https://oceanwatch.pifsc.noaa.gov/erddap'
  ]
};

// Ghana-specific bounds for optimized data fetching
const GHANA_BOUNDS = {
  west: -4.5,   // Western longitude
  east: 2.5,    // Eastern longitude  
  south: 3.0,   // Southern latitude
  north: 7.0,   // Northern latitude
  coastal_buffer: 0.5  // Extra margin for coastal areas
};

interface SatelliteDataRequest {
  source: 'VIIRS' | 'OLCI' | 'MODIS';
  date: string;
  bounds?: [number, number, number, number];
  variables?: string[];
  quality_threshold?: number;
}

interface SatelliteDataResponse {
  success: boolean;
  data: SatelliteObservation[];
  metadata: {
    source: string;
    dataset_id: string;
    fetch_time: Date;
    data_points: number;
    quality_score: number;
    coverage_percentage: number;
  };
  errors?: string[];
}

class RealSatelliteService {
  private apiKey: string;
  private cache: Map<string, any> = new Map();
  private healthStatus: Map<string, boolean> = new Map();
  private performanceMetrics: Map<string, number[]> = new Map();
  private dataQualityValidator: DataQualityValidator;
  private accuracyValidator: AccuracyValidator;

  constructor() {
    this.apiKey = ERDDAP_CONFIG.API_KEY || '';
    this.dataQualityValidator = new DataQualityValidator();
    this.accuracyValidator = new AccuracyValidator();
    this.initializeHealthMonitoring();
  }

  /**
   * Initialize health monitoring for all ERDDAP servers
   */
  private async initializeHealthMonitoring(): Promise<void> {
    const servers = [
      ERDDAP_ENDPOINTS.NOAA_COASTWATCH.base_url,
      ERDDAP_ENDPOINTS.NASA_OCEANDATA.base_url,
      ...ERDDAP_ENDPOINTS.BACKUP_SERVERS
    ];

    for (const server of servers) {
      try {
        await this.checkServerHealth(server);
      } catch (error) {
        console.warn(`Server health check failed: ${server}`, error);
        this.healthStatus.set(server, false);
      }
    }
  }

  /**
   * Check ERDDAP server health and response time
   */
  private async checkServerHealth(serverUrl: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const healthUrl = `${serverUrl}/info/index.html`;
      const response = await fetch(healthUrl, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      const responseTime = Date.now() - startTime;
      
      // Store performance metrics
      if (!this.performanceMetrics.has(serverUrl)) {
        this.performanceMetrics.set(serverUrl, []);
      }
      this.performanceMetrics.get(serverUrl)!.push(responseTime);
      
      const isHealthy = response.ok && responseTime < 10000;
      this.healthStatus.set(serverUrl, isHealthy);
      
      console.log(`Server ${serverUrl}: ${isHealthy ? 'Healthy' : 'Unhealthy'} (${responseTime}ms)`);
      return isHealthy;
      
    } catch (error) {
      this.healthStatus.set(serverUrl, false);
      console.warn(`Health check failed for ${serverUrl}:`, error);
      return false;
    }
  }

  /**
   * Fetch real-time VIIRS satellite data
   */
  async fetchVIIRSData(request: SatelliteDataRequest): Promise<SatelliteDataResponse> {
    const cacheKey = `viirs_${request.date}_${JSON.stringify(request.bounds)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.metadata.fetch_time.getTime() < ERDDAP_CONFIG.CACHE_DURATION) {
        return cached;
      }
    }

    try {
      const endpoint = ERDDAP_ENDPOINTS.NOAA_COASTWATCH;
      const dataset = endpoint.datasets.viirs_chla;
      
      const bounds = request.bounds || [
        GHANA_BOUNDS.west - GHANA_BOUNDS.coastal_buffer,
        GHANA_BOUNDS.south - GHANA_BOUNDS.coastal_buffer,
        GHANA_BOUNDS.east + GHANA_BOUNDS.coastal_buffer,
        GHANA_BOUNDS.north + GHANA_BOUNDS.coastal_buffer
      ];

      const url = this.buildERDDAPQuery(endpoint.base_url, dataset, request.date, bounds);
      
      console.log(`Fetching VIIRS data: ${url}`);
      
      const response = await this.fetchWithRetry(url, 3);
      const csvData = await response.text();
      
      const observations = await this.parseERDDAPData(csvData, 'VIIRS', dataset);
      const qualityScore = this.calculateDataQuality(observations);
      
      const result: SatelliteDataResponse = {
        success: true,
        data: observations,
        metadata: {
          source: 'VIIRS-NPP',
          dataset_id: dataset.id,
          fetch_time: new Date(),
          data_points: observations.length,
          quality_score: qualityScore,
          coverage_percentage: this.calculateCoverage(observations, bounds)
        }
      };

      // Cache the result
      this.cache.set(cacheKey, result);
      return result;
      
    } catch (error) {
      console.error('VIIRS data fetch failed:', error);
      return {
        success: false,
        data: [],
        metadata: {
          source: 'VIIRS-NPP',
          dataset_id: 'erdVHNchla1day',
          fetch_time: new Date(),
          data_points: 0,
          quality_score: 0,
          coverage_percentage: 0
        },
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Fetch real-time OLCI satellite data
   */
  async fetchOLCIData(request: SatelliteDataRequest): Promise<SatelliteDataResponse> {
    const cacheKey = `olci_${request.date}_${JSON.stringify(request.bounds)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.metadata.fetch_time.getTime() < ERDDAP_CONFIG.CACHE_DURATION) {
        return cached;
      }
    }

    try {
      const endpoint = ERDDAP_ENDPOINTS.NASA_OCEANDATA;
      const dataset = endpoint.datasets.olci_chla;
      
      const bounds = request.bounds || [
        GHANA_BOUNDS.west - GHANA_BOUNDS.coastal_buffer,
        GHANA_BOUNDS.south - GHANA_BOUNDS.coastal_buffer,
        GHANA_BOUNDS.east + GHANA_BOUNDS.coastal_buffer,
        GHANA_BOUNDS.north + GHANA_BOUNDS.coastal_buffer
      ];

      const url = this.buildERDDAPQuery(endpoint.base_url, dataset, request.date, bounds);
      
      console.log(`Fetching OLCI data: ${url}`);
      
      const response = await this.fetchWithRetry(url, 3);
      const csvData = await response.text();
      
      const observations = await this.parseERDDAPData(csvData, 'OLCI', dataset);
      const qualityScore = this.calculateDataQuality(observations);
      
      const result: SatelliteDataResponse = {
        success: true,
        data: observations,
        metadata: {
          source: 'Sentinel-3A OLCI',
          dataset_id: dataset.id,
          fetch_time: new Date(),
          data_points: observations.length,
          quality_score: qualityScore,
          coverage_percentage: this.calculateCoverage(observations, bounds)
        }
      };

      // Cache the result
      this.cache.set(cacheKey, result);
      return result;
      
    } catch (error) {
      console.error('OLCI data fetch failed:', error);
      return {
        success: false,
        data: [],
        metadata: {
          source: 'Sentinel-3A OLCI',
          dataset_id: 'S3A_OL_2_WFR_chla',
          fetch_time: new Date(),
          data_points: 0,
          quality_score: 0,
          coverage_percentage: 0
        },
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Build optimized ERDDAP query URL
   */
  private buildERDDAPQuery(
    baseUrl: string, 
    dataset: any, 
    date: string, 
    bounds: [number, number, number, number]
  ): string {
    const [minLon, minLat, maxLon, maxLat] = bounds;
    const dateStr = new Date(date).toISOString().split('T')[0];
    
    // Build constraint parameters
    const constraints = [
      `time>=${dateStr}T00:00:00Z`,
      `time<=${dateStr}T23:59:59Z`,
      `latitude>=${minLat}`,
      `latitude<=${maxLat}`,
      `longitude>=${minLon}`,
      `longitude<=${maxLon}`
    ];

    // Add quality flag constraints if available
    if (dataset.quality_flags) {
      constraints.push(`${dataset.quality_flags}<=8`); // Good quality data only
    }

    const url = `${baseUrl}/tabledap/${dataset.id}.csv?` +
      `longitude,latitude,time,${dataset.variable}` +
      (dataset.quality_flags ? `,${dataset.quality_flags}` : '') +
      '&' + constraints.join('&');

    return url;
  }

  /**
   * Fetch with automatic retry and fallback servers
   */
  private async fetchWithRetry(url: string, maxRetries: number): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(ERDDAP_CONFIG.TIMEOUT),
          headers: {
            'Accept': 'text/csv',
            'User-Agent': 'SARTRAC/2.0 (Ghana Sargassum Forecasting)',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`Fetch attempt ${attempt}/${maxRetries} failed:`, lastError.message);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('All fetch attempts failed');
  }

  /**
   * Parse ERDDAP CSV response into SatelliteObservation objects
   */
  private async parseERDDAPData(
    csvData: string, 
    source: string, 
    _dataset: any
  ): Promise<SatelliteObservation[]> {
    const lines = csvData.trim().split('\n');
    
    if (lines.length < 3) {
      throw new Error('Invalid ERDDAP response: insufficient data');
    }

    // Skip header rows (usually 2 lines)
    const dataLines = lines.slice(2);
    const observations: SatelliteObservation[] = [];

    for (const line of dataLines) {
      try {
        const values = line.split(',');
        
        if (values.length < 4) continue;
        
        const lon = parseFloat(values[0]);
        const lat = parseFloat(values[1]);
        const timeStr = values[2];
        const chlaValue = parseFloat(values[3]);
        const qualityFlag = values[4] ? parseInt(values[4]) : 0;

        // Skip invalid or poor quality data
        if (isNaN(lon) || isNaN(lat) || isNaN(chlaValue) || 
            chlaValue < 0 || chlaValue > 100 || qualityFlag > 8) {
          continue;
        }

        // Convert chlorophyll-a to sargassum index (simplified conversion)
        const sargassumIndex = this.convertChlaToSargassumIndex(chlaValue, source);
        
        observations.push({
          id: `${source}_${lat}_${lon}_${timeStr}`,
          lat,
          lon,
          timestamp: new Date(timeStr),
          satelliteName: source,
          sargassumIndex,
          indexType: 'CHLA',
          confidence: this.calculateConfidence(chlaValue, qualityFlag),
          cloudCover: qualityFlag > 4 ? (qualityFlag * 10) : 0,
          qualityFlags: qualityFlag > 0 ? [`quality_${qualityFlag}`] : []
        });
        
      } catch (error) {
        console.warn('Failed to parse ERDDAP data line:', line, error);
        continue;
      }
    }

    console.log(`Parsed ${observations.length} valid observations from ${source}`);
    return observations;
  }

  /**
   * Convert chlorophyll-a concentration to sargassum probability index
   */
  private convertChlaToSargassumIndex(chlaValue: number, source: string): number {
    // Research-based conversion from chlorophyll-a to sargassum probability
    // Based on studies showing elevated chlorophyll in sargassum areas
    
    let baseThreshold: number;
    let maxThreshold: number;
    
    if (source === 'VIIRS') {
      baseThreshold = 0.1;  // mg/m³
      maxThreshold = 2.0;   // mg/m³
    } else { // OLCI/MODIS
      baseThreshold = 0.15; // mg/m³  
      maxThreshold = 2.5;   // mg/m³
    }

    if (chlaValue < baseThreshold) {
      return 0; // No sargassum indication
    }
    
    if (chlaValue > maxThreshold) {
      return 1; // Maximum sargassum probability
    }

    // Linear mapping between thresholds
    return (chlaValue - baseThreshold) / (maxThreshold - baseThreshold);
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(value: number, qualityFlag: number): number {
    let confidence = 1.0;
    
    // Reduce confidence based on quality flags
    if (qualityFlag > 0) {
      confidence *= Math.max(0.2, 1 - (qualityFlag * 0.1));
    }
    
    // Reduce confidence for extreme values
    if (value > 5.0 || value < 0.05) {
      confidence *= 0.7;
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Calculate overall data quality score
   */
  private calculateDataQuality(observations: SatelliteObservation[]): number {
    if (observations.length === 0) return 0;
    
    const avgConfidence = observations.reduce((sum, obs) => sum + obs.confidence, 0) / observations.length;
    const cloudCoverPenalty = observations.reduce((sum, obs) => sum + (obs.cloudCover || 0), 0) / (observations.length * 100);
    
    return Math.max(0, avgConfidence - cloudCoverPenalty);
  }

  /**
   * Calculate spatial coverage percentage
   */
  private calculateCoverage(observations: SatelliteObservation[], bounds: [number, number, number, number]): number {
    if (observations.length === 0) return 0;
    
    const [minLon, minLat, maxLon, maxLat] = bounds;
    const totalArea = (maxLon - minLon) * (maxLat - minLat);
    
    // Approximate coverage based on observation density
    // Assume each observation covers ~0.01 degree square
    const observedArea = observations.length * 0.01;
    
    return Math.min(100, (observedArea / totalArea) * 100);
  }

  /**
   * Get comprehensive satellite data from all sources
   */
  async getComprehensiveSatelliteData(date: string, bounds?: [number, number, number, number]): Promise<{
    viirs: SatelliteDataResponse;
    olci: SatelliteDataResponse;
    combined: SatelliteObservation[];
    overall_quality: number;
  }> {
    const request: SatelliteDataRequest = {
      source: 'VIIRS',
      date,
      bounds,
      quality_threshold: 0.5
    };

    // Fetch data from both sources in parallel
    const [viirsResponse, olciResponse] = await Promise.allSettled([
      this.fetchVIIRSData(request),
      this.fetchOLCIData({ ...request, source: 'OLCI' })
    ]);

    const viirs = viirsResponse.status === 'fulfilled' ? viirsResponse.value : {
      success: false,
      data: [],
      metadata: { source: 'VIIRS', dataset_id: '', fetch_time: new Date(), data_points: 0, quality_score: 0, coverage_percentage: 0 }
    };

    const olci = olciResponse.status === 'fulfilled' ? olciResponse.value : {
      success: false,
      data: [],
      metadata: { source: 'OLCI', dataset_id: '', fetch_time: new Date(), data_points: 0, quality_score: 0, coverage_percentage: 0 }
    };

    // Combine observations with weighted confidence
    const combined = [...viirs.data, ...olci.data].sort((a, b) => b.confidence - a.confidence);
    
    const overall_quality = (
      viirs.metadata.quality_score * 0.6 + 
      olci.metadata.quality_score * 0.4
    );

    return {
      viirs,
      olci,
      combined,
      overall_quality
    };
  }

  /**
   * Get server health status for monitoring
   */
  getHealthStatus(): { [server: string]: boolean } {
    return Object.fromEntries(this.healthStatus);
  }

  /**
   * Get comprehensive performance metrics and cache statistics
   */
  getPerformanceMetrics(): {
    serverMetrics: { [server: string]: { avg: number; latest: number } };
    cache: CacheStats;
    batcher: {
      queueLength: number;
      activeRequests: number;
      isProcessing: boolean;
    };
    serverHealth: Map<string, boolean>;
  } {
    const serverMetrics: { [server: string]: { avg: number; latest: number } } = {};
    
    for (const [server, times] of this.performanceMetrics) {
      if (times.length > 0) {
        serverMetrics[server] = {
          avg: times.reduce((sum, time) => sum + time, 0) / times.length,
          latest: times[times.length - 1]
        };
      }
    }
    
    return {
      serverMetrics,
      cache: satelliteCache.getStats(),
      batcher: satelliteBatcher.getQueueStatus(),
      serverHealth: new Map(this.healthStatus)
    };
  }

  /**
   * Validate satellite data quality with comprehensive analysis
   */
  async validateDataQuality(observations: SatelliteObservation[], bounds: [number, number, number, number]): Promise<ValidationResult> {
    console.log(`🔍 Validating quality of ${observations.length} satellite observations...`);
    
    const validationResult = this.dataQualityValidator.validateSatelliteData(observations, bounds);
    
    // Log quality assessment
    console.log(`📊 Quality Assessment:`);
    console.log(`   Overall Score: ${(validationResult.quality_metrics.overall_score * 100).toFixed(1)}%`);
    console.log(`   Confidence: ${(validationResult.quality_metrics.confidence * 100).toFixed(1)}%`);
    console.log(`   Coverage: ${(validationResult.quality_metrics.coverage * 100).toFixed(1)}%`);
    console.log(`   Reliability: ${(validationResult.quality_metrics.reliability * 100).toFixed(1)}%`);
    
    if (validationResult.quality_flags.length > 0) {
      console.log(`   Quality Flags: ${validationResult.quality_flags.join(', ')}`);
    }
    
    return validationResult;
  }

  /**
   * Get comprehensive satellite data with quality validation
   */
  async getQualityValidatedSatelliteData(
    date: string, 
    bounds: [number, number, number, number]
  ): Promise<{
    comprehensive_data: any;
    quality_validation: ValidationResult;
    recommendations: string[];
  }> {
    // Get comprehensive satellite data
    const comprehensiveData = await this.getComprehensiveSatelliteData(date, bounds);
    
    // Validate data quality
    const qualityValidation = await this.validateDataQuality(comprehensiveData.combined, bounds);
    
    // Generate actionable recommendations
    const recommendations = this.generateActionableRecommendations(qualityValidation, comprehensiveData);
    
    return {
      comprehensive_data: comprehensiveData,
      quality_validation: qualityValidation,
      recommendations
    };
  }

  /**
   * Generate actionable recommendations based on quality assessment
   */
  private generateActionableRecommendations(validation: ValidationResult, data: any): string[] {
    const recommendations: string[] = [...validation.recommendations];
    
    // Add data-specific recommendations
    if (data.viirs.data.length === 0 && data.olci.data.length === 0) {
      recommendations.push('No satellite data available - consider expanding temporal or spatial search');
    }
    
    if (data.viirs.data.length > 0 && data.olci.data.length === 0) {
      recommendations.push('Only VIIRS data available - consider alternative OLCI sources');
    }
    
    if (data.olci.data.length > 0 && data.viirs.data.length === 0) {
      recommendations.push('Only OLCI data available - consider alternative VIIRS sources');
    }
    
    if (validation.quality_metrics.overall_score < 0.4) {
      recommendations.push('Consider using model predictions with higher weight due to poor satellite data quality');
    }
    
    if (validation.confidence_intervals.margin_of_error > 0.02) {
      recommendations.push('High uncertainty detected - increase observation density or apply smoothing filters');
    }
    
    return recommendations;
  }

  /**
   * Performance-optimized satellite data retrieval with caching and batching
   */
  async getOptimizedSatelliteData(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    options: {
      dataset?: 'VIIRS' | 'OLCI' | 'ALL';
      priority?: number;
      enableStreaming?: boolean;
      onProgress?: (progress: number) => void;
      onStreamChunk?: (chunk: StreamChunk) => void;
    } = {}
  ): Promise<SatelliteObservation[]> {
    const { dataset = 'ALL', priority = 0, enableStreaming = true } = options;

    // Check cache first
    const cached = await satelliteCache.get(north, south, east, west, startDate, endDate, dataset);
    
    if (cached) {
      if (options.onProgress) options.onProgress(100);
      return cached;
    }

    return new Promise((resolve) => {
      const observations: SatelliteObservation[] = [];
      let completionCount = 0;
      const expectedDatasets = dataset === 'ALL' ? ['VIIRS', 'OLCI'] : [dataset];

      for (const ds of expectedDatasets) {
        satelliteBatcher.addRequest(
          north, south, east, west, startDate, endDate,
          {
            dataset: ds,
            priority,
            onProgress: options.onProgress,
            onStreamChunk: enableStreaming ? options.onStreamChunk : undefined,
            onComplete: (data) => {
              observations.push(...data);
              completionCount++;
              
              if (completionCount === expectedDatasets.length) {
                // Cache the combined results
                satelliteCache.set(north, south, east, west, startDate, endDate, observations, dataset);
                resolve(observations);
              }
            },
            onError: (error) => {
              console.error(`Failed to fetch ${ds} data:`, error);
              completionCount++;
              
              if (completionCount === expectedDatasets.length) {
                resolve(observations); // Return partial results
              }
            }
          }
        );
      }
    });
  }

  /**
   * Bulk satellite data retrieval with intelligent batching
   */
  async getBulkSatelliteData(
    regions: Array<{
      north: number;
      south: number;
      east: number;
      west: number;
      startDate: Date;
      endDate: Date;
      id?: string;
    }>,
    options: {
      dataset?: 'VIIRS' | 'OLCI' | 'ALL';
      maxConcurrent?: number;
      onRegionComplete?: (regionId: string, data: SatelliteObservation[]) => void;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<Map<string, SatelliteObservation[]>> {
    const { dataset = 'ALL', maxConcurrent = 5 } = options;
    const results = new Map<string, SatelliteObservation[]>();
    let completed = 0;

    // Process regions in batches to avoid overwhelming servers
    const processBatch = async (batch: typeof regions) => {
      const promises = batch.map(async (region) => {
        const regionId = region.id || `${region.north}-${region.south}-${region.east}-${region.west}`;
        
        try {
          const data = await this.getOptimizedSatelliteData(
            region.north, region.south, region.east, region.west,
            region.startDate, region.endDate,
            { dataset }
          );
          
          results.set(regionId, data);
          
          if (options.onRegionComplete) {
            options.onRegionComplete(regionId, data);
          }
          
          completed++;
          if (options.onProgress) {
            options.onProgress(completed, regions.length);
          }
          
        } catch (error) {
          console.error(`Failed to fetch data for region ${regionId}:`, error);
          results.set(regionId, []);
          completed++;
          
          if (options.onProgress) {
            options.onProgress(completed, regions.length);
          }
        }
      });

      await Promise.allSettled(promises);
    };

    // Process regions in chunks
    for (let i = 0; i < regions.length; i += maxConcurrent) {
      const batch = regions.slice(i, i + maxConcurrent);
      await processBatch(batch);
    }

    return results;
  }

  /**
   * Stream satellite data with real-time updates
   */
  async streamSatelliteData(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    onChunk: (chunk: StreamChunk) => void,
    options: {
      dataset?: 'VIIRS' | 'OLCI' | 'ALL';
      chunkSize?: number;
      priority?: number;
    } = {}
  ): Promise<string> {
    const { dataset = 'ALL', priority = 0 } = options;

    return satelliteBatcher.addRequest(
      north, south, east, west, startDate, endDate,
      {
        dataset,
        priority,
        onStreamChunk: onChunk,
        onComplete: (data) => {
          console.log(`Streaming complete: ${data.length} observations`);
        },
        onError: (error) => {
          console.error('Streaming error:', error);
        }
      }
    );
  }

  /**
   * Prefetch satellite data for predicted user regions
   */
  async prefetchRegions(
    predictedRegions: Array<{
      north: number;
      south: number;
      east: number;
      west: number;
      startDate: Date;
      endDate: Date;
      probability: number; // 0-1 likelihood of access
    }>,
    options: {
      dataset?: 'VIIRS' | 'OLCI' | 'ALL';
      priorityThreshold?: number; // Only prefetch regions above this probability
    } = {}
  ): Promise<void> {
    const { dataset = 'ALL', priorityThreshold = 0.3 } = options;
    
    const highPriorityRegions = predictedRegions
      .filter(region => region.probability >= priorityThreshold)
      .sort((a, b) => b.probability - a.probability); // Highest probability first

    await satelliteCache.prefetch(
      highPriorityRegions.map(region => ({
        north: region.north,
        south: region.south,
        east: region.east,
        west: region.west,
        startDate: region.startDate,
        endDate: region.endDate,
        dataset
      })),
      async (north, south, east, west, startDate, endDate, ds) => {
        return this.getOptimizedSatelliteData(north, south, east, west, startDate, endDate, { dataset: ds as any });
      }
    );

    console.log(`Prefetched ${highPriorityRegions.length} high-priority regions`);
  }

  /**
   * Optimize cache and batcher configuration based on usage patterns
   */
  optimizePerformanceSettings(usage: {
    avgRegionSize: number;
    avgRequestFrequency: number;
    memoryConstraints: number;
    networkBandwidth: number;
  }): void {
    // Adjust cache settings based on memory constraints and usage
    const optimalCacheSize = Math.min(
      usage.memoryConstraints * 0.3, // 30% of available memory
      100 * 1024 * 1024 // Max 100MB
    );

    const optimalTTL = usage.avgRequestFrequency < 60000 ? 
      5 * 60 * 1000 : // 5 minutes for high frequency
      15 * 60 * 1000; // 15 minutes for low frequency

    satelliteCache.updateConfig({
      maxSizeBytes: optimalCacheSize,
      defaultTTL: optimalTTL,
      enablePredictivePrefetch: usage.avgRequestFrequency > 10000
    });

    // Adjust batching based on network and usage patterns
    const optimalBatchSize = usage.networkBandwidth > 10 ? 12 : 6; // High vs low bandwidth
    const optimalTimeout = usage.avgRegionSize > 2 ? 3000 : 1500; // Large vs small regions

    satelliteBatcher.updateConfig({
      maxBatchSize: optimalBatchSize,
      batchTimeoutMs: optimalTimeout,
      enableStreaming: usage.avgRegionSize > 1
    });

    console.log('Performance settings optimized based on usage patterns');
  }

  /**
   * Clear all caches and reset performance counters
   */
  clearPerformanceData(): void {
    satelliteCache.invalidate();
    satelliteBatcher.clear();
    this.cache.clear();
    this.performanceMetrics.clear();
    console.log('Performance data cleared');
  }

  /**
   * Validate accuracy of satellite data against model predictions
   */
  async validateSatelliteAccuracy(
    satelliteData: SatelliteObservation[],
    modelPredictions: ModelPrediction[],
    bounds: [number, number, number, number]
  ): Promise<AccuracyValidationResult> {
    console.log(`🎯 Validating satellite accuracy with ${satelliteData.length} observations against ${modelPredictions.length} model predictions`);
    
    return this.accuracyValidator.validateAccuracy(satelliteData, modelPredictions, bounds);
  }

  /**
   * Compare satellite observations with model forecasts for a specific region and time
   */
  async performAccuracyAssessment(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    modelPredictions: ModelPrediction[]
  ): Promise<{
    accuracyResults: AccuracyValidationResult;
    qualityResults: ValidationResult;
    recommendedWeights: {
      satelliteWeight: number;
      modelWeight: number;
      hybridConfidence: number;
    };
  }> {
    console.log(`📊 Performing comprehensive accuracy assessment for region [${north}, ${south}, ${east}, ${west}]`);

    // Get satellite data for the region
    const satelliteData = await this.getOptimizedSatelliteData(
      north, south, east, west, startDate, endDate
    );

    console.log(`Retrieved ${satelliteData.length} satellite observations for accuracy assessment`);

    // Validate data quality first
    const qualityResults = await this.validateDataQuality(satelliteData, [north, south, east, west]);

    // Perform accuracy validation
    const accuracyResults = await this.validateSatelliteAccuracy(
      satelliteData,
      modelPredictions,
      [north, south, east, west]
    );

    // Calculate recommended fusion weights based on validation results
    const recommendedWeights = this.calculateFusionWeights(accuracyResults, qualityResults);

    console.log(`📈 Accuracy Assessment Complete:
      - Overall Quality: ${accuracyResults.quality_assessment.overall_quality}
      - Correlation: ${accuracyResults.accuracy_metrics.correlationCoefficient.toFixed(3)}
      - RMSE: ${accuracyResults.accuracy_metrics.rootMeanSquareError.toFixed(3)}
      - Recommended Satellite Weight: ${recommendedWeights.satelliteWeight.toFixed(2)}
      - Recommended Model Weight: ${recommendedWeights.modelWeight.toFixed(2)}`);

    return {
      accuracyResults,
      qualityResults,
      recommendedWeights
    };
  }

  /**
   * Generate mock model predictions for testing accuracy validation
   */
  generateMockModelPredictions(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    count: number = 50
  ): ModelPrediction[] {
    const predictions: ModelPrediction[] = [];
    const latRange = north - south;
    const lonRange = east - west;
    const timeRange = endDate.getTime() - startDate.getTime();

    for (let i = 0; i < count; i++) {
      const lat = south + Math.random() * latRange;
      const lon = west + Math.random() * lonRange;
      const timestamp = new Date(startDate.getTime() + Math.random() * timeRange);

      // Generate model predictions with some correlation to location
      // (higher density near coast, seasonal patterns, etc.)
      const coastalDistance = Math.min(
        Math.abs(lat - south), Math.abs(lat - north),
        Math.abs(lon - west), Math.abs(lon - east)
      );
      
      const coastalFactor = Math.max(0, 1 - coastalDistance / 0.5); // Higher near coast
      const seasonalFactor = 0.8 + 0.4 * Math.sin((timestamp.getMonth() / 12) * 2 * Math.PI); // Seasonal variation
      
      const baseDensity = (coastalFactor * 0.4 + 0.1) * seasonalFactor;
      const noise = (Math.random() - 0.5) * 0.2; // ±0.1 noise
      const sargassumDensity = Math.max(0, Math.min(1, baseDensity + noise));

      predictions.push({
        lat,
        lon,
        timestamp,
        sargassumDensity,
        confidence: 0.7 + Math.random() * 0.25, // 0.7-0.95 confidence
        source: Math.random() > 0.5 ? 'HYCOM' : 'OPENDRIFT',
        windSpeed: 5 + Math.random() * 15, // 5-20 m/s
        currentSpeed: 0.1 + Math.random() * 0.5, // 0.1-0.6 m/s
        temperature: 26 + Math.random() * 4 // 26-30°C
      });
    }

    return predictions;
  }

  /**
   * Calculate optimal fusion weights based on validation results
   */
  private calculateFusionWeights(
    accuracyResults: AccuracyValidationResult,
    qualityResults: ValidationResult
  ): {
    satelliteWeight: number;
    modelWeight: number;
    hybridConfidence: number;
  } {
    const accuracy = accuracyResults.accuracy_metrics;
    const quality = qualityResults.quality_metrics;

    // Base weights on correlation and quality scores
    const correlationScore = Math.max(0, accuracy.correlationCoefficient);
    const qualityScore = quality.overall_score;
    const reliabilityScore = accuracyResults.quality_assessment.reliability_score;

    // Satellite weight based on data quality and correlation
    let satelliteWeight = (qualityScore + correlationScore + reliabilityScore) / 3;

    // Adjust for specific accuracy metrics
    if (accuracy.meanAbsoluteError > 0.15) {
      satelliteWeight *= 0.8; // Reduce if high error
    }

    if (accuracy.skillScore > 0.3) {
      satelliteWeight *= 1.1; // Boost if model shows skill
    }

    // Ensure reasonable bounds
    satelliteWeight = Math.max(0.1, Math.min(0.9, satelliteWeight));
    const modelWeight = 1 - satelliteWeight;

    // Hybrid confidence based on agreement
    const hybridConfidence = Math.min(0.95, 
      0.5 + 0.4 * correlationScore + 0.1 * reliabilityScore
    );

    return {
      satelliteWeight: Math.round(satelliteWeight * 100) / 100,
      modelWeight: Math.round(modelWeight * 100) / 100,
      hybridConfidence: Math.round(hybridConfidence * 100) / 100
    };
  }

  /**
   * Perform continuous accuracy monitoring for operational use
   */
  async startAccuracyMonitoring(
    monitoringRegions: Array<{
      name: string;
      north: number;
      south: number;
      east: number;
      west: number;
    }>,
    intervalHours: number = 6,
    onAccuracyUpdate?: (regionName: string, results: AccuracyValidationResult) => void
  ): Promise<() => void> {
    console.log(`🔄 Starting accuracy monitoring for ${monitoringRegions.length} regions (every ${intervalHours} hours)`);

    const monitoringInterval = setInterval(async () => {
      for (const region of monitoringRegions) {
        try {
          const now = new Date();
          const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
          
          // Generate mock model predictions for demonstration
          const modelPredictions = this.generateMockModelPredictions(
            region.north, region.south, region.east, region.west,
            startDate, now, 30
          );

          const assessment = await this.performAccuracyAssessment(
            region.north, region.south, region.east, region.west,
            startDate, now, modelPredictions
          );

          console.log(`📍 Accuracy monitoring update for ${region.name}:
            - Quality: ${assessment.accuracyResults.quality_assessment.overall_quality}
            - Correlation: ${assessment.accuracyResults.accuracy_metrics.correlationCoefficient.toFixed(3)}
            - Satellite Weight: ${assessment.recommendedWeights.satelliteWeight}`);

          if (onAccuracyUpdate) {
            onAccuracyUpdate(region.name, assessment.accuracyResults);
          }

        } catch (error) {
          console.error(`Failed to update accuracy monitoring for ${region.name}:`, error);
        }
      }
    }, intervalHours * 60 * 60 * 1000);

    // Return cleanup function
    return () => {
      clearInterval(monitoringInterval);
      console.log('Accuracy monitoring stopped');
    };
  }
}

export { RealSatelliteService };
export type { SatelliteDataRequest, SatelliteDataResponse };
