import { AlertTriangle, Info, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ForecastData } from '../services/forecastService';

interface DataQualityBannerProps {
  forecast: ForecastData | null;
  /**
   * How old a forecast must be (hours) before we surface a "stale" warning.
   * Defaults to 48h.
   */
  staleAfterHours?: number;
}

type Severity = 'warn' | 'error' | 'info';

interface BannerState {
  severity: Severity;
  title: string;
  detail: string;
}

/**
 * Shown just under the header when the current forecast is stale or
 * based on a low-quality detection source (e.g. chlor_a proxy).
 */
export function DataQualityBanner({ forecast, staleAfterHours = 48 }: DataQualityBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  const banner = useMemo<BannerState | null>(() => {
    if (!forecast) return null;
    if (forecast.isDemoData) {
      return {
        severity: 'info',
        title: 'Demo data',
        detail: 'Showing simulated forecast — real pipeline output unavailable.',
      };
    }

    const ageHours = (() => {
      const t = Date.parse(forecast.date);
      if (!Number.isFinite(t)) return 0;
      return (Date.now() - t) / 3_600_000;
    })();

    const forecastQuality = forecast.metadata?.data_quality;
    const detectionQuality = forecast.detections?.data_quality;
    const detectionSources = forecast.detections?.sources ?? [];
    const onlyProxyDetections =
      detectionSources.length > 0 &&
      detectionSources.every((s) => /chla|chlor/.test(s)) &&
      !detectionSources.some((s) => /afai|fai|mci/.test(s));

    if (ageHours > staleAfterHours) {
      return {
        severity: 'warn',
        title: `Forecast is ${Math.round(ageHours / 24)} days old`,
        detail:
          'The automated pipeline has not produced fresh output. Sargassum you ' +
          'see at the coast may not be represented — treat these particles as ' +
          'indicative only.',
      };
    }

    if (onlyProxyDetections || detectionQuality === 'low' || forecastQuality === 'low') {
      return {
        severity: 'warn',
        title: 'Low-confidence detection source',
        detail:
          'Detections are based on chlorophyll-a as a proxy, not a real AFAI/FAI ' +
          'index. Thin floating mats (windrows) can be missed and coastal ' +
          'productivity can produce false positives.',
      };
    }

    return null;
  }, [forecast, staleAfterHours]);

  if (!banner || dismissed) return null;

  const styles: Record<Severity, { bg: string; border: string; icon: JSX.Element }> = {
    error: {
      bg: 'bg-red-500/15',
      border: 'border-red-500/40',
      icon: <AlertTriangle className="h-4 w-4 text-red-300 flex-shrink-0" />,
    },
    warn: {
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
      icon: <AlertTriangle className="h-4 w-4 text-amber-300 flex-shrink-0" />,
    },
    info: {
      bg: 'bg-cyan-500/15',
      border: 'border-cyan-500/40',
      icon: <Info className="h-4 w-4 text-cyan-300 flex-shrink-0" />,
    },
  };
  const s = styles[banner.severity];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-0 right-0 z-[9998] top-12 sm:top-16 ${s.bg} ${s.border} border-b backdrop-blur-md`}
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex items-start gap-2 text-xs sm:text-sm">
        {s.icon}
        <div className="flex-1 text-slate-100">
          <span className="font-semibold">{banner.title}.</span>{' '}
          <span className="opacity-90">{banner.detail}</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 opacity-70 hover:opacity-100 text-slate-100"
          aria-label="Dismiss notice"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default DataQualityBanner;
