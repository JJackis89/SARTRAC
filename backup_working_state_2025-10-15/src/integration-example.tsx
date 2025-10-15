// Frontend Integration for SARTRAC Pipeline
// This file shows how to replace mock data with real pipeline outputs

import { useState, useEffect } from 'react';
import { ForecastData } from './types/forecast';

// Types for pipeline data
interface PipelineDetection {
  lat: number;
  lng: number;
  value: number;
  source: string;
  date: string;
  point_id: number;
}

interface PipelineForecast {
  lat: number;
  lng: number;
  particle_id: number;
  status: string;
  forecast_start: string;
  forecast_hours: number;
}

// API functions to load pipeline data
export class PipelineAPI {
  private static baseUrl = process.env.NODE_ENV === 'production' 
    ? '/api' 
    : 'http://localhost:8000/api';

  // Load latest detections from pipeline
  static async loadDetections(): Promise<PipelineDetection[]> {
    try {
      // Try to load from pipeline outputs
      const response = await fetch(`${this.baseUrl}/detections/latest`);
      if (!response.ok) throw new Error('Pipeline data not available');
      
      const geojson = await response.json();
      return geojson.features.map((feature: any) => ({
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0],
        value: feature.properties.value,
        source: feature.properties.source,
        date: feature.properties.date,
        point_id: feature.properties.point_id
      }));
    } catch (error) {
      console.warn('Failed to load pipeline detections, using mock data');
      return this.generateMockDetections();
    }
  }

  // Load forecast from pipeline  
  static async loadForecast(): Promise<PipelineForecast[]> {
    try {
      const response = await fetch(`${this.baseUrl}/forecast/latest`);
      if (!response.ok) throw new Error('Forecast data not available');
      
      const geojson = await response.json();
      return geojson.features.map((feature: any) => ({
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0],
        particle_id: feature.properties.particle_id,
        status: feature.properties.status,
        forecast_start: feature.properties.forecast_start,
        forecast_hours: feature.properties.forecast_hours
      }));
    } catch (error) {
      console.warn('Failed to load pipeline forecast, using mock data');
      return this.generateMockForecast();
    }
  }

  // Convert pipeline detections to app format
  static convertToForecastData(detections: PipelineDetection[]): ForecastData[] {
    return detections.map(detection => ({
      lat: detection.lat,
      lng: detection.lng,
      density: this.valueTodensidade(detection.value),
      timestamp: detection.date,
      source: detection.source
    }));
  }

  // Convert detection values to density categories
  private static valueTodensidade(value: number): 'low' | 'medium' | 'high' {
    if (value < 0.02) return 'low';
    if (value < 0.05) return 'medium';
    return 'high';
  }

  // Fallback mock data generators
  private static generateMockDetections(): PipelineDetection[] {
    const detections: PipelineDetection[] = [];
    const baseDate = new Date().toISOString().split('T')[0];
    
    for (let i = 0; i < 50; i++) {
      detections.push({
        lat: 4.5 + Math.random() * 3,
        lng: -3.5 + Math.random() * 4,
        value: Math.random() * 0.1,
        source: Math.random() > 0.5 ? 'viirs_chla' : 's3a_olci_chla',
        date: baseDate,
        point_id: i
      });
    }
    
    return detections;
  }

  private static generateMockForecast(): PipelineForecast[] {
    const forecast: PipelineForecast[] = [];
    const startTime = new Date().toISOString();
    
    for (let i = 0; i < 100; i++) {
      forecast.push({
        lat: 4.5 + Math.random() * 3,
        lng: -3.5 + Math.random() * 4,
        particle_id: i,
        status: 'active',
        forecast_start: startTime,
        forecast_hours: 72
      });
    }
    
    return forecast;
  }
}

// Hook for managing pipeline data
export function usePipelineData() {
  const [detections, setDetections] = useState<PipelineDetection[]>([]);
  const [forecast, setForecast] = useState<PipelineForecast[]>([]);
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Load data on mount and periodically
  useEffect(() => {
    loadData();
    
    // Refresh every hour to get new forecasts
    const interval = setInterval(loadData, 3600000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [detectionsData, forecastData] = await Promise.all([
        PipelineAPI.loadDetections(),
        PipelineAPI.loadForecast()
      ]);
      
      setDetections(detectionsData);
      setForecast(forecastData);
      setForecastData(PipelineAPI.convertToForecastData(detectionsData));
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading pipeline data:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    detections,
    forecast,
    forecastData,
    loading,
    lastUpdate,
    refresh: loadData
  };
}

// Updated App component with pipeline integration
export function AppWithPipeline() {
  const { forecastData, loading, lastUpdate, refresh } = usePipelineData();
  const [currentDay, setCurrentDay] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Status indicator for data freshness
  const getDataStatus = () => {
    if (loading) return 'loading';
    if (!lastUpdate) return 'error';
    
    const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 6) return 'fresh';
    if (hoursSinceUpdate < 24) return 'stale';
    return 'old';
  };

  return (
    <div className="app">
      {/* Data Status Indicator */}
      <div className={`data-status ${getDataStatus()}`}>
        {loading ? (
          <span>Loading forecast data...</span>
        ) : lastUpdate ? (
          <span>
            Last updated: {lastUpdate.toLocaleString()}
            <button onClick={refresh} className="refresh-btn">↻</button>
          </span>
        ) : (
          <span>
            Using mock data - pipeline not available
            <button onClick={refresh} className="refresh-btn">↻</button>
          </span>
        )}
      </div>

      {/* Rest of your existing app components */}
      <MapContainer>
        <SargassumOverlay 
          forecastData={forecastData}
          currentDay={currentDay}
        />
        <TimelineControls
          currentDay={currentDay}
          setCurrentDay={setCurrentDay}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          maxDays={7}
        />
      </MapContainer>
    </div>
  );
}

// CSS for data status indicator
const dataStatusStyles = `
.data-status {
  position: fixed;
  top: 10px;
  right: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
}

.data-status.loading {
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.data-status.fresh {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.data-status.stale {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid #fed7aa;
}

.data-status.old {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.refresh-btn:hover {
  opacity: 1;
}
`;

// Express.js backend API endpoints (for reference)
const backendExample = `
// backend/api/routes.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Serve latest detections
router.get('/detections/latest', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(__dirname, '../data', \`merged_detections_\${today}.geojson\`);
    
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      res.json(data);
    } else {
      // Try yesterday's data
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const fallbackPath = path.join(__dirname, '../data', \`merged_detections_\${yesterday}.geojson\`);
      
      if (fs.existsSync(fallbackPath)) {
        const data = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
        res.json(data);
      } else {
        res.status(404).json({ error: 'No recent detection data available' });
      }
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load detection data' });
  }
});

// Serve latest forecast
router.get('/forecast/latest', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(__dirname, '../outputs', \`forecast_\${today}.geojson\`);
    
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      res.json(data);
    } else {
      res.status(404).json({ error: 'No recent forecast data available' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load forecast data' });
  }
});

module.exports = router;
`;

export default AppWithPipeline;