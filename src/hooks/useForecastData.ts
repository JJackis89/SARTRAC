import { useState, useEffect, useCallback } from 'react';
import { forecastService, ForecastData, LoadingState } from '../services/forecastService';

export interface ForecastDataState {
  availableForecasts: ForecastData[];
  currentForecastIndex: number;
  currentForecast: ForecastData | null;
  isLoading: boolean;
  error: string | null;
  lastUpdateTime: Date | null;
  nextUpdateTime: Date | null;
  autoRefreshEnabled: boolean;
}

export interface ForecastDataActions {
  setCurrentForecastIndex: (index: number | ((prev: number) => number)) => void;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  handleManualRefresh: () => Promise<void>;
}

export function useForecastData(): ForecastDataState & ForecastDataActions {
  const [availableForecasts, setAvailableForecasts] = useState<ForecastData[]>([]);
  const [currentForecastIndex, setCurrentForecastIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [nextUpdateTime] = useState<Date | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Load forecasts from GitHub releases
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const initialize = async () => {
      unsubscribe = forecastService.onLoadingStateChange((state: LoadingState) => {
        setIsLoading(state.isLoading);
        setError(state.error);
        setLastUpdateTime(state.lastUpdated);
      });

      if (autoRefreshEnabled) {
        forecastService.startAutoRefresh();
      }

      await loadForecasts();
    };

    const loadForecasts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const latestForecast = await forecastService.getLatestForecast();
        if (latestForecast) {
          setAvailableForecasts([latestForecast]);
          setLastUpdateTime(new Date());
          loadHistorical();
        } else {
          setError('No forecast data available. Check GitHub releases or try again later.');
          setAvailableForecasts([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load forecast data');
        setAvailableForecasts([]);
      } finally {
        setIsLoading(false);
      }
    };

    const loadHistorical = async () => {
      try {
        const dates = await forecastService.getAvailableForecastDates();
        const forecasts: ForecastData[] = [];

        for (const date of dates.slice(0, 7)) {
          try {
            const forecast = await forecastService.getForecastForDate(date);
            if (forecast && !forecasts.some(f => f.date === forecast.date)) {
              forecasts.push(forecast);
            }
          } catch {
            // Skip failed individual forecasts
          }
        }

        forecasts.sort((a, b) => b.date.localeCompare(a.date));
        setAvailableForecasts(forecasts);
      } catch {
        // Keep whatever we already loaded
      }
    };

    initialize();

    return () => {
      unsubscribe?.();
      forecastService.stopAutoRefresh();
    };
  }, [autoRefreshEnabled]);

  const handleManualRefresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      forecastService.clearCache();
      const latestForecast = await forecastService.getLatestForecast();

      if (latestForecast) {
        const dates = await forecastService.getAvailableForecastDates();
        const forecasts: ForecastData[] = [];

        for (const date of dates.slice(0, 7)) {
          try {
            const forecast = await forecastService.getForecastForDate(date);
            if (forecast) forecasts.push(forecast);
          } catch {
            // Skip
          }
        }

        forecasts.sort((a, b) => b.date.localeCompare(a.date));
        setAvailableForecasts(forecasts);
        setLastUpdateTime(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const currentForecast = availableForecasts[currentForecastIndex] || null;

  return {
    availableForecasts,
    currentForecastIndex,
    currentForecast,
    isLoading,
    error,
    lastUpdateTime,
    nextUpdateTime,
    autoRefreshEnabled,
    setCurrentForecastIndex,
    setAutoRefreshEnabled,
    handleManualRefresh,
  };
}
