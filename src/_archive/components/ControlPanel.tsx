import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Map } from 'lucide-react';

interface LayerSettings {
  density: boolean;
  drift: boolean;
  uncertainty: boolean;
}

interface ControlPanelProps {
  forecastDays: number;
  onForecastDaysChange: (days: number) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  showLayers: LayerSettings;
  onLayersChange: (layers: LayerSettings) => void;
  baseMap: string;
  onBaseMapChange: (map: string) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  forecastDays,
  onForecastDaysChange,
  opacity,
  onOpacityChange,
  showLayers,
  onLayersChange,
  baseMap,
  onBaseMapChange
}) => {
  const [collapsed, setCollapsed] = useState({
    forecast: false,
    layers: false,
    basemap: false
  });

  const toggleSection = (section: keyof typeof collapsed) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-6 text-white">
      {/* Enhanced Forecast Period Section */}
      <div className="space-y-4">
        <button
          onClick={() => toggleSection('forecast')}
          className="flex items-center justify-between w-full text-left group p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-300"
        >
          <span className="text-sm font-bold text-white flex items-center space-x-3">
            <Layers className="h-4 w-4 text-cyan-300" />
            <span>Forecast Range</span>
          </span>
          {collapsed.forecast ? 
            <ChevronDown className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" /> : 
            <ChevronUp className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" />
          }
        </button>
        
        {!collapsed.forecast && (
          <div className="pl-4 space-y-3">
            <div className="relative">
              <select
                value={forecastDays}
                onChange={(e) => onForecastDaysChange(parseInt(e.target.value))}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white font-medium 
                          focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 focus:outline-none
                          transition-all duration-300 hover:bg-white/15 appearance-none cursor-pointer"
              >
                <option value={3} className="bg-slate-800 text-white">3 Days (High Confidence)</option>
                <option value={5} className="bg-slate-800 text-white">5 Days (Medium Confidence)</option>
                <option value={7} className="bg-slate-800 text-white">7 Days (Lower Confidence)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-cyan-300 pointer-events-none" />
            </div>
            <p className="text-xs text-cyan-300 pl-1">Accuracy decreases with longer forecasts</p>
          </div>
        )}
      </div>

      {/* Enhanced Data Layers Section */}
      <div className="space-y-4">
        <button
          onClick={() => toggleSection('layers')}
          className="flex items-center justify-between w-full text-left group p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-300"
        >
          <span className="text-sm font-bold text-white flex items-center space-x-3">
            <Layers className="h-4 w-4 text-cyan-300" />
            <span>Data Layers</span>
          </span>
          {collapsed.layers ? 
            <ChevronDown className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" /> : 
            <ChevronUp className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" />
          }
        </button>
        
        {!collapsed.layers && (
          <div className="space-y-3">
            {/* Sargassum Density Toggle */}
            <label className="group flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl cursor-pointer transition-all duration-300">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showLayers.density}
                    onChange={(e) => onLayersChange({
                      ...showLayers,
                      density: e.target.checked
                    })}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 transition-all duration-300 flex items-center justify-center ${
                    showLayers.density 
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 border-cyan-400' 
                      : 'border-white/30 group-hover:border-white/50'
                  }`}>
                    {showLayers.density && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-white">Sargassum Density</span>
              </div>
              <span className="px-3 py-1 bg-green-500/80 text-green-100 text-xs font-bold rounded-full border border-green-400/30">
                Primary
              </span>
            </label>
            
            {/* Current Vectors Toggle */}
            <label className="group flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl cursor-pointer transition-all duration-300">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showLayers.drift}
                    onChange={(e) => onLayersChange({
                      ...showLayers,
                      drift: e.target.checked
                    })}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 transition-all duration-300 flex items-center justify-center ${
                    showLayers.drift 
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 border-cyan-400' 
                      : 'border-white/30 group-hover:border-white/50'
                  }`}>
                    {showLayers.drift && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-white">Current Vectors</span>
              </div>
              <span className="px-3 py-1 bg-yellow-500/80 text-yellow-100 text-xs font-bold rounded-full border border-yellow-400/30">
                Beta
              </span>
            </label>
            
            {/* Uncertainty Toggle */}
            <label className="group flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl cursor-pointer transition-all duration-300">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showLayers.uncertainty}
                    onChange={(e) => onLayersChange({
                      ...showLayers,
                      uncertainty: e.target.checked
                    })}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 transition-all duration-300 flex items-center justify-center ${
                    showLayers.uncertainty 
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 border-cyan-400' 
                      : 'border-white/30 group-hover:border-white/50'
                  }`}>
                    {showLayers.uncertainty && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-white">Uncertainty Map</span>
              </div>
              <span className="px-3 py-1 bg-blue-500/80 text-blue-100 text-xs font-bold rounded-full border border-blue-400/30">
                Expert
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Enhanced Opacity Control */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-white">
            Layer Opacity
          </label>
          <span className="text-sm font-bold text-white bg-white/10 px-3 py-1 rounded-lg border border-white/20">
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className="w-full h-3 bg-white/10 rounded-lg appearance-none cursor-pointer border border-white/20
                      focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all duration-300"
            style={{
              background: `linear-gradient(to right, 
                rgb(255 255 255 / 0.1) 0%, 
                rgb(34 211 238 / 0.8) ${opacity * 100}%, 
                rgb(255 255 255 / 0.1) ${opacity * 100}%)`
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-cyan-300 font-medium">
          <span>Transparent</span>
          <span>Opaque</span>
        </div>
      </div>

      {/* Enhanced Base Map Section */}
      <div className="space-y-4">
        <button
          onClick={() => toggleSection('basemap')}
          className="flex items-center justify-between w-full text-left group p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-300"
        >
          <span className="text-sm font-bold text-white flex items-center space-x-3">
            <Map className="h-4 w-4 text-cyan-300" />
            <span>Base Map Style</span>
          </span>
          {collapsed.basemap ? 
            <ChevronDown className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" /> : 
            <ChevronUp className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" />
          }
        </button>
        
        {!collapsed.basemap && (
          <div className="grid grid-cols-1 gap-3">
            {[
              { key: 'satellite', label: 'Satellite Imagery', desc: 'High-resolution satellite view' },
              { key: 'terrain', label: 'Topographic Map', desc: 'Terrain and bathymetry details' },
              { key: 'minimal', label: 'Minimal Vector', desc: 'Clean cartographic style' }
            ].map((map) => (
              <button
                key={map.key}
                onClick={() => onBaseMapChange(map.key)}
                className={`group p-4 text-left rounded-xl border transition-all duration-300 ${
                  baseMap === map.key
                    ? 'border-cyan-400 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-white shadow-lg shadow-cyan-500/20'
                    : 'border-white/20 bg-white/5 text-cyan-100 hover:bg-white/10 hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm mb-1">{map.label}</div>
                    <div className="text-xs text-cyan-300">{map.desc}</div>
                  </div>
                  {baseMap === map.key && (
                    <div className="w-3 h-3 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full shadow-lg"></div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;