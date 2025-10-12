import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Activity, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { ForecastData, forecastService } from '../services/forecastService';

interface ForecastControlsProps {
  onForecastChange: (forecast: ForecastData | null) => void;
  visible: boolean;
  onVisibilityChange: (visible: boolean) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}

export const ForecastControls: React.FC<ForecastControlsProps> = ({
  onForecastChange,
  visible,
  onVisibilityChange,
  opacity,
  onOpacityChange
}) => {
  const [loading, setLoading] = useState(false);
  const [currentForecast, setCurrentForecast] = useState<ForecastData | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Load initial forecast and available dates
  useEffect(() => {
    loadLatestForecast();
    loadAvailableDates();
  }, []);

  const loadLatestForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const forecast = await forecastService.getLatestForecast();
      setCurrentForecast(forecast);
      onForecastChange(forecast);
      if (forecast) {
        setSelectedDate(forecast.date);
      }
    } catch (err) {
      // Handle the case where no releases exist yet
      if (err instanceof Error && err.message.includes('No releases found')) {
        setError('No automated forecasts available yet. The system runs daily at 06:00 UTC.');
      } else {
        setError('Failed to load latest forecast');
      }
      console.error('Error loading forecast:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableDates = async () => {
    try {
      const dates = await forecastService.getAvailableForecastDates();
      setAvailableDates(dates);
    } catch (err) {
      console.error('Error loading available dates:', err);
    }
  };

  const loadForecastForDate = async (date: string) => {
    if (!date) return;
    
    setLoading(true);
    setError(null);
    try {
      const forecast = await forecastService.getForecastForDate(date);
      setCurrentForecast(forecast);
      onForecastChange(forecast);
      setSelectedDate(date);
    } catch (err) {
      setError(`Failed to load forecast for ${date}`);
      console.error('Error loading forecast for date:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const getStatusIcon = () => {
    if (loading) return <RefreshCw className="h-4 w-4 animate-spin" />;
    if (error) return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (currentForecast) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <Activity className="h-4 w-4 text-gray-400" />;
  };

  const getStatusText = () => {
    if (loading) return 'Loading...';
    if (error) return error;
    if (currentForecast?.isEmpty) return 'No Sargassum detected';
    if (currentForecast) return `${currentForecast.particles.length} particles forecast`;
    return 'No forecast loaded';
  };

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className="bg-gradient-to-r from-gray-800/40 to-gray-700/40 backdrop-blur-sm rounded-lg p-4 border border-gray-600/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span className="text-sm font-medium text-white">System Status</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => onVisibilityChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
          </label>
        </div>
        <p className="text-sm text-gray-300">{getStatusText()}</p>
      </div>

      {/* Forecast Controls */}
      <div className="space-y-3">
        {/* Date Selection */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            <Calendar className="h-4 w-4 inline mr-2" />
            Forecast Date
          </label>
          <div className="flex gap-2">
            <select
              value={selectedDate}
              onChange={(e) => loadForecastForDate(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-400 text-sm text-white"
              disabled={loading}
            >
              <option value="">Select date...</option>
              {availableDates.map(date => (
                <option key={date} value={date} className="bg-gray-800">
                  {date} {date === availableDates[0] ? '(Latest)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={loadLatestForecast}
              disabled={loading}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 border border-green-500/50"
              title="Refresh latest forecast"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Opacity Control */}
        {visible && (
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Opacity: {Math.round(opacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider accent-green-500"
            />
          </div>
        )}
      </div>

      {/* Forecast Metadata */}
      {currentForecast && !currentForecast.isEmpty && (
        <div className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 backdrop-blur-sm rounded-lg p-4 border border-blue-500/30">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400"></div>
            <span className="text-sm font-medium text-blue-300">Forecast Details</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center text-gray-300">
                <Clock className="h-3 w-3 mr-1 text-blue-400" />
                <span className="text-xs">Generated</span>
              </div>
              <p className="text-white text-xs font-mono">{formatDateTime(currentForecast.metadata.generation_time)}</p>
            </div>
            <div className="space-y-2">
              <div className="text-gray-300 text-xs">Duration</div>
              <p className="text-white font-medium">{currentForecast.metadata.forecast_hours}h</p>
            </div>
            <div className="space-y-2">
              <div className="text-gray-300 text-xs">Particles</div>
              <p className="text-white font-medium">{currentForecast.particles.length}</p>
            </div>
            <div className="space-y-2">
              <div className="text-gray-300 text-xs">Windage</div>
              <p className="text-white font-medium">{(currentForecast.metadata.windage * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Empty Forecast Message */}
      {currentForecast?.isEmpty && (
        <div className="text-center py-6 bg-gradient-to-r from-green-900/30 to-blue-900/30 backdrop-blur-sm rounded-lg border border-green-500/30">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
          <p className="text-white font-medium">No Sargassum Detected</p>
          <p className="text-green-300 text-sm mt-1">Coast is clear! 🌊</p>
        </div>
      )}

      {/* No Forecasts Available Yet */}
      {!currentForecast && !loading && error && (
        <div className="text-center py-6 bg-gradient-to-r from-orange-900/30 to-red-900/30 backdrop-blur-sm rounded-lg border border-orange-500/30">
          <Activity className="h-12 w-12 mx-auto mb-3 text-orange-400" />
          <p className="text-white font-medium mb-3">Automated Forecasts Coming Soon</p>
          <div className="text-left space-y-2 mb-4">
            <p className="text-orange-200 text-sm">
              System runs daily at <span className="font-mono font-bold">06:00 UTC</span>
            </p>
            <div className="space-y-1 text-xs text-gray-300">
              <div className="flex items-center space-x-2">
                <div className="w-1 h-1 rounded-full bg-orange-400"></div>
                <span>Multi-satellite Sargassum detection</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1 h-1 rounded-full bg-orange-400"></div>
                <span>OpenDrift physics-based modeling</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1 h-1 rounded-full bg-orange-400"></div>
                <span>Real NOAA ocean currents & winds</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1 h-1 rounded-full bg-orange-400"></div>
                <span>72-hour drift predictions</span>
              </div>
            </div>
          </div>
          <div className="px-3 py-2 bg-orange-500/20 rounded-lg border border-orange-500/40 mb-4">
            <p className="text-orange-300 text-xs font-medium">
              Next forecast: Tomorrow at 06:00 UTC
            </p>
          </div>
          
          {/* Manual Trigger Button */}
          <div className="pt-3 border-t border-gray-600/30">
            <p className="text-gray-400 text-xs mb-2">For testing purposes:</p>
            <button
              onClick={() => window.open('https://github.com/JJackis89/SARTRAC/actions/workflows/daily_forecast.yml', '_blank')}
              className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 border border-blue-500/50"
            >
              🚀 Trigger Manual Forecast
            </button>
          </div>
        </div>
      )}
    </div>
  );
};