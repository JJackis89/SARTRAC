import { useState } from 'react';
import {
  MapPin,
  ChevronDown,
  Share,
  HelpCircle,
  User,
  Layers,
  Search,
  Camera,
  X,
} from 'lucide-react';
import { ForecastData } from '../services/forecastService';
import epaLogo from '../assets/logos/epa-logo.png';
import ugLogo from '../assets/logos/ug-logo.png';
import ghLogo from '../assets/logos/gh-logo.png';

const REGIONS: Record<string, { center: [number, number]; zoom: number }> = {
  'Ghana Coast': { center: [5.25, -0.90], zoom: 8 },
  'Western Region': { center: [4.95, -2.30], zoom: 10 },
  'Central Region': { center: [5.10, -1.25], zoom: 10 },
  'Greater Accra': { center: [5.55, -0.15], zoom: 11 },
};

interface HeaderProps {
  isLoading: boolean;
  error: string | null;
  currentForecast: ForecastData | null;
  lastUpdateTime: Date | null;
  nextUpdateTime: Date | null;
  availableForecastCount: number;
  onToggleDrawer: () => void;
  onScreenshot: () => void;
  onShare: () => void;
  onRegionChange?: (center: [number, number], zoom: number) => void;
}

export function Header({
  isLoading,
  error,
  currentForecast,
  lastUpdateTime,
  nextUpdateTime,
  availableForecastCount,
  onToggleDrawer,
  onScreenshot,
  onShare,
  onRegionChange,
}: HeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('Ghana Coast');

  const [showHelp, setShowHelp] = useState(false);

  const handleHelp = () => setShowHelp((p) => !p);
  const handleAccount = () => {}; // Reserved for future authentication

  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedRegion(name);
    const region = REGIONS[name];
    if (region && onRegionChange) {
      onRegionChange(region.center, region.zoom);
    }
  };

  return (
    <>
    <header
      className="fixed top-0 left-0 right-0 z-[9999] h-12 sm:h-16"
      style={{
        background: 'var(--ocean-glass)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(94, 234, 212, 0.2)',
      }}
      role="banner"
      aria-label="SARTRAC Mission Control Header"
    >
      <div className="h-full px-3 sm:px-6 flex items-center justify-between">
        {/* Left: Logo & Partners */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3">
            <img src={ghLogo} alt="Republic of Ghana" className="h-8 w-8 object-contain" />
            <div>
              <h1 className="text-sm sm:text-lg font-bold" style={{ color: 'var(--foam-white)' }}>
                <span className="hidden sm:inline">Ghana Sargassum Early Advisory System</span>
                <span className="sm:hidden">SARTRAC</span>
              </h1>
              <p className="text-xs hidden sm:block" style={{ color: 'var(--teal-foam)' }}>
                Sargassum Forecast
              </p>
            </div>
          </div>

          <div
            className="hidden lg:flex items-center space-x-4 pl-6 border-l"
            style={{ borderColor: 'rgba(94, 234, 212, 0.2)' }}
          >
            <div className="text-xs font-medium" style={{ color: 'var(--teal-foam)' }}>
              Partnership:
            </div>
            <div className="flex items-center space-x-3">
              <img
                src={epaLogo}
                alt="EPA Ghana"
                className="h-8 w-auto opacity-90 hover:opacity-100 transition-opacity duration-200"
                style={{ filter: 'brightness(1.1)' }}
              />
              <div className="w-px h-6" style={{ background: 'rgba(94, 234, 212, 0.3)' }} />
              <img
                src={ugLogo}
                alt="University of Ghana"
                className="h-8 w-auto opacity-90 hover:opacity-100 transition-opacity duration-200"
                style={{ filter: 'brightness(1.1)' }}
              />
            </div>
          </div>
        </div>

        {/* Center: Location & Search */}
        <div className="hidden sm:flex items-center space-x-4">
          {showSearch ? (
            <div
              className="flex items-center space-x-2 px-3 py-2 rounded-lg"
              style={{
                background: 'rgba(45, 62, 80, 0.8)',
                border: '1px solid rgba(94, 234, 212, 0.2)',
              }}
            >
              <Search className="h-4 w-4" style={{ color: 'var(--teal-foam)' }} />
              <input
                type="text"
                placeholder="Search locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm border-none outline-none w-48 focus-ocean"
                style={{ color: 'var(--foam-white)' }}
                autoFocus
                onBlur={() => setShowSearch(false)}
                aria-label="Search for locations on the map"
              />
            </div>
          ) : (
            <>
              <div
                className="flex items-center space-x-2 px-3 py-2 rounded-lg"
                style={{
                  background: 'rgba(45, 62, 80, 0.8)',
                  border: '1px solid rgba(94, 234, 212, 0.2)',
                }}
              >
                <MapPin className="h-4 w-4" style={{ color: 'var(--teal-foam)' }} />
                <select
                  className="bg-transparent text-sm font-medium border-none outline-none appearance-none cursor-pointer focus-ocean"
                  style={{ color: 'var(--foam-white)' }}
                  aria-label="Select geographic region"
                  value={selectedRegion}
                  onChange={handleRegionChange}
                >
                  <option className="bg-slate-800">Ghana Coast</option>
                  <option className="bg-slate-800">Western Region</option>
                  <option className="bg-slate-800">Central Region</option>
                  <option className="bg-slate-800">Greater Accra</option>
                </select>
                <ChevronDown className="h-3 w-3" style={{ color: 'var(--teal-foam)' }} />
              </div>

              <button
                onClick={() => setShowSearch(true)}
                className="p-2 rounded-lg transition-all duration-200"
                style={{
                  background: 'rgba(45, 62, 80, 0.6)',
                  border: '1px solid rgba(94, 234, 212, 0.15)',
                  color: 'var(--teal-foam)',
                }}
              >
                <Search className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Right: Status & Actions */}
        <div className="flex items-center space-x-4">
          {/* Live Status Indicator */}
          <div className="relative group">
            <div
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                isLoading
                  ? 'bg-orange-500/15 border-orange-500/30'
                  : error
                  ? 'bg-red-500/15 border-red-500/30'
                  : 'bg-green-500/15 border-green-500/30'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isLoading
                    ? 'bg-orange-400 animate-spin'
                    : error
                    ? 'bg-red-400 animate-pulse'
                    : 'bg-green-400 animate-pulse'
                }`}
              />
              <span
                className={`text-sm font-bold ${
                  isLoading ? 'text-orange-400' : error ? 'text-red-400' : 'text-green-400'
                }`}
              >
                {isLoading ? 'Loading' : error ? 'Offline' : 'Live'}
              </span>
            </div>

            {/* Tooltip */}
            <div
              className="absolute top-full right-0 mt-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 min-w-48"
              style={{
                background: 'var(--ocean-glass)',
                border: '1px solid rgba(94, 234, 212, 0.2)',
                color: 'var(--foam-white)',
              }}
            >
              {isLoading ? (
                <div>
                  <div>Loading forecast data...</div>
                  <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                    Fetching from GitHub releases
                  </div>
                </div>
              ) : error ? (
                <div>
                  <div>⚠️ Connection Issue</div>
                  <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                    {error}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--teal-foam)' }}>
                    {availableForecastCount > 0 ? 'Using cached data' : 'Using demo data'}
                  </div>
                </div>
              ) : (
                <div>
                  <div>Latest forecast: {currentForecast?.date || 'Today'}</div>
                  <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                    {lastUpdateTime
                      ? `Updated: ${lastUpdateTime.toLocaleTimeString()}`
                      : 'Ready'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                    {availableForecastCount} forecast
                    {availableForecastCount !== 1 ? 's' : ''} available
                  </div>
                  {currentForecast?.metadata?.data_quality && (
                    <div className="text-xs mt-1" style={{
                      color: currentForecast.metadata.data_quality === 'high' ? '#4ade80' :
                             currentForecast.metadata.data_quality === 'medium' ? '#facc15' : '#fb923c'
                    }}>
                      Data: {currentForecast.metadata.data_quality.toUpperCase()}
                      {currentForecast.metadata.has_real_currents ? ' · HYCOM' : ''}
                      {currentForecast.metadata.has_real_winds ? ' · GFS' : ''}
                    </div>
                  )}
                  {nextUpdateTime && (
                    <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                      Next check: {nextUpdateTime.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={onToggleDrawer}
              className="p-2 rounded-lg transition-all duration-200"
              style={{
                background:
                  'linear-gradient(135deg, var(--teal-mid) 0%, var(--blue-mid) 100%)',
                color: 'var(--foam-white)',
                boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)',
              }}
              title="Toggle Layers Panel"
            >
              <Layers className="h-4 w-4" />
            </button>

            <button
              className="p-2 rounded-lg transition-all duration-200"
              style={{
                background: 'rgba(45, 62, 80, 0.6)',
                border: '1px solid rgba(94, 234, 212, 0.15)',
                color: 'var(--teal-foam)',
              }}
              title="Export Screenshot"
              onClick={onScreenshot}
            >
              <Camera className="h-4 w-4" />
            </button>

            <button
              className="p-2 rounded-lg transition-all duration-200"
              style={{
                background: 'rgba(45, 62, 80, 0.6)',
                border: '1px solid rgba(94, 234, 212, 0.15)',
                color: 'var(--teal-foam)',
              }}
              title="Share Link"
              onClick={onShare}
            >
              <Share className="h-4 w-4" />
            </button>

            <button
              className="hidden sm:block p-2 rounded-lg transition-all duration-200"
              style={{
                background: 'rgba(45, 62, 80, 0.6)',
                border: '1px solid rgba(94, 234, 212, 0.15)',
                color: 'var(--teal-foam)',
              }}
              title="Help & Tour"
              onClick={handleHelp}
            >
              <HelpCircle className="h-4 w-4" />
            </button>

            <button
              className="hidden sm:block p-2 rounded-lg transition-all duration-200"
              style={{
                background: 'rgba(45, 62, 80, 0.6)',
                border: '1px solid rgba(94, 234, 212, 0.15)',
                color: 'var(--teal-foam)',
              }}
              title="Account"
              onClick={handleAccount}
            >
              <User className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>

    {/* Help Modal */}
    {showHelp && (
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={() => setShowHelp(false)}
      >
        <div
          className="relative max-w-lg w-full mx-4 rounded-xl p-6 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            border: '1px solid rgba(94, 234, 212, 0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowHelp(false)}
            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: 'var(--teal-foam)' }}
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--foam-white)' }}>
            How to Use SARTRAC
          </h2>
          <div className="space-y-3 text-sm" style={{ color: 'var(--seafoam-light)' }}>
            <div>
              <h3 className="font-semibold mb-1" style={{ color: 'var(--teal-foam)' }}>Map Navigation</h3>
              <p>Drag to pan, scroll to zoom, or use the controls on the right. Select a coastal region from the dropdown to navigate quickly.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ color: 'var(--teal-foam)' }}>Forecast Layers</h3>
              <p>Open the layers panel (left) to toggle forecast heatmap, detection points, drift vectors, and uncertainty overlays. Adjust opacity and rendering style.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ color: 'var(--teal-foam)' }}>Timeline</h3>
              <p>Use the timeline at the bottom to step through forecast dates or press play for automatic animation. Choose 3, 5, or 7-day forecast horizons.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ color: 'var(--teal-foam)' }}>Alerts</h3>
              <p>Sargassum alerts appear in the bottom-left panel. Click an alert to fly to its location on the map. Alert severity ranges from Watch to Critical.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ color: 'var(--teal-foam)' }}>Colour Scale</h3>
              <p className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#00ff00' }} /> Low
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#ffff00' }} /> Moderate
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#ff8c00' }} /> High
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#ff0000' }} /> Critical
              </p>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
