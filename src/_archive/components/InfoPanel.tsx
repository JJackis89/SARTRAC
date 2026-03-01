import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, TrendingUp, AlertTriangle } from 'lucide-react';

interface ForecastData {
  date: string;
  concentration: number[][];
  driftDirection: number[][];
  uncertainty: 'Low' | 'Medium' | 'High';
}

interface InfoPanelProps {
  lastUpdated: string;
  currentForecast?: ForecastData;
  currentDay: number;
}

const InfoPanel: React.FC<InfoPanelProps> = ({
  lastUpdated,
  currentForecast,
  currentDay
}) => {
  const [collapsed, setCollapsed] = useState({
    metadata: false,
    statistics: false,
    impact: false
  });

  const toggleSection = (section: keyof typeof collapsed) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const getConfidenceBadge = (uncertainty: string) => {
    const badges = {
      Low: { className: 'bg-green-500/80 text-green-100 border-green-400/30', icon: '✓', color: 'green' },
      Medium: { className: 'bg-yellow-500/80 text-yellow-100 border-yellow-400/30', icon: '⚠', color: 'yellow' },
      High: { className: 'bg-red-500/80 text-red-100 border-red-400/30', icon: '✕', color: 'red' }
    };
    
    return badges[uncertainty as keyof typeof badges] || badges.High;
  };

  return (
    <div className="space-y-6 text-white">

      {/* Prominent Current Forecast Card */}
      {currentForecast && (
        <div className="bg-gradient-to-br from-blue-600/30 to-cyan-600/30 border-2 border-cyan-400/50 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <TrendingUp className="h-5 w-5 text-cyan-300" />
              <span className="text-lg font-bold text-white">
                Day {currentDay} Forecast
              </span>
            </div>
            {(() => {
              const badge = getConfidenceBadge(currentForecast.uncertainty);
              return (
                <span className={`px-4 py-2 rounded-xl text-sm font-bold border shadow-lg ${badge.className}`}>
                  {badge.icon} {currentForecast.uncertainty} Confidence
                </span>
              );
            })()}
          </div>
          
          <div className="space-y-2">
            <div className="text-lg font-semibold text-cyan-100">
              {new Date(currentForecast.date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
            </div>
            <div className="text-sm text-cyan-200">
              Generated from satellite data and oceanographic models
            </div>
          </div>
        </div>
      )}

      {/* Prominent System Metadata */}
      <div className="space-y-4">
        <button
          onClick={() => toggleSection('metadata')}
          className="flex items-center justify-between w-full text-left group p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300"
        >
          <span className="text-sm font-bold text-white flex items-center space-x-3">
            <AlertTriangle className="h-4 w-4 text-cyan-300" />
            <span>Data Sources & Timing</span>
          </span>
          {collapsed.metadata ? 
            <ChevronDown className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" /> : 
            <ChevronUp className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" />
          }
        </button>
        
        {!collapsed.metadata && (
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-cyan-200">Last Updated</span>
                <span className="text-sm font-bold text-white">
                  {formatDate(lastUpdated)}
                </span>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-cyan-200">Data Source</span>
                <span className="text-sm font-bold text-white">
                  Satellite + Ocean Models
                </span>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-cyan-200">Grid Resolution</span>
                <span className="text-sm font-bold text-white">
                  1km spacing
                </span>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-cyan-200">Next Update</span>
                <span className="text-sm font-bold text-white">
                  {new Date(Date.now() + 6 * 60 * 60 * 1000).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Coverage Statistics with Color Swatches */}
      <div className="space-y-4">
        <button
          onClick={() => toggleSection('statistics')}
          className="flex items-center justify-between w-full text-left group p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300"
        >
          <span className="text-sm font-bold text-white flex items-center space-x-3">
            <BarChart3 className="h-4 w-4 text-cyan-300" />
            <span>Current Coverage Analysis</span>
          </span>
          {collapsed.statistics ? 
            <ChevronDown className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" /> : 
            <ChevronUp className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" />
          }
        </button>
        
        {!collapsed.statistics && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-400/30 rounded-xl p-4 hover:from-red-500/30 hover:to-red-600/30 transition-all duration-300">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-4 h-4 bg-gradient-to-r from-red-400 to-red-500 rounded-full shadow-lg"></div>
                <div className="text-lg font-bold text-red-300">12%</div>
              </div>
              <div className="text-xs font-medium text-red-200">High Density</div>
            </div>
            
            <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border border-yellow-400/30 rounded-xl p-4 hover:from-yellow-500/30 hover:to-yellow-600/30 transition-all duration-300">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-4 h-4 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full shadow-lg"></div>
                <div className="text-lg font-bold text-yellow-300">28%</div>
              </div>
              <div className="text-xs font-medium text-yellow-200">Medium Density</div>
            </div>
            
            <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-400/30 rounded-xl p-4 hover:from-green-500/30 hover:to-green-600/30 transition-all duration-300">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-4 h-4 bg-gradient-to-r from-green-400 to-green-500 rounded-full shadow-lg"></div>
                <div className="text-lg font-bold text-green-300">35%</div>
              </div>
              <div className="text-xs font-medium text-green-200">Low Density</div>
            </div>
            
            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-400/30 rounded-xl p-4 hover:from-blue-500/30 hover:to-blue-600/30 transition-all duration-300">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-4 h-4 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full shadow-lg"></div>
                <div className="text-lg font-bold text-blue-300">25%</div>
              </div>
              <div className="text-xs font-medium text-blue-200">Clear Waters</div>
            </div>
          </div>
        )}
      </div>

      {/* Regional Selector */}
      <div className="space-y-4">
        <label className="block text-sm font-bold text-white">
          Focus Area
        </label>
        <div className="relative">
          <select className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white font-medium 
                            focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 focus:outline-none
                            transition-all duration-300 hover:bg-white/15 appearance-none cursor-pointer">
            <option value="full" className="bg-slate-800 text-white">🌊 Full Ghana Coastline</option>
            <option value="western" className="bg-slate-800 text-white">� Western Region (Takoradi)</option>
            <option value="central" className="bg-slate-800 text-white">🏛️ Central Region (Cape Coast)</option>
            <option value="accra" className="bg-slate-800 text-white">🏙️ Greater Accra (Tema)</option>
            <option value="volta" className="bg-slate-800 text-white">🌅 Volta Region (Keta)</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-cyan-300 pointer-events-none" />
        </div>
      </div>

      {/* Enhanced Impact Assessment */}
      <div className="space-y-4">
        <button
          onClick={() => toggleSection('impact')}
          className="flex items-center justify-between w-full text-left group p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300"
        >
          <span className="text-sm font-bold text-white flex items-center space-x-3">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span>Impact Assessment</span>
          </span>
          {collapsed.impact ? 
            <ChevronDown className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" /> : 
            <ChevronUp className="h-4 w-4 text-cyan-300 group-hover:text-white transition-colors" />
          }
        </button>
        
        {!collapsed.impact && (
          <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-400/30 rounded-xl p-5">
            <h4 className="text-sm font-bold text-yellow-300 mb-3 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Actionable Insights</span>
            </h4>
            <p className="text-sm text-cyan-200 leading-relaxed mb-4">
              Current conditions show moderate Sargassum accumulation affecting coastal zones. 
              High-density areas may impact beach activities, fishing operations, and tourism along Ghana's coastline.
            </p>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-xs">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span className="text-yellow-300 font-medium">Monitor coastal zones for potential impacts</span>
              </div>
              <div className="flex items-center space-x-2 text-xs">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-blue-300 font-medium">Check conditions before beach activities</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InfoPanel;