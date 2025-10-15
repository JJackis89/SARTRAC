import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import html2canvas from 'html2canvas';
import { 
  Waves, 
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
  Calendar
} from 'lucide-react';
import SargassumOverlay from './components/SargassumOverlay';
import MapController from './components/MapController';

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

interface ForecastData {
  date: string;
  concentration: number[][];
  driftDirection: number[][];
  uncertainty: 'Low' | 'Medium' | 'High';
}

function App() {
  const mapRef = useRef<L.Map | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [forecastDays, setForecastDays] = useState(7);
  const [opacity, setOpacity] = useState(0.7);
  const [showLayers, setShowLayers] = useState({
    density: true,
    drift: false,
    uncertainty: false,
    bathymetry: false,
    grid: false
  });
  const [baseMap, setBaseMap] = useState('satellite');
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const [lastUpdated] = useState(new Date().toISOString());
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  // Enhanced layer controls
  const [renderMode, setRenderMode] = useState<'native' | 'smooth'>('smooth');
  const [showGridCells, setShowGridCells] = useState(false);
  const [driftAnimated, setDriftAnimated] = useState(true);
  const [uncertaintyStyle, setUncertaintyStyle] = useState<'alpha' | 'contour' | 'hatching'>('alpha');
  const [collapsedLayers, setCollapsedLayers] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Mission control metadata
  const modelInfo = {
    name: 'SARTRAC',
    version: 'v2.1',
    resolution: '1 km',
    dataWindow: '2025-10-11 18:00–24:00 UTC'
  };

  // Callback to receive map instance from MapController
  const handleMapReady = (map: L.Map) => {
    mapRef.current = map;
  };

  // Generate mock forecast data
  useEffect(() => {
    const generateMockData = (): ForecastData[] => {
      const data: ForecastData[] = [];
      for (let day = 1; day <= 7; day++) {
        const date = new Date();
        date.setDate(date.getDate() + day);
        
        const concentration: number[][] = [];
        const driftDirection: number[][] = [];
        
        for (let lat = 0; lat < 20; lat++) {
          concentration[lat] = [];
          driftDirection[lat] = [];
          for (let lng = 0; lng < 20; lng++) {
            const baseConcentration = Math.sin(lat * 0.3) * Math.cos(lng * 0.3);
            concentration[lat][lng] = Math.max(0, baseConcentration + Math.random() * 0.5);
            driftDirection[lat][lng] = (day * 45 + lat * 10 + lng * 5) % 360;
          }
        }
        
        data.push({
          date: date.toISOString().split('T')[0],
          concentration,
          driftDirection,
          uncertainty: day <= 3 ? 'Low' : day <= 5 ? 'Medium' : 'High'
        });
      }
      return data;
    };

    setForecastData(generateMockData());
  }, []);

  // Auto-play animation
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentDay(prev => {
          const next = prev >= forecastDays ? (loopEnabled ? 1 : prev) : prev + 1;
          if (!loopEnabled && next === prev) {
            setIsPlaying(false);
          }
          return next;
        });
      }, 1500 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, forecastDays, playbackSpeed, loopEnabled]);

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
          if (e.shiftKey) {
            // Shift+Left for hour scrubbing (if available)
            setCurrentDay(prev => Math.max(1, prev - 1));
          } else {
            setCurrentDay(prev => Math.max(1, prev - 1));
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Right for hour scrubbing (if available)
            setCurrentDay(prev => Math.min(forecastDays, prev + 1));
          } else {
            setCurrentDay(prev => Math.min(forecastDays, prev + 1));
          }
          break;
        case 'Home':
          e.preventDefault();
          setCurrentDay(1);
          break;
        case 'End':
          e.preventDefault();
          setCurrentDay(forecastDays);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, forecastDays]);

  const currentForecast = forecastData[currentDay - 1];

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
        link.download = `ghana-sargassum-forecast-day${currentDay}-${Date.now()}.png`;
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
      const text = `Ghana Sargassum Early Advisory System - Day ${currentDay} Forecast`;
      
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
                <p className="text-xs" style={{ color: 'var(--teal-foam)' }}>Ocean Forecast</p>
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
            {/* Enhanced Live Status with tooltip */}
            <div className="relative group">
              <div className="flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer" style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#86efac' }}></div>
                <span className="text-sm font-bold" style={{ color: '#86efac' }}>Live</span>
              </div>
              
              {/* Tooltip */}
              <div className="absolute top-full right-0 mt-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50" style={{ background: 'var(--ocean-glass)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}>
                <div>Assimilated to: Oct 11, 19:00 UTC</div>
                <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>Last update: 3 min ago</div>
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
          <div className="h-full w-80 overflow-y-auto" style={{ background: 'var(--ocean-glass)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(94, 234, 212, 0.2)', boxShadow: '0 8px 32px rgba(10, 15, 28, 0.3)' }}>
            {drawerOpen && (
              <div className="p-6 space-y-6">
                {/* Drawer Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--foam-white)' }}>Layers & Forecast</h2>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="p-2 rounded-lg transition-all duration-200"
                    style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)', color: 'var(--teal-foam)' }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Forecast Range Section - Sticky */}
                <div className="space-y-4">
                  <div className="sticky top-0 z-10 p-3 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(94, 234, 212, 0.2)' }}>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--foam-white)' }}>Forecast Range</h3>
                  </div>
                  <div className="px-3">
                    <select 
                      value={forecastDays}
                      onChange={(e) => setForecastDays(parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg text-sm border-none outline-none transition-all duration-200"
                      style={{ background: 'rgba(45, 62, 80, 0.8)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}
                    >
                      <option value={3} className="bg-slate-800">3 Days (High Confidence)</option>
                      <option value={5} className="bg-slate-800">5 Days (Medium Confidence)</option>
                      <option value={7} className="bg-slate-800">7 Days (Lower Confidence)</option>
                    </select>
                  </div>
                </div>

                {/* Data Layers Section - Sticky */}
                <div className="space-y-4">
                  <div className="sticky top-0 z-10 p-3 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(94, 234, 212, 0.2)' }}>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--foam-white)' }}>Data Layers</h3>
                  </div>
                  
                  <div className="px-3 space-y-3">
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
                            checked={showLayers.density}
                            onChange={(e) => setShowLayers(prev => ({ ...prev, density: e.target.checked }))}
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
                                className={`btn-secondary text-xs px-3 py-1 ${renderMode === 'smooth' ? 'bg-teal-surface/20' : ''}`}
                              >
                                Smooth
                              </button>
                              <button
                                onClick={() => setRenderMode('native')}
                                className={`btn-secondary text-xs px-3 py-1 ${renderMode === 'native' ? 'bg-teal-surface/20' : ''}`}
                              >
                                Native Grid
                              </button>
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
            
            {currentForecast && showLayers.density && (
              <SargassumOverlay
                data={currentForecast.concentration}
                opacity={opacity}
                bounds={GHANA_BOUNDS}
              />
            )}
          </MapContainer>
        </div>

        {/* Floating Controls - Outside Map Container */}
        <div className={`fixed inset-0 pointer-events-none z-[500] transition-all duration-300 ${drawerOpen ? 'left-80' : 'left-0'}`} style={{ top: '4rem' }}>
          {/* Enhanced Timeline Player - Bottom Center */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
            <div className="rounded-xl border-2 shadow-2xl p-4 min-w-96" style={{ background: 'rgba(248, 250, 252, 0.25)', backdropFilter: 'blur(20px)', borderColor: 'rgba(248, 250, 252, 0.5)', boxShadow: '0 8px 32px rgba(10, 15, 28, 0.3)' }}>
              
              {/* Timeline Header with Enhanced Day Summary */}
              <div className="flex justify-between items-center text-sm mb-4">
                <div className="flex items-center space-x-3">
                  <span className="font-medium" style={{ color: 'var(--foam-white)' }}>
                    Day {currentDay} of {forecastDays}
                  </span>
                  {currentForecast && (
                    <>
                      <span style={{ color: 'var(--teal-foam)' }}>•</span>
                      <span className="font-semibold" style={{ color: 'var(--foam-white)' }}>
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
                    <Calendar className="h-4 w-4" />
                  </button>
                </div>
                
                {currentForecast && (
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    currentForecast.uncertainty === 'Low' 
                      ? 'confidence-high' :
                    currentForecast.uncertainty === 'Medium' 
                      ? 'confidence-medium' :
                      'confidence-low'
                  }`}>
                    {currentForecast.uncertainty} Confidence
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Enhanced Play/Pause Button */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-3 rounded-lg transition-all duration-200 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, var(--teal-mid) 0%, var(--blue-mid) 100%)', color: 'var(--foam-white)', boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)' }}
                  title={isPlaying ? 'Pause Animation' : 'Play Animation'}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                {/* Enhanced Timeline with Better Spacing */}
                <div className="flex-1 space-y-3">
                  {/* Progress Bar */}
                  <div className="relative">
                    <div className="w-full h-2 rounded-full" style={{ background: 'rgba(45, 62, 80, 0.6)' }}></div>
                    <div 
                      className="absolute top-0 left-0 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        background: 'linear-gradient(90deg, var(--teal-surface) 0%, var(--blue-surface) 100%)',
                        width: `${(currentDay / forecastDays) * 100}%` 
                      }}
                    ></div>
                  </div>
                  
                  {/* Day Buttons with 8pt Grid Spacing */}
                  <div className="flex justify-between space-x-2">
                    {Array.from({ length: forecastDays }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        onClick={() => setCurrentDay(day)}
                        className={`w-10 h-10 rounded-lg text-sm font-bold transition-all duration-200 border-2 ${
                          day === currentDay 
                            ? 'shadow-lg scale-110' 
                            : day < currentDay
                            ? 'hover:scale-105'
                            : 'hover:scale-105'
                        }`}
                        style={day === currentDay 
                          ? { 
                              background: 'linear-gradient(135deg, var(--teal-surface) 0%, var(--blue-surface) 100%)', 
                              color: 'var(--foam-white)', 
                              borderColor: 'var(--teal-surface)',
                              boxShadow: '0 4px 12px rgba(20, 184, 166, 0.25)'
                            }
                          : day < currentDay
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
                        title={`Day ${day} - ${forecastData[day - 1] ? new Date(forecastData[day - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Enhanced Control Panel */}
                <div className="flex flex-col space-y-2 min-w-[80px]">
                  {/* Speed Control */}
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--teal-foam)' }}>Speed</label>
                    <select 
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                      className="w-full px-2 py-1 text-xs rounded border-none outline-none"
                      style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.2)', color: 'var(--foam-white)' }}
                    >
                      <option value={0.5} className="bg-slate-800">0.5×</option>
                      <option value={1} className="bg-slate-800">1×</option>
                      <option value={2} className="bg-slate-800">2×</option>
                      <option value={4} className="bg-slate-800">4×</option>
                    </select>
                  </div>
                  
                  {/* Loop Control */}
                  <label className="flex items-center space-x-2">
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
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      className="w-3 h-3 rounded text-teal-500 focus:ring-teal-400"
                      style={{ background: 'rgba(45, 62, 80, 0.6)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--teal-foam)' }}>Compare</span>
                  </label>
                </div>
              </div>
              
              {/* Keyboard Shortcuts Hint */}
              <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: 'rgba(94, 234, 212, 0.2)', color: 'var(--teal-foam)' }}>
                <span>Keyboard: Space (play/pause), ←/→ (prev/next day)</span>
              </div>
            </div>
          </div>

          {/* Enhanced Map Utilities - Bottom Right */}
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