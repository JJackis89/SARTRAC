import { useState } from 'react';
import { X, ChevronDown, Info, Activity } from 'lucide-react';
import { ForecastData, ForecastHorizon } from '../services/forecastService';
import { forecastService } from '../services/forecastService';

interface ShowLayers {
  forecast: boolean;
  detections: boolean;
  drift: boolean;
  uncertainty: boolean;
  bathymetry: boolean;
  grid: boolean;
  coastsnap: boolean;
}

interface ControlDrawerProps {
  open: boolean;
  onClose: () => void;
  // Forecast state
  isLoading: boolean;
  error: string | null;
  currentForecast: ForecastData | null;
  availableForecastCount: number;
  lastUpdateTime: Date | null;
  autoRefreshEnabled: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
  onManualRefresh: () => Promise<void>;
  // Horizon
  selectedHorizon: ForecastHorizon;
  onHorizonChange: (horizon: ForecastHorizon) => void;
  // Layer state
  showLayers: ShowLayers;
  onLayersChange: (layers: ShowLayers) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  renderMode: 'native' | 'smooth';
  onRenderModeChange: (mode: 'native' | 'smooth') => void;
  showGridCells: boolean;
  onShowGridCellsChange: (show: boolean) => void;
  uncertaintyStyle: 'alpha' | 'contour' | 'hatching';
  onUncertaintyStyleChange: (style: 'alpha' | 'contour' | 'hatching') => void;
  driftAnimated: boolean;
  onDriftAnimatedChange: (animated: boolean) => void;
  // Base map
  baseMap: string;
  onBaseMapChange: (map: string) => void;
}

export function ControlDrawer({
  open,
  onClose,
  isLoading,
  error,
  currentForecast,
  availableForecastCount,
  lastUpdateTime,
  autoRefreshEnabled,
  onAutoRefreshChange,
  onManualRefresh,
  selectedHorizon,
  onHorizonChange,
  showLayers,
  onLayersChange,
  opacity,
  onOpacityChange,
  renderMode,
  onRenderModeChange,
  showGridCells,
  onShowGridCellsChange,
  uncertaintyStyle,
  onUncertaintyStyleChange,
  driftAnimated,
  onDriftAnimatedChange,
  baseMap,
  onBaseMapChange,
}: ControlDrawerProps) {
  const [collapsedLayers, setCollapsedLayers] = useState<Set<string>>(new Set());

  const toggleCollapse = (layer: string) => {
    setCollapsedLayers((prev) => {
      const next = new Set(prev);
      next.has(layer) ? next.delete(layer) : next.add(layer);
      return next;
    });
  };

  const updateLayer = (key: keyof ShowLayers, value: boolean) => {
    onLayersChange({ ...showLayers, [key]: value });
  };

  return (
    <div
      className={`absolute top-0 left-0 h-full z-40 transition-all duration-300 ease-in-out ${
        open ? 'w-full sm:w-80' : 'w-0'
      } overflow-hidden`}
    >
      <div
        className="h-full w-full sm:w-80 overflow-y-auto flex flex-col min-h-0"
        style={{
          background: 'rgba(36, 52, 66, 0.95)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(94, 234, 212, 0.2)',
          boxShadow: '0 8px 32px rgba(10, 15, 28, 0.3)',
        }}
      >
        {open && (
          <div className="p-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-600/30">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <h2 className="text-lg font-bold text-white">Control Center</h2>
                <div className="ml-2 px-2 py-1 text-xs font-medium bg-green-600/20 text-green-300 rounded border border-green-500/30">
                  LIVE
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-700/50 border border-gray-600/30 text-gray-300 hover:text-white hover:border-gray-500/50"
                title="Close Control Panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Forecast System Status */}
            <ForecastSystemCard
              isLoading={isLoading}
              error={error}
              currentForecast={currentForecast}
              availableForecastCount={availableForecastCount}
              lastUpdateTime={lastUpdateTime}
              autoRefreshEnabled={autoRefreshEnabled}
              showForecast={showLayers.forecast}
              onForecastToggle={(v) => updateLayer('forecast', v)}
              onAutoRefreshChange={onAutoRefreshChange}
              onManualRefresh={onManualRefresh}
              selectedHorizon={selectedHorizon}
              onHorizonChange={onHorizonChange}
            />

            {/* Data Layers */}
            <div className="rounded-xl p-4 border border-blue-500/20 bg-gradient-to-br from-blue-900/20 to-cyan-900/20 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  <h3 className="text-base font-bold text-white">Data Layers</h3>
                </div>
                <div className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                  {Object.values(showLayers).filter(Boolean).length} ACTIVE
                </div>
              </div>

              <div className="space-y-4">
                {/* Density Layer */}
                <LayerCard
                  id="density"
                  label="Sargassum Density"
                  checked={showLayers.forecast}
                  onCheckedChange={(v) => updateLayer('forecast', v)}
                  collapsed={collapsedLayers.has('density')}
                  onToggleCollapse={() => toggleCollapse('density')}
                  tooltip="Confidence decreases with time"
                >
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium mb-2 text-teal-foam">Rendering Style</label>
                      <div className="flex space-x-2">
                        {(['smooth', 'native'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => onRenderModeChange(mode)}
                            className={`btn-secondary text-xs px-3 py-1 transition-all duration-200 ${
                              renderMode === mode
                                ? 'bg-teal-surface/30 border-teal-surface text-teal-foam'
                                : 'hover:bg-teal-surface/10'
                            }`}
                          >
                            {mode === 'smooth' ? 'Smooth' : 'Native Grid'}
                          </button>
                        ))}
                      </div>
                      <div className="text-xs mt-1 text-teal-foam opacity-75">
                        {renderMode === 'smooth'
                          ? 'Continuous heatmap visualization'
                          : 'Discrete grid cells with optional outlines'}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-2 text-teal-foam">Opacity</label>
                      <div className="timeline-scrubber">
                        <div className="timeline-progress" style={{ width: `${opacity * 100}%` }} />
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={opacity}
                          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                      <div className="text-xs mt-1 text-teal-foam">{Math.round(opacity * 100)}%</div>
                    </div>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={showGridCells}
                        onChange={(e) => onShowGridCellsChange(e.target.checked)}
                        className="w-3 h-3 rounded"
                      />
                      <span className="text-xs text-teal-foam">Show grid cells</span>
                    </label>

                    <div className="text-xs text-teal-foam space-y-1">
                      <div>Units: % coverage</div>
                      <div>Resolution: 1 km</div>
                      <div>Update: every 6 hours</div>
                    </div>
                  </div>
                </LayerCard>

                {/* Detection Points */}
                <LayerCard
                  id="detections"
                  label="Satellite Detections"
                  checked={showLayers.detections}
                  onCheckedChange={(v) => updateLayer('detections', v)}
                  collapsed={collapsedLayers.has('detections')}
                  onToggleCollapse={() => toggleCollapse('detections')}
                  tooltip="Raw satellite detection points"
                >
                  <div className="text-xs text-teal-foam space-y-1">
                    <div>Source: Sentinel-3 OLCI chlor-a</div>
                    <div>Shows where satellites detected Sargassum</div>
                    <div>Yellow dots = detection locations</div>
                  </div>
                </LayerCard>

                {/* Drift Layer */}
                <LayerCard
                  id="drift"
                  label="Drift Vectors"
                  checked={showLayers.drift}
                  onCheckedChange={(v) => updateLayer('drift', v)}
                  collapsed={collapsedLayers.has('drift')}
                  onToggleCollapse={() => toggleCollapse('drift')}
                  tooltip="Ocean current predictions"
                >
                  <div className="space-y-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={driftAnimated}
                        onChange={(e) => onDriftAnimatedChange(e.target.checked)}
                        className="w-3 h-3 rounded"
                      />
                      <span className="text-xs text-teal-foam">Animate vectors</span>
                    </label>
                    <div className="text-xs text-teal-foam space-y-1">
                      <div>Source: Ocean models</div>
                      <div>Units: cm/s</div>
                      <div>Calm seas easing</div>
                    </div>
                  </div>
                </LayerCard>

                {/* Uncertainty Layer */}
                <LayerCard
                  id="uncertainty"
                  label="Uncertainty"
                  checked={showLayers.uncertainty}
                  onCheckedChange={(v) => updateLayer('uncertainty', v)}
                  collapsed={collapsedLayers.has('uncertainty')}
                  onToggleCollapse={() => toggleCollapse('uncertainty')}
                  tooltip="Confidence decreases with time"
                >
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium mb-2 text-teal-foam">Display Style</label>
                      <div className="space-y-1">
                        {(['alpha', 'contour', 'hatching'] as const).map((style) => (
                          <label key={style} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="uncertaintyStyle"
                              value={style}
                              checked={uncertaintyStyle === style}
                              onChange={() => onUncertaintyStyleChange(style)}
                              className="w-3 h-3"
                            />
                            <span className="text-xs text-teal-foam capitalize">
                              {style === 'alpha' ? 'Alpha haze' : style === 'contour' ? 'Contour bands' : 'Hatching'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-teal-foam space-y-1">
                      <div>Confidence decreases with time</div>
                      <div>Day 1-3: Low uncertainty</div>
                      <div>Day 4-7: Medium-High uncertainty</div>
                    </div>
                  </div>
                </LayerCard>

                {/* Bathymetry */}
                <LayerCard
                  id="bathymetry"
                  label="Bathymetry"
                  checked={showLayers.bathymetry}
                  onCheckedChange={(v) => updateLayer('bathymetry', v)}
                  collapsed={collapsedLayers.has('bathymetry')}
                  onToggleCollapse={() => toggleCollapse('bathymetry')}
                  tooltip="Ocean depth contours"
                >
                  <div className="text-xs text-teal-foam space-y-1">
                    <div>100m, 200m, 500m, 1000m contours</div>
                    <div>Teal-gray shaded relief</div>
                    <div>Source: GEBCO bathymetry</div>
                  </div>
                </LayerCard>

                {/* Grid */}
                <LayerCard
                  id="grid"
                  label="Lat/Long Grid"
                  checked={showLayers.grid}
                  onCheckedChange={(v) => updateLayer('grid', v)}
                  collapsed={collapsedLayers.has('grid')}
                  onToggleCollapse={() => toggleCollapse('grid')}
                  tooltip="Coordinate reference grid"
                >
                  <div className="text-xs text-teal-foam space-y-1">
                    <div>Reduced brightness grid lines</div>
                    <div>Major: 1° intervals</div>
                    <div>Minor: 0.5° intervals</div>
                  </div>
                </LayerCard>

                {/* CoastSnap */}
                <LayerCard
                  id="coastsnap"
                  label="CoastSnap Points"
                  checked={showLayers.coastsnap}
                  onCheckedChange={(v) => updateLayer('coastsnap', v)}
                  collapsed={collapsedLayers.has('coastsnap')}
                  onToggleCollapse={() => toggleCollapse('coastsnap')}
                  tooltip="Coastal monitoring points"
                >
                  <div className="text-xs text-teal-foam space-y-1">
                    <div>Coastal monitoring stations</div>
                    <div>7 active monitoring points</div>
                    <div>Ghana coastline coverage</div>
                  </div>
                </LayerCard>
              </div>
            </div>

            {/* Legend */}
            <LegendSection />

            {/* Map Style */}
            <div className="space-y-4">
              <div
                className="sticky top-0 z-10 p-3 rounded-lg"
                style={{
                  background: 'rgba(45, 62, 80, 0.8)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(94, 234, 212, 0.2)',
                }}
              >
                <h3 className="text-sm font-bold" style={{ color: 'var(--foam-white)' }}>
                  Map Style
                </h3>
              </div>
              <div className="px-3">
                <select
                  value={baseMap}
                  onChange={(e) => onBaseMapChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border-none outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(45, 62, 80, 0.8)',
                    border: '1px solid rgba(94, 234, 212, 0.2)',
                    color: 'var(--foam-white)',
                  }}
                >
                  <option value="satellite" className="bg-slate-800">Satellite Imagery</option>
                  <option value="terrain" className="bg-slate-800">Bathymetric Terrain</option>
                  <option value="minimal" className="bg-slate-800">Minimal Navigation</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function ForecastSystemCard({
  isLoading,
  error,
  currentForecast,
  availableForecastCount,
  lastUpdateTime,
  autoRefreshEnabled,
  showForecast,
  onForecastToggle,
  onAutoRefreshChange,
  onManualRefresh,
  selectedHorizon,
  onHorizonChange,
}: {
  isLoading: boolean;
  error: string | null;
  currentForecast: ForecastData | null;
  availableForecastCount: number;
  lastUpdateTime: Date | null;
  autoRefreshEnabled: boolean;
  showForecast: boolean;
  onForecastToggle: (v: boolean) => void;
  onAutoRefreshChange: (v: boolean) => void;
  onManualRefresh: () => Promise<void>;
  selectedHorizon: ForecastHorizon;
  onHorizonChange: (h: ForecastHorizon) => void;
}) {
  const qualityColor = (q?: string) => {
    switch (q) {
      case 'high': return 'text-green-400';
      case 'medium': return 'text-yellow-400';
      default: return 'text-orange-400';
    }
  };
  const qualityLabel = (q?: string) => {
    switch (q) {
      case 'high': return 'High — real currents + winds';
      case 'medium': return 'Medium — real currents only';
      default: return 'Low — using fallback data';
    }
  };
  return (
    <div className="rounded-xl p-4 border border-green-500/20 bg-gradient-to-br from-green-900/20 to-blue-900/20 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isLoading ? 'bg-orange-400 animate-spin' : error ? 'bg-red-400 animate-pulse' : 'bg-green-400 animate-pulse'
            }`}
          />
          <h3 className="text-base font-bold text-white">Live Forecast System</h3>
        </div>
        <div className="flex items-center space-x-2">
          <div className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-300 rounded-full border border-green-500/30">
            {availableForecastCount} FORECAST{availableForecastCount !== 1 ? 'S' : ''}
          </div>
          <button
            onClick={onManualRefresh}
            className="p-1 rounded transition-all duration-200 hover:bg-green-500/20"
            title="Refresh forecast data"
            disabled={isLoading}
          >
            <Activity className={`h-4 w-4 text-green-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 backdrop-blur-sm rounded-lg border border-blue-500/30">
            <Activity className="h-8 w-8 mx-auto mb-2 text-blue-400 animate-spin" />
            <p className="text-white text-sm font-medium">Loading Forecasts</p>
            <p className="text-blue-300 text-xs mt-1">Fetching data from GitHub releases...</p>
          </div>
        ) : availableForecastCount > 0 ? (
          <div className="bg-gradient-to-r from-gray-800/40 to-gray-700/40 backdrop-blur-sm rounded-lg p-3 border border-gray-600/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">Current Forecast</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showForecast}
                  onChange={(e) => onForecastToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500" />
              </label>
            </div>
            <div className="space-y-1 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-medium">{currentForecast?.date || 'None selected'}</span>
              </div>
              <div className="flex justify-between">
                <span>Particles:</span>
                <span className="font-medium">{currentForecast?.particles.length || 0}</span>
              </div>
              {currentForecast?.metadata && (
                <>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="font-medium">{currentForecast.metadata.forecast_hours}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span
                      className={`font-medium ${
                        currentForecast.isDemoData
                          ? 'text-blue-400'
                          : currentForecast.isEmpty
                          ? 'text-orange-400'
                          : 'text-green-400'
                      }`}
                    >
                      {currentForecast.isDemoData ? 'Demo Mode' : currentForecast.isEmpty ? 'No Detection' : 'Active'}
                    </span>
                  </div>
                  {currentForecast.metadata.data_quality && (
                    <div className="flex justify-between">
                      <span>Data Quality:</span>
                      <span className={`font-medium ${qualityColor(currentForecast.metadata.data_quality)}`}>
                        {currentForecast.metadata.data_quality === 'high' ? '●●●' :
                         currentForecast.metadata.data_quality === 'medium' ? '●●○' : '●○○'}
                        {' '}{(currentForecast.metadata.data_quality ?? 'low').toUpperCase()}
                      </span>
                    </div>
                  )}
                </>
              )}
              {lastUpdateTime && (
                <div className="flex justify-between">
                  <span>Updated:</span>
                  <span className="font-medium">{lastUpdateTime.toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            {/* Forecast Horizon Selector */}
            <div className="mt-3 pt-2 border-t border-gray-600/30">
              <label className="block text-xs font-medium text-gray-300 mb-2">Forecast Horizon</label>
              <div className="flex space-x-1">
                {(['3d', '5d', '7d'] as ForecastHorizon[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => onHorizonChange(h)}
                    className={`flex-1 text-xs px-2 py-1.5 rounded-md font-medium transition-all duration-200 ${
                      selectedHorizon === h
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 hover:text-gray-200'
                    }`}
                  >
                    {h === '3d' ? '3 Day' : h === '5d' ? '5 Day' : '7 Day'}
                  </button>
                ))}
              </div>
            </div>

            {/* Data Quality Details */}
            {currentForecast?.metadata.data_sources && currentForecast.metadata.data_sources.length > 0 && (
              <div className="mt-2 p-2 rounded-md bg-gray-800/40 border border-gray-700/40">
                <div className="text-xs text-gray-400 mb-1 font-medium">Data Sources</div>
                <div className="text-xs text-gray-300 space-y-0.5">
                  <div className="flex items-center space-x-1.5">
                    <span className={currentForecast.metadata.has_real_currents ? 'text-green-400' : 'text-orange-400'}>
                      {currentForecast.metadata.has_real_currents ? '✓' : '⚠'}
                    </span>
                    <span>Currents: {currentForecast.metadata.has_real_currents ? 'HYCOM ocean model' : 'Constant fallback'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={currentForecast.metadata.has_real_winds ? 'text-green-400' : 'text-orange-400'}>
                      {currentForecast.metadata.has_real_winds ? '✓' : '⚠'}
                    </span>
                    <span>Winds: {currentForecast.metadata.has_real_winds ? 'GFS forecast' : 'Constant fallback'}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1" title={qualityLabel(currentForecast.metadata.data_quality)}>
                  {qualityLabel(currentForecast.metadata.data_quality)}
                </div>
              </div>
            )}

            <div className="mt-3 pt-2 border-t border-gray-600/30">
              <label className="flex items-center justify-between text-xs">
                <span className="text-gray-300">Auto-refresh every 30min</span>
                <input
                  type="checkbox"
                  checked={autoRefreshEnabled}
                  onChange={(e) => {
                    onAutoRefreshChange(e.target.checked);
                    if (e.target.checked) {
                      forecastService.startAutoRefresh();
                    } else {
                      forecastService.stopAutoRefresh();
                    }
                  }}
                  className="w-3 h-3 rounded text-green-500"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 bg-gradient-to-r from-orange-900/30 to-red-900/30 backdrop-blur-sm rounded-lg border border-orange-500/30">
            <Activity className="h-8 w-8 mx-auto mb-2 text-orange-400" />
            <p className="text-white text-sm font-medium">
              {error ? 'Connection Error' : 'No Forecasts Available'}
            </p>
            <p className="text-orange-300 text-xs mt-1">
              {error ? 'Using demonstration data' : 'System runs daily at 06:00 UTC'}
            </p>
            {error && (
              <button
                onClick={() => window.location.reload()}
                className="mt-2 px-3 py-1 text-xs bg-orange-500/20 text-orange-300 rounded border border-orange-500/30 hover:bg-orange-500/30 transition-all duration-200"
              >
                Retry Connection
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LayerCard({
  id: _id,
  label,
  checked,
  onCheckedChange,
  collapsed,
  onToggleCollapse,
  tooltip,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`layer-card ${collapsed ? 'collapsed' : ''}`}>
      <div className="layer-header" onClick={onToggleCollapse}>
        <label className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
            style={{ background: 'rgba(17, 75, 87, 0.8)', borderColor: 'rgba(14, 165, 163, 0.2)' }}
          />
          <span className="text-sm font-medium text-white">{label}</span>
        </label>
        <div className="flex items-center space-x-2">
          <button
            className="p-1 rounded hover:bg-teal-surface/10"
            style={{ color: 'var(--teal-foam)' }}
            title={tooltip}
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="h-4 w-4" />
          </button>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            style={{ color: 'var(--teal-foam)' }}
          />
        </div>
      </div>
      <div className="layer-content">{children}</div>
    </div>
  );
}

function LegendSection() {
  return (
    <div className="space-y-4">
      <div
        className="sticky top-0 z-10 p-3 rounded-lg"
        style={{
          background: 'rgba(45, 62, 80, 0.8)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(94, 234, 212, 0.2)',
        }}
      >
        <h3 className="text-sm font-bold" style={{ color: 'var(--foam-white)' }}>
          Legend
        </h3>
      </div>
      <div className="px-3">
        <div
          className="p-4 rounded-lg"
          style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)' }}
        >
          <div className="text-xs mb-3" style={{ color: 'var(--teal-foam)' }}>
            Sargassum Density (% Coverage)
          </div>
          <div className="relative">
            <div className="w-full h-4 rounded-full bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500" />
            <div className="flex justify-between text-xs mt-2" style={{ color: 'var(--teal-foam)' }}>
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="mt-4 text-xs space-y-1" style={{ color: 'var(--teal-foam)' }}>
            <div>Resolution: 1km grid</div>
            <div>Confidence: Decreases with time</div>
            <div>Last model run: 18:00 UTC</div>
          </div>
          <div className="mt-4">
            <div className="text-xs mb-2" style={{ color: 'var(--teal-foam)' }}>
              Current Coverage Distribution
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {[
                { color: 'bg-blue-400', pct: '25%' },
                { color: 'bg-green-400', pct: '35%' },
                { color: 'bg-yellow-400', pct: '28%' },
                { color: 'bg-red-400', pct: '12%' },
              ].map((item) => (
                <div key={item.pct} className="flex items-center space-x-1">
                  <div className={`w-3 h-2 ${item.color} rounded-sm`} />
                  <span style={{ color: 'var(--foam-white)' }}>{item.pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
