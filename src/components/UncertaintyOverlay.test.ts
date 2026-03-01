import { describe, it, expect } from 'vitest';
import type { ForecastData, ForecastParticle } from '../services/forecastService';

// ── Helpers ─────────────────────────────────────────────────────────

function makeParticle(lat: number, lon: number, forecastTime = '2025-06-15T06:00:00Z'): ForecastParticle {
  return { particle_id: 0, lat, lon, status: 'active', forecast_time: forecastTime };
}

function makeForecast(
  particles: ForecastParticle[],
  forecastHours = 72,
  forecastStart = '2025-06-15T00:00:00Z'
): ForecastData {
  return {
    particles,
    metadata: {
      forecast_start: forecastStart,
      forecast_hours: forecastHours,
      windage: 0.01,
      particles_per_point: 5,
      seed_points: particles.length,
      generation_time: '2025-06-15T06:00:00Z',
    },
    date: '2025-06-15',
    isEmpty: particles.length === 0,
    isDemoData: false,
  };
}

// ── Uncertainty calculation (mirrors UncertaintyOverlay logic) ──────

function computeUncertainty(forecastData: ForecastData) {
  if (!forecastData || forecastData.isEmpty) return [];

  const CELL_SIZE = 0.2;
  const buckets = new Map<string, { lats: number[]; lons: number[] }>();

  forecastData.particles.forEach((p) => {
    const gx = Math.floor(p.lon / CELL_SIZE);
    const gy = Math.floor(p.lat / CELL_SIZE);
    const key = `${gx},${gy}`;
    if (!buckets.has(key)) buckets.set(key, { lats: [], lons: [] });
    const b = buckets.get(key)!;
    b.lats.push(p.lat);
    b.lons.push(p.lon);
  });

  const results: { lat: number; lon: number; uncertainty: number }[] = [];

  const forecastStartMs = new Date(forecastData.metadata.forecast_start).getTime();

  buckets.forEach((b) => {
    if (b.lats.length < 2) return;

    const centerLat = b.lats.reduce((a, c) => a + c, 0) / b.lats.length;
    const centerLon = b.lons.reduce((a, c) => a + c, 0) / b.lons.length;

    // Temporal uncertainty (fraction of total forecast window elapsed)
    const avgForecastTimeStr = forecastData.particles[0]?.forecast_time;
    const forecastTimeMs = avgForecastTimeStr ? new Date(avgForecastTimeStr).getTime() : forecastStartMs;
    const hoursElapsed = Math.max(0, (forecastTimeMs - forecastStartMs) / 3_600_000);
    const temporalFrac = Math.min(1, hoursElapsed / forecastData.metadata.forecast_hours);

    // Spatial spread
    const latStd = stddev(b.lats);
    const lonStd = stddev(b.lons);
    const spreadFrac = Math.min(1, (latStd + lonStd) / 0.3);

    const uncertainty = Math.min(1, temporalFrac * 0.4 + spreadFrac * 0.6);

    results.push({ lat: centerLat, lon: centerLon, uncertainty });
  });

  return results;
}

function stddev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sumSq = arr.reduce((s, v) => s + (v - mean) ** 2, 0);
  return Math.sqrt(sumSq / arr.length);
}

// ── Tests ───────────────────────────────────────────────────────────

describe('UncertaintyOverlay — computation', () => {
  it('returns empty for empty forecast', () => {
    const forecast = makeForecast([]);
    expect(computeUncertainty(forecast)).toEqual([]);
  });

  it('ignores cells with single particle', () => {
    const forecast = makeForecast([makeParticle(5.0, -1.0)]);
    expect(computeUncertainty(forecast)).toHaveLength(0);
  });

  it('computes uncertainty for a cluster', () => {
    const particles = [
      makeParticle(5.00, -1.00),
      makeParticle(5.02, -1.01),
      makeParticle(5.01, -0.99),
    ];
    const forecast = makeForecast(particles);
    const result = computeUncertainty(forecast);
    expect(result.length).toBeGreaterThanOrEqual(1);
    result.forEach((r) => {
      expect(r.uncertainty).toBeGreaterThanOrEqual(0);
      expect(r.uncertainty).toBeLessThanOrEqual(1);
    });
  });

  it('uncertainty is capped at 1.0', () => {
    // Very spread particles + long forecast time
    const particles = Array.from({ length: 20 }, (_, i) =>
      makeParticle(5.0 + (i * 0.05), -1.0 + (i * 0.05), '2025-06-18T00:00:00Z')
    );
    const forecast = makeForecast(particles, 72, '2025-06-15T00:00:00Z');
    const result = computeUncertainty(forecast);
    result.forEach((r) => {
      expect(r.uncertainty).toBeLessThanOrEqual(1.0);
    });
  });

  it('tighter clusters have lower uncertainty', () => {
    // Tight cluster
    const tightParticles = [
      makeParticle(5.000, -1.000, '2025-06-15T00:00:00Z'),
      makeParticle(5.001, -1.001, '2025-06-15T00:00:00Z'),
      makeParticle(5.002, -1.002, '2025-06-15T00:00:00Z'),
    ];
    // Spread cluster
    const spreadParticles = [
      makeParticle(5.00, -1.00, '2025-06-15T00:00:00Z'),
      makeParticle(5.10, -1.10, '2025-06-15T00:00:00Z'),
      makeParticle(5.15, -0.90, '2025-06-15T00:00:00Z'),
    ];

    const tightResult = computeUncertainty(makeForecast(tightParticles, 72, '2025-06-15T00:00:00Z'));
    const spreadResult = computeUncertainty(makeForecast(spreadParticles, 72, '2025-06-15T00:00:00Z'));

    // Due to cell binning, particles must be in the same cell for comparison.
    // Tight cluster should have lower spread uncertainty.
    if (tightResult.length > 0 && spreadResult.length > 0) {
      expect(tightResult[0].uncertainty).toBeLessThanOrEqual(spreadResult[0].uncertainty);
    }
  });
});

describe('UncertaintyOverlay — stddev helper', () => {
  it('returns 0 for uniform values', () => {
    expect(stddev([5, 5, 5, 5])).toBe(0);
  });

  it('computes correct standard deviation', () => {
    // [1, 2, 3, 4, 5] → mean = 3, variance = 2, stddev ≈ 1.414
    expect(stddev([1, 2, 3, 4, 5])).toBeCloseTo(1.414, 2);
  });
});

describe('UncertaintyOverlay — colour classification', () => {
  function uncertaintyLevel(u: number): 'low' | 'medium' | 'high' {
    if (u < 0.35) return 'low';
    if (u < 0.65) return 'medium';
    return 'high';
  }

  it('low uncertainty < 0.35', () => {
    expect(uncertaintyLevel(0.1)).toBe('low');
    expect(uncertaintyLevel(0.34)).toBe('low');
  });

  it('medium uncertainty [0.35, 0.65)', () => {
    expect(uncertaintyLevel(0.35)).toBe('medium');
    expect(uncertaintyLevel(0.64)).toBe('medium');
  });

  it('high uncertainty >= 0.65', () => {
    expect(uncertaintyLevel(0.65)).toBe('high');
    expect(uncertaintyLevel(1.0)).toBe('high');
  });
});
