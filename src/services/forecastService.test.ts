import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forecastService } from '../services/forecastService';
import type { ForecastData, LoadingState } from '../services/forecastService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeGeoJSON(count = 3) {
  return {
    type: 'FeatureCollection',
    properties: {
      forecast_start: '2025-01-15T00:00:00Z',
      forecast_hours: 72,
      windage: 0.01,
      particles_per_point: 5,
      seed_points: count,
      forecast_time: '2025-01-15T06:00:00Z',
    },
    features: Array.from({ length: count }, (_, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.2 + i * 0.1, 5.6 - i * 0.05] },
      properties: {
        particle_id: i,
        status: 'active',
        forecast_time: '2025-01-15T06:00:00Z',
      },
    })),
  };
}

function makeRelease(tag: string, hasAsset = true) {
  return {
    tag_name: tag,
    assets: hasAsset
      ? [{ name: `forecast_2025-01-15.geojson`, browser_download_url: 'https://github.com/JJackis89/SARTRAC/releases/download/v1/forecast_2025-01-15.geojson' }]
      : [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForecastService', () => {
  beforeEach(() => {
    forecastService.clearCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    forecastService.stopAutoRefresh();
  });

  it('getLatestForecast returns parsed forecast from a release', async () => {
    const geojson = makeFakeGeoJSON(5);
    const release = makeRelease('forecast-2025-01-15');

    // First fetch → latest release; second fetch → asset GeoJSON
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(release), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(geojson), { status: 200 }));

    const result = await forecastService.getLatestForecast();

    expect(result).not.toBeNull();
    expect(result!.particles).toHaveLength(5);
    expect(result!.date).toBe('2025-01-15');
    expect(result!.isEmpty).toBe(false);
    expect(result!.metadata.forecast_hours).toBe(72);
  });

  it('getLatestForecast returns cached data on second call', async () => {
    const geojson = makeFakeGeoJSON(2);
    const release = makeRelease('forecast-2025-01-15');

    vi.spyOn(globalThis, 'fetch')
      // First call: release + asset
      .mockResolvedValueOnce(new Response(JSON.stringify(release), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(geojson), { status: 200 }))
      // Second call: release (asset skipped because date is cached)
      .mockResolvedValueOnce(new Response(JSON.stringify(release), { status: 200 }));

    const first = await forecastService.getLatestForecast();
    const second = await forecastService.getLatestForecast();

    expect(first).toEqual(second);
    // 3 fetch calls: release + asset + release (cache hit on date)
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('getLatestForecast falls back to demo when release has no asset', async () => {
    const release = makeRelease('forecast-2025-01-15', false);

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(release), { status: 200 }))
      // tryLoadDemoData will fetch /test_forecast_real.geojson and fail
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await forecastService.getLatestForecast();
    // Either null or an error-state result; no crash
    expect(result === null || result?.isEmpty === true || result?.isDemoData === true || forecastService.getLoadingState().error !== null).toBe(true);
  });

  it('getLatestForecast surfaces error when API returns 404 (no releases)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      // demo fallback also fails
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await forecastService.getLatestForecast();
    const state = forecastService.getLoadingState();

    expect(result).toBeNull();
    expect(state.error).toBeTruthy();
    expect(state.isLoading).toBe(false);
  });

  it('clearCache empties the cache', async () => {
    const geojson = makeFakeGeoJSON(1);
    const release = makeRelease('forecast-2025-01-15');

    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(release), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(geojson), { status: 200 }));

    await forecastService.getLatestForecast();
    expect(spy).toHaveBeenCalledTimes(2);

    forecastService.clearCache();

    spy.mockResolvedValueOnce(new Response(JSON.stringify(release), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(geojson), { status: 200 }));

    await forecastService.getLatestForecast();
    // After clearing cache, fetch is called again
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('onLoadingStateChange notifies listeners', async () => {
    const states: LoadingState[] = [];
    const unsubscribe = forecastService.onLoadingStateChange((s) => states.push({ ...s }));

    const release = makeRelease('forecast-2025-01-15');
    const geojson = makeFakeGeoJSON(1);

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(release), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(geojson), { status: 200 }));

    await forecastService.getLatestForecast();
    unsubscribe();

    // At minimum: initial state emission + isLoading=true + isLoading=false
    expect(states.length).toBeGreaterThanOrEqual(2);
    expect(states.some((s) => s.isLoading)).toBe(true);
    expect(states[states.length - 1].isLoading).toBe(false);
  });

  it('getAvailableForecastDates returns sorted dates descending', async () => {
    const releases = [
      { tag_name: 'forecast-2025-01-10', assets: [] },
      { tag_name: 'forecast-2025-01-15', assets: [] },
      { tag_name: 'forecast-2025-01-12', assets: [] },
    ];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(releases), { status: 200 }));

    const dates = await forecastService.getAvailableForecastDates();

    expect(dates).toEqual(['2025-01-15', '2025-01-12', '2025-01-10']);
  });

  it('getAvailableForecastDates falls back to demo dates on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const dates = await forecastService.getAvailableForecastDates();

    expect(dates.length).toBeGreaterThan(0);
    // Demo dates should be valid date strings
    dates.forEach((d) => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });
});
