/**
 * Forecast data service — fetches Sargassum forecast GeoJSON from GitHub Releases.
 *
 * In development Vite proxies `/api/github` → `https://api.github.com`, so no
 * external CORS proxies are needed. In production (deployed build) the app hits
 * the GitHub API directly since the page itself is served from GitHub Pages / a
 * container that can set appropriate headers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ForecastParticle {
  particle_id: number;
  lon: number;
  lat: number;
  status: string;
  forecast_time: string;
}

export type DataQuality = 'high' | 'medium' | 'low' | 'demo';

export interface ForecastMetadata {
  forecast_start: string;
  forecast_hours: number;
  windage: number;
  particles_per_point: number;
  seed_points: number;
  generation_time: string;
  data_sources?: string[];
  data_quality?: DataQuality;
  has_real_currents?: boolean;
  has_real_winds?: boolean;
  uses_fallback?: boolean;
}

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  nextUpdateTime?: Date | null;
}

export interface DetectionPoint {
  lat: number;
  lon: number;
  value: number;
  source: string;
  date: string;
  confidence?: number;
  n_sources?: number;
}

export interface DetectionData {
  points: DetectionPoint[];
  date: string;
  totalPoints: number;
  /** Overall data quality derived from detection sources (high = real AFAI/FAI). */
  data_quality?: DataQuality;
  /** Unique dataset sources present, e.g. ['modis_aqua_afai','s3a_olci_chla']. */
  sources?: string[];
}

export type ForecastHorizon = '3d' | '5d' | '7d';

export interface ForecastData {
  particles: ForecastParticle[];
  metadata: ForecastMetadata;
  date: string;
  isEmpty: boolean;
  isDemoData?: boolean;
  detections?: DetectionData;
  horizon?: ForecastHorizon;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isDev = (): boolean =>
  typeof window !== 'undefined' && window.location.hostname === 'localhost';

/** GitHub repo slug — configurable via VITE_GITHUB_REPO env var. */
const GITHUB_REPO = (): string =>
  (import.meta.env.VITE_GITHUB_REPO as string) || 'JJackis89/SARTRAC';

/** Base URL for GitHub API requests (uses Vite proxy in development). */
const GITHUB_API_BASE = (): string =>
  isDev()
    ? `/api/github/repos/${GITHUB_REPO()}`
    : `https://api.github.com/repos/${GITHUB_REPO()}`;

/**
 * Fetch with a timeout (default 15 s). Avoids hanging on slow or dead
 * endpoints.
 */
/**
 * Derive overall detection quality from per-feature `data_quality` plus
 * the set of source dataset keys. Real AFAI/FAI datasets are `high`;
 * chlor_a proxies are `low` unless the file already declares otherwise.
 */
function deriveDetectionQuality(
  topLevelQuality: unknown,
  sources: string[],
): DataQuality {
  const tl = typeof topLevelQuality === 'string' ? topLevelQuality.toLowerCase() : '';
  if (tl === 'high' || tl === 'medium' || tl === 'low' || tl === 'demo') {
    return tl as DataQuality;
  }
  const hasReal = sources.some((s) => /afai|fai|mci/.test(s));
  const allProxy = sources.length > 0 && sources.every((s) => /chla|chlor/.test(s));
  if (hasReal) return 'high';
  if (allProxy) return 'low';
  return 'medium';
}

async function fetchWithTimeout(url: string, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'SARTRAC-App' },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download a release asset.
 * In dev the asset URL (github.com) would be CORS-blocked, so we route
 * through Vite's `/api/releases` proxy. In prod we fetch directly.
 */
async function fetchAsset(browserDownloadUrl: string): Promise<Response> {
  if (isDev()) {
    // Transform: https://github.com/<owner>/<repo>/releases/download/...
    //         → /api/releases/<owner>/<repo>/releases/download/...
    const proxyUrl = browserDownloadUrl.replace('https://github.com', '/api/releases');
    const res = await fetchWithTimeout(proxyUrl);
    if (res.ok) return res;
    console.warn('Vite proxy asset fetch failed, trying direct...');
  }

  // Direct fetch (works in production or if proxy fails)
  return fetchWithTimeout(browserDownloadUrl);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ForecastService {
  private cache = new Map<string, ForecastData>();
  /** Cached releases list — avoids repeated API calls (rate-limit: 60/h). */
  private releasesCache: { data: any[]; fetchedAt: number } | null = null;
  private static RELEASES_TTL = 5 * 60_000; // 5 min
  private static LS_RELEASES_KEY = 'sartrac_releases_cache';

  constructor() {
    // Hydrate releases cache from localStorage on startup
    this.hydrateFromStorage();
  }

  private hydrateFromStorage() {
    try {
      const stored = localStorage.getItem(ForecastService.LS_RELEASES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.fetchedAt && Date.now() - parsed.fetchedAt < ForecastService.RELEASES_TTL) {
          this.releasesCache = parsed;
        } else {
          localStorage.removeItem(ForecastService.LS_RELEASES_KEY);
        }
      }
    } catch { /* ignore corrupt storage */ }
  }

  private persistToStorage() {
    try {
      if (this.releasesCache) {
        localStorage.setItem(
          ForecastService.LS_RELEASES_KEY,
          JSON.stringify(this.releasesCache),
        );
      }
    } catch { /* storage full or disabled */ }
  }

  // -- Loading-state pub/sub -------------------------------------------------
  private listeners: Array<(s: LoadingState) => void> = [];
  private state: LoadingState = { isLoading: false, error: null, lastUpdated: null };

  onLoadingStateChange(cb: (s: LoadingState) => void): () => void {
    this.listeners.push(cb);
    cb(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(patch: Partial<LoadingState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  // -- Auto-refresh -----------------------------------------------------------
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  startAutoRefresh(intervalMinutes = 30) {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(async () => {
      try {
        await this.getLatestForecast();
      } catch {
        /* swallow – state already reports the error */
      }
    }, intervalMinutes * 60_000);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // -- Public API -------------------------------------------------------------

  clearCache() {
    this.cache.clear();
  }

  getLoadingState(): LoadingState {
    return { ...this.state };
  }

  // -- Releases cache --------------------------------------------------------

  /** Fetch all releases (cached for 5 min to avoid GitHub API rate limits). */
  private async fetchReleases(): Promise<any[]> {
    if (
      this.releasesCache &&
      Date.now() - this.releasesCache.fetchedAt < ForecastService.RELEASES_TTL
    ) {
      return this.releasesCache.data;
    }

    const res = await fetchWithTimeout(`${GITHUB_API_BASE()}/releases?per_page=10`);
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('GitHub API rate limit exceeded — try again in a few minutes');
      }
      if (res.status === 404) {
        throw new Error('No releases found. The automated forecast system runs daily at 06:00 UTC.');
      }
      throw new Error(`GitHub API returned ${res.status}`);
    }
    const data = await res.json();
    this.releasesCache = { data, fetchedAt: Date.now() };
    this.persistToStorage();
    return data;
  }

  /** Try loading forecast data baked into the deployed site (dist/data/). */
  private async tryLoadStaticForecast(horizon: ForecastHorizon = '3d'): Promise<ForecastData | null> {
    try {
      const base = import.meta.env.BASE_URL ?? '/';
      const manifestRes = await fetchWithTimeout(`${base}data/manifest.json`, 5_000);
      if (!manifestRes.ok) return null;
      const manifest = await manifestRes.json();
      const date = manifest.date as string;
      if (!date) return null;

      // Try horizon-specific, then default
      const filenames = [
        `forecast_${date}_${horizon}.geojson`,
        `forecast_${date}.geojson`,
      ];
      for (const name of filenames) {
        try {
          const r = await fetchWithTimeout(`${base}data/${name}`, 5_000);
          if (!r.ok) continue;
          const geo = await r.json();
          const data = this.parseGeoJSON(geo, date);
          if (data.particles.length > 0) {
            data.horizon = horizon;
            // Also load baked-in detections
            data.detections = await this.tryLoadStaticDetections(date);
            return data;
          }
        } catch { /* try next */ }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Try loading detection data baked into the deployed site (dist/data/).
   * The deploy workflow downloads merged_detections_*.geojson alongside
   * the forecast files so they are available as a CORS-free fallback.
   */
  private async tryLoadStaticDetections(date: string): Promise<DetectionData | undefined> {
    try {
      const base = import.meta.env.BASE_URL ?? '/';
      const filenames = [
        `merged_detections_${date}.geojson`,
        // Also try without date in case the filename pattern differs
        'merged_detections.geojson',
      ];
      for (const name of filenames) {
        try {
          const r = await fetchWithTimeout(`${base}data/${name}`, 5_000);
          if (!r.ok) continue;
          const geo = await r.json();
          if (!geo.features?.length) continue;

          const points: DetectionPoint[] = geo.features
            .filter((f: any) => f.geometry?.type === 'Point')
            .map((f: any) => ({
              lat: f.geometry.coordinates[1],
              lon: f.geometry.coordinates[0],
              value: f.properties?.chlor_a ?? f.properties?.value ?? 0,
              source: f.properties?.source ?? f.properties?.dataset ?? 'satellite',
              date: f.properties?.date ?? date,
              confidence: f.properties?.confidence ?? undefined,
              n_sources: f.properties?.n_sources ?? undefined,
            }));

          if (points.length > 0) {
            const sources = Array.from(
              new Set(points.flatMap((pt) => String(pt.source).split(','))),
            );
            return {
              points,
              date,
              totalPoints: points.length,
              data_quality: deriveDetectionQuality(geo.properties?.data_quality, sources),
              sources,
            };
          }
        } catch { /* try next */ }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Fetch the most recent forecast from GitHub Releases. */
  async getLatestForecast(horizon: ForecastHorizon = '3d'): Promise<ForecastData | null> {
    this.emit({ isLoading: true, error: null });
    try {
      const releases = await this.fetchReleases();
      const release = releases.find((r: any) => r.tag_name?.startsWith('forecast-'));

      if (!release) {
        throw new Error('No forecast releases found.');
      }

      const forecastDate = this.extractDate(release.tag_name);

      const cacheKey = `${forecastDate}-${horizon}`;
      if (this.cache.has(cacheKey)) {
        this.emit({ isLoading: false, lastUpdated: new Date() });
        return this.cache.get(cacheKey)!;
      }

      // Prefer horizon-specific file (e.g. forecast_2026-03-01_5d.geojson),
      // fall back to default forecast file
      const horizonSuffix = `_${horizon}.geojson`;
      const horizonAsset = release.assets?.find(
        (a: any) => a.name.includes('forecast_') && a.name.endsWith(horizonSuffix)
      );
      const defaultAsset = release.assets?.find(
        (a: any) => a.name.includes('forecast_') && a.name.endsWith('.geojson') && !/_\dd\.geojson$/.test(a.name)
      );
      const asset = horizonAsset || defaultAsset;

      if (!asset) {
        console.warn('No forecast GeoJSON found in latest release');
        return this.fallbackToDemo(forecastDate, 'No forecast file in latest release');
      }

      const assetRes = await fetchAsset(asset.browser_download_url);
      const geojson = await assetRes.json();
      let data = this.parseGeoJSON(geojson, forecastDate);
      console.info(`[SARTRAC] Tier 1 (API): loaded ${data.particles.length} particles for ${forecastDate} (${horizon})`);

      // If real forecast is empty (pipeline found no detections / cloud cover),
      // load demo data so the UI stays usable and shows \"Live\" status.
      if (data.particles.length === 0) {
        const demo = await this.tryLoadDemoData(forecastDate);
        if (demo) {
          demo.isDemoData = true;
          this.cache.set(forecastDate, demo);
          this.emit({
            isLoading: false,
            error: null,          // << no error — keeps the \"Live\" badge
            lastUpdated: new Date(),
          });
          return demo;
        }
      }

      // Also fetch detection points if available
      data.detections = await this.fetchDetections(release, forecastDate);
      // If detection fetch failed (e.g. CORS on GitHub Pages), try baked-in static data
      if (!data.detections) {
        data.detections = await this.tryLoadStaticDetections(forecastDate);
      }
      data.horizon = horizon;

      this.cache.set(cacheKey, data);
      this.emit({ isLoading: false, error: null, lastUpdated: new Date() });
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('getLatestForecast:', msg);

      // Tier 2: Try static forecast data baked into the deploy
      const staticData = await this.tryLoadStaticForecast(horizon);
      if (staticData) {
        console.info(`[SARTRAC] Tier 2 (static): loaded ${staticData.particles.length} particles for ${staticData.date} (${horizon})`);
        this.cache.set(`${staticData.date}-${horizon}`, staticData);
        this.emit({ isLoading: false, error: null, lastUpdated: new Date() });
        return staticData;
      }

      // Tier 3: Serve demo data so the UI stays usable
      const demo = await this.tryLoadDemoData(new Date().toISOString().split('T')[0]);
      if (demo) {
        console.info(`[SARTRAC] Tier 3 (demo): loaded ${demo.particles.length} particles`);
        this.emit({ isLoading: false, error: null, lastUpdated: new Date() });
        return demo;
      }
      this.emit({ isLoading: false, error: msg });
      return null;
    }
  }

  /** Get forecast for a specific date (from cache, release, or demo). */
  async getForecastForDate(date: string): Promise<ForecastData | null> {
    if (this.cache.has(date)) return this.cache.get(date)!;

    try {
      const releases = await this.fetchReleases();
      const release = releases.find((r: any) => r.tag_name?.includes(date));

      if (!release) return this.generateDemo(date);

      const asset = release.assets?.find(
        (a: any) => a.name.includes('forecast_') && a.name.endsWith('.geojson')
      );
      if (!asset) return this.generateDemo(date);

      const assetRes = await fetchAsset(asset.browser_download_url);
      const geojson = await assetRes.json();
      const data = this.parseGeoJSON(geojson, date);
      this.cache.set(date, data);
      return data;
    } catch {
      return this.generateDemo(date);
    }
  }

  /** List available forecast dates. */
  async getAvailableForecastDates(): Promise<string[]> {
    try {
      const releases = await this.fetchReleases();
      const dates = (releases as any[])
        .filter((r) => r.tag_name?.startsWith('forecast-'))
        .map((r) => this.extractDate(r.tag_name))
        .sort()
        .reverse();

      return dates.length > 0 ? dates : this.demoDates();
    } catch {
      return this.demoDates();
    }
  }

  // -- Internal helpers -------------------------------------------------------

  private extractDate(tag: string): string {
    const m = tag.match(/forecast-(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : new Date().toISOString().split('T')[0];
  }

  private parseGeoJSON(geo: any, date: string): ForecastData {
    if (!geo.features?.length) {
      return {
        particles: [],
        metadata: this.defaultMeta(date),
        date,
        isEmpty: true,
      };
    }

    const particles: ForecastParticle[] = geo.features
      .filter((f: any) => f.geometry?.type === 'Point')
      .map((f: any) => ({
        particle_id: f.properties?.particle_id ?? 0,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        status: f.properties?.status ?? 'active',
        forecast_time: f.properties?.forecast_time ?? new Date().toISOString(),
      }));

    const p = geo.properties ?? {};
    return {
      particles,
      metadata: {
        forecast_start: p.forecast_start ?? new Date(date).toISOString(),
        forecast_hours: p.forecast_hours ?? 72,
        windage: p.windage ?? 0.01,
        particles_per_point: p.particles_per_point ?? 5,
        seed_points: p.seed_points ?? 0,
        generation_time: p.forecast_time ?? new Date().toISOString(),
        data_sources: p.data_sources ?? [],
        data_quality: p.data_quality ?? (particles.length > 0 ? 'medium' : 'low'),
        has_real_currents: p.has_real_currents ?? false,
        has_real_winds: p.has_real_winds ?? false,
        uses_fallback: p.uses_fallback ?? true,
      },
      date,
      isEmpty: particles.length === 0,
    };
  }

  private defaultMeta(date: string): ForecastMetadata {
    return {
      forecast_start: new Date(date).toISOString(),
      forecast_hours: 72,
      windage: 0.01,
      particles_per_point: 0,
      seed_points: 0,
      generation_time: new Date().toISOString(),
    };
  }

  /** Try loading the local demo GeoJSON shipped with the app. */
  private async tryLoadDemoData(date: string): Promise<ForecastData | null> {
    try {
      const base = import.meta.env.BASE_URL ?? '/';
      const res = await fetch(`${base}test_forecast_real.geojson`);
      if (!res.ok) return null;
      const geo = await res.json();
      const data = this.parseGeoJSON(geo, date);
      if (data.particles.length === 0) return null;
      data.isDemoData = true;
      data.isEmpty = false;
      return data;
    } catch {
      return null;
    }
  }

  private async fallbackToDemo(date: string, reason: string): Promise<ForecastData | null> {
    const demo = await this.tryLoadDemoData(date);
    if (demo) {
      this.emit({ isLoading: false, error: `${reason} – showing demo`, lastUpdated: new Date() });
      return demo;
    }
    this.emit({ isLoading: false, error: reason });
    return null;
  }

  /** Generate synthetic demo particles for a given date. */
  private generateDemo(date: string): ForecastData {
    const basePoints = [
      { lat: 5.6, lon: -0.2 },
      { lat: 4.9, lon: -1.8 },
      { lat: 4.7, lon: -2.0 },
    ];

    let id = 0;
    const particles: ForecastParticle[] = basePoints.flatMap((pt) =>
      Array.from({ length: 15 }, () => ({
        particle_id: id++,
        lon: pt.lon + (Math.random() - 0.5) * 0.3,
        lat: pt.lat + (Math.random() - 0.5) * 0.2,
        status: 'active',
        forecast_time: new Date(date).toISOString(),
      }))
    );

    return {
      particles,
      metadata: {
        forecast_start: new Date(date).toISOString(),
        forecast_hours: 72,
        windage: 0.03,
        particles_per_point: 15,
        seed_points: 3,
        generation_time: new Date().toISOString(),
      },
      date,
      isEmpty: false,
    };
  }

  /** Fetch merged detection points from the same release. */
  private async fetchDetections(release: any, date: string): Promise<DetectionData | undefined> {
    try {
      const asset = release.assets?.find(
        (a: any) => a.name.includes('merged_detections') && a.name.endsWith('.geojson')
      );
      if (!asset) return undefined;

      const res = await fetchAsset(asset.browser_download_url);
      if (!res.ok) return undefined;
      const geo = await res.json();

      if (!geo.features?.length) return undefined;

      const points: DetectionPoint[] = geo.features
        .filter((f: any) => f.geometry?.type === 'Point')
        .map((f: any) => ({
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          value: f.properties?.chlor_a ?? f.properties?.value ?? 0,
          source: f.properties?.source ?? f.properties?.dataset ?? 'satellite',
          date: f.properties?.date ?? date,
          confidence: f.properties?.confidence ?? undefined,
          n_sources: f.properties?.n_sources ?? undefined,
        }));

      const sources = Array.from(
        new Set(points.flatMap((pt) => String(pt.source).split(','))),
      );
      return {
        points,
        date,
        totalPoints: points.length,
        data_quality: deriveDetectionQuality(geo.properties?.data_quality, sources),
        sources,
      };
    } catch (e) {
      console.warn('Failed to fetch detections:', e);
      return undefined;
    }
  }

  private demoDates(): string[] {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  }
}

export const forecastService = new ForecastService();
