/**
 * Service for fetching and managing Sargassum forecast data from GitHub releases
 */

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

export interface ForecastData {
  particles: ForecastParticle[];
  metadata: ForecastMetadata;
  date: string;
  isEmpty: boolean;
  isLoading?: boolean;
  error?: string;
}

export interface ForecastLoadingState {
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  nextUpdateTime: Date | null;
}

class ForecastService {
  private readonly GITHUB_API = 'https://api.github.com/repos/JJackis89/SARTRAC';
  private cache: Map<string, ForecastData> = new Map();
  private loadingState: ForecastLoadingState = {
    isLoading: false,
    error: null,
    lastUpdated: null,
    nextUpdateTime: null
  };
  private refreshInterval: number | null = null;
  private callbacks: ((state: ForecastLoadingState) => void)[] = [];

  /**
   * Subscribe to loading state changes
   */
  onLoadingStateChange(callback: (state: ForecastLoadingState) => void): () => void {
    this.callbacks.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all subscribers of loading state changes
   */
  private notifyStateChange(): void {
    this.callbacks.forEach(callback => callback(this.loadingState));
  }

  /**
   * Update loading state
   */
  private updateLoadingState(updates: Partial<ForecastLoadingState>): void {
    this.loadingState = { ...this.loadingState, ...updates };
    this.notifyStateChange();
  }

  /**
   * Get current loading state
   */
  getLoadingState(): ForecastLoadingState {
    return { ...this.loadingState };
  }

  /**
   * Start automatic refresh of forecast data
   */
  startAutoRefresh(intervalMinutes: number = 60): void {
    this.stopAutoRefresh();
    
    this.refreshInterval = setInterval(async () => {
      console.log('Auto-refreshing forecast data...');
      try {
        await this.getLatestForecast();
      } catch (error) {
        console.warn('Auto-refresh failed:', error);
      }
    }, intervalMinutes * 60 * 1000);

    // Set next update time
    const nextUpdate = new Date();
    nextUpdate.setMinutes(nextUpdate.getMinutes() + intervalMinutes);
    this.updateLoadingState({ nextUpdateTime: nextUpdate });
  }

  /**
   * Stop automatic refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      this.updateLoadingState({ nextUpdateTime: null });
    }
  }

  /**
   * Get the latest forecast data with enhanced error handling
   */
  async getLatestForecast(): Promise<ForecastData | null> {
    this.updateLoadingState({ isLoading: true, error: null });
    
    try {
      console.log('Fetching latest forecast...');
      
      // Get latest release
      const releaseResponse = await fetch(`${this.GITHUB_API}/releases/latest`);
      if (!releaseResponse.ok) {
        console.warn('No releases found, checking available dates...');
        // First check if it's a 404 (no releases) vs other error
        if (releaseResponse.status === 404) {
          const fallbackData = await this.handleNoReleases();
          this.updateLoadingState({ 
            isLoading: false, 
            error: 'No automated forecasts available. Using demonstration data.',
            lastUpdated: new Date()
          });
          return fallbackData;
        }
        throw new Error(`GitHub API error: ${releaseResponse.statusText}`);
      }

      const release = await releaseResponse.json();
      const forecastDate = this.extractDateFromTag(release.tag_name);
      
      // Check cache first
      if (this.cache.has(forecastDate)) {
        console.log('Using cached forecast for', forecastDate);
        this.updateLoadingState({ 
          isLoading: false, 
          lastUpdated: new Date()
        });
        return this.cache.get(forecastDate)!;
      }

      // Find forecast file in release assets
      const forecastAsset = release.assets.find((asset: any) => 
        asset.name.includes('forecast_') && asset.name.endsWith('.geojson')
      );

      if (!forecastAsset) {
        console.warn('No forecast file found in latest release');
        throw new Error('Forecast file not found in latest release');
      }

      // Fetch forecast data with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      try {
        const forecastResponse = await fetch(forecastAsset.browser_download_url, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!forecastResponse.ok) {
          throw new Error(`Failed to fetch forecast data: ${forecastResponse.statusText}`);
        }

        const forecastGeoJSON = await forecastResponse.json();
        const forecastData = this.parseGeoJSONForecast(forecastGeoJSON, forecastDate);
        
        // Cache the result
        this.cache.set(forecastDate, forecastData);
        
        console.log(`Loaded forecast for ${forecastDate} with ${forecastData.particles.length} particles`);
        
        this.updateLoadingState({ 
          isLoading: false, 
          error: null,
          lastUpdated: new Date()
        });
        
        return forecastData;

      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

    } catch (error) {
      console.error('Error fetching latest forecast:', error);
      this.updateLoadingState({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        lastUpdated: new Date()
      });
      
      // Return cached data if available, otherwise demo data
      const cachedData = this.getMostRecentCached();
      if (cachedData) {
        console.log('Returning cached data due to error');
        return cachedData;
      }
      
      return this.generateDemoForecast(new Date().toISOString().split('T')[0]);
    }
  }

  /**
   * Handle case when no releases are found
   */
  private async handleNoReleases(): Promise<ForecastData | null> {
    // Try to load from test files if available
    try {
      const testData = await this.loadTestForecast();
      if (testData) {
        return testData;
      }
    } catch (error) {
      console.warn('Could not load test data:', error);
    }

    // Return demo data as fallback
    return this.generateDemoForecast(new Date().toISOString().split('T')[0]);
  }

  /**
   * Load test forecast data
   */
  private async loadTestForecast(): Promise<ForecastData | null> {
    try {
      // Try to load test_forecast_real.geojson
      const response = await fetch('/test_forecast_real.geojson');
      if (!response.ok) {
        throw new Error('Test file not found');
      }
      
      const geoJSON = await response.json();
      const today = new Date().toISOString().split('T')[0];
      
      return this.parseGeoJSONForecast(geoJSON, today);
    } catch (error) {
      console.warn('Could not load test forecast:', error);
      return null;
    }
  }

  /**
   * Get most recent cached forecast
   */
  private getMostRecentCached(): ForecastData | null {
    if (this.cache.size === 0) return null;
    
    const sortedEntries = Array.from(this.cache.entries())
      .sort((a, b) => b[0].localeCompare(a[0])); // Sort by date descending
    
    return sortedEntries[0][1];
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
   * Parse GeoJSON forecast data with enhanced metadata extraction
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

    // Parse particles from features and extract metadata from first feature
    let sampleMetadata: any = null;
    
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
        
        // Use first feature's properties as sample for metadata
        if (!sampleMetadata && feature.properties) {
          sampleMetadata = feature.properties;
        }
      }
    });

    // Extract metadata from sample feature properties or GeoJSON properties or use defaults
    const props = sampleMetadata || geoJSON.properties || {};
    const metadata: ForecastMetadata = {
      forecast_start: props.forecast_start || new Date().toISOString(),
      forecast_hours: props.forecast_hours || 72,
      windage: props.windage || 0.01,
      particles_per_point: props.particles_per_point || 5,
      seed_points: props.seed_points || particles.length / (props.particles_per_point || 5),
      generation_time: props.forecast_time || new Date().toISOString()
    };

    console.log(`Parsed forecast: ${particles.length} particles, metadata:`, metadata);

    return {
      particles,
      metadata,
      date,
      isEmpty: particles.length === 0
    };
  }

  /**
   * Get forecast for a specific date with enhanced error handling
   */
  async getForecastForDate(date: string): Promise<ForecastData | null> {
    try {
      // Check cache first
      if (this.cache.has(date)) {
        return this.cache.get(date)!;
      }

      // Get all releases and find the one for this date
      const releasesResponse = await fetch(`${this.GITHUB_API}/releases`);
      if (!releasesResponse.ok) {
        throw new Error(`Failed to fetch releases: ${releasesResponse.statusText}`);
      }
      
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
      if (!forecastResponse.ok) {
        throw new Error(`Failed to fetch forecast data: ${forecastResponse.statusText}`);
      }
      
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
   * Get available forecast dates with better error handling
   */
  async getAvailableForecastDates(): Promise<string[]> {
    try {
      const releasesResponse = await fetch(`${this.GITHUB_API}/releases`);
      if (!releasesResponse.ok) {
        console.warn('Failed to fetch releases, using demo data');
        return this.generateDemoForecastDates();
      }
      
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
   * Generate enhanced demo forecast data for testing
   */
  private generateDemoForecast(date: string): ForecastData {
    const particles: ForecastParticle[] = [];
    
    // Generate demo particles around Ghana's coast with more realistic distribution
    const basePoints = [
      { lat: 5.6, lon: -0.2, density: 20 }, // Accra area - high density
      { lat: 4.9, lon: -1.8, density: 15 }, // Cape Coast area - medium density
      { lat: 4.7, lon: -2.0, density: 12 }, // Takoradi area - medium density
      { lat: 5.1, lon: -0.5, density: 8 },  // Tema area - low density
      { lat: 4.5, lon: -1.5, density: 10 }, // Winneba area - low density
    ];

    let particleId = 0;
    basePoints.forEach(point => {
      // Generate cluster of particles around each base point
      for (let i = 0; i < point.density; i++) {
        particles.push({
          particle_id: particleId++,
          lon: point.lon + (Math.random() - 0.5) * 0.4,
          lat: point.lat + (Math.random() - 0.5) * 0.3,
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
        seed_points: basePoints.length,
        generation_time: new Date().toISOString()
      },
      date,
      isEmpty: false
    };
  }

  /**
   * Generate demo forecast dates for testing
   */
  private generateDemoForecastDates(): string[] {
    const dates: string[] = [];
    const baseDate = new Date();
    
    // Generate dates for the past 2 days and next 5 days
    for (let i = -2; i < 6; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates.reverse(); // Most recent first
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
}

export const forecastService = new ForecastService();