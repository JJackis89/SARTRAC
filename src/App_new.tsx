import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { LatLngExpression } from 'leaflet';
import { 
  Waves, 
  MapPin, 
  Menu, 
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
  Pause
} from 'lucide-react';
import SargassumOverlay from './components/SargassumOverlay';
import 'leaflet/dist/leaflet.css';

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [forecastDays, setForecastDays] = useState(7);
  const [opacity, setOpacity] = useState(0.7);
  const [showLayers, setShowLayers] = useState({
    density: true,
    drift: false,
    uncertainty: false
  });
  const [baseMap, setBaseMap] = useState('satellite');
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const [lastUpdated] = useState(new Date().toISOString());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(false);

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

  const currentForecast = forecastData[currentDay - 1];

  const baseMaps = {
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    minimal: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Global Header - 64px tall, sticky */}
      <header className="sticky top-0 z-50 h-16 bg-white/10 backdrop-blur-xl border-b border-white/20 shadow-lg">
        <div className="h-full px-4 flex items-center justify-between">
          {/* Left: Product Logo */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg shadow-lg">
              <Waves className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">SARTRAC</h1>
              <p className="text-xs text-cyan-200">Ocean Forecast</p>
            </div>
          </div>
          
          {/* Center: Location, Range, Timestamp, Status */}
          <div className="flex items-center space-x-6">
            {/* Location Selector */}
            <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/20">
              <MapPin className="h-4 w-4 text-cyan-300" />
              <select className="bg-transparent text-white text-sm font-medium focus:outline-none appearance-none cursor-pointer">
                <option className="bg-slate-800">Ghana Coast</option>
                <option className="bg-slate-800">Western Region</option>
                <option className="bg-slate-800">Central Region</option>
                <option className="bg-slate-800">Greater Accra</option>
              </select>
              <ChevronDown className="h-3 w-3 text-cyan-300" />
            </div>
            
            {/* Forecast Range */}
            <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg border border-white/20">
              <span className="text-white text-sm font-medium">{forecastDays} Day Forecast</span>
            </div>
            
            {/* Run Timestamp */}
            <div className="text-sm text-cyan-200">
              <span className="font-medium">Updated:</span>
              <span className="text-white font-bold ml-1">
                {new Date(lastUpdated).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>
            
            {/* Live Status */}
            <div className="flex items-center space-x-2 bg-green-500/20 border border-green-400/30 px-3 py-2 rounded-lg">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-300 text-sm font-bold">Live</span>
            </div>
          </div>
          
          {/* Right: Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="p-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg transition-all duration-300 shadow-lg"
            >
              <Layers className="h-4 w-4" />
            </button>
            
            <button className="p-2 text-cyan-300 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300">
              <Share className="h-4 w-4" />
            </button>
            
            <button className="p-2 text-cyan-300 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300">
              <HelpCircle className="h-4 w-4" />
            </button>
            
            <button className="p-2 text-cyan-300 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300">
              <User className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-full relative">
        {/* Layers & Forecast Drawer */}
        <div className={`absolute top-0 left-0 h-full z-40 transition-all duration-300 ease-in-out ${
          drawerOpen ? 'w-80' : 'w-0'
        } overflow-hidden`}>
          <div className="h-full w-80 bg-white/10 backdrop-blur-xl border-r border-white/20 shadow-2xl overflow-y-auto">
            {drawerOpen && (
              <div className="p-4 space-y-6">
                {/* Drawer Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Layers & Forecast</h2>
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="p-2 text-cyan-300 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Forecast Range Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-white sticky top-0 bg-white/5 backdrop-blur-sm p-2 rounded-lg">
                    Forecast Range
                  </h3>
                  <select 
                    value={forecastDays}
                    onChange={(e) => setForecastDays(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    <option value={3} className="bg-slate-800">3 Days (High Confidence)</option>
                    <option value={5} className="bg-slate-800">5 Days (Medium Confidence)</option>
                    <option value={7} className="bg-slate-800">7 Days (Lower Confidence)</option>
                  </select>
                </div>

                {/* Data Layers Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-white sticky top-0 bg-white/5 backdrop-blur-sm p-2 rounded-lg">
                    Data Layers
                  </h3>
                  
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={showLayers.density}
                      onChange={(e) => setShowLayers(prev => ({ ...prev, density: e.target.checked }))}
                      className="w-4 h-4 rounded border-white/20 bg-white/10 text-cyan-500 focus:ring-cyan-400"
                    />
                    <span className="text-white text-sm">Sargassum Density</span>
                  </label>
                  
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={showLayers.drift}
                      onChange={(e) => setShowLayers(prev => ({ ...prev, drift: e.target.checked }))}
                      className="w-4 h-4 rounded border-white/20 bg-white/10 text-cyan-500 focus:ring-cyan-400"
                    />
                    <span className="text-white text-sm">Drift Vectors</span>
                  </label>
                  
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={showLayers.uncertainty}
                      onChange={(e) => setShowLayers(prev => ({ ...prev, uncertainty: e.target.checked }))}
                      className="w-4 h-4 rounded border-white/20 bg-white/10 text-cyan-500 focus:ring-cyan-400"
                    />
                    <span className="text-white text-sm">Uncertainty</span>
                  </label>

                  {/* Layer Opacity */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-white mb-2">Layer Opacity</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={opacity}
                      onChange={(e) => setOpacity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="text-xs text-cyan-300 mt-1">{Math.round(opacity * 100)}%</div>
                  </div>
                </div>

                {/* Legend Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-white sticky top-0 bg-white/5 backdrop-blur-sm p-2 rounded-lg">
                    Legend
                  </h3>
                  
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-xs text-cyan-100 mb-2">Sargassum Density</div>
                    <div className="relative">
                      <div className="w-full h-3 bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500 rounded-full"></div>
                      <div className="flex justify-between text-xs text-cyan-200 mt-1">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                      </div>
                    </div>
                    
                    <div className="mt-3 text-xs text-cyan-200">
                      <div>Source: Satellite + Ocean Models</div>
                      <div>Resolution: 1km grid</div>
                    </div>
                    
                    {/* Live Coverage */}
                    <div className="mt-3">
                      <div className="text-xs text-cyan-100 mb-2">Live Coverage</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                          <span className="text-white">12%</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                          <span className="text-white">28%</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          <span className="text-white">35%</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                          <span className="text-white">25%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Map Style Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-white sticky top-0 bg-white/5 backdrop-blur-sm p-2 rounded-lg">
                    Map Style
                  </h3>
                  
                  <select 
                    value={baseMap}
                    onChange={(e) => setBaseMap(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    <option value="satellite" className="bg-slate-800">Satellite</option>
                    <option value="terrain" className="bg-slate-800">Terrain</option>
                    <option value="minimal" className="bg-slate-800">Minimal</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Map Area */}
        <div className={`flex-1 transition-all duration-300 ${drawerOpen ? 'ml-80' : 'ml-0'}`}>
          <MapContainer
            center={GHANA_CENTER}
            zoom={7}
            maxBounds={GHANA_BOUNDS}
            className="h-full w-full"
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              url={baseMaps[baseMap as keyof typeof baseMaps]}
              attribution="© OpenStreetMap contributors"
            />
            
            {currentForecast && showLayers.density && (
              <SargassumOverlay
                data={currentForecast.concentration}
                opacity={opacity}
                bounds={GHANA_BOUNDS}
              />
            )}
          </MapContainer>

          {/* Timeline Player - Bottom Center */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30">
            <div className="bg-white/15 backdrop-blur-xl rounded-xl border border-white/25 shadow-2xl p-4 min-w-96">
              <div className="flex items-center space-x-4">
                {/* Play/Pause Button */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg transition-all duration-300 shadow-lg"
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                {/* Timeline */}
                <div className="flex-1 space-y-2">
                  {/* Day Info */}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white font-medium">
                      Day {currentDay} of {forecastDays} • {currentForecast && new Date(currentForecast.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {currentForecast && (
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        currentForecast.uncertainty === 'Low' 
                          ? 'bg-green-500/80 text-green-100' :
                        currentForecast.uncertainty === 'Medium' 
                          ? 'bg-yellow-500/80 text-yellow-100' :
                          'bg-red-500/80 text-red-100'
                      }`}>
                        {currentForecast.uncertainty}
                      </span>
                    )}
                  </div>
                  
                  {/* Day Buttons */}
                  <div className="flex justify-between">
                    {Array.from({ length: forecastDays }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        onClick={() => setCurrentDay(day)}
                        className={`w-10 h-10 rounded-full text-sm font-bold transition-all duration-300 border-2 ${
                          day === currentDay 
                            ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white border-cyan-300 shadow-lg scale-110' 
                            : day < currentDay
                            ? 'bg-cyan-500/40 text-cyan-200 border-cyan-400/40 hover:bg-cyan-500/60'
                            : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speed Control */}
                <div className="flex flex-col space-y-1">
                  <select 
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                    className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs"
                  >
                    <option value={0.5} className="bg-slate-800">0.5×</option>
                    <option value={1} className="bg-slate-800">1×</option>
                    <option value={2} className="bg-slate-800">2×</option>
                  </select>
                  
                  <label className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={loopEnabled}
                      onChange={(e) => setLoopEnabled(e.target.checked)}
                      className="w-3 h-3"
                    />
                    <span className="text-xs text-cyan-200">Loop</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Map Utilities - Bottom Right */}
          <div className="absolute bottom-4 right-4 z-30">
            <div className="bg-white/15 backdrop-blur-xl rounded-xl border border-white/25 shadow-xl p-2 space-y-2">
              <button className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-300 flex items-center justify-center">
                <ZoomIn size={16} />
              </button>
              <button className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-300 flex items-center justify-center">
                <ZoomOut size={16} />
              </button>
              <button className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-300 flex items-center justify-center">
                <Compass size={16} />
              </button>
              <button className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-300 flex items-center justify-center">
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          {/* Scale Bar - Bottom Left */}
          <div className="absolute bottom-4 left-4 z-30">
            <div className="bg-white/15 backdrop-blur-xl rounded-lg border border-white/25 px-3 py-2">
              <div className="text-xs text-white">
                <div className="border-b border-white/30 w-16 mb-1"></div>
                <div>50 km</div>
              </div>
            </div>
          </div>

          {/* Attribution Footer */}
          <div className="absolute bottom-0 right-0 z-30 bg-black/50 text-white text-xs px-2 py-1">
            © OpenStreetMap contributors
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;