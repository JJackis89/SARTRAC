#!/usr/bin/env python3
"""
Create mock OpenDrift forecast output for pipeline testing
This simulates what the real OpenDrift forecast would produce
"""
import json
import logging
import argparse
from datetime import datetime, timedelta
import random
import math

def create_mock_forecast(detection_file, output_file, hours):
    """Create mock Sargassum drift forecast"""
    
    # Load detection data
    with open(detection_file, 'r') as f:
        detection_data = json.load(f)
    
    detections = detection_data['features']
    start_date = detection_data['metadata']['date']
    
    logging.info(f"Creating {hours}h forecast from {len(detections)} detections")
    
    # Create forecast trajectories
    features = []
    
    # For each detection, create a trajectory
    for i, detection in enumerate(detections):
        start_lon, start_lat = detection['geometry']['coordinates']
        
        # Simulate drift parameters (typical Gulf of Guinea)
        # Current: ~0.1-0.3 m/s westward (Guinea Current)
        current_speed = random.uniform(0.1, 0.3)  # m/s
        current_dir = random.uniform(240, 300)  # degrees (westward)
        
        # Wind drift: ~3% of wind speed
        wind_speed = random.uniform(5, 15)  # m/s
        wind_dir = random.uniform(190, 250)  # degrees (SW winds)
        wind_drift_factor = 0.03
        
        # Create trajectory points every 6 hours
        time_steps = list(range(0, hours + 1, 6))
        trajectory_coords = []
        
        current_lon, current_lat = start_lon, start_lat
        
        for hour in time_steps:
            # Calculate drift for this time step
            dt_hours = 6 if hour > 0 else 0
            
            if dt_hours > 0:
                # Current drift
                current_drift_m = current_speed * dt_hours * 3600  # meters
                current_drift_deg_lon = (current_drift_m * math.cos(math.radians(current_dir))) / (111320 * math.cos(math.radians(current_lat)))
                current_drift_deg_lat = (current_drift_m * math.sin(math.radians(current_dir))) / 111320
                
                # Wind drift  
                wind_drift_speed = wind_speed * wind_drift_factor
                wind_drift_m = wind_drift_speed * dt_hours * 3600
                wind_drift_deg_lon = (wind_drift_m * math.cos(math.radians(wind_dir))) / (111320 * math.cos(math.radians(current_lat)))
                wind_drift_deg_lat = (wind_drift_m * math.sin(math.radians(wind_dir))) / 111320
                
                # Add some randomness
                random_drift_lon = random.uniform(-0.001, 0.001)
                random_drift_lat = random.uniform(-0.001, 0.001)
                
                # Update position
                current_lon += current_drift_deg_lon + wind_drift_deg_lon + random_drift_lon
                current_lat += current_drift_deg_lat + wind_drift_deg_lat + random_drift_lat
            
            trajectory_coords.append([round(current_lon, 6), round(current_lat, 6)])
        
        # Create forecast feature
        forecast_time = datetime.fromisoformat(start_date + "T00:00:00")
        end_time = forecast_time + timedelta(hours=hours)
        
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": trajectory_coords
            },
            "properties": {
                "particle_id": i + 1,
                "start_time": forecast_time.isoformat(),
                "end_time": end_time.isoformat(),
                "forecast_hours": hours,
                "start_position": [start_lon, start_lat],
                "end_position": trajectory_coords[-1],
                "total_drift_km": round(
                    math.sqrt((trajectory_coords[-1][0] - start_lon)**2 + 
                             (trajectory_coords[-1][1] - start_lat)**2) * 111.32, 2),
                "source_detection": {
                    "detection_value": detection['properties']['detection_value'],
                    "confidence": detection['properties']['confidence'],
                    "area_km2": detection['properties']['area_km2']
                },
                "model_params": {
                    "current_speed_ms": round(current_speed, 3),
                    "current_direction": round(current_dir, 1),
                    "wind_speed_ms": round(wind_speed, 1),
                    "wind_direction": round(wind_dir, 1),
                    "wind_drift_factor": wind_drift_factor
                }
            }
        }
        features.append(feature)
    
    # Create forecast GeoJSON
    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "forecast_start": start_date,
            "forecast_hours": hours,
            "trajectory_count": len(features),
            "model": "mock_opendrift",
            "region": "ghana_coast",
            "generated": datetime.now().isoformat(),
            "note": "Mock forecast for pipeline testing"
        },
        "features": features
    }
    
    # Write output
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    logging.info(f"Created forecast with {len(features)} trajectories in {output_file}")
    return output_file

def main():
    parser = argparse.ArgumentParser(description='Create mock OpenDrift forecast')
    parser.add_argument('--detections', required=True, help='Detection GeoJSON file')
    parser.add_argument('--output', required=True, help='Output forecast GeoJSON file')
    parser.add_argument('--hours', type=int, default=72, help='Forecast duration in hours')
    
    args = parser.parse_args()
    
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    logging.info(f"Creating mock {args.hours}h forecast from {args.detections}")
    
    # Create mock forecast
    create_mock_forecast(args.detections, args.output, args.hours)
    
    logging.info(f"Mock forecast complete: {args.output}")

if __name__ == "__main__":
    main()