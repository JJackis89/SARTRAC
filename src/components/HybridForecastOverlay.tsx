import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { RealSatelliteService } from '../services/realSatelliteService';
import { SatelliteObservation } from '../services/satelliteService';
import { ForecastData } from '../services/forecastService';

interface HybridForecastOverlayProps {
  currentStep: number;
  forecastData: ForecastData[];
  isVisible: boolean;
  opacity: number;
  onDataUpdate?: (stats: any) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

type DataMode = 'model-only' | 'satellite-only' | 'hybrid';
type SatelliteSource = 'VIIRS' | 'OLCI' | 'ALL';

interface SatelliteStats {
  totalObservations: number;
  viirsObservations: number;
  olciObservations: number;
  qualityScore: number;
  coverage: number;
  lastUpdate: Date;
  serverHealth: { [server: string]: boolean };
}

const HybridForecastOverlay: React.FC<HybridForecastOverlayProps> = ({
  currentStep,
  forecastData,
  isVisible,
  opacity,
  onDataUpdate,
  onLoadingChange
}) => {
  const [dataMode, setDataMode] = useState<DataMode>('hybrid');
  const [satelliteSource, setSatelliteSource] = useState<SatelliteSource>('ALL');
  const [satelliteData, setSatelliteData] = useState<SatelliteObservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SatelliteStats | null>(null);
  const [showQualityPanel, setShowQualityPanel] = useState(false);

  const realSatelliteService = useRef(new RealSatelliteService());
  const particleLayerRef = useRef<L.LayerGroup | null>(null);
  const satelliteLayerRef = useRef<L.LayerGroup | null>(null);

  // Update component when forecast data changes
  useEffect(() => {
    if (isVisible) {
      updateVisualization();
    }
  }, [currentStep, forecastData, isVisible, dataMode, satelliteSource, opacity]);

  // Fetch satellite data for current time step
  const fetchSatelliteData = async () => {
    if (!forecastData || forecastData.length === 0) return;

    setIsLoading(true);
    setError(null);
    
    if (onLoadingChange) {
      onLoadingChange(true);
    }

    try {
      const currentForecast = forecastData[currentStep] || forecastData[0];

      console.log(`🛰️ Fetching satellite data for ${currentForecast.date}`);

      // Ghana coastal bounds
      const bounds: [number, number, number, number] = [7.0, 3.0, 2.5, -4.5]; // [north, south, east, west]

      const comprehensiveData = await realSatelliteService.current.getComprehensiveSatelliteData(
        currentForecast.date,
        bounds
      );

      // Filter data based on selected source
      let filteredData: SatelliteObservation[] = [];
      if (satelliteSource === 'ALL') {
        filteredData = comprehensiveData.combined;
      } else if (satelliteSource === 'VIIRS') {
        filteredData = comprehensiveData.viirs.data;
      } else if (satelliteSource === 'OLCI') {
        filteredData = comprehensiveData.olci.data;
      }

      setSatelliteData(filteredData);

      // Update statistics
      const healthStatus = realSatelliteService.current.getHealthStatus();
      const newStats: SatelliteStats = {
        totalObservations: filteredData.length,
        viirsObservations: comprehensiveData.viirs.data.length,
        olciObservations: comprehensiveData.olci.data.length,
        qualityScore: comprehensiveData.overall_quality,
        coverage: Math.max(
          comprehensiveData.viirs.metadata.coverage_percentage,
          comprehensiveData.olci.metadata.coverage_percentage
        ),
        lastUpdate: new Date(),
        serverHealth: healthStatus
      };

      setStats(newStats);

      if (onDataUpdate) {
        onDataUpdate(newStats);
      }

      console.log(`✅ Loaded ${filteredData.length} satellite observations`);

    } catch (err) {
      console.error('❌ Failed to fetch satellite data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch satellite data');
    } finally {
      setIsLoading(false);
      if (onLoadingChange) {
        onLoadingChange(false);
      }
    }
  };

  // Update visualization based on current mode
  const updateVisualization = () => {
    if (dataMode === 'satellite-only' || dataMode === 'hybrid') {
      fetchSatelliteData();
    }
  };

  // Component for rendering on the map
  const MapRenderer: React.FC = () => {
    const map = useMap();

    useEffect(() => {
      if (!isVisible) {
        // Clear all layers
        if (particleLayerRef.current) {
          map.removeLayer(particleLayerRef.current);
        }
        if (satelliteLayerRef.current) {
          map.removeLayer(satelliteLayerRef.current);
        }
        return;
      }

      // Render model particles
      if (dataMode === 'model-only' || dataMode === 'hybrid') {
        renderModelParticles(map);
      }

      // Render satellite observations
      if ((dataMode === 'satellite-only' || dataMode === 'hybrid') && satelliteData.length > 0) {
        renderSatelliteObservations(map);
      }

    }, [map, isVisible, dataMode, satelliteData, currentStep, opacity]);

    return null;
  };

  // Render model particles (existing forecast visualization)
  const renderModelParticles = (map: L.Map) => {
    if (particleLayerRef.current) {
      map.removeLayer(particleLayerRef.current);
    }

    if (!forecastData || forecastData.length === 0) return;

    particleLayerRef.current = L.layerGroup();

    const currentData = forecastData[currentStep] || forecastData[0];
    if (!currentData?.particles) return;

    currentData.particles.forEach((particle) => {
      // Generate density based on particle clustering or use default
      const density = Math.random() * 0.8 + 0.2; // Mock density for now
      const size = Math.max(2, density * 8);
      
      // Color based on density with transparency for hybrid mode
      const baseOpacity = dataMode === 'hybrid' ? 0.6 : 0.8;
      const color = density > 0.7 ? '#d73027' : 
                   density > 0.4 ? '#f46d43' : 
                   density > 0.2 ? '#fdae61' : '#74add1';

      const circle = L.circleMarker([particle.lat, particle.lon], {
        radius: size,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: opacity * baseOpacity,
        fillOpacity: opacity * baseOpacity * 0.6
      });

      circle.bindPopup(`
        <div class="bg-white p-2 rounded shadow">
          <strong>Model Prediction</strong><br>
          Density: ${(density * 100).toFixed(1)}%<br>
          Location: ${particle.lat.toFixed(3)}, ${particle.lon.toFixed(3)}<br>
          Status: ${particle.status}<br>
          Time: ${new Date(particle.forecast_time).toLocaleString()}
        </div>
      `);

      particleLayerRef.current!.addLayer(circle);
    });

    map.addLayer(particleLayerRef.current);
  };

  // Render satellite observations
  const renderSatelliteObservations = (map: L.Map) => {
    if (satelliteLayerRef.current) {
      map.removeLayer(satelliteLayerRef.current);
    }

    satelliteLayerRef.current = L.layerGroup();

    satelliteData.forEach((obs) => {
      const sargassumIndex = obs.sargassumIndex;
      const confidence = obs.confidence;
      
      // Size based on sargassum index
      const size = Math.max(3, sargassumIndex * 10);
      
      // Color based on sargassum index and satellite source
      let color: string;
      if (obs.satelliteName === 'VIIRS') {
        color = sargassumIndex > 0.7 ? '#8e0152' : 
                sargassumIndex > 0.4 ? '#c51b7d' : 
                sargassumIndex > 0.2 ? '#de77ae' : '#7fbc41';
      } else { // OLCI
        color = sargassumIndex > 0.7 ? '#276419' : 
                sargassumIndex > 0.4 ? '#4d9221' : 
                sargassumIndex > 0.2 ? '#7fbc41' : '#abd9e9';
      }

      // Adjust opacity based on confidence and hybrid mode
      const baseOpacity = dataMode === 'hybrid' ? 0.7 : 0.9;
      const adjustedOpacity = opacity * baseOpacity * confidence;

      // Create marker with different symbols for different satellites
      const markerOptions: L.CircleMarkerOptions = {
        radius: size,
        fillColor: color,
        color: obs.satelliteName === 'VIIRS' ? '#ffffff' : '#000000',
        weight: obs.satelliteName === 'VIIRS' ? 2 : 1,
        opacity: adjustedOpacity,
        fillOpacity: adjustedOpacity * 0.8
      };

      const marker = L.circleMarker([obs.lat, obs.lon], markerOptions);

      // Enhanced popup with satellite details
      marker.bindPopup(`
        <div class="bg-white p-3 rounded shadow-lg">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-lg">🛰️</span>
            <strong>${obs.satelliteName}</strong>
          </div>
          <div class="space-y-1 text-sm">
            <div>Sargassum Index: <strong>${(sargassumIndex * 100).toFixed(1)}%</strong></div>
            <div>Confidence: <strong>${(confidence * 100).toFixed(1)}%</strong></div>
            <div>Location: ${obs.lat.toFixed(4)}, ${obs.lon.toFixed(4)}</div>
            <div>Time: ${new Date(obs.timestamp).toLocaleString()}</div>
            ${obs.cloudCover ? `<div>Cloud Cover: ${obs.cloudCover.toFixed(1)}%</div>` : ''}
            ${obs.qualityFlags ? `<div>Quality: ${obs.qualityFlags.join(', ')}</div>` : ''}
          </div>
        </div>
      `);

      satelliteLayerRef.current!.addLayer(marker);
    });

    map.addLayer(satelliteLayerRef.current);
  };

  // Render quality assessment panel
  const renderQualityPanel = () => {
    if (!showQualityPanel || !stats) return null;

    const healthyServers = Object.values(stats.serverHealth).filter(h => h).length;
    const totalServers = Object.keys(stats.serverHealth).length;

    return (
      <div className="fixed top-32 right-6 bg-gray-800/90 backdrop-blur-lg rounded-2xl shadow-xl p-5 w-80 z-[1000] border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            � Data Quality Report
          </h3>
          <button
            onClick={() => setShowQualityPanel(false)}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3">
              <div className="text-xs text-blue-300 mb-1">Total Observations</div>
              <div className="text-xl font-bold text-blue-100">{stats.totalObservations}</div>
            </div>
            <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3">
              <div className="text-xs text-green-300 mb-1">Quality Score</div>
              <div className="text-xl font-bold text-green-100">{(stats.qualityScore * 100).toFixed(1)}%</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-3">
              <div className="text-xs text-purple-300 mb-1">VIIRS</div>
              <div className="text-lg font-bold text-purple-100">{stats.viirsObservations}</div>
            </div>
            <div className="bg-orange-900/30 border border-orange-500/30 rounded-lg p-3">
              <div className="text-xs text-orange-300 mb-1">OLCI</div>
              <div className="text-lg font-bold text-orange-100">{stats.olciObservations}</div>
            </div>
          </div>

          <div className="bg-gray-700/50 border border-gray-600/50 rounded-lg p-3">
            <div className="text-xs text-gray-300 mb-2">Server Health</div>
            <div className="text-sm font-semibold text-white mb-2">
              {healthyServers}/{totalServers} servers online
            </div>
            <div className="flex gap-2">
              {Object.entries(stats.serverHealth).map(([server, healthy]) => (
                <div
                  key={server}
                  className={`w-3 h-3 rounded-full ${healthy ? 'bg-green-400' : 'bg-red-400'}`}
                  title={`${server}: ${healthy ? 'Online' : 'Offline'}`}
                />
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-400 border-t border-gray-600/50 pt-3">
            Last Updated: {stats.lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  };

  // Render data mode controls
  const renderDataModeControls = () => {
    return (
      <div className="satellite-controls fixed top-24 left-6 bg-gray-800/90 backdrop-blur-lg rounded-2xl shadow-xl p-4 z-[1000] border border-gray-700/50">
        <div className="space-y-4">
          <div className="flex items-center space-x-2 mb-3">
            <span className="text-lg">🛰️</span>
            <h3 className="text-sm font-bold text-white">Satellite Controls</h3>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-2">Display Mode</label>
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value as DataMode)}
              className="w-full p-2 bg-gray-700/80 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="model-only">🌊 Model Only</option>
              <option value="satellite-only">🛰️ Satellite Only</option>
              <option value="hybrid">🔄 Hybrid Fusion</option>
            </select>
          </div>

          {(dataMode === 'satellite-only' || dataMode === 'hybrid') && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">Satellite Source</label>
              <select
                value={satelliteSource}
                onChange={(e) => setSatelliteSource(e.target.value as SatelliteSource)}
                className="w-full p-2 bg-gray-700/80 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ALL">All Satellites</option>
                <option value="VIIRS">VIIRS Only</option>
                <option value="OLCI">OLCI Only</option>
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => fetchSatelliteData()}
              disabled={isLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Loading
                </>
              ) : (
                <>
                  🔄 Refresh
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowQualityPanel(!showQualityPanel)}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              📊
            </button>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-3">
              <div className="text-xs text-red-200">{error}</div>
            </div>
          )}

          {stats && (
            <div className="bg-gray-700/50 border border-gray-600/50 rounded-lg p-3 space-y-2">
              <div className="text-xs text-gray-300">
                <div className="flex justify-between">
                  <span>Observations:</span>
                  <span className="font-semibold text-white">{stats.totalObservations}</span>
                </div>
                <div className="flex justify-between">
                  <span>Quality:</span>
                  <span className="font-semibold text-green-400">{(stats.qualityScore * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderDataModeControls()}
      {renderQualityPanel()}
      <MapRenderer />
    </>
  );
};

export default HybridForecastOverlay;