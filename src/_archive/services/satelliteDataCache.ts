import { SatelliteObservation } from './satelliteService';

export interface CacheEntry {
  data: SatelliteObservation[];
  timestamp: number;
  expiresAt: number;
  region: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  requestHash: string;
  compressionRatio?: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheConfig {
  maxSizeBytes: number;
  defaultTTL: number; // Time to live in milliseconds
  maxEntries: number;
  compressionThreshold: number; // Compress entries larger than this size
  enableRegionalCaching: boolean;
  enablePredictivePrefetch: boolean;
  statsTracking: boolean;
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  currentSizeBytes: number;
  entryCount: number;
  avgResponseTime: number;
  compressionSavings: number;
  evictionCount: number;
  lastCleanup: number;
}

export class SatelliteDataCache {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats;
  private config: CacheConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private requestQueue = new Map<string, Promise<SatelliteObservation[]>>();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSizeBytes: 100 * 1024 * 1024, // 100MB default
      defaultTTL: 15 * 60 * 1000, // 15 minutes
      maxEntries: 1000,
      compressionThreshold: 50 * 1024, // 50KB
      enableRegionalCaching: true,
      enablePredictivePrefetch: true,
      statsTracking: true,
      ...config
    };

    this.stats = {
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      totalHits: 0,
      totalMisses: 0,
      currentSizeBytes: 0,
      entryCount: 0,
      avgResponseTime: 0,
      compressionSavings: 0,
      evictionCount: 0,
      lastCleanup: Date.now()
    };

    this.startCleanupScheduler();
  }

  /**
   * Generate cache key from request parameters
   */
  private generateCacheKey(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    dataset?: string
  ): string {
    const region = `${north.toFixed(3)},${south.toFixed(3)},${east.toFixed(3)},${west.toFixed(3)}`;
    const timeRange = `${startDate.toISOString()}-${endDate.toISOString()}`;
    const dsParam = dataset || 'default';
    return `${region}|${timeRange}|${dsParam}`;
  }

  /**
   * Generate hash for request deduplication
   */
  private generateRequestHash(key: string): string {
    // Simple hash function for request deduplication
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Check if regions overlap for regional caching
   */
  private regionsOverlap(
    region1: { north: number; south: number; east: number; west: number },
    region2: { north: number; south: number; east: number; west: number }
  ): boolean {
    return !(
      region1.east < region2.west ||
      region2.east < region1.west ||
      region1.north < region2.south ||
      region2.north < region1.south
    );
  }

  /**
   * Find cached data that overlaps with requested region
   */
  private findOverlappingCacheEntries(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date
  ): CacheEntry[] {
    if (!this.config.enableRegionalCaching) return [];

    const requestRegion = { north, south, east, west };
    const overlapping: CacheEntry[] = [];

    for (const entry of this.cache.values()) {
      if (entry.expiresAt < Date.now()) continue;

      // Check regional overlap
      if (this.regionsOverlap(entry.region, requestRegion)) {
        // Check temporal overlap
        const entryStart = new Date(entry.timestamp);
        const entryEnd = new Date(entry.timestamp + this.config.defaultTTL);
        
        if (!(endDate < entryStart || startDate > entryEnd)) {
          overlapping.push(entry);
        }
      }
    }

    return overlapping;
  }

  /**
   * Compress large data entries
   */
  private compressData(data: SatelliteObservation[]): string {
    try {
      // Simple JSON compression - in production, use proper compression library
      const jsonString = JSON.stringify(data);
      if (jsonString.length < this.config.compressionThreshold) {
        return jsonString;
      }

      // Simulate compression by removing unnecessary whitespace and precision
      const compressed = JSON.stringify(data, (_key, value) => {
        if (typeof value === 'number') {
          return Math.round(value * 1000) / 1000; // Limit to 3 decimal places
        }
        return value;
      });

      return compressed;
    } catch (error) {
      console.warn('Data compression failed:', error);
      return JSON.stringify(data);
    }
  }

  /**
   * Calculate entry size in bytes
   */
  private calculateEntrySize(entry: CacheEntry): number {
    const dataSize = JSON.stringify(entry.data).length * 2; // Rough UTF-16 size
    const metadataSize = 200; // Approximate metadata size
    return dataSize + metadataSize;
  }

  /**
   * Evict least recently used entries
   */
  private evictLRU(): void {
    const entries = Array.from(this.cache.entries()).sort(
      ([, a], [, b]) => a.lastAccessed - b.lastAccessed
    );

    let currentSize = this.stats.currentSizeBytes;
    let evicted = 0;

    while (
      (currentSize > this.config.maxSizeBytes * 0.8 || 
       this.cache.size > this.config.maxEntries * 0.8) &&
      entries.length > evicted
    ) {
      const [key, entry] = entries[evicted];
      const entrySize = this.calculateEntrySize(entry);
      
      this.cache.delete(key);
      currentSize -= entrySize;
      evicted++;
    }

    this.stats.evictionCount += evicted;
    this.stats.currentSizeBytes = currentSize;
    this.stats.entryCount = this.cache.size;

    if (evicted > 0) {
      console.log(`Evicted ${evicted} cache entries (LRU policy)`);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleanedSize = 0;
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        cleanedSize += this.calculateEntrySize(entry);
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    this.stats.currentSizeBytes -= cleanedSize;
    this.stats.entryCount = this.cache.size;
    this.stats.lastCleanup = now;

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  /**
   * Start automatic cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
      if (
        this.stats.currentSizeBytes > this.config.maxSizeBytes ||
        this.cache.size > this.config.maxEntries
      ) {
        this.evictLRU();
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Get cached data if available
   */
  async get(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    dataset?: string
  ): Promise<SatelliteObservation[] | null> {
    const key = this.generateCacheKey(north, south, east, west, startDate, endDate, dataset);
    const startTime = Date.now();

    this.stats.totalRequests++;

    // Check exact cache hit
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      
      this.stats.totalHits++;
      this.stats.hitRate = this.stats.totalHits / this.stats.totalRequests;
      
      const responseTime = Date.now() - startTime;
      this.stats.avgResponseTime = 
        (this.stats.avgResponseTime * (this.stats.totalRequests - 1) + responseTime) / 
        this.stats.totalRequests;

      console.log(`Cache HIT for key: ${key} (${responseTime}ms)`);
      return entry.data;
    }

    // Check for overlapping regional data
    if (this.config.enableRegionalCaching) {
      const overlapping = this.findOverlappingCacheEntries(
        north, south, east, west, startDate, endDate
      );

      if (overlapping.length > 0) {
        // Merge overlapping data
        const mergedData: SatelliteObservation[] = [];
        const seenIds = new Set<string>();

        for (const overlap of overlapping) {
          for (const obs of overlap.data) {
            const id = `${obs.lat}-${obs.lon}-${obs.timestamp}`;
            if (!seenIds.has(id)) {
              // Check if observation is within requested bounds
              if (
                obs.lat >= south && obs.lat <= north &&
                obs.lon >= west && obs.lon <= east &&
                new Date(obs.timestamp) >= startDate &&
                new Date(obs.timestamp) <= endDate
              ) {
                mergedData.push(obs);
                seenIds.add(id);
              }
            }
          }
        }

        if (mergedData.length > 0) {
          this.stats.totalHits++;
          this.stats.hitRate = this.stats.totalHits / this.stats.totalRequests;
          
          console.log(`Regional cache HIT: merged ${mergedData.length} observations`);
          return mergedData;
        }
      }
    }

    this.stats.totalMisses++;
    this.stats.missRate = this.stats.totalMisses / this.stats.totalRequests;
    
    console.log(`Cache MISS for key: ${key}`);
    return null;
  }

  /**
   * Store data in cache with automatic optimization
   */
  async set(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    data: SatelliteObservation[],
    dataset?: string,
    customTTL?: number
  ): Promise<void> {
    const key = this.generateCacheKey(north, south, east, west, startDate, endDate, dataset);
    const now = Date.now();
    const ttl = customTTL || this.config.defaultTTL;

    const entry: CacheEntry = {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      region: { north, south, east, west },
      requestHash: this.generateRequestHash(key),
      accessCount: 1,
      lastAccessed: now
    };

    // Compress large entries
    const entrySize = this.calculateEntrySize(entry);
    if (entrySize > this.config.compressionThreshold) {
      const compressed = this.compressData(data);
      const originalSize = JSON.stringify(data).length;
      const compressedSize = compressed.length;
      
      entry.compressionRatio = compressedSize / originalSize;
      this.stats.compressionSavings += originalSize - compressedSize;
      
      console.log(`Compressed cache entry: ${originalSize} -> ${compressedSize} bytes (${(entry.compressionRatio * 100).toFixed(1)}%)`);
    }

    this.cache.set(key, entry);
    this.stats.currentSizeBytes += entrySize;
    this.stats.entryCount = this.cache.size;

    // Trigger cleanup if needed
    if (
      this.stats.currentSizeBytes > this.config.maxSizeBytes ||
      this.cache.size > this.config.maxEntries
    ) {
      this.evictLRU();
    }

    console.log(`Cached ${data.length} observations for region ${north},${south},${east},${west}`);
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      this.stats.currentSizeBytes = 0;
      this.stats.entryCount = 0;
      console.log('Cleared entire cache');
      return;
    }

    let removed = 0;
    let removedSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (key.includes(pattern)) {
        removedSize += this.calculateEntrySize(entry);
        this.cache.delete(key);
        removed++;
      }
    }

    this.stats.currentSizeBytes -= removedSize;
    this.stats.entryCount = this.cache.size;

    console.log(`Invalidated ${removed} cache entries matching pattern: ${pattern}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Cache configuration updated:', newConfig);
  }

  /**
   * Prefetch data for predicted requests
   */
  async prefetch(
    regions: Array<{
      north: number;
      south: number;
      east: number;
      west: number;
      startDate: Date;
      endDate: Date;
      dataset?: string;
    }>,
    dataFetcher: (
      north: number,
      south: number,
      east: number,
      west: number,
      startDate: Date,
      endDate: Date,
      dataset?: string
    ) => Promise<SatelliteObservation[]>
  ): Promise<void> {
    if (!this.config.enablePredictivePrefetch) return;

    console.log(`Prefetching data for ${regions.length} predicted regions`);

    const prefetchPromises = regions.map(async (region) => {
      const cached = await this.get(
        region.north,
        region.south,
        region.east,
        region.west,
        region.startDate,
        region.endDate,
        region.dataset
      );

      if (!cached) {
        try {
          const data = await dataFetcher(
            region.north,
            region.south,
            region.east,
            region.west,
            region.startDate,
            region.endDate,
            region.dataset
          );

          await this.set(
            region.north,
            region.south,
            region.east,
            region.west,
            region.startDate,
            region.endDate,
            data,
            region.dataset
          );
        } catch (error) {
          console.warn('Prefetch failed for region:', region, error);
        }
      }
    });

    await Promise.allSettled(prefetchPromises);
  }

  /**
   * Clean up and stop cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    this.requestQueue.clear();
    console.log('Cache destroyed and cleaned up');
  }
}

// Export singleton instance
export const satelliteCache = new SatelliteDataCache({
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  defaultTTL: 10 * 60 * 1000, // 10 minutes for satellite data
  maxEntries: 500,
  enableRegionalCaching: true,
  enablePredictivePrefetch: true,
  statsTracking: true
});