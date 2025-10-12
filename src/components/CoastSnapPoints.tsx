import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// CoastSnap monitoring points from KML data
const coastSnapPoints = [
  {
    name: "BEYIN COASTSNAP POINT",
    description: "Woods",
    coordinates: [-2.590825, 4.98667] as [number, number],
    elevation: 0
  },
  {
    name: "EGBAZO COASTSNAP POINT", 
    description: "Coastal monitoring point",
    coordinates: [-2.796165, 5.029656] as [number, number],
    elevation: 13.69
  },
  {
    name: "ESIAMA COASTSNAP POINT",
    description: "Coastal monitoring point", 
    coordinates: [-2.352498, 4.932634] as [number, number],
    elevation: 0
  },
  {
    name: "JAWAY COASTSNAP POINT",
    description: "Coastal monitoring point",
    coordinates: [-2.934319, 5.057206] as [number, number], 
    elevation: 0
  },
  {
    name: "NEWTOWN COASTSNAP POINT",
    description: "Coastal monitoring point",
    coordinates: [-3.097624, 5.089596] as [number, number],
    elevation: 0
  },
  {
    name: "PRINCES TOWN COASTSNAP POINT", 
    description: "Coastal monitoring point",
    coordinates: [-2.137434, 4.793619] as [number, number],
    elevation: 30.97
  },
  {
    name: "SANZULE COASTSNAP POINT",
    description: "Coastal monitoring point", 
    coordinates: [-2.456823, 4.959866] as [number, number],
    elevation: 12.73
  }
];

// Custom icon for CoastSnap points
const coastSnapIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="8" fill="#0ea5a3" stroke="#ffffff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="#ffffff"/>
      <text x="12" y="16" text-anchor="middle" font-family="Arial" font-size="8" fill="#0ea5a3" font-weight="bold">CS</text>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

interface CoastSnapPointsProps {
  visible: boolean;
}

const CoastSnapPoints: React.FC<CoastSnapPointsProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <>
      {coastSnapPoints.map((point, index) => (
        <Marker
          key={index}
          position={[point.coordinates[1], point.coordinates[0]]} // Leaflet uses [lat, lng]
          icon={coastSnapIcon}
        >
          <Popup>
            <div className="coastsnap-popup">
              <h3 style={{ 
                margin: '0 0 8px 0', 
                color: 'var(--ocean-deep)', 
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                {point.name}
              </h3>
              <div style={{ 
                fontSize: '12px', 
                color: 'var(--text-muted)',
                marginBottom: '4px'
              }}>
                {point.description}
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: 'var(--teal-deep)',
                fontFamily: 'monospace'
              }}>
                <div>Lat: {point.coordinates[1].toFixed(6)}</div>
                <div>Lng: {point.coordinates[0].toFixed(6)}</div>
                {point.elevation > 0 && (
                  <div>Elevation: {point.elevation}m</div>
                )}
              </div>
              <div style={{ 
                marginTop: '8px',
                padding: '4px 8px',
                background: 'rgba(14, 165, 163, 0.1)',
                borderRadius: '4px',
                fontSize: '10px',
                color: 'var(--teal-deep)',
                textAlign: 'center'
              }}>
                COASTSNAP Monitoring Point
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export default CoastSnapPoints;