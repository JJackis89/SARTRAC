import { SatelliteObservation } from './satelliteService';
import { satelliteCache } from './satelliteDataCache';

export interface BatchRequest {
  id: string;
  north: number;
  south: number;
  east: number;
  west: number;
  startDate: Date;
  endDate: Date;
  dataset?: string;
  priority: number;
  timeout: number;
  retryCount: number;
  maxRetries: number;
  onProgress?: (progress: number) => void;
  onComplete?: (data: SatelliteObservation[]) => void;
  onError?: (error: Error) => void;
}

export interface StreamChunk {
  requestId: string;
  data: SatelliteObservation[];
  isComplete: boolean;
  progress: number;
  timestamp: number;
  chunkIndex: number;
  totalChunks: number;
}

export interface BatchConfig {
  maxBatchSize: number;
  batchTimeoutMs: number;
  maxConcurrentRequests: number;
  enableStreaming: boolean;
  chunkSize: number;
  retryDelayMs: number;
  priorityQueuing: boolean;
}

export class SatelliteRequestBatcher {
  private requestQueue: BatchRequest[] = [];
  private activeRequests = new Map<string, Promise<SatelliteObservation[]>>();
  private processingBatch = false;
  private config: BatchConfig;
  private batchTimeout: NodeJS.Timeout | null = null;
  private streamingCallbacks = new Map<string, (chunk: StreamChunk) => void>();

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      maxBatchSize: 10,
      batchTimeoutMs: 2000,
      maxConcurrentRequests: 5,
      enableStreaming: true,
      chunkSize: 100, // observations per chunk
      retryDelayMs: 1000,
      priorityQueuing: true,
      ...config
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if regions can be merged for batch optimization
   */
  private canMergeRegions(
    region1: { north: number; south: number; east: number; west: number },
    region2: { north: number; south: number; east: number; west: number }
  ): boolean {
    // Simple adjacency check - can be made more sophisticated
    const tolerance = 0.1; // degrees
    
    return (
      Math.abs(region1.north - region2.south) < tolerance ||
      Math.abs(region1.south - region2.north) < tolerance ||
      Math.abs(region1.east - region2.west) < tolerance ||
      Math.abs(region1.west - region2.east) < tolerance
    );
  }

  /**
   * Merge adjacent regions into a single larger region
   */
  private mergeRegions(requests: BatchRequest[]): {
    north: number;
    south: number;
    east: number;
    west: number;
  } {
    let north = Math.max(...requests.map(r => r.north));
    let south = Math.min(...requests.map(r => r.south));
    let east = Math.max(...requests.map(r => r.east));
    let west = Math.min(...requests.map(r => r.west));

    return { north, south, east, west };
  }

  /**
   * Filter observations by region
   */
  private filterObservationsByRegion(
    observations: SatelliteObservation[],
    north: number,
    south: number,
    east: number,
    west: number
  ): SatelliteObservation[] {
    return observations.filter(obs =>
      obs.lat >= south && obs.lat <= north &&
      obs.lon >= west && obs.lon <= east
    );
  }

  /**
   * Process observations in chunks for streaming
   */
  private async processStreamingChunks(
    requestId: string,
    observations: SatelliteObservation[],
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    if (!this.config.enableStreaming) {
      onChunk({
        requestId,
        data: observations,
        isComplete: true,
        progress: 100,
        timestamp: Date.now(),
        chunkIndex: 0,
        totalChunks: 1
      });
      return;
    }

    const chunkSize = this.config.chunkSize;
    const totalChunks = Math.ceil(observations.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, observations.length);
      const chunk = observations.slice(start, end);
      const progress = ((i + 1) / totalChunks) * 100;

      onChunk({
        requestId,
        data: chunk,
        isComplete: i === totalChunks - 1,
        progress,
        timestamp: Date.now(),
        chunkIndex: i,
        totalChunks
      });

      // Small delay between chunks to prevent overwhelming the UI
      if (i < totalChunks - 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }

  /**
   * Execute actual data fetch
   */
  private async executeFetch(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    dataset?: string
  ): Promise<SatelliteObservation[]> {
    // This would connect to your actual satellite data service
    // For now, return mock data based on region size
    const latRange = north - south;
    const lonRange = east - west;
    const area = latRange * lonRange;
    const density = 50; // observations per square degree
    const count = Math.floor(area * density);

    const observations: SatelliteObservation[] = [];
    const timeRange = endDate.getTime() - startDate.getTime();

    for (let i = 0; i < count; i++) {
      const lat = south + Math.random() * latRange;
      const lon = west + Math.random() * lonRange;
      const timestamp = new Date(startDate.getTime() + Math.random() * timeRange);

      observations.push({
        id: `obs_${i}_${Date.now()}`,
        lat,
        lon,
        timestamp,
        satelliteName: dataset || 'SENTINEL-3',
        sargassumIndex: Math.random() * 0.5 + 0.1, // 0.1 to 0.6
        indexType: 'AFAI' as const,
        confidence: Math.random() * 0.4 + 0.6, // 0.6 to 1.0
        cloudCover: Math.random() * 30, // 0 to 30%
        qualityFlags: Math.random() > 0.1 ? ['good'] : ['questionable']
      });
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    return observations;
  }

  /**
   * Process a batch of requests
   */
  private async processBatch(): Promise<void> {
    if (this.processingBatch || this.requestQueue.length === 0) return;

    this.processingBatch = true;
    console.log(`Processing batch of ${this.requestQueue.length} requests`);

    try {
      // Sort by priority if enabled
      if (this.config.priorityQueuing) {
        this.requestQueue.sort((a, b) => b.priority - a.priority);
      }

      // Take up to maxBatchSize requests
      const batchRequests = this.requestQueue.splice(0, this.config.maxBatchSize);
      
      // Group requests that can be optimized together
      const optimizedGroups = this.optimizeBatch(batchRequests);

      // Process groups concurrently up to maxConcurrentRequests
      const activePromises: Promise<void>[] = [];

      for (const group of optimizedGroups) {
        if (activePromises.length >= this.config.maxConcurrentRequests) {
          await Promise.race(activePromises);
          // Remove completed promises
          for (let i = activePromises.length - 1; i >= 0; i--) {
            if (await this.isPromiseSettled(activePromises[i])) {
              activePromises.splice(i, 1);
            }
          }
        }

        const groupPromise = this.processRequestGroup(group);
        activePromises.push(groupPromise);
      }

      // Wait for all remaining requests
      await Promise.allSettled(activePromises);

    } catch (error) {
      console.error('Batch processing error:', error);
    } finally {
      this.processingBatch = false;

      // Schedule next batch if there are more requests
      if (this.requestQueue.length > 0) {
        setTimeout(() => this.processBatch(), 100);
      }
    }
  }

  /**
   * Check if promise is settled
   */
  private async isPromiseSettled(promise: Promise<void>): Promise<boolean> {
    try {
      await Promise.race([
        promise,
        new Promise(resolve => setTimeout(resolve, 0))
      ]);
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Optimize batch by grouping mergeable requests
   */
  private optimizeBatch(requests: BatchRequest[]): BatchRequest[][] {
    const groups: BatchRequest[][] = [];
    const processed = new Set<string>();

    for (const request of requests) {
      if (processed.has(request.id)) continue;

      const group = [request];
      processed.add(request.id);

      // Find mergeable requests
      for (const other of requests) {
        if (processed.has(other.id)) continue;

        if (
          request.dataset === other.dataset &&
          Math.abs(request.startDate.getTime() - other.startDate.getTime()) < 3600000 && // 1 hour
          Math.abs(request.endDate.getTime() - other.endDate.getTime()) < 3600000 &&
          this.canMergeRegions(request, other)
        ) {
          group.push(other);
          processed.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Process a group of optimized requests
   */
  private async processRequestGroup(requests: BatchRequest[]): Promise<void> {
    const primaryRequest = requests[0];
    
    try {
      // Check cache first
      let observations: SatelliteObservation[] | null = null;

      if (requests.length === 1) {
        // Single request - check exact cache
        observations = await satelliteCache.get(
          primaryRequest.north,
          primaryRequest.south,
          primaryRequest.east,
          primaryRequest.west,
          primaryRequest.startDate,
          primaryRequest.endDate,
          primaryRequest.dataset
        );
      }

      if (!observations) {
        // Merge regions for batch fetch
        const mergedRegion = this.mergeRegions(requests);
        const earliestStart = new Date(Math.min(...requests.map(r => r.startDate.getTime())));
        const latestEnd = new Date(Math.max(...requests.map(r => r.endDate.getTime())));

        // Fetch merged data
        observations = await this.executeFetch(
          mergedRegion.north,
          mergedRegion.south,
          mergedRegion.east,
          mergedRegion.west,
          earliestStart,
          latestEnd,
          primaryRequest.dataset
        );

        // Cache the merged result
        await satelliteCache.set(
          mergedRegion.north,
          mergedRegion.south,
          mergedRegion.east,
          mergedRegion.west,
          earliestStart,
          latestEnd,
          observations,
          primaryRequest.dataset
        );
      }

      // Process each request individually
      for (const request of requests) {
        try {
          // Filter observations for this specific request
          const filteredObs = this.filterObservationsByRegion(
            observations,
            request.north,
            request.south,
            request.east,
            request.west
          );

          // Further filter by time range
          const timeFilteredObs = filteredObs.filter(obs => {
            const obsTime = new Date(obs.timestamp);
            return obsTime >= request.startDate && obsTime <= request.endDate;
          });

          // Stream the results
          if (this.config.enableStreaming && request.onProgress) {
            await this.processStreamingChunks(
              request.id,
              timeFilteredObs,
              (chunk) => {
                if (request.onProgress) {
                  request.onProgress(chunk.progress);
                }
                
                const callback = this.streamingCallbacks.get(request.id);
                if (callback) {
                  callback(chunk);
                }
              }
            );
          }

          // Complete the request
          if (request.onComplete) {
            request.onComplete(timeFilteredObs);
          }

          console.log(`Completed request ${request.id}: ${timeFilteredObs.length} observations`);

        } catch (error) {
          this.handleRequestError(request, error as Error);
        }
      }

    } catch (error) {
      // Handle group-level errors
      for (const request of requests) {
        this.handleRequestError(request, error as Error);
      }
    }
  }

  /**
   * Handle request errors with retry logic
   */
  private async handleRequestError(request: BatchRequest, error: Error): Promise<void> {
    console.error(`Request ${request.id} failed:`, error);

    if (request.retryCount < request.maxRetries) {
      request.retryCount++;
      console.log(`Retrying request ${request.id} (attempt ${request.retryCount}/${request.maxRetries})`);
      
      // Add delay before retry
      setTimeout(() => {
        this.requestQueue.unshift(request); // Add to front of queue for priority
        this.processBatch();
      }, this.config.retryDelayMs * request.retryCount);
    } else {
      if (request.onError) {
        request.onError(error);
      }
    }
  }

  /**
   * Schedule batch processing
   */
  private scheduleBatch(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.config.batchTimeoutMs);
  }

  /**
   * Add request to batch queue
   */
  async addRequest(
    north: number,
    south: number,
    east: number,
    west: number,
    startDate: Date,
    endDate: Date,
    options: {
      dataset?: string;
      priority?: number;
      timeout?: number;
      maxRetries?: number;
      onProgress?: (progress: number) => void;
      onComplete?: (data: SatelliteObservation[]) => void;
      onError?: (error: Error) => void;
      onStreamChunk?: (chunk: StreamChunk) => void;
    } = {}
  ): Promise<string> {
    const requestId = this.generateRequestId();

    const request: BatchRequest = {
      id: requestId,
      north,
      south,
      east,
      west,
      startDate,
      endDate,
      dataset: options.dataset,
      priority: options.priority || 0,
      timeout: options.timeout || 30000,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      onProgress: options.onProgress,
      onComplete: options.onComplete,
      onError: options.onError
    };

    if (options.onStreamChunk) {
      this.streamingCallbacks.set(requestId, options.onStreamChunk);
    }

    this.requestQueue.push(request);
    console.log(`Added request ${requestId} to batch queue (queue size: ${this.requestQueue.length})`);

    // Trigger immediate processing if we have enough requests or it's been too long
    if (
      this.requestQueue.length >= this.config.maxBatchSize ||
      !this.batchTimeout
    ) {
      this.processBatch();
    } else {
      this.scheduleBatch();
    }

    return requestId;
  }

  /**
   * Cancel a request
   */
  cancelRequest(requestId: string): boolean {
    const index = this.requestQueue.findIndex(req => req.id === requestId);
    if (index >= 0) {
      this.requestQueue.splice(index, 1);
      this.streamingCallbacks.delete(requestId);
      console.log(`Cancelled request ${requestId}`);
      return true;
    }
    return false;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    activeRequests: number;
    isProcessing: boolean;
  } {
    return {
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests.size,
      isProcessing: this.processingBatch
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Batch configuration updated:', newConfig);
  }

  /**
   * Clear all requests and reset
   */
  clear(): void {
    this.requestQueue.length = 0;
    this.activeRequests.clear();
    this.streamingCallbacks.clear();
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    console.log('Request batcher cleared');
  }
}

// Export singleton instance
export const satelliteBatcher = new SatelliteRequestBatcher({
  maxBatchSize: 8,
  batchTimeoutMs: 1500,
  maxConcurrentRequests: 4,
  enableStreaming: true,
  chunkSize: 50,
  retryDelayMs: 1000,
  priorityQueuing: true
});