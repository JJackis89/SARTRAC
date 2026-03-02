import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, X, Bell, ChevronDown, MapPin, Clock, TrendingUp, Anchor } from 'lucide-react';
import { ForecastData } from '../services/forecastService';

// ── Types ───────────────────────────────────────────────────────────

export interface SargassumAlert {
  id: string;
  level: 'watch' | 'warning' | 'critical';
  region: string;
  message: string;
  detail: string;
  lat: number;
  lon: number;
  particleCount: number;
  estimatedETA: string;        // e.g. "12-24 hours"
  confidence: number;           // 0-1
  timestamp: Date;
  dismissed: boolean;
}

interface AlertPanelProps {
  forecastData: ForecastData | null;
  visible: boolean;
  onAlertClick?: (alert: SargassumAlert) => void;
}

// ── Ghana coastal regions for proximity checks ──────────────────────
// Coordinates placed AT the coastline, not inland city centres

const COASTAL_REGIONS = [
  // Western Region — CoastSnap monitoring zone
  { name: 'Newtown / Half Assini', lat: 5.08, lon: -3.10, radiusDeg: 0.20 },
  { name: 'Jaway / Beyin', lat: 5.02, lon: -2.76, radiusDeg: 0.25 },
  { name: 'Sanzule / Esiama', lat: 4.95, lon: -2.40, radiusDeg: 0.20 },
  { name: 'Axim / Princes Town', lat: 4.82, lon: -2.14, radiusDeg: 0.25 },
  { name: 'Dixcove / Cape Three Points', lat: 4.77, lon: -1.96, radiusDeg: 0.20 },
  // Takoradi & Central
  { name: 'Western Region (Takoradi)', lat: 4.88, lon: -1.75, radiusDeg: 0.25 },
  { name: 'Sekondi', lat: 4.93, lon: -1.60, radiusDeg: 0.20 },
  { name: 'Elmina', lat: 5.08, lon: -1.35, radiusDeg: 0.15 },
  { name: 'Central Region (Cape Coast)', lat: 5.10, lon: -1.25, radiusDeg: 0.25 },
  { name: 'Winneba', lat: 5.34, lon: -0.63, radiusDeg: 0.15 },
  // Greater Accra & Volta
  { name: 'Greater Accra (Tema)', lat: 5.62, lon: -0.01, radiusDeg: 0.25 },
  { name: 'Volta Region (Keta)', lat: 5.75, lon: 0.99, radiusDeg: 0.25 },
];

// High-resolution Ghana coastline latitude for a given longitude
function coastLatAt(lon: number): number {
  const pts = [
    { lon: -3.20, lat: 5.02 },
    { lon: -2.90, lat: 5.05 },
    { lon: -2.60, lat: 4.98 },
    { lon: -2.35, lat: 4.93 },
    { lon: -2.10, lat: 4.80 },
    { lon: -1.75, lat: 4.88 },
    { lon: -1.60, lat: 4.93 },
    { lon: -1.35, lat: 5.08 },
    { lon: -1.25, lat: 5.10 },
    { lon: -1.00, lat: 5.20 },
    { lon: -0.75, lat: 5.29 },
    { lon: -0.63, lat: 5.34 },
    { lon: -0.40, lat: 5.47 },
    { lon: -0.20, lat: 5.53 },
    { lon: -0.01, lat: 5.62 },
    { lon:  0.20, lat: 5.62 },
    { lon:  0.50, lat: 5.77 },
    { lon:  0.80, lat: 5.78 },
    { lon:  1.00, lat: 5.75 },
    { lon:  1.20, lat: 6.10 },
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    if (lon >= pts[i].lon && lon <= pts[i + 1].lon) {
      const t = (lon - pts[i].lon) / (pts[i + 1].lon - pts[i].lon);
      return pts[i].lat + t * (pts[i + 1].lat - pts[i].lat);
    }
  }
  return lon < pts[0].lon ? pts[0].lat : pts[pts.length - 1].lat;
}

function distanceDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2);
}

// ── Alert generation logic ──────────────────────────────────────────

function generateAlerts(forecast: ForecastData): SargassumAlert[] {
  if (!forecast || forecast.isEmpty) return [];

  const alerts: SargassumAlert[] = [];
  const particles = forecast.particles;

  // 1. Check proximity to each coastal region
  COASTAL_REGIONS.forEach((region) => {
    const nearby = particles.filter(
      (p) => distanceDeg(p.lat, p.lon, region.lat, region.lon) < region.radiusDeg * 2
    );

    if (nearby.length < 3) return;

    // Distance to coast in degrees → approximate km
    const avgDist =
      nearby.reduce((s, p) => s + Math.abs(p.lat - coastLatAt(p.lon)), 0) / nearby.length;
    const distKm = avgDist * 111;

    let level: SargassumAlert['level'];
    let eta: string;

    if (distKm < 5) {
      level = 'critical';
      eta = '<6 hours';
    } else if (distKm < 15) {
      level = 'warning';
      eta = '6-24 hours';
    } else if (distKm < 40) {
      level = 'watch';
      eta = '1-3 days';
    } else {
      return; // too far
    }

    const confidence = Math.min(1, nearby.length / 20);

    alerts.push({
      id: `alert-${region.name}-${forecast.date}`,
      level,
      region: region.name,
      message:
        level === 'critical'
          ? `Sargassum beaching imminent near ${region.name}`
          : level === 'warning'
          ? `Sargassum approaching ${region.name}`
          : `Sargassum detected offshore of ${region.name}`,
      detail: `${nearby.length} forecast particles within ${distKm.toFixed(0)} km of coast. Estimated arrival: ${eta}.`,
      lat: region.lat,
      lon: region.lon,
      particleCount: nearby.length,
      estimatedETA: eta,
      confidence,
      timestamp: new Date(),
      dismissed: false,
    });
  });

  // 2. Beached Sargassum detection — particles within ~2km of coast
  const beachedParticles = particles.filter((p) => {
    const coast = coastLatAt(p.lon);
    const distDeg = Math.abs(p.lat - coast);
    return distDeg < 0.02 && p.lon >= -3.5 && p.lon <= 1.5; // ~2km
  });

  if (beachedParticles.length >= 3) {
    // Group by nearest coastal region
    const affectedRegions = new Set<string>();
    beachedParticles.forEach((p) => {
      let closest = COASTAL_REGIONS[0];
      let minDist = Infinity;
      COASTAL_REGIONS.forEach((r) => {
        const d = distanceDeg(p.lat, p.lon, r.lat, r.lon);
        if (d < minDist) { minDist = d; closest = r; }
      });
      affectedRegions.add(closest.name);
    });

    alerts.push({
      id: `alert-beached-${forecast.date}`,
      level: 'critical',
      region: affectedRegions.size > 1
        ? `${affectedRegions.size} coastal areas`
        : Array.from(affectedRegions)[0],
      message: `Sargassum beaching detected — ${beachedParticles.length} particles at shoreline`,
      detail: `Active beaching predicted at: ${Array.from(affectedRegions).join(', ')}. Immediate cleanup coordination recommended.`,
      lat: beachedParticles[0].lat,
      lon: beachedParticles[0].lon,
      particleCount: beachedParticles.length,
      estimatedETA: 'NOW — Beaching',
      confidence: Math.min(1, beachedParticles.length / 10),
      timestamp: new Date(),
      dismissed: false,
    });
  }

  // 3. Overall density alert — large aggregation anywhere near Ghana
  const nearshoreParticles = particles.filter((p) => {
    const coast = coastLatAt(p.lon);
    return Math.abs(p.lat - coast) < 0.3 && p.lon >= -3.5 && p.lon <= 1.5;
  });

  if (nearshoreParticles.length >= 20) {
    alerts.push({
      id: `alert-bulk-${forecast.date}`,
      level: nearshoreParticles.length >= 50 ? 'critical' : 'warning',
      region: 'Ghana Coastline',
      message: `Large Sargassum aggregation detected — ${nearshoreParticles.length} particles nearshore`,
      detail: `Significant accumulation across the 0-30 km coastal band. Multiple beaches may be affected.`,
      lat: 5.3,
      lon: -1.0,
      particleCount: nearshoreParticles.length,
      estimatedETA: '6-48 hours',
      confidence: Math.min(1, nearshoreParticles.length / 40),
      timestamp: new Date(),
      dismissed: false,
    });
  }

  // 4. Drift velocity-based ETA refinement
  // Compute average southward (toward coast) drift if multiple time steps exist
  const timeGroups = new Map<string, typeof particles>();
  particles.forEach((p) => {
    const key = String(p.particle_id);
    if (!timeGroups.has(key)) timeGroups.set(key, []);
    timeGroups.get(key)!.push(p);
  });

  // Sort by severity
  const levelOrder = { critical: 0, warning: 1, watch: 2 };
  alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  return alerts;
}

// ── AlertPanel component ────────────────────────────────────────────

export const AlertPanel: React.FC<AlertPanelProps> = ({ forecastData, visible, onAlertClick }) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);

  const alerts = useMemo(() => {
    if (!forecastData) return [];
    return generateAlerts(forecastData).map((a) => ({
      ...a,
      dismissed: dismissed.has(a.id),
    }));
  }, [forecastData, dismissed]);

  const activeAlerts = alerts.filter((a) => !a.dismissed);
  const criticalCount = activeAlerts.filter((a) => a.level === 'critical').length;

  // Request notification permission on first critical alert
  useEffect(() => {
    if (criticalCount > 0 && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [criticalCount]);

  // Play a subtle notification sound for critical alerts
  useEffect(() => {
    if (criticalCount > 0 && visible) {
      // Browser notification API (permission-gated)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('SARTRAC Alert', {
          body: `${criticalCount} critical Sargassum alert${criticalCount > 1 ? 's' : ''} active`,
          icon: '/favicon.ico',
        });
      }
    }
  }, [criticalCount, visible]);

  const handleDismiss = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  if (!visible || alerts.length === 0) return null;

  return (
    <div
      className="absolute top-4 right-4 z-[600] pointer-events-auto"
      style={{ maxWidth: 360, maxHeight: 'calc(100vh - 10rem)' }}
    >
      {/* Header bar */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-t-xl transition-all"
        style={{
          background:
            criticalCount > 0
              ? 'linear-gradient(135deg, rgba(220,38,38,0.85), rgba(185,28,28,0.9))'
              : 'linear-gradient(135deg, rgba(234,179,8,0.85), rgba(202,138,4,0.9))',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
          ...(expanded ? {} : { borderRadius: '0.75rem' }),
        }}
      >
        <div className="flex items-center space-x-2">
          <Bell className="h-4 w-4 text-white animate-pulse" />
          <span className="text-sm font-bold text-white">
            {activeAlerts.length} Alert{activeAlerts.length !== 1 ? 's' : ''}
          </span>
          {criticalCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-white/20 text-white rounded">
              {criticalCount} CRITICAL
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-white transition-transform ${expanded ? '' : 'rotate-180'}`}
        />
      </button>

      {/* Alert list */}
      {expanded && (
        <div
          className="overflow-y-auto rounded-b-xl"
          style={{
            maxHeight: 'calc(100vh - 14rem)',
            background: 'rgba(30, 41, 59, 0.92)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: 'none',
          }}
        >
          {activeAlerts.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">All alerts dismissed</div>
          ) : (
            activeAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isSelected={selectedAlert === alert.id}
                onSelect={() => {
                  setSelectedAlert((prev) => (prev === alert.id ? null : alert.id));
                  onAlertClick?.(alert);
                }}
                onDismiss={(e) => handleDismiss(alert.id, e)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ── Individual alert card ───────────────────────────────────────────

function AlertCard({
  alert,
  isSelected,
  onSelect,
  onDismiss,
}: {
  alert: SargassumAlert;
  isSelected: boolean;
  onSelect: () => void;
  onDismiss: (e: React.MouseEvent) => void;
}) {
  const palette = {
    critical: {
      bg: 'rgba(220,38,38,0.12)',
      border: 'rgba(220,38,38,0.35)',
      icon: '#ef4444',
      badge: 'bg-red-500/20 text-red-300 border-red-500/40',
    },
    warning: {
      bg: 'rgba(234,179,8,0.10)',
      border: 'rgba(234,179,8,0.30)',
      icon: '#eab308',
      badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    },
    watch: {
      bg: 'rgba(59,130,246,0.08)',
      border: 'rgba(59,130,246,0.25)',
      icon: '#3b82f6',
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    },
  }[alert.level];

  return (
    <div
      onClick={onSelect}
      className="cursor-pointer transition-all"
      style={{
        background: isSelected ? palette.bg : 'transparent',
        borderLeft: `3px solid ${palette.border}`,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div className="px-4 py-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2">
            {alert.estimatedETA.includes('Beaching') ? (
              <Anchor className="h-4 w-4 flex-shrink-0" style={{ color: palette.icon }} />
            ) : (
              <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: palette.icon }} />
            )}
            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${palette.badge}`}>
              {alert.level.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Dismiss alert"
          >
            <X className="h-3 w-3 text-gray-400" />
          </button>
        </div>

        <p className="text-xs font-medium text-white mt-2">{alert.message}</p>

        {isSelected && (
          <div className="mt-2 space-y-2 text-[11px] text-gray-300">
            <p>{alert.detail}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center space-x-1">
                <MapPin className="h-3 w-3 text-teal-400" />
                <span>{alert.region}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3 text-teal-400" />
                <span>ETA: {alert.estimatedETA}</span>
              </div>
              <div className="flex items-center space-x-1">
                <TrendingUp className="h-3 w-3 text-teal-400" />
                <span>Confidence: {(alert.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-teal-400 text-[10px]">●</span>
                <span>{alert.particleCount} particles</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AlertPanel;
