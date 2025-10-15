import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import html2canvas from 'html2canvas';
import { 
  MapPin, 
  X, 
  ChevronDown, 
  Share, 
  HelpCircle, 
  User, 
  Layers,
  ZoomIn,
  ZoomOut,
  Compass,
  RotateCcw,
  Play,
  Pause,
  Search,
  Camera,
  Info,
  Calendar,
  Activity
} from 'lucide-react';
import { ForecastOverlay } from './components/ForecastOverlay';
import MapController from './components/MapController';
import CoastSnapPoints from './components/CoastSnapPoints';
import { forecastService, ForecastData as LiveForecastData } from './services/forecastService';

// Import logos
import epaLogo from './assets/logos/epa-logo.png';
import ugLogo from './assets/logos/ug-logo.png';
import ghLogo from './assets/logos/gh-logo.png';

// Ghana coastline center coordinates
const GHANA_CENTER: LatLngExpression = [5.6037, -0.1870];
const GHANA_BOUNDS: [[number, number], [number, number]] = [
  [4.5, -3.5], // Southwest
  [11.5, 1.5]  // Northeast
];

function App() {
  const mapRef = useRef<L.Map | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentForecastIndex, setCurrentForecastIndex] = useState(0);
  const [opacity, setOpacity] = useState(1.0);
  const [showLayers, setShowLayers] = useState({
    forecast: true,
    drift: false,
    uncertainty: false,
    bathymetry: false,
    grid: false,
    coastsnap: true
  });
  const [baseMap, setBaseMap] = useState('satellite');
  const [availableForecasts, setAvailableForecasts] = useState<LiveForecastData[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  // Enhanced layer controls
  const [renderMode, setRenderMode] = useState<'native' | 'smooth'>('native');
  const [showGridCells, setShowGridCells] = useState(false);
  const [driftAnimated, setDriftAnimated] = useState(true);
  const [uncertaintyStyle, setUncertaintyStyle] = useState<'alpha' | 'contour' | 'hatching'>('alpha');
  const [collapsedLayers, setCollapsedLayers] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [isLoadingForecasts, setIsLoadingForecasts] = useState(true);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [nextUpdateTime, setNextUpdateTime] = useState<Date | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Callback to receive map instance from MapController
  const handleMapReady = (map: L.Map) => {
    mapRef.current = map;
  };

  // Load available forecasts from GitHub releases with enhanced real-time capabilities
  useEffect(() => {
    let unsubscribeFromLoadingState: (() => void) | null = null;
    
    const initializeForecastService = async () => {
      // Subscribe to loading state changes
      unsubscribeFromLoadingState = forecastService.onLoadingStateChange((state) => {
        setIsLoadingForecasts(state.isLoading);
        setForecastError(state.error);
        setLastUpdateTime(state.lastUpdated);
        setNextUpdateTime(state.nextUpdateTime);
      });

      // Start auto-refresh every 30 minutes
      if (autoRefreshEnabled) {
        forecastService.startAutoRefresh(30);
      }

      await loadAvailableForecasts();
    };

    const loadAvailableForecasts = async () => {
      setIsLoadingForecasts(true);
      setForecastError(null);
      
      try {
        console.log('Loading available forecasts from GitHub releases...');
        
        // Get latest forecast first
        const latestForecast = await forecastService.getLatestForecast();
        
        if (latestForecast) {
          console.log('Loaded latest forecast:', latestForecast.date);
          setAvailableForecasts([latestForecast]);
          setLastUpdateTime(new Date());
          
          // Load additional historical forecasts in background
          loadHistoricalForecasts();
        } else {
          setForecastError('No forecast data available. Check GitHub releases or try again later.');
          setAvailableForecasts([]);
        }
        
      } catch (error) {
        console.error('Failed to load forecasts:', error);
        setForecastError(error instanceof Error ? error.message : 'Failed to load forecast data');
        setAvailableForecasts([]);
      } finally {
        setIsLoadingForecasts(false);
      }
    };

    const loadHistoricalForecasts = async () => {
      try {
        const dates = await forecastService.getAvailableForecastDates();
        const forecasts: LiveForecastData[] = [];
        
        // Load up to 7 most recent forecasts
        for (const date of dates.slice(0, 7)) {
          try {
            const forecast = await forecastService.getForecastForDate(date);
            if (forecast && !forecasts.some(f => f.date === forecast.date)) {
              forecasts.push(forecast);
            }
          } catch (error) {
            console.warn(`Failed to load forecast for ${date}:`, error);
          }
        }
        
        // Sort by date (most recent first)
        forecasts.sort((a, b) => b.date.localeCompare(a.date));
        setAvailableForecasts(forecasts);
        
        console.log(`Loaded ${forecasts.length} forecasts from GitHub releases`);
        
      } catch (error) {
        console.warn('Failed to load historical forecasts:', error);
      }
    };

    initializeForecastService();

    // Cleanup function
    return () => {
      if (unsubscribeFromLoadingState) {
        unsubscribeFromLoadingState();
      }
      forecastService.stopAutoRefresh();
    };
  }, [autoRefreshEnabled]);

  // Auto-play animation for forecast timeline
  useEffect(() => {
    let interval: any;
    if (isPlaying && availableForecasts.length > 0) {
      interval = setInterval(() => {
        setCurrentForecastIndex(prev => {
          const next = prev >= availableForecasts.length - 1 ? (loopEnabled ? 0 : prev) : prev + 1;
          if (!loopEnabled && next === prev) {
            setIsPlaying(false);
          }
          return next;
        });
      }, 1500 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, availableForecasts.length, playbackSpeed, loopEnabled]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keys when not typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentForecastIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentForecastIndex(prev => Math.min(availableForecasts.length - 1, prev + 1));
          break;
        case 'Home':
          e.preventDefault();
          setCurrentForecastIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentForecastIndex(Math.max(0, availableForecasts.length - 1));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, availableForecasts.length]);

  const currentForecast = availableForecasts[currentForecastIndex] || null;

  // Map utility functions
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.setView(GHANA_CENTER, 7);
    }
  };

  const handleResetNorth = () => {
    if (mapRef.current) {
      // Reset view to center
      mapRef.current.setView(mapRef.current.getCenter(), mapRef.current.getZoom());
    }
  };

  // Utility function handlers
  const handleScreenshot = async () => {
    try {
      // Try modern browser screenshot API first
      if ('getDisplayMedia' in navigator.mediaDevices) {
        // Show instruction dialog
        const useBuiltIn = confirm(`Screenshot Options:

1. Click "OK" to use browser's built-in screenshot (recommended)
2. Click "Cancel" to try automatic capture

For best results, use your browser's built-in screenshot:
• Press Ctrl+Shift+S (Chrome/Edge)
• Press F12 → Sources → Screenshot (DevTools)
• Right-click → "Save page as" → Web page, complete`);
        
        if (useBuiltIn) {
          alert(`Browser Screenshot Instructions:

Chrome/Edge: Press Ctrl+Shift+S
Firefox: Press F12, then click the camera icon
Safari: Develop menu → Take Screenshot

Or use your operating system:
Windows: Win+Shift+S
Mac: Cmd+Shift+4`);
          return;
        }
      }

      // Fallback: Try html2canvas with better error handling
      const loadingDiv = document.createElement('div');
      loadingDiv.innerHTML = 'Capturing screenshot...';
      loadingDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: rgba(45, 62, 80, 0.95); color: #5eead4;
        padding: 12px 20px; border-radius: 6px;
        font-family: system-ui; font-size: 14px;
        border: 1px solid rgba(94, 234, 212, 0.3);
      `;
      document.body.appendChild(loadingDiv);

      // Give UI time to update
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // Target just the main content area instead of full page
        const mapContainer = document.querySelector('.leaflet-container')?.parentElement;
        const targetElement = mapContainer || document.body;
        
        const canvas = await html2canvas(targetElement as HTMLElement, {
          useCORS: true,
          allowTaint: false,
          height: window.innerHeight,
          width: window.innerWidth
        });

        // Create and download
        const link = document.createElement('a');
        link.download = `ghana-sargassum-forecast-${currentForecast?.date || 'current'}-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png', 0.8);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        document.body.removeChild(loadingDiv);
        alert('Screenshot downloaded successfully!');
        
      } catch (canvasError) {
        document.body.removeChild(loadingDiv);
        console.error('Canvas capture failed:', canvasError);
        
        // Final fallback - print dialog
        const printFallback = confirm(`Automatic screenshot failed. Would you like to:

1. Click "OK" to open print dialog (save as PDF)
2. Click "Cancel" for manual screenshot instructions`);
        
        if (printFallback) {
          window.print();
        } else {
          alert(`Manual Screenshot Instructions:

Windows:
• Press Win+Shift+S for Snipping Tool
• Or press PrintScreen key

Mac:
• Press Cmd+Shift+4 to select area
• Or press Cmd+Shift+3 for full screen

Browser:
• Right-click → "Save page as"
• Or use DevTools screenshot feature`);
        }
      }
      
    } catch (error) {
      console.error('Screenshot function failed:', error);
      alert('Screenshot feature unavailable. Please use your browser\'s print function or screenshot tool.');
    }
  };

  const handleShare = () => {
    try {
      const url = window.location.href;
      const text = `Ghana Sargassum Early Advisory System - ${currentForecast?.date || 'Current'} Forecast`;
      
      if (navigator.share) {
        navigator.share({
          title: 'Ghana Sargassum Forecast',
          text: text,
          url: url
        });
      } else {
        // Fallback - copy to clipboard
        navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
          alert('Forecast link copied to clipboard!');
        }).catch(() => {
          // Final fallback - show the URL
          prompt('Copy this link to share:', url);
        });
      }
    } catch (error) {
      console.error('Share failed:', error);
      alert('Share feature not available in this browser');
    }
  };

  const handleHelp = () => {
    alert(`Ghana Sargassum Early Advisory System Help:

Navigation:
• Click and drag to pan the map
• Use mouse wheel or +/- buttons to zoom
• Click timeline controls to view different forecast days

Timeline Controls:
• Play/Pause: Space bar or ▶️ button
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
    alert('Account features coming soon!\n\nThis will include:\n• Custom forecast alerts\n• Historical data access\n• Export capabilities\n• Personalized dashboard');
  };

  // Manual refresh function for forecast data
  const handleManualRefresh = async () => {
    setIsLoadingForecasts(true);
    setForecastError(null);
    
    try {
      // Clear cache and fetch fresh data
      forecastService.clearCache();
      const latestForecast = await forecastService.getLatestForecast();
      
      if (latestForecast) {
        console.log('Manual refresh successful:', latestForecast.date);
        // Reload all forecasts
        const dates = await forecastService.getAvailableForecastDates();
        const forecasts: LiveForecastData[] = [];
        
        for (const date of dates.slice(0, 7)) {
          try {
            const forecast = await forecastService.getForecastForDate(date);
            if (forecast) {
              forecasts.push(forecast);
            }
          } catch (error) {
            console.warn(`Failed to load forecast for ${date}:`, error);
          }
        }
        
        forecasts.sort((a, b) => b.date.localeCompare(a.date));
        setAvailableForecasts(forecasts);
        setLastUpdateTime(new Date());
      }
    } catch (error) {
      console.error('Manual refresh failed:', error);
      setForecastError(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setIsLoadingForecasts(false);
    }
  };

  const baseMaps = {
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    minimal: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  };

  return (
    <div className="h-screen w-screen relative overflow-hidden flex flex-col" style={{ background: 'linear-gradient(135deg, var(--ocean-abyss) 0%, var(--ocean-deep) 35%, var(--ocean-mid) 100%)' }}>
      {/* Mission Control Header - Enhanced */}
      <header 
        className="fixed top-0 left-0 right-0 z-[9999] h-16" 
        style={{ background: 'var(--ocean-glass)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(94, 234, 212, 0.2)' }}
        role="banner"
        aria-label="SARTRAC Mission Control Header"
      >
        <div className="h-full px-6 flex items-center justify-between">
          {/* Left: Product Logo & Organization Logos */}
          <div className="flex items-center space-x-6">
            {/* Main Product Identity */}
            <div className="flex items-center space-x-3">
              <img 
                src={ghLogo} 
                alt="Republic of Ghana" 
                className="h-8 w-8 object-contain"
              />
              <div>
                <h1 className="text-lg font-bold" style={{ color: 'var(--foam-white)' }}>Ghana Sargassum Early Advisory System</h1>
                <p className="text-xs" style={{ color: 'var(--teal-foam)' }}>Sargassum Forecast</p>
              </div>
            </div>
            
            {/* Partner Organization Logos */}
            <div className="hidden lg:flex items-center space-x-4 pl-6 border-l" style={{ borderColor: 'rgba(94, 234, 212, 0.2)' }}>
              <div className="text-xs font-medium" style={{ color: 'var(--teal-foam)' }}>
                Partnership:
              </div>
              <div className="flex items-center space-x-3">
                <img 
                  src={epaLogo} 
                  alt="Environmental Protection Authority Ghana" 
                  className="h-8 w-auto opacity-90 hover:opacity-100 transition-opacity duration-200"
                  style={{ filter: 'brightness(1.1)' }}
                />
                <div className="w-px h-6" style={{ background: 'rgba(94, 234, 212, 0.3)' }}></div>
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
          <div className="flex items-center space-x-4">
            {/* Search */}
            {showSearch ? (
              <div className="flex items-center space-x-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.8)', border: '1px solid rgba(94, 234, 212, 0.2)' }}>
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
                {/* Location Selector */}
                <div className="flex items-center space-x-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.8)', border: '1px solid rgba(94, 234, 212, 0.2)' }}>
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
                  style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)', color: 'var(--teal-foam)' }}
                >
                  <Search className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          
          {/* Right: Status & Actions */}
          <div className="flex items-center space-x-4">
            {/* Enhanced Live Status with real-time GitHub data */}
            <div className="relative group">
              <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                isLoadingForecasts 
                  ? 'bg-orange-500/15 border-orange-500/30' 
                  : forecastError 
                    ? 'bg-red-500/15 border-red-500/30'
                    : 'bg-green-500/15 border-green-500/30'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isLoadingForecasts 
                    ? 'bg-orange-400 animate-spin' 
                    : forecastError 
                      ? 'bg-red-400 animate-pulse' 
                      : 'bg-green-400 animate-pulse'
                }`}></div>
                <span className={`text-sm font-bold ${
                  isLoadingForecasts 
                    ? 'text-orange-400' 
                    : forecastError 
                      ? 'text-red-400' 
                      : 'text-green-400'
                }`}>
                  {isLoadingForecasts ? 'Loading' : forecastError ? 'Offline' : 'Live'}
                </span>
              </div>
              
              {/* Enhanced Tooltip with real data */}
              <div className="absolute top-full right-0 mt-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 min-w-48" style={{ background: 'var(--ocean-glass)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}>
                {isLoadingForecasts ? (
                  <div>
                    <div>Loading forecast data...</div>
                    <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>Fetching from GitHub releases</div>
                  </div>
                ) : forecastError ? (
                  <div>
                    <div>⚠️ Connection Issue</div>
                    <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>{forecastError}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--teal-foam)' }}>
                      {availableForecasts.length > 0 ? 'Using cached data' : 'Using demo data'}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div>Latest forecast: {currentForecast?.date || 'Today'}</div>
                    <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                      {lastUpdateTime ? `Updated: ${lastUpdateTime.toLocaleTimeString()}` : 'Ready'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                      {availableForecasts.length} forecast{availableForecasts.length !== 1 ? 's' : ''} available
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
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setDrawerOpen(!drawerOpen)}
                className="p-2 rounded-lg transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, var(--teal-mid) 0%, var(--blue-mid) 100%)', color: 'var(--foam-white)', boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)' }}
                title="Toggle Layers Panel"
              >
                <Layers className="h-4 w-4" />
              </button>
              
              <button 
                className="p-2 rounded-lg transition-all duration-200"
                style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)', color: 'var(--teal-foam)' }}
                title="Export Screenshot"
                onClick={handleScreenshot}
              >
                <Camera className="h-4 w-4" />
              </button>
              
              <button 
                className="p-2 rounded-lg transition-all duration-200"
                style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)', color: 'var(--teal-foam)' }}
                title="Share Link"
                onClick={handleShare}
              >
                <Share className="h-4 w-4" />
              </button>
              
              <button 
                className="p-2 rounded-lg transition-all duration-200"
                style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)', color: 'var(--teal-foam)' }}
                title="Help & Tour"
                onClick={handleHelp}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              
              <button 
                className="p-2 rounded-lg transition-all duration-200"
                style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)', color: 'var(--teal-foam)' }}
                title="Account"
                onClick={handleAccount}
              >
                <User className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - Account for header height */}
      <div className="flex flex-1 relative" style={{ height: 'calc(100vh - 4rem)' }}>
        {/* Professional Layers & Forecast Drawer */}
        <div className={`absolute top-0 left-0 h-full z-40 transition-all duration-300 ease-in-out ${
          drawerOpen ? 'w-80' : 'w-0'
        } overflow-hidden`}>
          <div className="h-full w-80 overflow-y-auto flex flex-col min-h-0" style={{ background: 'rgba(36, 52, 66, 0.95)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(94, 234, 212, 0.2)', boxShadow: '0 8px 32px rgba(10, 15, 28, 0.3)' }}>
            {drawerOpen && (
              <div className="p-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
                {/* Drawer Header */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-600/30">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <h2 className="text-lg font-bold text-white">Control Center</h2>
                    <div className="ml-2 px-2 py-1 text-xs font-medium bg-green-600/20 text-green-300 rounded border border-green-500/30">
                      LIVE
                    </div>
                  </div>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-700/50 border border-gray-600/30 text-gray-300 hover:text-white hover:border-gray-500/50"
                    title="Close Control Panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Enhanced Integrated Forecast System */}
                <div className="rounded-xl p-4 border border-green-500/20 bg-gradient-to-br from-green-900/20 to-blue-900/20 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        isLoadingForecasts 
                          ? 'bg-orange-400 animate-spin' 
                          : forecastError 
                            ? 'bg-red-400 animate-pulse' 
                            : 'bg-green-400 animate-pulse'
                      }`}></div>
                      <h3 className="text-base font-bold text-white">Live Forecast System</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-300 rounded-full border border-green-500/30">
                        {availableForecasts.length} FORECAST{availableForecasts.length !== 1 ? 'S' : ''}
                      </div>
                      <button
                        onClick={handleManualRefresh}
                        className="p-1 rounded transition-all duration-200 hover:bg-green-500/20"
                        title="Refresh forecast data"
                        disabled={isLoadingForecasts}
                      >
                        <Activity className={`h-4 w-4 text-green-400 ${isLoadingForecasts ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {isLoadingForecasts ? (
                      <div className="text-center py-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 backdrop-blur-sm rounded-lg border border-blue-500/30">
                        <Activity className="h-8 w-8 mx-auto mb-2 text-blue-400 animate-spin" />
                        <p className="text-white text-sm font-medium">Loading Forecasts</p>
                        <p className="text-blue-300 text-xs mt-1">Fetching data from GitHub releases...</p>
                      </div>
                    ) : availableForecasts.length > 0 ? (
                      <div className="bg-gradient-to-r from-gray-800/40 to-gray-700/40 backdrop-blur-sm rounded-lg p-3 border border-gray-600/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-white">Current Forecast</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showLayers.forecast}
                              onChange={(e) => setShowLayers(prev => ({ ...prev, forecast: e.target.checked }))}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
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
                                <span className={`font-medium ${
                                  currentForecast.isDemoData ? 'text-blue-400' : 
                                  currentForecast.isEmpty ? 'text-orange-400' : 'text-green-400'
                                }`}>
                                  {currentForecast.isDemoData ? 'Demo Mode' : 
                                   currentForecast.isEmpty ? 'No Detection' : 'Active'}
                                </span>
                              </div>
                            </>
                          )}
                          {lastUpdateTime && (
                            <div className="flex justify-between">
                              <span>Updated:</span>
                              <span className="font-medium">{lastUpdateTime.toLocaleTimeString()}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Auto-refresh toggle */}
                        <div className="mt-3 pt-2 border-t border-gray-600/30">
                          <label className="flex items-center justify-between text-xs">
                            <span className="text-gray-300">Auto-refresh every 30min</span>
                            <input
                              type="checkbox"
                              checked={autoRefreshEnabled}
                              onChange={(e) => {
                                setAutoRefreshEnabled(e.target.checked);
                                if (e.target.checked) {
                                  forecastService.startAutoRefresh(30);
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
                          {forecastError ? 'Connection Error' : 'No Forecasts Available'}
                        </p>
                        <p className="text-orange-300 text-xs mt-1">
                          {forecastError ? 'Using demonstration data' : 'System runs daily at 06:00 UTC'}
                        </p>
                        {forecastError && (
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

                {/* Data Layers Section - Enhanced Card */}
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
                    {/* Sargassum Density Layer - Enhanced */}
                    <div className={`layer-card ${collapsedLayers.has('density') ? 'collapsed' : ''}`}>
                      <div 
                        className="layer-header"
                        onClick={() => {
                          setCollapsedLayers(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has('density')) {
                              newSet.delete('density');
                            } else {
                              newSet.add('density');
                            }
                            return newSet;
                          });
                        }}
                      >
                        <label className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={showLayers.forecast}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, forecast: e.target.checked }))}
                            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                            style={{ background: 'rgba(17, 75, 87, 0.8)', borderColor: 'rgba(14, 165, 163, 0.2)' }}
                          />
                          <span className="text-sm font-medium text-white">Sargassum Density</span>
                        </label>
                        <div className="flex items-center space-x-2">
                          <button 
                            className="p-1 rounded hover:bg-teal-surface/10" 
                            style={{ color: 'var(--teal-foam)' }} 
                            title="Confidence decreases with time"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <ChevronDown 
                            className={`h-4 w-4 transition-transform ${collapsedLayers.has('density') ? 'rotate-180' : ''}`}
                            style={{ color: 'var(--teal-foam)' }}
                          />
                        </div>
                      </div>
                      
                      <div className="layer-content">
                        <div className="space-y-4">
                          {/* Rendering Mode Toggle */}
                          <div>
                            <label className="block text-xs font-medium mb-2 text-teal-foam">Rendering Style</label>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => setRenderMode('smooth')}
                                className={`btn-secondary text-xs px-3 py-1 transition-all duration-200 ${
                                  renderMode === 'smooth' 
                                    ? 'bg-teal-surface/30 border-teal-surface text-teal-foam' 
                                    : 'hover:bg-teal-surface/10'
                                }`}
                              >
                                Smooth
                              </button>
                              <button
                                onClick={() => setRenderMode('native')}
                                className={`btn-secondary text-xs px-3 py-1 transition-all duration-200 ${
                                  renderMode === 'native' 
                                    ? 'bg-teal-surface/30 border-teal-surface text-teal-foam' 
                                    : 'hover:bg-teal-surface/10'
                                }`}
                              >
                                Native Grid
                              </button>
                            </div>
                            <div className="text-xs mt-1 text-teal-foam opacity-75">
                              {renderMode === 'smooth' ? 'Continuous heatmap visualization' : 'Discrete grid cells with optional outlines'}
                            </div>
                          </div>
                          
                          {/* Opacity Control */}
                          <div>
                            <label className="block text-xs font-medium mb-2 text-teal-foam">Opacity</label>
                            <div className="timeline-scrubber">
                              <div 
                                className="timeline-progress" 
                                style={{ width: `${opacity * 100}%` }}
                              />
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={opacity}
                                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                            </div>
                            <div className="text-xs mt-1 text-teal-foam">{Math.round(opacity * 100)}%</div>
                          </div>
                          
                          {/* Grid Cell Outline Toggle */}
                          <div>
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={showGridCells}
                                onChange={(e) => setShowGridCells(e.target.checked)}
                                className="w-3 h-3 rounded"
                              />
                              <span className="text-xs text-teal-foam">Show grid cells</span>
                            </label>
                          </div>
                          
                          <div className="text-xs text-teal-foam space-y-1">
                            <div>Units: % coverage</div>
                            <div>Resolution: 1 km</div>
                            <div>Update: every 6 hours</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Drift Vectors Layer - Enhanced */}
                    <div className={`layer-card ${collapsedLayers.has('drift') ? 'collapsed' : ''}`}>
                      <div 
                        className="layer-header"
                        onClick={() => {
                          setCollapsedLayers(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has('drift')) {
                              newSet.delete('drift');
                            } else {
                              newSet.add('drift');
                            }
                            return newSet;
                          });
                        }}
                      >
                        <label className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={showLayers.drift}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, drift: e.target.checked }))}
                            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                            style={{ background: 'rgba(17, 75, 87, 0.8)', borderColor: 'rgba(14, 165, 163, 0.2)' }}
                          />
                          <span className="text-sm font-medium text-white">Drift Vectors</span>
                        </label>
                        <div className="flex items-center space-x-2">
                          <button 
                            className="p-1 rounded hover:bg-teal-surface/10" 
                            style={{ color: 'var(--teal-foam)' }} 
                            title="Ocean current predictions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <ChevronDown 
                            className={`h-4 w-4 transition-transform ${collapsedLayers.has('drift') ? 'rotate-180' : ''}`}
                            style={{ color: 'var(--teal-foam)' }}
                          />
                        </div>
                      </div>
                      
                      <div className="layer-content">
                        <div className="space-y-4">
                          {/* Animation Toggle */}
                          <div>
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={driftAnimated}
                                onChange={(e) => setDriftAnimated(e.target.checked)}
                                className="w-3 h-3 rounded"
                              />
                              <span className="text-xs text-teal-foam">Animate vectors</span>
                            </label>
                          </div>
                          
                          {/* Vector Controls */}
                          <div>
                            <label className="block text-xs font-medium mb-2 text-teal-foam">Vector Density</label>
                            <select className="input-ocean text-xs w-full">
                              <option value="low">Low density</option>
                              <option value="medium">Medium density</option>
                              <option value="high">High density</option>
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium mb-2 text-teal-foam">Arrow Scale</label>
                            <input
                              type="range"
                              min="0.5"
                              max="2"
                              step="0.1"
                              defaultValue="1"
                              className="w-full"
                            />
                          </div>
                          
                          <div className="text-xs text-teal-foam space-y-1">
                            <div>Source: Ocean models</div>
                            <div>Units: cm/s</div>
                            <div>Calm seas easing</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Uncertainty Layer - Enhanced */}
                    <div className={`layer-card ${collapsedLayers.has('uncertainty') ? 'collapsed' : ''}`}>
                      <div 
                        className="layer-header"
                        onClick={() => {
                          setCollapsedLayers(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has('uncertainty')) {
                              newSet.delete('uncertainty');
                            } else {
                              newSet.add('uncertainty');
                            }
                            return newSet;
                          });
                        }}
                      >
                        <label className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={showLayers.uncertainty}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, uncertainty: e.target.checked }))}
                            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                            style={{ background: 'rgba(17, 75, 87, 0.8)', borderColor: 'rgba(14, 165, 163, 0.2)' }}
                          />
                          <span className="text-sm font-medium text-white">Uncertainty</span>
                        </label>
                        <div className="flex items-center space-x-2">
                          <button 
                            className="p-1 rounded hover:bg-teal-surface/10" 
                            style={{ color: 'var(--teal-foam)' }} 
                            title="Confidence decreases with time"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <ChevronDown 
                            className={`h-4 w-4 transition-transform ${collapsedLayers.has('uncertainty') ? 'rotate-180' : ''}`}
                            style={{ color: 'var(--teal-foam)' }}
                          />
                        </div>
                      </div>
                      
                      <div className="layer-content">
                        <div className="space-y-4">
                          {/* Display Style */}
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
                                    onChange={(e) => setUncertaintyStyle(e.target.value as typeof uncertaintyStyle)}
                                    className="w-3 h-3"
                                  />
                                  <span className="text-xs text-teal-foam capitalize">{style === 'alpha' ? 'Alpha haze' : style === 'contour' ? 'Contour bands' : 'Hatching'}</span>
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
                      </div>
                    </div>

                    {/* Bathymetry Layer - New */}
                    <div className={`layer-card ${collapsedLayers.has('bathymetry') ? 'collapsed' : ''}`}>
                      <div 
                        className="layer-header"
                        onClick={() => {
                          setCollapsedLayers(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has('bathymetry')) {
                              newSet.delete('bathymetry');
                            } else {
                              newSet.add('bathymetry');
                            }
                            return newSet;
                          });
                        }}
                      >
                        <label className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={showLayers.bathymetry}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, bathymetry: e.target.checked }))}
                            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                            style={{ background: 'rgba(17, 75, 87, 0.8)', borderColor: 'rgba(14, 165, 163, 0.2)' }}
                          />
                          <span className="text-sm font-medium text-white">Bathymetry</span>
                        </label>
                        <div className="flex items-center space-x-2">
                          <button 
                            className="p-1 rounded hover:bg-teal-surface/10" 
                            style={{ color: 'var(--teal-foam)' }} 
                            title="Ocean depth contours"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <ChevronDown 
                            className={`h-4 w-4 transition-transform ${collapsedLayers.has('bathymetry') ? 'rotate-180' : ''}`}
                            style={{ color: 'var(--teal-foam)' }}
                          />
                        </div>
                      </div>
                      
                      <div className="layer-content">
                        <div className="space-y-3">
                          <div className="text-xs text-teal-foam space-y-1">
                            <div>100m, 200m, 500m, 1000m contours</div>
                            <div>Teal-gray shaded relief</div>
                            <div>Source: GEBCO bathymetry</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Grid Overlay - New */}
                    <div className={`layer-card ${collapsedLayers.has('grid') ? 'collapsed' : ''}`}>
                      <div 
                        className="layer-header"
                        onClick={() => {
                          setCollapsedLayers(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has('grid')) {
                              newSet.delete('grid');
                            } else {
                              newSet.add('grid');
                            }
                            return newSet;
                          });
                        }}
                      >
                        <label className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={showLayers.grid}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, grid: e.target.checked }))}
                            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                            style={{ background: 'rgba(17, 75, 87, 0.8)', borderColor: 'rgba(14, 165, 163, 0.2)' }}
                          />
                          <span className="text-sm font-medium text-white">Lat/Long Grid</span>
                        </label>
                        <div className="flex items-center space-x-2">
                          <button 
                            className="p-1 rounded hover:bg-teal-surface/10" 
                            style={{ color: 'var(--teal-foam)' }} 
                            title="Coordinate reference grid"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <ChevronDown 
                            className={`h-4 w-4 transition-transform ${collapsedLayers.has('grid') ? 'rotate-180' : ''}`}
                            style={{ color: 'var(--teal-foam)' }}
                          />
                        </div>
                      </div>
                      
                      <div className="layer-content">
                        <div className="space-y-3">
                          <div className="text-xs text-teal-foam space-y-1">
                            <div>Reduced brightness grid lines</div>
                            <div>Major: 1° intervals</div>
                            <div>Minor: 0.5° intervals</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CoastSnap Points Layer */}
                    <div className={`layer-card ${collapsedLayers.has('coastsnap') ? 'collapsed' : ''}`}>
                      <div 
                        className="layer-header"
                        onClick={() => {
                          setCollapsedLayers(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has('coastsnap')) {
                              newSet.delete('coastsnap');
                            } else {
                              newSet.add('coastsnap');
                            }
                            return newSet;
                          });
                        }}
                      >
                        <label className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={showLayers.coastsnap}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, coastsnap: e.target.checked }))}
                            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                            style={{ background: 'rgba(17, 75, 87, 0.8)', borderColor: 'rgba(14, 165, 163, 0.2)' }}
                          />
                          <span className="text-sm font-medium text-white">CoastSnap Points</span>
                        </label>
                        <div className="flex items-center space-x-2">
                          <button 
                            className="p-1 rounded hover:bg-teal-surface/10" 
                            style={{ color: 'var(--teal-foam)' }} 
                            title="Coastal monitoring points"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <ChevronDown 
                            className={`h-4 w-4 transition-transform ${collapsedLayers.has('coastsnap') ? 'rotate-180' : ''}`}
                            style={{ color: 'var(--teal-foam)' }}
                          />
                        </div>
                      </div>
                      
                      <div className="layer-content">
                        <div className="space-y-3">
                          <div className="text-xs text-teal-foam space-y-1">
                            <div>Coastal monitoring stations</div>
                            <div>7 active monitoring points</div>
                            <div>Ghana coastline coverage</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Drift Vectors Layer */}
                    <div className="p-4 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={showLayers.drift}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, drift: e.target.checked }))}
                            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                            style={{ background: 'rgba(45, 62, 80, 0.8)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
                          />
                          <span className="text-sm font-medium" style={{ color: 'var(--foam-white)' }}>Drift Vectors</span>
                        </label>
                        <button className="p-1 rounded" style={{ color: 'var(--teal-foam)' }} title="Layer Information">
                          <Info className="h-4 w-4" />
                        </button>
                      </div>
                      
                      {showLayers.drift && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--teal-foam)' }}>Arrow Density</label>
                              <select className="w-full px-2 py-1 text-xs rounded" style={{ background: 'rgba(45, 62, 80, 0.8)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}>
                                <option>Low</option>
                                <option>Medium</option>
                                <option>High</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--teal-foam)' }}>Scale</label>
                              <select className="w-full px-2 py-1 text-xs rounded" style={{ background: 'rgba(45, 62, 80, 0.8)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}>
                                <option>Auto</option>
                                <option>Fixed</option>
                              </select>
                            </div>
                          </div>
                          <label className="flex items-center space-x-2">
                            <input type="checkbox" className="w-3 h-3 rounded text-teal-500" />
                            <span className="text-xs" style={{ color: 'var(--teal-foam)' }}>Animate Flow</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Uncertainty Layer */}
                    <div className="p-4 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={showLayers.uncertainty}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, uncertainty: e.target.checked }))}
                            className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                            style={{ background: 'rgba(45, 62, 80, 0.8)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
                          />
                          <span className="text-sm font-medium" style={{ color: 'var(--foam-white)' }}>Uncertainty</span>
                        </label>
                        <button className="p-1 rounded" style={{ color: 'var(--teal-foam)' }} title="Layer Information">
                          <Info className="h-4 w-4" />
                        </button>
                      </div>
                      
                      {showLayers.uncertainty && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--teal-foam)' }}>Display Mode</label>
                            <select className="w-full px-2 py-1 text-xs rounded" style={{ background: 'rgba(45, 62, 80, 0.8)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}>
                              <option>Contour Bands</option>
                              <option>Alpha Haze</option>
                              <option>Stippling</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Enhanced Legend Section - Sticky */}
                <div className="space-y-4">
                  <div className="sticky top-0 z-10 p-3 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(94, 234, 212, 0.2)' }}>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--foam-white)' }}>Legend</h3>
                  </div>
                  
                  <div className="px-3">
                    <div className="p-4 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)' }}>
                      <div className="text-xs mb-3" style={{ color: 'var(--teal-foam)' }}>Sargassum Density (% Coverage)</div>
                      <div className="relative">
                        <div className="w-full h-4 rounded-full bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500"></div>
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
                      
                      {/* Live Coverage Sparkline */}
                      <div className="mt-4">
                        <div className="text-xs mb-2" style={{ color: 'var(--teal-foam)' }}>Current Coverage Distribution</div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-2 bg-blue-400 rounded-sm"></div>
                            <span style={{ color: 'var(--foam-white)' }}>25%</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-2 bg-green-400 rounded-sm"></div>
                            <span style={{ color: 'var(--foam-white)' }}>35%</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-2 bg-yellow-400 rounded-sm"></div>
                            <span style={{ color: 'var(--foam-white)' }}>28%</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-2 bg-red-400 rounded-sm"></div>
                            <span style={{ color: 'var(--foam-white)' }}>12%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Map Style Section - Sticky */}
                <div className="space-y-4">
                  <div className="sticky top-0 z-10 p-3 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(94, 234, 212, 0.2)' }}>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--foam-white)' }}>Map Style</h3>
                  </div>
                  
                  <div className="px-3">
                    <select 
                      value={baseMap}
                      onChange={(e) => setBaseMap(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm border-none outline-none transition-all duration-200"
                      style={{ background: 'rgba(45, 62, 80, 0.8)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}
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

        {/* Main Map Area */}
        <div 
          className={`flex-1 transition-all duration-300 ${drawerOpen ? 'ml-80' : 'ml-0'} relative`}
          role="main"
          aria-label="Interactive Sargassum forecast map"
        >
          <MapContainer
            center={GHANA_CENTER}
            zoom={7}
            maxBounds={GHANA_BOUNDS}
            className="h-full w-full"
            zoomControl={false}
            attributionControl={false}
            ref={mapRef}
            aria-label="Sargassum forecast map of Ghana coastline"
          >
            <TileLayer
              url={baseMaps[baseMap as keyof typeof baseMaps]}
              attribution="© OpenStreetMap contributors"
            />
            
            <MapController onMapReady={handleMapReady} />
            
            {/* Current Forecast Overlay */}
            {currentForecast && showLayers.forecast && (
              <ForecastOverlay
                forecastData={currentForecast}
                visible={true}
                opacity={opacity}
                renderMode={renderMode}
                showGridCells={showGridCells}
              />
            )}
            
            {showLayers.coastsnap && <CoastSnapPoints visible={showLayers.coastsnap} />}
          </MapContainer>

          {/* Enhanced Map Utilities - Bottom Right - MOVED HERE */}
          <div className="map-utilities">
            <button 
              onClick={handleZoomIn}
              title="Zoom In"
              className="map-utility-btn"
              aria-label="Zoom in to map"
            >
              <ZoomIn size={16} />
            </button>
            <button 
              onClick={handleZoomOut}
              title="Zoom Out"
              className="map-utility-btn"
              aria-label="Zoom out from map"
            >
              <ZoomOut size={16} />
            </button>
            
            {/* Compass Rose with North Indicator */}
            <div 
              className="compass-rose"
              title="North"
              role="img" 
              aria-label="North direction indicator"
            >
              N
            </div>
            
            <button 
              onClick={handleResetView}
              title="Reset to Ghana View"
              className="map-utility-btn"
              aria-label="Reset map to Ghana coastline view"
            >
              <Compass size={16} />
            </button>
            
            <button 
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition((position) => {
                    if (mapRef.current) {
                      mapRef.current.setView([position.coords.latitude, position.coords.longitude], 10);
                    }
                  });
                }
              }}
              title="My Location"
              className="map-utility-btn"
              aria-label="Go to my current location"
            >
              <MapPin size={16} />
            </button>
            
            <button 
              onClick={handleResetNorth}
              title="Reset Map Orientation"
              className="map-utility-btn"
              aria-label="Reset map orientation to north up"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Floating Controls - Outside Map Container */}
        <div className={`fixed inset-0 pointer-events-none z-[500] transition-all duration-300 ${drawerOpen ? 'left-80' : 'left-0'}`} style={{ top: '4rem' }}>
          {/* Enhanced Timeline Player - Bottom Right */}
          <div className="absolute bottom-4 right-4 pointer-events-auto">
            <div className="rounded-xl border-2 shadow-2xl p-3 w-80" style={{ background: 'rgba(248, 250, 252, 0.25)', backdropFilter: 'blur(20px)', borderColor: 'rgba(248, 250, 252, 0.5)', boxShadow: '0 8px 32px rgba(10, 15, 28, 0.3)' }}>
              
              {/* Timeline Header with Enhanced Day Summary */}
              <div className="flex justify-between items-center text-sm mb-3">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-xs" style={{ color: 'var(--foam-white)' }}>
                    Forecast {currentForecastIndex + 1} of {availableForecasts.length}
                    {compareMode && currentForecastIndex > 0 && (
                      <span className="ml-1 px-1 py-0.5 text-xs rounded" style={{ background: 'rgba(94, 234, 212, 0.2)', color: 'var(--teal-foam)' }}>
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
                          day: 'numeric' 
                        })}
                      </span>
                    </>
                  )}
                  
                  {/* Mini Calendar Dropdown */}
                  <button 
                    className="p-1 rounded transition-all duration-200"
                    style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)', color: 'var(--teal-foam)' }}
                    title="Jump to Date"
                  >
                    <Calendar className="h-3 w-3" />
                  </button>
                </div>
                
                {currentForecast && (
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    currentForecastIndex === 0 
                      ? 'confidence-high' :
                    currentForecastIndex < 3 
                      ? 'confidence-medium' :
                      'confidence-low'
                  }`}>
                    {currentForecastIndex === 0 ? 'High' : currentForecastIndex < 3 ? 'Med' : 'Low'}
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                {/* Enhanced Play/Pause Button */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-lg transition-all duration-200 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, var(--teal-mid) 0%, var(--blue-mid) 100%)', color: 'var(--foam-white)', boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)' }}
                  title={isPlaying ? 'Pause Animation' : 'Play Animation'}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>

                {/* Enhanced Timeline with Better Spacing */}
                <div className="flex-1 space-y-2">
                  {/* Progress Bar */}
                  <div className="relative">
                    <div className="w-full h-2 rounded-full" style={{ background: 'rgba(45, 62, 80, 0.6)' }}></div>
                    <div 
                      className="absolute top-0 left-0 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        background: 'linear-gradient(90deg, var(--teal-surface) 0%, var(--blue-surface) 100%)',
                        width: `${((currentForecastIndex + 1) / availableForecasts.length) * 100}%` 
                      }}
                    ></div>
                  </div>
                  
                  {/* Enhanced Forecast Buttons with Data Source Indicators */}
                  <div className="flex justify-between space-x-1">
                    {availableForecasts.map((forecast, index) => {
                      const isRealData = !forecast.isEmpty && forecast.particles.length > 0 && forecast.metadata.seed_points > 0;
                      const isDemoData = forecast.metadata.seed_points <= 3; // Demo data typically has 3 seed points
                      
                      return (
                        <button
                          key={index}
                          onClick={() => setCurrentForecastIndex(index)}
                          className={`relative w-8 h-8 rounded-lg text-xs font-bold transition-all duration-200 border-2 ${
                            index === currentForecastIndex 
                              ? 'shadow-lg scale-110' 
                              : index < currentForecastIndex
                              ? 'hover:scale-105'
                              : 'hover:scale-105'
                          }`}
                          style={index === currentForecastIndex 
                            ? { 
                                background: 'linear-gradient(135deg, var(--teal-surface) 0%, var(--blue-surface) 100%)', 
                                color: 'var(--foam-white)', 
                                borderColor: 'var(--teal-surface)',
                                boxShadow: '0 4px 12px rgba(20, 184, 166, 0.25)'
                              }
                            : index < currentForecastIndex
                            ? { 
                                background: 'rgba(20, 184, 166, 0.4)', 
                                color: 'var(--teal-foam)', 
                                borderColor: 'rgba(20, 184, 166, 0.4)' 
                              }
                            : { 
                                background: 'rgba(45, 62, 80, 0.6)', 
                                color: 'var(--foam-white)', 
                                borderColor: 'rgba(94, 234, 212, 0.2)' 
                              }
                          }
                          title={`Forecast ${index + 1} - ${new Date(forecast.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${
                            isDemoData ? ' (Demo)' : isRealData ? ' (Live)' : ' (No Data)'
                          }`}
                        >
                          {index + 1}
                          
                          {/* Data source indicator */}
                          <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border border-white/50 ${
                            isDemoData 
                              ? 'bg-orange-400' 
                              : isRealData 
                                ? 'bg-green-400' 
                                : 'bg-gray-400'
                          }`} title={
                            isDemoData 
                              ? 'Demo data' 
                              : isRealData 
                                ? 'Live satellite data' 
                                : 'No detections'
                          }></div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Enhanced Control Panel */}
                <div className="flex flex-col space-y-1 min-w-[70px]">
                  {/* Speed Control */}
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--teal-foam)' }}>Speed</label>
                    <select 
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                      className="w-full px-1 py-1 text-xs rounded border-none outline-none"
                      style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}
                    >
                      <option value={0.5} className="bg-slate-800">0.5×</option>
                      <option value={1} className="bg-slate-800">1×</option>
                      <option value={2} className="bg-slate-800">2×</option>
                      <option value={4} className="bg-slate-800">4×</option>
                    </select>
                  </div>
                  
                  {/* Loop Control */}
                  <label className="flex items-center space-x-2" title="Continuously repeat animation from day 1 to 7">
                    <input
                      type="checkbox"
                      checked={loopEnabled}
                      onChange={(e) => setLoopEnabled(e.target.checked)}
                      className="w-3 h-3 rounded text-teal-500 focus:ring-teal-400"
                      style={{ background: 'rgba(45, 62, 80, 0.6)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--teal-foam)' }}>Loop</span>
                  </label>
                  
                  {/* Compare Mode */}
                  <label className="flex items-center space-x-2" title="Compare current day with previous day overlay">
                    <input
                      type="checkbox"
                      className="w-3 h-3 rounded text-teal-500 focus:ring-teal-400"
                      style={{ background: 'rgba(45, 62, 80, 0.6)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
                      checked={compareMode}
                      onChange={(e) => setCompareMode(e.target.checked)}
                    />
                    <span className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                      Compare
                      {compareMode && currentForecastIndex > 0 && (
                        <span className="ml-1 opacity-75">({currentForecastIndex + 1} vs {currentForecastIndex})</span>
                      )}
                    </span>
                  </label>
                </div>
              </div>
              
              {/* Enhanced Status & Legend */}
              <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'rgba(94, 234, 212, 0.2)' }}>
                <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                  <span>Keyboard: Space (play/pause), ←/→ (prev/next day)</span>
                </div>
                
                {/* Data Source Legend */}
                {availableForecasts.length > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--teal-foam)' }}>Data sources:</span>
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span style={{ color: 'var(--teal-foam)' }}>Live</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                        <span style={{ color: 'var(--teal-foam)' }}>Demo</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                        <span style={{ color: 'var(--teal-foam)' }}>None</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Loading/Error Status */}
                {isLoadingForecasts && (
                  <div className="flex items-center space-x-2 text-xs">
                    <Activity className="h-3 w-3 animate-spin" style={{ color: 'var(--teal-foam)' }} />
                    <span style={{ color: 'var(--teal-foam)' }}>Loading forecast data from GitHub...</span>
                  </div>
                )}
                {forecastError && !isLoadingForecasts && (
                  <div className="flex items-center space-x-2 text-xs">
                    <Info className="h-3 w-3" style={{ color: 'var(--teal-foam)' }} />
                    <span style={{ color: 'var(--teal-foam)' }} title={forecastError}>
                      {availableForecasts.length > 0 ? 'Using cached data' : 'Using demonstration data'}
                    </span>
                  </div>
                )}
                {!isLoadingForecasts && !forecastError && availableForecasts.length > 0 && (
                  <div className="flex items-center space-x-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span style={{ color: 'var(--teal-foam)' }}>
                      {availableForecasts.length} forecast{availableForecasts.length !== 1 ? 's' : ''} loaded
                      {lastUpdateTime && ` • Updated ${lastUpdateTime.toLocaleTimeString()}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Enhanced Scale Bar - Bottom Left */}
          <div className="absolute bottom-4 left-4 pointer-events-auto">
            <div className="rounded-lg border-2 px-3 py-2" style={{ background: 'rgba(248, 250, 252, 0.25)', backdropFilter: 'blur(20px)', borderColor: 'rgba(248, 250, 252, 0.5)' }}>
              <div className="text-xs" style={{ color: 'var(--foam-white)' }}>
                <div className="border-b mb-1 w-16" style={{ borderColor: 'rgba(248, 250, 252, 0.7)' }}></div>
                <div className="font-semibold">50 km</div>
              </div>
            </div>
          </div>

          {/* Attribution Footer */}
          <div className="absolute bottom-0 right-0 bg-black/50 text-white text-xs px-2 py-1">
            © OpenStreetMap contributors
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;