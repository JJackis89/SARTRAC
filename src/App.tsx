import { useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet';

import { useForecastData, usePlayback, useMapControls, GHANA_CENTER, GHANA_BOUNDS } from './hooks';
import { Header } from './components/Header';
import { ControlDrawer } from './components/ControlDrawer';
import { TimelinePlayer } from './components/TimelinePlayer';
import { MapUtilities } from './components/MapUtilities';
import { ForecastOverlay } from './components/ForecastOverlay';
import { DriftVectorsOverlay } from './components/DriftVectorsOverlay';
import { UncertaintyOverlay } from './components/UncertaintyOverlay';
import { BathymetryOverlay } from './components/BathymetryOverlay';
import { AlertPanel } from './components/AlertPanel';
import { DetectionPointsOverlay } from './components/DetectionPointsOverlay';
import AccuracyPanel from './components/AccuracyPanel';
import MapController from './components/MapController';
import CoastSnapPoints from './components/CoastSnapPoints';

const BASE_MAP_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

function App() {
  // --- Custom hooks ---
  const forecast = useForecastData();
  const playback = usePlayback(forecast.availableForecasts.length, forecast.setCurrentForecastIndex);
  const map = useMapControls();

  // --- Local UI state ---
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [opacity, setOpacity] = useState(1.0);
  const [renderMode, setRenderMode] = useState<'native' | 'smooth'>('native');
  const [showGridCells, setShowGridCells] = useState(false);
  const [driftAnimated, setDriftAnimated] = useState(true);
  const [uncertaintyStyle, setUncertaintyStyle] = useState<'alpha' | 'contour' | 'hatching'>('alpha');
  const [showLayers, setShowLayers] = useState({
    forecast: true,
    detections: true,
    drift: false,
    uncertainty: false,
    bathymetry: false,
    grid: false,
    coastsnap: true,
  });
  const [showAccuracy, setShowAccuracy] = useState(false);

  return (
    <div
      className="h-screen w-screen relative overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(135deg, var(--ocean-abyss) 0%, var(--ocean-deep) 35%, var(--ocean-mid) 100%)',
      }}
    >
      {/* Header */}
      <Header
        isLoading={forecast.isLoading}
        error={forecast.error}
        currentForecast={forecast.currentForecast}
        lastUpdateTime={forecast.lastUpdateTime}
        nextUpdateTime={forecast.nextUpdateTime}
        availableForecastCount={forecast.availableForecasts.length}
        onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
        onScreenshot={() => map.handleScreenshot(forecast.currentForecast?.date)}
        onShare={() => map.handleShare(forecast.currentForecast?.date)}
        onRegionChange={(center, zoom) => map.mapRef.current?.flyTo(center, zoom, { duration: 1.2 })}
      />

      {/* Main Content */}
      <div className="flex flex-1 relative" style={{ height: 'calc(100vh - 4rem)' }}>
        {/* Control Drawer */}
        <ControlDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          isLoading={forecast.isLoading}
          error={forecast.error}
          currentForecast={forecast.currentForecast}
          availableForecastCount={forecast.availableForecasts.length}
          lastUpdateTime={forecast.lastUpdateTime}
          autoRefreshEnabled={forecast.autoRefreshEnabled}
          onAutoRefreshChange={forecast.setAutoRefreshEnabled}
          onManualRefresh={forecast.handleManualRefresh}
          selectedHorizon={forecast.selectedHorizon}
          onHorizonChange={forecast.setSelectedHorizon}
          showLayers={showLayers}
          onLayersChange={setShowLayers}
          opacity={opacity}
          onOpacityChange={setOpacity}
          renderMode={renderMode}
          onRenderModeChange={setRenderMode}
          showGridCells={showGridCells}
          onShowGridCellsChange={setShowGridCells}
          uncertaintyStyle={uncertaintyStyle}
          onUncertaintyStyleChange={setUncertaintyStyle}
          driftAnimated={driftAnimated}
          onDriftAnimatedChange={setDriftAnimated}
        />

        {/* Map */}
        <div
          className={`flex-1 transition-all duration-300 ${drawerOpen ? 'sm:ml-80 ml-0' : 'ml-0'} relative`}
          role="main"
          aria-label="Interactive Sargassum forecast map"
        >
          <MapContainer
            center={GHANA_CENTER}
            zoom={8}
            maxBounds={GHANA_BOUNDS}
            className="h-full w-full"
            zoomControl={false}
            attributionControl={false}
            ref={map.mapRef}
            aria-label="Sargassum forecast map of Ghana coastline"
            /* Responsive: map shifts with drawer on desktop */
          >
            <TileLayer
              url={BASE_MAP_URL}
              attribution="© OpenStreetMap contributors"
            />
            <MapController onMapReady={map.handleMapReady} />
            {forecast.currentForecast && showLayers.forecast && (
              <ForecastOverlay
                forecastData={forecast.currentForecast}
                visible={true}
                opacity={opacity}
                renderMode={renderMode}
                showGridCells={showGridCells}
              />
            )}
            {forecast.currentForecast && showLayers.detections && (
              <DetectionPointsOverlay
                detectionData={forecast.currentForecast.detections ?? null}
                visible={true}
                opacity={opacity}
              />
            )}
            {forecast.currentForecast && showLayers.drift && (
              <DriftVectorsOverlay
                forecastData={forecast.currentForecast}
                visible={true}
                opacity={opacity}
                animated={driftAnimated}
              />
            )}
            {forecast.currentForecast && showLayers.uncertainty && (
              <UncertaintyOverlay
                forecastData={forecast.currentForecast}
                visible={true}
                opacity={opacity}
                style={uncertaintyStyle}
              />
            )}
            {showLayers.bathymetry && (
              <BathymetryOverlay
                visible={true}
                opacity={opacity}
              />
            )}
            {showLayers.coastsnap && <CoastSnapPoints visible={showLayers.coastsnap} />}
          </MapContainer>

          {/* Map Utilities (zoom, compass, etc.) */}
          <MapUtilities
            onZoomIn={map.handleZoomIn}
            onZoomOut={map.handleZoomOut}
            onResetView={map.handleResetView}
            onResetNorth={map.handleResetNorth}
            onMyLocation={map.handleMyLocation}
          />

          {/* Sargassum Alerts */}
          <div className="alert-panel-mobile">
            <AlertPanel
              forecastData={forecast.currentForecast}
              visible={showLayers.forecast}
              onAlertClick={(alert) => {
                map.mapRef.current?.flyTo([alert.lat, alert.lon], 10, { duration: 1.2 });
              }}
            />
          </div>

          {/* Accuracy Panel Toggle */}
          <button
            onClick={() => setShowAccuracy(prev => !prev)}
            className="absolute top-20 right-4 z-[999] bg-slate-800/90 hover:bg-slate-700 text-white
                       rounded-lg px-3 py-2 text-xs font-medium border border-slate-600/50 backdrop-blur-sm
                       transition-colors flex items-center gap-1.5"
            title="Forecast accuracy metrics"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Accuracy
          </button>
          <AccuracyPanel isOpen={showAccuracy} onClose={() => setShowAccuracy(false)} />
        </div>

        {/* Floating Timeline & Scale */}
        <div
          className={`fixed inset-0 pointer-events-none z-[500] transition-all duration-300 ${
            drawerOpen ? 'sm:left-80 left-0' : 'left-0'
          }`}
          style={{ top: '4rem' }}
        >
          <TimelinePlayer
            availableForecasts={forecast.availableForecasts}
            currentForecastIndex={forecast.currentForecastIndex}
            currentForecast={forecast.currentForecast}
            isPlaying={playback.isPlaying}
            playbackSpeed={playback.playbackSpeed}
            loopEnabled={playback.loopEnabled}
            compareMode={playback.compareMode}
            isLoading={forecast.isLoading}
            error={forecast.error}
            lastUpdateTime={forecast.lastUpdateTime}
            onTogglePlay={playback.togglePlay}
            onSetIndex={(i) => forecast.setCurrentForecastIndex(() => i)}
            onSetSpeed={playback.setPlaybackSpeed}
            onSetLoop={playback.setLoopEnabled}
            onSetCompare={playback.setCompareMode}
          />

          {/* Scale Bar */}
          <div className="absolute bottom-4 left-4 pointer-events-auto">
            <div
              className="rounded-lg border-2 px-3 py-2"
              style={{
                background: 'rgba(248, 250, 252, 0.25)',
                backdropFilter: 'blur(20px)',
                borderColor: 'rgba(248, 250, 252, 0.5)',
              }}
            >
              <div className="text-xs" style={{ color: 'var(--foam-white)' }}>
                <div className="border-b mb-1 w-16" style={{ borderColor: 'rgba(248, 250, 252, 0.7)' }} />
                <div className="font-semibold">50 km</div>
              </div>
            </div>
          </div>

          {/* Attribution */}
          <div className="absolute bottom-0 right-0 bg-black/50 text-white text-xs px-2 py-1">
            © OpenStreetMap contributors
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
