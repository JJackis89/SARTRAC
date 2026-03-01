/**
 * BeachedOverlay Component
 * Visualizes beached Sargassum detections and forecasts on the map
 * Integrates with Sentinel-2 ML detection service
 */

import React, { useEffect, useState, useMemo } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import type { BeachedDetection, BeachedSummary } from '../services/beachedSargassumService';
import { beachedSargassumService, BeachedSargassumService } from '../services/beachedSargassumService';

interface BeachedOverlayProps {
  visible: boolean;
  opacity: number;
  date: string;
  onDetectionData?: (summary: BeachedSummary | null) => void;
  onError?: (error: string) => void;
}

export const BeachedOverlay: React.FC<BeachedOverlayProps> = ({
  visible,
  opacity,
  date,
  onDetectionData,
  onError
}) => {
  const [detections, setDetections] = useState<BeachedDetection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load beached detection data for the current date
  useEffect(() => {
    if (!visible || !date) return;

    const loadDetections = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log(`Loading beached detections for ${date}`);
        
        const response = await beachedSargassumService.detectBeachedSargassum(date, {
          threshold: 0.35,
          exportCloud: false,
          useCache: true
        });

        // Pass summary data to parent
        if (onDetectionData) {
          onDetectionData(response.detection_summary);
        }

        // Convert summary to visual detections
        const detectionData = beachedSargassumService.convertSummaryToDetections(response.detection_summary);
        setDetections(detectionData);

        console.log(`Loaded ${detectionData.length} beached detections for ${date}`);

      } catch (error) {
        const errorMsg = `Failed to load beached detections: ${error}`;
        setError(errorMsg);
        if (onError) onError(errorMsg);
        if (onDetectionData) onDetectionData(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadDetections();
  }, [date, visible, onDetectionData, onError]);

  // Create GeoJSON style function for detections
  const getDetectionStyle = useMemo(() => {
    return (feature: any) => {
      const detection = feature.properties as BeachedDetection['properties'];
      
      // Color based on confidence level
      let color: string;
      let fillColor: string;
      
      switch (detection.confidence) {
        case 'high':
          color = '#d32f2f';
          fillColor = '#ffcdd2';
          break;
        case 'medium':
          color = '#f57c00';
          fillColor = '#ffe0b2';
          break;
        case 'low':
          color = '#fbc02d';
          fillColor = '#fff9c4';
          break;
        default:
          color = '#757575';
          fillColor = '#f5f5f5';
      }

      return {
        color,
        fillColor,
        fillOpacity: 0.6 * opacity,
        opacity: 0.8 * opacity,
        weight: 2,
        className: 'beached-detection'
      };
    };
  }, [opacity]);

  // Create popup content for detections
  const onEachFeature = useMemo(() => {
    return (feature: any, layer: L.Layer) => {
      const detection = feature.properties as BeachedDetection['properties'];
      
      const popupContent = `
        <div class="space-y-2">
          <div class="font-semibold text-red-700">Beached Sargassum Detected</div>
          <div class="text-sm space-y-1">
            <div><strong>Date:</strong> ${new Date(date).toLocaleDateString()}</div>
            <div><strong>Area:</strong> ${BeachedSargassumService.formatArea(detection.area_m2)}</div>
            <div><strong>Confidence:</strong> ${detection.confidence.toUpperCase()}</div>
            <div><strong>Method:</strong> Sentinel-2 ML Detection</div>
            <div><strong>Threshold:</strong> ${(detection.threshold * 100).toFixed(1)}%</div>
          </div>
        </div>
      `;

      layer.bindPopup(popupContent, {
        className: 'beached-detection-popup'
      });

      // Add hover effect
      layer.on({
        mouseover: (e) => {
          const target = e.target;
          target.setStyle({
            weight: 3,
            opacity: 1.0
          });
        },
        mouseout: (e) => {
          const target = e.target;
          target.setStyle({
            weight: 2,
            opacity: 0.8 * opacity
          });
        }
      });
    };
  }, [date, opacity]);

  // Convert detections to GeoJSON format
  const geoJsonData = useMemo(() => {
    if (detections.length === 0) return null;

    return {
      type: 'FeatureCollection' as const,
      features: detections.map(detection => ({
        type: 'Feature' as const,
        geometry: detection.geometry,
        properties: {
          ...detection.properties,
          id: detection.id,
          date: detection.date
        }
      }))
    };
  }, [detections]);

  // Don't render if not visible or no data
  if (!visible || !geoJsonData || detections.length === 0) {
    return null;
  }

  return (
    <>
      <GeoJSON
        key={`beached-${date}-${detections.length}`}
        data={geoJsonData}
        style={getDetectionStyle}
        onEachFeature={onEachFeature}
      />
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-4 right-4 bg-white bg-opacity-90 rounded-lg p-2 shadow-lg z-[1000]">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-700">Loading beached detections...</span>
          </div>
        </div>
      )}

      {/* Error indicator */}
      {error && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-lg p-2 shadow-lg z-[1000]">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 text-red-500">⚠</div>
            <span className="text-sm text-red-700">Detection error</span>
          </div>
        </div>
      )}
    </>
  );
};

// Additional component for beached detection summary panel
interface BeachedSummaryPanelProps {
  summary: BeachedSummary | null;
  visible: boolean;
  onClose?: () => void;
}

export const BeachedSummaryPanel: React.FC<BeachedSummaryPanelProps> = ({
  summary,
  visible,
  onClose
}) => {
  if (!visible || !summary) return null;

  const summaryText = BeachedSargassumService.generateSummaryText(summary);
  const severityLevel = BeachedSargassumService.getSeverityLevel(summary.total_area_hectares);

  const getSeverityColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg border p-4 max-w-sm z-[1000]">
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-gray-800">Beached Sargassum Status</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            ×
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className={`px-3 py-2 rounded-lg border text-sm ${getSeverityColor(severityLevel)}`}>
          <div className="font-medium capitalize">{severityLevel} Severity</div>
          <div>{summaryText}</div>
        </div>

        {summary.detection_count > 0 && (
          <div className="text-sm space-y-1 text-gray-600">
            <div><strong>Total Area:</strong> {BeachedSargassumService.formatArea(summary.total_area_m2)}</div>
            <div><strong>Detection Count:</strong> {summary.detection_count}</div>
            <div><strong>Confidence:</strong> {(summary.probability_mean * 100).toFixed(1)}%</div>
            <div><strong>Method:</strong> Sentinel-2 ML Detection</div>
          </div>
        )}

        <div className="text-xs text-gray-500 pt-2 border-t">
          Date: {new Date(summary.date).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};

export default BeachedOverlay;