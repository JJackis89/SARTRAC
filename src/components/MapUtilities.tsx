import { ZoomIn, ZoomOut, Compass, MapPin, RotateCcw } from 'lucide-react';

interface MapUtilitiesProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onResetNorth: () => void;
  onMyLocation: () => void;
}

export function MapUtilities({
  onZoomIn,
  onZoomOut,
  onResetView,
  onResetNorth,
  onMyLocation,
}: MapUtilitiesProps) {
  return (
    <div className="map-utilities">
      <button onClick={onZoomIn} title="Zoom In" className="map-utility-btn" aria-label="Zoom in to map">
        <ZoomIn size={16} />
      </button>
      <button onClick={onZoomOut} title="Zoom Out" className="map-utility-btn" aria-label="Zoom out from map">
        <ZoomOut size={16} />
      </button>
      <div className="compass-rose" title="North" role="img" aria-label="North direction indicator">
        N
      </div>
      <button
        onClick={onResetView}
        title="Reset to Ghana View"
        className="map-utility-btn"
        aria-label="Reset map to Ghana coastline view"
      >
        <Compass size={16} />
      </button>
      <button onClick={onMyLocation} title="My Location" className="map-utility-btn" aria-label="Go to my current location">
        <MapPin size={16} />
      </button>
      <button
        onClick={onResetNorth}
        title="Reset Map Orientation"
        className="map-utility-btn"
        aria-label="Reset map orientation to north up"
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}
