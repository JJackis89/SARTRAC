/**
 * Service for fetching and managing Sargassum forecast data from GitHub releases
 */

// CORS proxy helper function
const fetchWithCorsProxy = async (url: string): Promise<Response> => {
  // Try direct fetch first
  try {
    const response = await fetch(url, { 
      mode: 'cors',
      headers: { 'Accept': 'application/json' } 
    });
    if (response.ok) {
      return response;
    }
  } catch (error) {
    // Silent fallback to proxy
  }

  // Try CORS proxies as fallback
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      const response = await fetch(proxyUrl, { mode: 'cors' });
      if (response.ok) {
        return response;
      }
    } catch (error) {
      // Continue to next proxy
    }
  }
  
  throw new Error('Data access failed - please check connection');
};

export interface ForecastParticle {
  particle_id: number;
  lon: number;
  lat: number;
  status: string;
  forecast_time: string;
}

export interface ForecastMetadata {
  forecast_start: string;
  forecast_hours: number;
  windage: number;
  particles_per_point: number;
  seed_points: number;
  generation_time: string;
}

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export interface ForecastData {
  particles: ForecastParticle[];
  metadata: ForecastMetadata;
  date: string;
  isEmpty: boolean;
  isDemoData?: boolean;
}

class ForecastService {
  private readonly GITHUB_API = 'https://api.github.com/repos/JJackis89/SARTRAC';
  private cache: Map<string, ForecastData> = new Map();

  /**
   * Get the latest forecast data
   */
  async getLatestForecast(): Promise<ForecastData | null> {
    try {
      this.updateLoadingState({ isLoading: true, error: null });
      console.log('Fetching latest forecast...');
      
      // Get latest release
      const releaseResponse = await fetch(`${this.GITHUB_API}/releases/latest`);
      if (!releaseResponse.ok) {
        console.warn('No releases found, checking artifacts...');
        // First check if it's a 404 (no releases) vs other error
        if (releaseResponse.status === 404) {
          throw new Error('No releases found. The automated forecast system runs daily at 06:00 UTC.');
        }
        return await this.getLatestFromArtifacts();
      }

      const release = await releaseResponse.json();
      const forecastDate = this.extractDateFromTag(release.tag_name);
      
      // Check cache first
      if (this.cache.has(forecastDate)) {
        console.log('Using cached forecast for', forecastDate);
        return this.cache.get(forecastDate)!;
      }

      // Find forecast file in release assets
      const forecastAsset = release.assets.find((asset: any) => 
        asset.name.includes('forecast_') && asset.name.endsWith('.geojson')
      );

      if (!forecastAsset) {
        console.warn('No forecast file found in latest release');
        return null;
      }

      // Fetch forecast data using CORS proxy if needed
      const forecastResponse = await fetchWithCorsProxy(forecastAsset.browser_download_url);
      const forecastGeoJSON = await forecastResponse.json();

      const forecastData = this.parseGeoJSONForecast(forecastGeoJSON, forecastDate);
      
      // If no particles found, try loading test data as fallback
      if (forecastData.particles.length === 0) {
        console.log('📊 No Sargassum detected in current forecast - loading demonstration data');
        try {
          const testResponse = await fetch('/test_forecast_real.geojson');
          if (testResponse.ok) {
            const testGeoJSON = await testResponse.json();
            const testData = this.parseGeoJSONForecast(testGeoJSON, forecastDate);
            if (testData.particles.length > 0) {
              // Mark as demonstration data
              testData.isDemoData = true;
              testData.isEmpty = false;
              console.log(`✅ Demonstration mode: ${testData.particles.length} particles`);
              // Cache the test data instead of empty forecast
              this.cache.set(forecastDate, testData);
              this.updateLoadingState({ 
                isLoading: false, 
                error: null, 
                lastUpdated: new Date() 
              });
              return testData;
            }
          }
        } catch (testError) {
          console.warn('Demonstration data unavailable');
        }
      }
      
      // Cache the result (either real data with particles or confirmed empty forecast)
      this.cache.set(forecastDate, forecastData);
      
      console.log(`Loaded forecast for ${forecastDate} with ${forecastData.particles.length} particles`);
      
      this.updateLoadingState({ 
        isLoading: false, 
        error: null, 
        lastUpdated: new Date() 
      });
      
      return forecastData;

    } catch (error) {
      console.error('Error fetching latest forecast:', error);
      this.updateLoadingState({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Get forecast for a specific date
   */
  async getForecastForDate(date: string): Promise<ForecastData | null> {
    try {
      // Check cache first
      if (this.cache.has(date)) {
        return this.cache.get(date)!;
      }

      // Get all releases and find the one for this date
      const releasesResponse = await fetch(`${this.GITHUB_API}/releases`);
      const releases = await releasesResponse.json();
      
      const targetRelease = releases.find((release: any) => 
        release.tag_name.includes(date)
      );

      if (!targetRelease) {
        console.warn(`No release found for date ${date}, using demo data`);
        return this.generateDemoForecast(date);
      }

      const forecastAsset = targetRelease.assets.find((asset: any) => 
        asset.name.includes('forecast_') && asset.name.endsWith('.geojson')
      );

      if (!forecastAsset) {
        return this.generateDemoForecast(date);
      }

      const forecastResponse = await fetch(forecastAsset.browser_download_url);
      const forecastGeoJSON = await forecastResponse.json();

      const forecastData = this.parseGeoJSONForecast(forecastGeoJSON, date);
      this.cache.set(date, forecastData);
      
      return forecastData;

    } catch (error) {
      console.error(`Error fetching forecast for ${date}:`, error);
      return this.generateDemoForecast(date);
    }
  }

  /**
   * Generate demo forecast data for testing
   */
  private generateDemoForecast(date: string): ForecastData {
    const particles: ForecastParticle[] = [];
    
    // Generate demo particles around Ghana's coast
    const basePoints = [
      { lat: 5.6, lon: -0.2 }, // Accra area
      { lat: 4.9, lon: -1.8 }, // Cape Coast area
      { lat: 4.7, lon: -2.0 }, // Takoradi area
    ];

    let particleId = 0;
    basePoints.forEach(point => {
      // Generate cluster of particles around each base point
      for (let i = 0; i < 15; i++) {
        particles.push({
          particle_id: particleId++,
          lon: point.lon + (Math.random() - 0.5) * 0.3,
          lat: point.lat + (Math.random() - 0.5) * 0.2,
          status: 'active',
          forecast_time: new Date(date).toISOString()
        });
      }
    });

    return {
      particles,
      metadata: {
        forecast_start: new Date(date).toISOString(),
        forecast_hours: 72,
        windage: 0.03,
        particles_per_point: 15,
        seed_points: 3,
        generation_time: new Date().toISOString()
      },
      date,
      isEmpty: false
    };
  }

  /**
   * Get available forecast dates
   */
  async getAvailableForecastDates(): Promise<string[]> {
    try {
      const releasesResponse = await fetch(`${this.GITHUB_API}/releases`);
      const releases = await releasesResponse.json();
      
      const dates = releases
        .filter((release: any) => release.tag_name.startsWith('forecast-'))
        .map((release: any) => this.extractDateFromTag(release.tag_name))
        .sort()
        .reverse(); // Most recent first

      // If no real data, provide demo dates
      if (dates.length === 0) {
        console.warn('No forecast releases found, using demo data');
        return this.generateDemoForecastDates();
      }

      return dates;

    } catch (error) {
      console.error('Error fetching available dates:', error);
      // Fallback to demo data
      return this.generateDemoForecastDates();
    }
  }

  /**
   * Generate demo forecast dates for testing
   */
  private generateDemoForecastDates(): string[] {
    const dates: string[] = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  }

  /**
   * Fallback: Get latest from workflow artifacts
   */
  private async getLatestFromArtifacts(): Promise<ForecastData | null> {
    try {
      // This would require authentication for private repos
      // For now, return null and rely on releases
      console.warn('Artifact access requires authentication');
      return null;
    } catch (error) {
      console.error('Error fetching from artifacts:', error);
      return null;
    }
  }

  /**
   * Parse GeoJSON forecast data
   */
  private parseGeoJSONForecast(geoJSON: any, date: string): ForecastData {
    const particles: ForecastParticle[] = [];
    
    // Handle empty forecasts
    if (!geoJSON.features || geoJSON.features.length === 0) {
      return {
        particles: [],
        metadata: {
          forecast_start: new Date().toISOString(),
          forecast_hours: 72,
          windage: 0.01,
          particles_per_point: 0,
          seed_points: 0,
          generation_time: new Date().toISOString()
        },
        date,
        isEmpty: true
      };
    }

    // Parse particles from features
    geoJSON.features.forEach((feature: any) => {
      if (feature.geometry?.type === 'Point') {
        const [lon, lat] = feature.geometry.coordinates;
        particles.push({
          particle_id: feature.properties?.particle_id || 0,
          lon,
          lat,
          status: feature.properties?.status || 'active',
          forecast_time: feature.properties?.forecast_time || new Date().toISOString()
        });
      }
    });

    // Extract metadata from properties or use defaults
    const props = geoJSON.properties || {};
    const metadata: ForecastMetadata = {
      forecast_start: props.forecast_start || new Date().toISOString(),
      forecast_hours: props.forecast_hours || 72,
      windage: props.windage || 0.01,
      particles_per_point: props.particles_per_point || 5,
      seed_points: props.seed_points || 0,
      generation_time: props.forecast_time || new Date().toISOString()
    };

    return {
      particles,
      metadata,
      date,
      isEmpty: particles.length === 0
    };
  }

  /**
   * Extract date from release tag
   */
  private extractDateFromTag(tag: string): string {
    // Tag format: "forecast-YYYY-MM-DD"
    const match = tag.match(/forecast-(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : new Date().toISOString().split('T')[0];
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // Loading state management
  private loadingStateListeners: Array<(state: LoadingState) => void> = [];
  private currentLoadingState: LoadingState = {
    isLoading: false,
    error: null,
    lastUpdated: null
  };

  // Auto-refresh functionality
  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private readonly AUTO_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

  /**
   * Subscribe to loading state changes
   */
  onLoadingStateChange(callback: (state: LoadingState) => void): () => void {
    this.loadingStateListeners.push(callback);
    // Immediately call with current state
    callback(this.currentLoadingState);
    
    // Return unsubscribe function
    return () => {
      const index = this.loadingStateListeners.indexOf(callback);
      if (index > -1) {
        this.loadingStateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Update loading state and notify listeners
   */
  private updateLoadingState(newState: Partial<LoadingState>): void {
    this.currentLoadingState = { ...this.currentLoadingState, ...newState };
    this.loadingStateListeners.forEach(listener => {
      try {
        listener(this.currentLoadingState);
      } catch (error) {
        console.error('Error in loading state listener:', error);
      }
    });
  }

  /**
   * Start auto-refresh
   */
  startAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    
    this.autoRefreshInterval = setInterval(async () => {
      try {
        console.log('🔄 Auto-refreshing forecast data...');
        await this.getLatestForecast();
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, this.AUTO_REFRESH_INTERVAL);
    
    console.log('✅ Auto-refresh started (every 30 minutes)');
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log('⏹️ Auto-refresh stopped');
    }
  }

  /**
   * Get current loading state
   */
  getLoadingState(): LoadingState {
    return { ...this.currentLoadingState };
  }
}

export const forecastService = new ForecastService();