import { Play, Pause, Calendar, Activity, Info } from 'lucide-react';
import { ForecastData } from '../services/forecastService';

interface TimelinePlayerProps {
  availableForecasts: ForecastData[];
  currentForecastIndex: number;
  currentForecast: ForecastData | null;
  isPlaying: boolean;
  playbackSpeed: number;
  loopEnabled: boolean;
  compareMode: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdateTime: Date | null;
  onTogglePlay: () => void;
  onSetIndex: (index: number) => void;
  onSetSpeed: (speed: number) => void;
  onSetLoop: (loop: boolean) => void;
  onSetCompare: (compare: boolean) => void;
}

export function TimelinePlayer({
  availableForecasts,
  currentForecastIndex,
  currentForecast,
  isPlaying,
  playbackSpeed,
  loopEnabled,
  compareMode,
  isLoading,
  error,
  lastUpdateTime,
  onTogglePlay,
  onSetIndex,
  onSetSpeed,
  onSetLoop,
  onSetCompare,
}: TimelinePlayerProps) {
  return (
    <div className="absolute bottom-4 right-4 left-4 sm:left-auto pointer-events-auto">
      <div
        className="rounded-xl border-2 shadow-2xl p-3 w-full sm:w-80"
        style={{
          background: 'rgba(248, 250, 252, 0.25)',
          backdropFilter: 'blur(20px)',
          borderColor: 'rgba(248, 250, 252, 0.5)',
          boxShadow: '0 8px 32px rgba(10, 15, 28, 0.3)',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center text-sm mb-3">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-xs" style={{ color: 'var(--foam-white)' }}>
              Forecast {currentForecastIndex + 1} of {availableForecasts.length}
              {compareMode && currentForecastIndex > 0 && (
                <span
                  className="ml-1 px-1 py-0.5 text-xs rounded"
                  style={{ background: 'rgba(94, 234, 212, 0.2)', color: 'var(--teal-foam)' }}
                >
                  vs {currentForecastIndex}
                </span>
              )}
            </span>
            {currentForecast && (
              <>
                <span style={{ color: 'var(--teal-foam)' }}>•</span>
                <span className="font-semibold text-xs" style={{ color: 'var(--foam-white)' }}>
                  {new Date(currentForecast.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </>
            )}
            <button
              className="p-1 rounded transition-all duration-200"
              style={{
                background: 'rgba(45, 62, 80, 0.6)',
                border: '1px solid rgba(94, 234, 212, 0.15)',
                color: 'var(--teal-foam)',
              }}
              title="Jump to Date"
            >
              <Calendar className="h-3 w-3" />
            </button>
          </div>

          {currentForecast && (
            <span
              className={`px-2 py-1 rounded-full text-xs font-bold ${
                currentForecastIndex === 0
                  ? 'confidence-high'
                  : currentForecastIndex < 3
                  ? 'confidence-medium'
                  : 'confidence-low'
              }`}
            >
              {currentForecastIndex === 0 ? 'High' : currentForecastIndex < 3 ? 'Med' : 'Low'}
            </span>
          )}
        </div>

        {/* Controls Row */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onTogglePlay}
            className="p-2 rounded-lg transition-all duration-200 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, var(--teal-mid) 0%, var(--blue-mid) 100%)',
              color: 'var(--foam-white)',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)',
            }}
            title={isPlaying ? 'Pause Animation' : 'Play Animation'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <div className="flex-1 space-y-2">
            {/* Progress Bar */}
            <div className="relative">
              <div className="w-full h-2 rounded-full" style={{ background: 'rgba(45, 62, 80, 0.6)' }} />
              <div
                className="absolute top-0 left-0 h-2 rounded-full transition-all duration-300"
                style={{
                  background: 'linear-gradient(90deg, var(--teal-surface) 0%, var(--blue-surface) 100%)',
                  width: `${((currentForecastIndex + 1) / Math.max(availableForecasts.length, 1)) * 100}%`,
                }}
              />
            </div>

            {/* Forecast Buttons */}
            <div className="flex justify-between space-x-1">
              {availableForecasts.map((forecast, index) => {
                const isRealData =
                  !forecast.isEmpty && forecast.particles.length > 0 && forecast.metadata.seed_points > 0;
                const isDemoData = forecast.metadata.seed_points <= 3;

                return (
                  <button
                    key={index}
                    onClick={() => onSetIndex(index)}
                    className={`relative w-8 h-8 rounded-lg text-xs font-bold transition-all duration-200 border-2 ${
                      index === currentForecastIndex
                        ? 'shadow-lg scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={
                      index === currentForecastIndex
                        ? {
                            background:
                              'linear-gradient(135deg, var(--teal-surface) 0%, var(--blue-surface) 100%)',
                            color: 'var(--foam-white)',
                            borderColor: 'var(--teal-surface)',
                            boxShadow: '0 4px 12px rgba(20, 184, 166, 0.25)',
                          }
                        : index < currentForecastIndex
                        ? {
                            background: 'rgba(20, 184, 166, 0.4)',
                            color: 'var(--teal-foam)',
                            borderColor: 'rgba(20, 184, 166, 0.4)',
                          }
                        : {
                            background: 'rgba(45, 62, 80, 0.6)',
                            color: 'var(--foam-white)',
                            borderColor: 'rgba(94, 234, 212, 0.2)',
                          }
                    }
                    title={`Forecast ${index + 1} - ${new Date(forecast.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}${isDemoData ? ' (Demo)' : isRealData ? ' (Live)' : ' (No Data)'}`}
                  >
                    {index + 1}
                    <div
                      className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border border-white/50 ${
                        isDemoData ? 'bg-orange-400' : isRealData ? 'bg-green-400' : 'bg-gray-400'
                      }`}
                      title={isDemoData ? 'Demo data' : isRealData ? 'Live satellite data' : 'No detections'}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Settings */}
          <div className="flex flex-col space-y-1 min-w-[70px]">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--teal-foam)' }}>
                Speed
              </label>
              <select
                value={playbackSpeed}
                onChange={(e) => onSetSpeed(parseFloat(e.target.value))}
                className="w-full px-1 py-1 text-xs rounded border-none outline-none"
                style={{
                  background: 'rgba(45, 62, 80, 0.6)',
                  border: '1px solid rgba(94, 234, 212, 0.2)',
                  color: 'var(--foam-white)',
                }}
              >
                <option value={0.5} className="bg-slate-800">0.5×</option>
                <option value={1} className="bg-slate-800">1×</option>
                <option value={2} className="bg-slate-800">2×</option>
                <option value={4} className="bg-slate-800">4×</option>
              </select>
            </div>

            <label className="flex items-center space-x-2" title="Loop playback">
              <input
                type="checkbox"
                checked={loopEnabled}
                onChange={(e) => onSetLoop(e.target.checked)}
                className="w-3 h-3 rounded text-teal-500 focus:ring-teal-400"
                style={{ background: 'rgba(45, 62, 80, 0.6)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
              />
              <span className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                Loop
              </span>
            </label>

            <label className="flex items-center space-x-2" title="Compare with previous">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => onSetCompare(e.target.checked)}
                className="w-3 h-3 rounded text-teal-500 focus:ring-teal-400"
                style={{ background: 'rgba(45, 62, 80, 0.6)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
              />
              <span className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                Compare
                {compareMode && currentForecastIndex > 0 && (
                  <span className="ml-1 opacity-75">
                    ({currentForecastIndex + 1} vs {currentForecastIndex})
                  </span>
                )}
              </span>
            </label>
          </div>
        </div>

        {/* Footer Status */}
        <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'rgba(94, 234, 212, 0.2)' }}>
          <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
            <span>Keyboard: Space (play/pause), ←/→ (prev/next day)</span>
          </div>

          {availableForecasts.length > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--teal-foam)' }}>Data sources:</span>
              <div className="flex items-center space-x-3">
                {[
                  { color: 'bg-green-400', label: 'Live' },
                  { color: 'bg-orange-400', label: 'Demo' },
                  { color: 'bg-gray-400', label: 'None' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${s.color}`} />
                    <span style={{ color: 'var(--teal-foam)' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center space-x-2 text-xs">
              <Activity className="h-3 w-3 animate-spin" style={{ color: 'var(--teal-foam)' }} />
              <span style={{ color: 'var(--teal-foam)' }}>Loading forecast data from GitHub...</span>
            </div>
          )}
          {error && !isLoading && (
            <div className="flex items-center space-x-2 text-xs">
              <Info className="h-3 w-3" style={{ color: 'var(--teal-foam)' }} />
              <span style={{ color: 'var(--teal-foam)' }} title={error}>
                {availableForecasts.length > 0 ? 'Using cached data' : 'Using demonstration data'}
              </span>
            </div>
          )}
          {!isLoading && !error && availableForecasts.length > 0 && (
            <div className="flex items-center space-x-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span style={{ color: 'var(--teal-foam)' }}>
                {availableForecasts.length} forecast{availableForecasts.length !== 1 ? 's' : ''} loaded
                {lastUpdateTime && ` • Updated ${lastUpdateTime.toLocaleTimeString()}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
