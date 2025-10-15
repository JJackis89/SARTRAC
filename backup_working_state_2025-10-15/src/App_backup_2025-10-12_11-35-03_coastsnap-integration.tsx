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
import CoastSnapPoints from './components/CoastSnapPoints';

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
    grid: false,
    coastsnap: true
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
        
        // Create a 30x30 grid for Ghana region
        const concentration: number[][] = [];
        const driftDirection: number[][] = [];
        
        for (let i = 0; i < 30; i++) {
          concentration[i] = [];
          driftDirection[i] = [];
          for (let j = 0; j < 30; j++) {
            // Simulate varying concentrations with some hotspots
            const baseConcentration = Math.random() * 0.3;
            const hotspotFactor = Math.sin(i * 0.3) * Math.cos(j * 0.4) * 0.7;
            concentration[i][j] = Math.max(0, baseConcentration + hotspotFactor);
            
            // Simulate drift direction (0-360 degrees)
            driftDirection[i][j] = Math.random() * 360;
          }
        }
        
        data.push({
          date: date.toISOString().split('T')[0],
          concentration,
          driftDirection,
          uncertainty: Math.random() > 0.7 ? 'High' : Math.random() > 0.4 ? 'Medium' : 'Low'
        });
      }
      return data;
    };

    setForecastData(generateMockData());
  }, []);

  // Animation logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentDay(prev => {
          if (prev >= forecastDays) {
            if (loopEnabled) {
              return 1;
            } else {
              setIsPlaying(false);
              return prev;
            }
          }
          return prev + 1;
        });
      }, 1500 / playbackSpeed);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, forecastDays, playbackSpeed, loopEnabled]);

  const currentForecast = forecastData[currentDay - 1];

  const baseMaps = {
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ocean: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    topographic: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
  };

  const handlePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleDayChange = (day: number) => {
    setCurrentDay(day);
    setIsPlaying(false);
  };

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

  const getLocationName = (lat: number, lng: number) => {
    // Mock function - in real app, would use reverse geocoding
    const locations = [
      { name: 'Accra', lat: 5.6037, lng: -0.1870 },
      { name: 'Cape Coast', lat: 5.1053, lng: -1.2466 },
      { name: 'Takoradi', lat: 4.8845, lng: -1.7554 },
      { name: 'Tema', lat: 5.6698, lng: -0.0166 }
    ];
    
    let closest = locations[0];
    let minDistance = Math.sqrt(Math.pow(lat - closest.lat, 2) + Math.pow(lng - closest.lng, 2));
    
    locations.forEach(loc => {
      const distance = Math.sqrt(Math.pow(lat - loc.lat, 2) + Math.pow(lng - loc.lng, 2));
      if (distance < minDistance) {
        minDistance = distance;
        closest = loc;
      }
    });
    
    return closest.name;
  };

  const handleScreenshot = async (level: 'basic' | 'enhanced' | 'full' = 'enhanced') => {
    try {
      let targetElement: HTMLElement;
      let filename: string;
      
      switch (level) {
        case 'basic':
          // Just the map area
          const mapElement = document.querySelector('.leaflet-container') as HTMLElement;
          if (!mapElement) throw new Error('Map not found');
          targetElement = mapElement;
          filename = `ghana-sargassum-map-${new Date().toISOString().slice(0, 10)}.png`;
          break;
          
        case 'enhanced':
          // Map + timeline controls
          const mapContainer = document.querySelector('.leaflet-container')?.parentElement;
          const targetElement = mapContainer || document.body;
          filename = `ghana-sargassum-forecast-${new Date().toISOString().slice(0, 10)}.png`;
          break;
          
        case 'full':
        default:
          // Full application
          targetElement = document.body;
          filename = `ghana-sargassum-full-${new Date().toISOString().slice(0, 10)}.png`;
          break;
      }

      const canvas = await html2canvas(targetElement, {
        backgroundColor: '#0f1419',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        ignoreElements: (element) => {
          return element.classList.contains('screenshot-exclude');
        }
      });

      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL();
      link.click();
      
    } catch (error) {
      console.error('Screenshot failed:', error);
      // Fallback: try simpler approach
      try {
        const canvas = await html2canvas(document.body, {
          backgroundColor: '#0f1419',
          scale: 1
        });
        const link = document.createElement('a');
        link.download = `ghana-sargassum-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
      } catch (fallbackError) {
        console.error('Fallback screenshot also failed:', fallbackError);
        alert('Screenshot feature temporarily unavailable. Please try again.');
      }
    }
  };

  return (
    <div className="h-screen w-screen flex bg-dark-deep text-white overflow-hidden">
      {/* Enhanced Side Drawer with Professional Branding */}
      <div 
        className={`bg-dark-surface border-r border-teal-deep/30 transition-all duration-300 ease-in-out flex flex-col ${
          drawerOpen ? 'w-96' : 'w-16'
        } backdrop-blur-sm`}
        style={{ 
          background: 'linear-gradient(180deg, rgba(17, 75, 87, 0.95) 0%, rgba(45, 62, 80, 0.95) 100%)',
          borderRight: '1px solid rgba(94, 234, 212, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Professional Header with Ghana Branding */}
        <div className="p-6 border-b border-teal-deep/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {drawerOpen && (
                <div className="flex flex-col">
                  <h1 className="text-xl font-bold text-foam-white">
                    Ghana Sargassum Early Advisory System
                  </h1>
                  <p className="text-sm text-teal-foam">
                    Coastal Protection & Marine Forecasting
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="p-2 rounded-lg hover:bg-teal-surface/20 transition-colors"
              style={{ color: 'var(--teal-foam)' }}
            >
              {drawerOpen ? <X className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
            </button>
          </div>
          
          {/* Organizational Logos */}
          {drawerOpen && (
            <div className="flex items-center justify-between py-3 border-t border-teal-deep/20">
              <div className="flex items-center space-x-4">
                <img 
                  src={epaLogo} 
                  alt="EPA Ghana" 
                  className="h-8 w-auto opacity-90 hover:opacity-100 transition-opacity"
                />
                <div className="h-6 w-px bg-teal-deep/40"></div>
                <img 
                  src={ugLogo} 
                  alt="University of Ghana" 
                  className="h-8 w-auto opacity-90 hover:opacity-100 transition-opacity"
                />
                <div className="h-6 w-px bg-teal-deep/40"></div>
                <img 
                  src={ghLogo} 
                  alt="Republic of Ghana" 
                  className="h-8 w-auto opacity-90 hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          )}
        </div>

        {/* Controls Content */}
        {drawerOpen ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Mission Control Status */}
            <div className="p-4 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)' }}>
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium" style={{ color: 'var(--foam-white)' }}>System Status: Operational</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: 'var(--teal-foam)' }}>
                <div>Model: {modelInfo.name} {modelInfo.version}</div>
                <div>Resolution: {modelInfo.resolution}</div>
                <div className="col-span-2">Data Window: {modelInfo.dataWindow}</div>
              </div>
            </div>

            {/* Forecast Timeline */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--foam-white)' }}>Sargassum Forecast</h3>
                <span className="text-sm px-2 py-1 rounded" 
                      style={{ background: 'rgba(94, 234, 212, 0.1)', color: 'var(--teal-foam)' }}>
                  {forecastDays} Day Window
                </span>
              </div>
              
              {/* Playback Controls */}
              <div className="flex items-center space-x-3 p-3 rounded-lg" 
                   style={{ background: 'rgba(45, 62, 80, 0.4)', border: '1px solid rgba(94, 234, 212, 0.1)' }}>
                <button
                  onClick={handlePlay}
                  className="p-2 rounded-full transition-all duration-200 hover:scale-105"
                  style={{ 
                    background: isPlaying ? 'var(--teal-bright)' : 'var(--teal-surface)',
                    color: isPlaying ? 'var(--dark-deep)' : 'var(--foam-white)'
                  }}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                
                <div className="flex items-center space-x-2 flex-1">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={compareMode}
                      onChange={(e) => setCompareMode(e.target.checked)}
                      className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                      style={{ background: 'rgba(45, 62, 80, 0.8)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
                    />
                    <span className="text-xs text-teal-foam">Compare</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={loopEnabled}
                      onChange={(e) => setLoopEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                      style={{ background: 'rgba(45, 62, 80, 0.8)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
                    />
                    <span className="text-xs text-teal-foam">Loop</span>
                  </label>
                </div>
                
                <span className="text-xs px-2 py-1 rounded" 
                      style={{ background: 'rgba(94, 234, 212, 0.1)', color: 'var(--teal-foam)' }}>
                  Day {currentDay}
                </span>
              </div>

              {/* Timeline Slider */}
              <div className="space-y-2">
                <input
                  type="range"
                  min="1"
                  max={forecastDays}
                  value={currentDay}
                  onChange={(e) => handleDayChange(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer timeline-slider"
                  style={{
                    background: `linear-gradient(to right, var(--teal-bright) 0%, var(--teal-bright) ${((currentDay - 1) / (forecastDays - 1)) * 100}%, rgba(94, 234, 212, 0.2) ${((currentDay - 1) / (forecastDays - 1)) * 100}%, rgba(94, 234, 212, 0.2) 100%)`
                  }}
                />
                <div className="flex justify-between text-xs" style={{ color: 'var(--teal-foam)' }}>
                  <span>Today</span>
                  <span>+{forecastDays}d</span>
                </div>
              </div>

              {/* Current Forecast Info */}
              {currentForecast && (
                <div className="p-3 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.4)', border: '1px solid rgba(94, 234, 212, 0.1)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--foam-white)' }}>
                      {new Date(currentForecast.date).toLocaleDateString()}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      currentForecast.uncertainty === 'Low' ? 'bg-green-500/20 text-green-400' :
                      currentForecast.uncertainty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {currentForecast.uncertainty} Certainty
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                    Forecast confidence based on model ensemble variance
                  </div>
                </div>
              )}
            </div>

            {/* Layer Controls */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--foam-white)' }}>Data Layers</h3>
              
              <div className="space-y-3">
                {/* Sargassum Concentration */}
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
                        title="Sargassum biomass concentration"
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
                    <div className="space-y-3">
                      {/* Opacity Control */}
                      <div>
                        <label className="text-xs text-teal-foam block mb-2">
                          Opacity: {Math.round(opacity * 100)}%
                        </label>
                        <input
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.1"
                          value={opacity}
                          onChange={(e) => setOpacity(parseFloat(e.target.value))}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer opacity-slider"
                        />
                      </div>
                      
                      {/* Rendering Mode */}
                      <div>
                        <label className="text-xs text-teal-foam block mb-2">Rendering Style</label>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setRenderMode('smooth')}
                            className={`px-3 py-1 rounded text-xs transition-all ${
                              renderMode === 'smooth'
                                ? 'bg-teal-bright text-dark-deep'
                                : 'bg-teal-surface/20 text-teal-foam hover:bg-teal-surface/30'
                            }`}
                          >
                            Smooth
                          </button>
                          <button
                            onClick={() => setRenderMode('native')}
                            className={`px-3 py-1 rounded text-xs transition-all ${
                              renderMode === 'native'
                                ? 'bg-teal-bright text-dark-deep'
                                : 'bg-teal-surface/20 text-teal-foam hover:bg-teal-surface/30'
                            }`}
                          >
                            Native Grid
                          </button>
                        </div>
                      </div>

                      {/* Color Scale */}
                      <div className="text-xs">
                        <div className="text-teal-foam mb-1">Concentration Scale</div>
                        <div className="h-3 rounded overflow-hidden density-gradient"></div>
                        <div className="flex justify-between mt-1" style={{ color: 'var(--teal-foam)' }}>
                          <span>Low</span>
                          <span>High</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Base Map Selection */}
                <div className="p-4 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)' }}>
                  <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--foam-white)' }}>Base Map</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(baseMaps).map(([key, _]) => (
                      <button
                        key={key}
                        onClick={() => setBaseMap(key)}
                        className={`p-2 rounded text-xs transition-all ${
                          baseMap === key
                            ? 'bg-teal-bright text-dark-deep'
                            : 'bg-teal-surface/20 text-teal-foam hover:bg-teal-surface/30'
                        }`}
                      >
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bathymetry Layer */}
                <div className="p-4 rounded-lg" style={{ background: 'rgba(45, 62, 80, 0.6)', border: '1px solid rgba(94, 234, 212, 0.15)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={showLayers.bathymetry}
                        onChange={(e) => setShowLayers(prev => ({ ...prev, bathymetry: e.target.checked }))}
                        className="w-4 h-4 rounded border-0 text-teal-500 focus:ring-teal-400 focus:ring-2"
                        style={{ background: 'rgba(45, 62, 80, 0.8)', borderColor: 'rgba(94, 234, 212, 0.2)' }}
                      />
                      <span className="text-sm font-medium" style={{ color: 'var(--foam-white)' }}>Bathymetry</span>
                    </label>
                    <button 
                      className="p-1 rounded hover:bg-teal-surface/10" 
                      style={{ color: 'var(--teal-foam)' }} 
                      title="Ocean depth contours"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--teal-foam)' }}>
                    Depth contours every 200m
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
                    <button 
                      className="p-1 rounded hover:bg-teal-surface/10" 
                      style={{ color: 'var(--teal-foam)' }} 
                      title="Current direction and speed"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                  {showLayers.drift && (
                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={driftAnimated}
                          onChange={(e) => setDriftAnimated(e.target.checked)}
                          className="w-3 h-3 rounded text-teal-500"
                          style={{ background: 'rgba(45, 62, 80, 0.8)' }}
                        />
                        <span className="text-xs" style={{ color: 'var(--teal-foam)' }}>Animated</span>
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
                    <button 
                      className="p-1 rounded hover:bg-teal-surface/10" 
                      style={{ color: 'var(--teal-foam)' }} 
                      title="Model prediction confidence"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                  {showLayers.uncertainty && (
                    <div className="space-y-2">
                      <label className="text-xs" style={{ color: 'var(--teal-foam)' }}>Display Style</label>
                      <div className="flex space-x-1">
                        {['alpha', 'contour', 'hatching'].map((style) => (
                          <button
                            key={style}
                            onClick={() => setUncertaintyStyle(style as any)}
                            className={`px-2 py-1 rounded text-xs ${
                              uncertaintyStyle === style
                                ? 'bg-teal-bright text-dark-deep'
                                : 'bg-teal-surface/20 text-teal-foam'
                            }`}
                          >
                            {style.charAt(0).toUpperCase() + style.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ghana Regional Quick Navigation */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--foam-white)' }}>Ghana Coastal Regions</h3>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { name: 'Greater Accra', center: [5.6037, -0.1870] as LatLngExpression, zoom: 9 },
                  { name: 'Central Region', center: [5.1053, -1.2466] as LatLngExpression, zoom: 9 },
                  { name: 'Western Region', center: [4.8845, -1.7554] as LatLngExpression, zoom: 9 },
                  { name: 'Volta Region', center: [6.1108, 0.6971] as LatLngExpression, zoom: 9 }
                ].map((region) => (
                  <button
                    key={region.name}
                    onClick={() => {
                      if (mapRef.current) {
                        mapRef.current.setView(region.center, region.zoom);
                      }
                    }}
                    className="p-2 rounded text-left text-sm transition-all hover:bg-teal-surface/20"
                    style={{ color: 'var(--teal-foam)' }}
                  >
                    <MapPin className="h-4 w-4 inline mr-2" />
                    {region.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-4 border-t border-teal-deep/30">
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleScreenshot('enhanced')}
                  className="flex items-center justify-center space-x-2 p-3 rounded-lg transition-all hover:bg-teal-surface/20"
                  style={{ color: 'var(--teal-foam)', border: '1px solid rgba(94, 234, 212, 0.2)' }}
                >
                  <Camera className="h-4 w-4" />
                  <span className="text-sm">Export</span>
                </button>
                <button className="flex items-center justify-center space-x-2 p-3 rounded-lg transition-all hover:bg-teal-surface/20"
                        style={{ color: 'var(--teal-foam)', border: '1px solid rgba(94, 234, 212, 0.2)' }}>
                  <Share className="h-4 w-4" />
                  <span className="text-sm">Share</span>
                </button>
              </div>
              <button className="w-full flex items-center justify-center space-x-2 p-3 rounded-lg transition-all hover:bg-teal-surface/20"
                      style={{ color: 'var(--teal-foam)', border: '1px solid rgba(94, 234, 212, 0.2)' }}>
                <HelpCircle className="h-4 w-4" />
                <span className="text-sm">Help & Documentation</span>
              </button>
            </div>
          </div>
        ) : (
          // Collapsed drawer - icon only
          <div className="flex flex-col items-center space-y-4 pt-20">
            <button 
              onClick={handlePlay}
              className="p-3 rounded-full"
              style={{ 
                background: isPlaying ? 'var(--teal-bright)' : 'var(--teal-surface)',
                color: isPlaying ? 'var(--dark-deep)' : 'var(--foam-white)'
              }}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button 
              onClick={() => handleScreenshot('enhanced')}
              className="p-3 rounded-full hover:bg-teal-surface/20"
              style={{ color: 'var(--teal-foam)' }}
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative">
        {/* Map Header */}
        <div className="absolute top-0 left-0 right-0 z-10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                Sargassum Forecast
              </h2>
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full" 
                   style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}>
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm text-white">Live Data</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-2 rounded-lg bg-black/40 hover:bg-black/60 text-white transition-colors backdrop-blur-sm">
                <User className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div 
          className="h-full"
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
              <>
                <SargassumOverlay
                  data={currentForecast.concentration}
                  opacity={compareMode ? opacity * 0.7 : opacity}
                  bounds={GHANA_BOUNDS}
                  renderMode={renderMode}
                />
                {compareMode && currentDay > 1 && forecastData[currentDay - 2] && (
                  <SargassumOverlay
                    data={forecastData[currentDay - 2].concentration}
                    opacity={opacity * 0.5}
                    bounds={GHANA_BOUNDS}
                    renderMode={renderMode}
                  />
                )}
              </>
            )}
            
            {showLayers.coastsnap && <CoastSnapPoints visible={showLayers.coastsnap} />}
          </MapContainer>

          {/* Enhanced Map Utilities - Bottom Right - MOVED HERE */}
          <div className="absolute bottom-6 right-6 z-20">
            <div 
              className="map-utilities flex flex-col space-y-3 p-4 rounded-lg"
              style={{ 
                background: 'rgba(17, 75, 87, 0.95)', 
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(94, 234, 212, 0.2)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
              }}
            >
              <button
                onClick={handleZoomIn}
                className="map-utility-btn p-3 rounded-lg transition-all hover:bg-teal-surface/20 hover:scale-105"
                style={{ color: 'var(--foam-white)' }}
                title="Zoom In"
                aria-label="Zoom in to map"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              
              <button
                onClick={handleZoomOut}
                className="map-utility-btn p-3 rounded-lg transition-all hover:bg-teal-surface/20 hover:scale-105"
                style={{ color: 'var(--foam-white)' }}
                title="Zoom Out"
                aria-label="Zoom out of map"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              
              <button
                onClick={handleResetView}
                className="map-utility-btn p-3 rounded-lg transition-all hover:bg-teal-surface/20 hover:scale-105"
                style={{ color: 'var(--foam-white)' }}
                title="Reset View"
                aria-label="Reset map view to Ghana"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              
              <div className="w-full h-px bg-teal-deep/30"></div>
              
              <button
                onClick={() => handleScreenshot('basic')}
                className="map-utility-btn p-3 rounded-lg transition-all hover:bg-teal-surface/20 hover:scale-105"
                style={{ color: 'var(--foam-white)' }}
                title="Screenshot Map"
                aria-label="Take screenshot of current map view"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Search Overlay */}
          {showSearch && (
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-30 w-96">
              <div className="p-4 rounded-lg" style={{ 
                background: 'rgba(17, 75, 87, 0.95)', 
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(94, 234, 212, 0.2)'
              }}>
                <div className="flex items-center space-x-3">
                  <Search className="h-5 w-5" style={{ color: 'var(--teal-foam)' }} />
                  <input
                    type="text"
                    placeholder="Search Ghana coastal locations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-b border-teal-deep/30 text-white placeholder-teal-foam/70 outline-none"
                  />
                  <button
                    onClick={() => setShowSearch(false)}
                    className="p-1 hover:bg-teal-surface/20 rounded"
                    style={{ color: 'var(--teal-foam)' }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;