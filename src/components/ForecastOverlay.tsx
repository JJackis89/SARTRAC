import React from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import { ForecastData } from '../services/forecastService';

interface ForecastOverlayProps {
  forecastData: ForecastData | null;
  visible: boolean;
  opacity: number;
}

export const ForecastOverlay: React.FC<ForecastOverlayProps> = ({
  forecastData,
  visible,
  opacity
}) => {
  if (!visible || !forecastData || forecastData.isEmpty) {
    return null;
  }

  // Group particles by their trajectory (if available) or show as individual points
  const renderParticles = () => {
    return forecastData.particles.map((particle, index) => (
      <CircleMarker
        key={`forecast-particle-${particle.particle_id || index}`}
        center={[particle.lat, particle.lon]}
        radius={4}
        pathOptions={{
          color: '#ff6b35',
          fillColor: '#ff6b35',
          fillOpacity: opacity * 0.8,
          opacity: opacity,
          weight: 2
        }}
      >
        <Popup>
          <div className="text-sm">
            <div className="font-semibold text-orange-600 mb-2">
              🌊 Forecast Particle
            </div>
            <div className="space-y-1">
              <div><strong>ID:</strong> {particle.particle_id}</div>
              <div><strong>Position:</strong> {particle.lat.toFixed(4)}°N, {particle.lon.toFixed(4)}°E</div>
              <div><strong>Status:</strong> 
                <span className={`ml-1 px-2 py-0.5 rounded text-xs ${
                  particle.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {particle.status}
                </span>
              </div>
              <div><strong>Forecast Time:</strong> {new Date(particle.forecast_time).toLocaleString()}</div>
            </div>
          </div>
        </Popup>
      </CircleMarker>
    ));
  };

  // Render trajectory lines if we have multiple time steps (future enhancement)
  const renderTrajectories = () => {
    // For now, we'll just show particles
    // In the future, we could show particle paths over time
    return null;
  };

  return (
    <>
      {renderParticles()}
      {renderTrajectories()}
    </>
  );
};