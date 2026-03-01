import { describe, it, expect } from 'vitest';
import type { ForecastData, ForecastParticle } from '../services/forecastService';

// ── Test helpers ────────────────────────────────────────────────────

function makeParticle(lat: number, lon: number, id = 0): ForecastParticle {
  return {
    particle_id: id,
    lat,
    lon,
    status: 'active',
    forecast_time: '2025-06-15T06:00:00Z',
  };
}

function makeForecast(particles: ForecastParticle[]): ForecastData {
  return {
    particles,
    metadata: {
      forecast_start: '2025-06-15T00:00:00Z',
      forecast_hours: 72,
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

// ── Drift vector grid binning logic (mirrors DriftVectorsOverlay) ──

function computeGridVectors(forecastData: ForecastData) {
  if (!forecastData || forecastData.isEmpty) return [];

  const CELL_SIZE = 0.15;
  const buckets = new Map<string, { lats: number[]; lons: number[]; count: number }>();

  forecastData.particles.forEach((p) => {
    const gx = Math.floor(p.lon / CELL_SIZE);
    const gy = Math.floor(p.lat / CELL_SIZE);
    const key = `${gx},${gy}`;
    if (!buckets.has(key)) buckets.set(key, { lats: [], lons: [], count: 0 });
    const b = buckets.get(key)!;
    b.lats.push(p.lat);
    b.lons.push(p.lon);
    b.count++;
  });

  const vectors: { lat: number; lon: number; angle: number; magnitude: number; count: number }[] = [];

  buckets.forEach((b) => {
    if (b.count < 2) return;
    const centerLat = b.lats.reduce((a, c) => a + c, 0) / b.lats.length;
    const centerLon = b.lons.reduce((a, c) => a + c, 0) / b.lons.length;
    const latSpread = Math.max(...b.lats) - Math.min(...b.lats);
    const lonSpread = Math.max(...b.lons) - Math.min(...b.lons);
    const dLat = 0.05 + latSpread * 0.3;
    const dLon = -0.15 - lonSpread * 0.2;
    const angle = Math.atan2(dLat, dLon);
    const magnitude = Math.min(Math.sqrt(dLat ** 2 + dLon ** 2), 0.3);
    vectors.push({ lat: centerLat, lon: centerLon, angle, magnitude, count: b.count });
  });

  return vectors;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('DriftVectorsOverlay — grid binning', () => {
  it('returns empty for empty forecast', () => {
    const forecast = makeForecast([]);
    expect(computeGridVectors(forecast)).toEqual([]);
  });

  it('ignores cells with fewer than 2 particles', () => {
    // Single particle in one cell
    const forecast = makeForecast([makeParticle(5.0, -1.0, 0)]);
    const vectors = computeGridVectors(forecast);
    expect(vectors).toHaveLength(0);
  });

  it('groups nearby particles into the same cell', () => {
    // Two particles very close (same 0.15° cell)
    const p1 = makeParticle(5.00, -1.00, 1);
    const p2 = makeParticle(5.01, -1.01, 2);
    const forecast = makeForecast([p1, p2]);
    const vectors = computeGridVectors(forecast);
    expect(vectors).toHaveLength(1);
    expect(vectors[0].count).toBe(2);
  });

  it('creates separate vectors for distant particles', () => {
    // Two clusters far apart
    const cluster1 = [makeParticle(5.0, -1.0, 1), makeParticle(5.01, -1.01, 2)];
    const cluster2 = [makeParticle(6.0, 0.5, 3), makeParticle(6.01, 0.51, 4)];
    const forecast = makeForecast([...cluster1, ...cluster2]);
    const vectors = computeGridVectors(forecast);
    expect(vectors).toHaveLength(2);
  });

  it('vector magnitude is capped at 0.3', () => {
    // Many spread-out particles → high raw magnitude
    const particles = Array.from({ length: 20 }, (_, i) =>
      makeParticle(5.0 + (i * 0.01), -1.0, i)
    );
    const forecast = makeForecast(particles);
    const vectors = computeGridVectors(forecast);
    vectors.forEach((v) => {
      expect(v.magnitude).toBeLessThanOrEqual(0.3);
    });
  });

  it('vector angle includes westward Gulf of Guinea climatology', () => {
    // Tightly packed particles → minimal spread → angle dominated by dLon=-0.15
    const p1 = makeParticle(5.000, -1.000, 1);
    const p2 = makeParticle(5.001, -1.001, 2);
    const forecast = makeForecast([p1, p2]);
    const vectors = computeGridVectors(forecast);
    expect(vectors).toHaveLength(1);

    // dLon ≈ -0.15, dLat ≈ 0.05 → angle in second quadrant (~162°)
    const angleDeg = (vectors[0].angle * 180) / Math.PI;
    expect(angleDeg).toBeGreaterThan(90);  // northward + westward component
    expect(angleDeg).toBeLessThan(180);
  });
});

describe('DriftVectorsOverlay — intensity colour mapping', () => {
  // Mirror the intensityToColor function from the component
  function intensityToColor(t: number): string {
    const r = Math.round(50 + t * 150);
    const g = Math.round(120 + t * 135);
    const b = Math.round(200 + t * 55);
    return `rgb(${r}, ${g}, ${b})`;
  }

  it('low intensity produces blue-ish colour', () => {
    const color = intensityToColor(0);
    expect(color).toBe('rgb(50, 120, 200)');
  });

  it('high intensity produces white-ish colour', () => {
    const color = intensityToColor(1);
    expect(color).toBe('rgb(200, 255, 255)');
  });

  it('mid intensity is between blue and white', () => {
    const color = intensityToColor(0.5);
    expect(color).toContain('rgb(');
    // Components should be between low and high
    const [, r, g, b] = color.match(/rgb\((\d+), (\d+), (\d+)\)/)!.map(Number);
    expect(r).toBeGreaterThan(50);
    expect(r).toBeLessThan(200);
    expect(g).toBeGreaterThan(120);
  });
});
