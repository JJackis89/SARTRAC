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
} from 'lucide-react';
import { ForecastData } from '../services/forecastService';
import epaLogo from '../assets/logos/epa-logo.png';
import ugLogo from '../assets/logos/ug-logo.png';
import ghLogo from '../assets/logos/gh-logo.png';

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
}: HeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleHelp = () => {
    alert(`Ghana Sargassum Early Advisory System Help:

Navigation:
• Click and drag to pan the map
• Use mouse wheel or +/- buttons to zoom
• Click timeline controls to view different forecast days

Timeline Controls:
• Play/Pause: Space bar or play button
• Step through days: Arrow keys or click timeline
• Adjust speed: Use playback speed controls
• Loop: Toggle continuous playback

Layers:
• Toggle different forecast layers on/off
• Adjust opacity with the slider
• Switch between satellite/terrain base maps

Color Scale:
• Green: Low Sargassum density
• Yellow/Orange: Moderate density
• Red: High density
• Dark Red: Very high density`);
  };

  const handleAccount = () => {
    alert('Account features coming soon!');
  };

  return (
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
              <h1 className="text-lg font-bold sm:text-lg text-sm" style={{ color: 'var(--foam-white)' }}>
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
  );
}
