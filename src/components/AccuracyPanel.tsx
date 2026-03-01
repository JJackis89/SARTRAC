import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface AccuracyMetrics {
  hit_rate: number | null;
  false_alarm_rate: number | null;
  miss_rate: number | null;
  mean_distance_km: number | null;
  spatial_correlation: number | null;
  forecast_particles: number;
  observation_points: number;
  forecast_file: string;
  observation_file: string;
  status: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const GITHUB_API = 'https://api.github.com/repos/JJackis89/SARTRAC/releases';

export default function AccuracyPanel({ isOpen, onClose }: Props) {
  const [metrics, setMetrics] = useState<AccuracyMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);

    // Search recent releases for accuracy JSON
    fetch(`${GITHUB_API}?per_page=10`)
      .then(res => res.json())
      .then(async (releases: any[]) => {
        for (const rel of releases) {
          const accAsset = (rel.assets || []).find((a: any) =>
            a.name.startsWith('accuracy_') && a.name.endsWith('.json')
          );
          if (accAsset) {
            const data = await fetch(accAsset.browser_download_url).then(r => r.json());
            setMetrics(data);
            setLoading(false);
            return;
          }
        }
        setError('No accuracy data available yet. Validation runs weekly.');
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch accuracy data');
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const pct = (val: number | null) =>
    val !== null ? `${(val * 100).toFixed(1)}%` : '—';

  const qualityLabel = (hitRate: number | null): { text: string; color: string } => {
    if (hitRate === null) return { text: 'Unknown', color: 'text-gray-400' };
    if (hitRate >= 0.7) return { text: 'Good', color: 'text-green-400' };
    if (hitRate >= 0.4) return { text: 'Moderate', color: 'text-yellow-400' };
    return { text: 'Low', color: 'text-red-400' };
  };

  const quality = metrics ? qualityLabel(metrics.hit_rate) : qualityLabel(null);

  return (
    <div className="absolute top-16 right-4 z-[1000] w-80 bg-slate-800/95 backdrop-blur-sm
                    rounded-xl border border-slate-600/50 shadow-xl text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-700/50 border-b border-slate-600/40">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-cyan-400" />
          <span className="font-semibold text-sm">Forecast Accuracy</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="p-4 space-y-4">
        {loading && (
          <div className="text-center py-8 text-slate-400">
            <Activity size={24} className="animate-spin mx-auto mb-2" />
            Loading accuracy data...
          </div>
        )}

        {error && (
          <div className="text-center py-6 text-slate-400 text-sm">{error}</div>
        )}

        {metrics && metrics.status === 'valid' && (
          <>
            {/* Overall quality */}
            <div className="text-center pb-2">
              <div className={`text-2xl font-bold ${quality.color}`}>{quality.text}</div>
              <div className="text-xs text-slate-400">Overall Forecast Quality</div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                icon={<TrendingUp size={14} className="text-green-400" />}
                label="Hit Rate"
                value={pct(metrics.hit_rate)}
                subtext="Particles confirmed by obs"
              />
              <MetricCard
                icon={<TrendingDown size={14} className="text-red-400" />}
                label="Miss Rate"
                value={pct(metrics.miss_rate)}
                subtext="Detections not forecast"
              />
              <MetricCard
                icon={<Activity size={14} className="text-cyan-400" />}
                label="Spatial Corr"
                value={pct(metrics.spatial_correlation)}
                subtext="Grid overlap (Jaccard)"
              />
              <MetricCard
                icon={<BarChart3 size={14} className="text-amber-400" />}
                label="Mean Distance"
                value={metrics.mean_distance_km !== null ? `${metrics.mean_distance_km} km` : '—'}
                subtext="Obs → nearest forecast"
              />
            </div>

            {/* Sample sizes */}
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-700 space-y-1">
              <div>Forecast: {metrics.forecast_particles} particles · Observations: {metrics.observation_points} points</div>
              <div className="truncate" title={metrics.forecast_file}>Source: {metrics.forecast_file}</div>
            </div>
          </>
        )}

        {metrics && metrics.status === 'insufficient_data' && (
          <div className="text-center py-6 text-slate-400 text-sm">
            Insufficient data for validation.
            <br />
            Need both forecast particles and observation detections.
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subtext }: {
  icon: React.ReactNode; label: string; value: string; subtext: string;
}) {
  return (
    <div className="bg-slate-700/40 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] text-slate-500 leading-tight">{subtext}</div>
    </div>
  );
}
