/**
 * Beached Sargassum Service
 * Handles detection, visualization, and forecasting of beached Sargassum
 * Integrates with Cloud Run ML inference and Google Earth Engine
 */

import type { Polygon } from 'geojson';

export interface BeachedDetection {
  id: string;
  date: string;
  geometry: Polygon;
  properties: {
    area_m2: number;
    area_hectares: number;
    confidence: 'low' | 'medium' | 'high';
    detection_method: string;
    threshold: number;
    processing_time: string;
  };
}

export interface BeachedForecast {
  date: string;
  probability: number;
  uncertainty: number;
  source: 'particle_tracking' | 'ml_prediction' | 'combined';
  beaching_zones: BeachedDetection[];
}

export interface BeachedSummary {
  date: string;
  detection_count: number;
  total_area_m2: number;
  total_area_hectares: number;
  probability_min: number;
  probability_max: number;
  probability_mean: number;
  threshold_used: number;
  error?: string;
}

export interface BeachedServiceResponse {
  status: 'success' | 'error';
  date: string;
  detection_summary: BeachedSummary;
  threshold: number;
  export_requested: boolean;
  model_asset: string;
  timestamp: string;
  export_task_ids?: {
    probability_task: string;
    vectors_task: string;
  };
  error?: string;
}

export class BeachedSargassumService {
  private baseUrl: string;
  private cache: Map<string, BeachedServiceResponse> = new Map();
  private readonly CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Detect beached Sargassum for a specific date
   */
  async detectBeachedSargassum(
    date: string,
    options: {
      threshold?: number;
      exportCloud?: boolean;
      useCache?: boolean;
    } = {}
  ): Promise<BeachedServiceResponse> {
    const {
      threshold = 0.35,
      exportCloud = false,
      useCache = true
    } = options;

    const cacheKey = `${date}_${threshold}`;
    
    // Check cache first
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < this.CACHE_DURATION) {
        console.log(`Using cached beached detection for ${date}`);
        return cached;
      }
    }

    try {
      console.log(`Requesting beached detection for ${date}`);
      
      const params = new URLSearchParams({
        date,
        threshold: threshold.toString(),
        export: exportCloud.toString()
      });

      const response = await fetch(`${this.baseUrl}/beached?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Beached detection failed: ${response.status} ${response.statusText}`);
      }

      const data: BeachedServiceResponse = await response.json();
      
      if (data.status === 'error') {
        throw new Error(`Detection error: ${data.error}`);
      }

      // Cache successful response
      if (useCache) {
        this.cache.set(cacheKey, data);
      }

      console.log(`Beached detection completed for ${date}:`, data.detection_summary);
      
      return data;

    } catch (error) {
      console.error(`Beached detection failed for ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get beached Sargassum forecast for multiple dates
   */
  async getBeachedForecast(
    startDate: string,
    days: number = 3,
    threshold: number = 0.35
  ): Promise<BeachedForecast[]> {
    console.log(`Getting beached forecast from ${startDate} for ${days} days`);

    const forecasts: BeachedForecast[] = [];
    const promises: Promise<void>[] = [];

    // Generate date range
    const start = new Date(startDate);
    for (let i = 0; i < days; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const promise = this.detectBeachedSargassum(dateStr, { threshold })
        .then(response => {
          const forecast: BeachedForecast = {
            date: dateStr,
            probability: response.detection_summary.probability_mean,
            uncertainty: response.detection_summary.probability_max - response.detection_summary.probability_min,
            source: 'ml_prediction',
            beaching_zones: this.convertSummaryToDetections(response.detection_summary)
          };
          
          forecasts.push(forecast);
        })
        .catch(error => {
          console.warn(`Failed to get beached forecast for ${dateStr}:`, error);
          // Add placeholder forecast
          forecasts.push({
            date: dateStr,
            probability: 0,
            uncertainty: 0,
            source: 'ml_prediction',
            beaching_zones: []
          });
        });

      promises.push(promise);
    }

    await Promise.allSettled(promises);
    
    // Sort by date
    forecasts.sort((a, b) => a.date.localeCompare(b.date));
    
    console.log(`Generated ${forecasts.length} beached forecasts`);
    return forecasts;
  }

  /**
   * Convert detection summary to simplified detection objects
   */
  convertSummaryToDetections(summary: BeachedSummary): BeachedDetection[] {
    if (summary.detection_count === 0) {
      return [];
    }

    // Create simplified detection for visualization
    // In production, this would come from the actual polygon data
    return [{
      id: `beached_${summary.date}`,
      date: summary.date,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-1.0, 5.5], [-0.8, 5.5], [-0.8, 5.7], [-1.0, 5.7], [-1.0, 5.5]
        ]]
      },
      properties: {
        area_m2: summary.total_area_m2,
        area_hectares: summary.total_area_hectares,
        confidence: this.getConfidenceLevel(summary.probability_mean),
        detection_method: 'S2_RF_Sept2021',
        threshold: summary.threshold_used,
        processing_time: new Date().toISOString()
      }
    }];
  }

  /**
   * Get confidence level based on probability
   */
  private getConfidenceLevel(probability: number): 'low' | 'medium' | 'high' {
    if (probability < 0.3) return 'low';
    if (probability < 0.6) return 'medium';
    return 'high';
  }

  /**
   * Get detection status for multiple dates
   */
  async getDetectionStatus(dates: string[]): Promise<Map<string, BeachedSummary>> {
    const status = new Map<string, BeachedSummary>();
    
    const promises = dates.map(async (date) => {
      try {
        const response = await this.detectBeachedSargassum(date, { useCache: true });
        status.set(date, response.detection_summary);
      } catch (error) {
        console.warn(`Failed to get status for ${date}:`, error);
        status.set(date, {
          date,
          detection_count: 0,
          total_area_m2: 0,
          total_area_hectares: 0,
          probability_min: 0,
          probability_max: 0,
          probability_mean: 0,
          threshold_used: 0.35,
          error: String(error)
        });
      }
    });

    await Promise.allSettled(promises);
    return status;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('Beached detection cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Format area for display
   */
  static formatArea(areaM2: number): string {
    if (areaM2 < 10000) {
      return `${Math.round(areaM2)} m²`;
    } else {
      const hectares = areaM2 / 10000;
      return `${hectares.toFixed(1)} ha`;
    }
  }

  /**
   * Get severity level based on area
   */
  static getSeverityLevel(areaHectares: number): 'low' | 'medium' | 'high' | 'critical' {
    if (areaHectares < 1) return 'low';
    if (areaHectares < 10) return 'medium';
    if (areaHectares < 50) return 'high';
    return 'critical';
  }

  /**
   * Generate human-readable summary
   */
  static generateSummaryText(summary: BeachedSummary): string {
    if (summary.error) {
      return `Detection failed: ${summary.error}`;
    }

    if (summary.detection_count === 0) {
      return 'No beached Sargassum detected';
    }

    const area = BeachedSargassumService.formatArea(summary.total_area_m2);
    const confidence = summary.probability_mean > 0.6 ? 'high' : summary.probability_mean > 0.3 ? 'medium' : 'low';
    
    return `${summary.detection_count} beaching event${summary.detection_count > 1 ? 's' : ''} detected (${area}, ${confidence} confidence)`;
  }
}

// Export singleton instance
export const beachedSargassumService = new BeachedSargassumService();