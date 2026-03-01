#!/usr/bin/env python3
"""
Create mock OpenDrift forecast output for pipeline testing.

Generates **Point** features for final particle positions — matching the real
OpenDrift output and the frontend GeoJSON parser.
"""
import json
import logging
import argparse
from datetime import datetime, timedelta
import random
import math

def create_mock_forecast(detection_file, output_file, hours):
    """Create mock Sargassum drift forecast (final particle positions)."""

    with open(detection_file, 'r') as f:
        detection_data = json.load(f)

    detections = detection_data.get('features', [])
    # Support both 'metadata' dict and top-level 'properties'
    meta = detection_data.get('metadata', detection_data.get('properties', {}))
    start_date = meta.get('date', datetime.utcnow().strftime('%Y-%m-%d'))

    logging.info(f"Creating {hours}h mock forecast from {len(detections)} detections")

    features = []
    particle_id = 0

    for detection in detections:
        start_lon, start_lat = detection['geometry']['coordinates'][:2]

        # Typical Gulf-of-Guinea drift parameters
        current_speed = random.uniform(0.1, 0.3)        # m/s
        current_dir = random.uniform(240, 300)           # degrees (westward)
        wind_speed = random.uniform(5, 15)               # m/s
        wind_dir = random.uniform(190, 250)              # SW monsoon
        wind_drift_factor = 0.03

        # Generate 5 particles per detection (same as real pipeline)
        for _ in range(5):
            lon, lat = start_lon, start_lat

            # Integrate drift over forecast window (6 h steps)
            for _ in range(0, hours, 6):
                dt_s = 6 * 3600
                # current drift
                cur_m = current_speed * dt_s
                lon += (cur_m * math.cos(math.radians(current_dir))) / (111320 * math.cos(math.radians(lat)))
                lat += (cur_m * math.sin(math.radians(current_dir))) / 111320
                # wind drift
                wm = wind_speed * wind_drift_factor * dt_s
                lon += (wm * math.cos(math.radians(wind_dir))) / (111320 * math.cos(math.radians(lat)))
                lat += (wm * math.sin(math.radians(wind_dir))) / 111320
                # stochastic jitter
                lon += random.uniform(-0.002, 0.002)
                lat += random.uniform(-0.002, 0.002)

            forecast_time = (datetime.fromisoformat(f"{start_date}T00:00:00")
                             + timedelta(hours=hours))

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(lon, 6), round(lat, 6)],
                },
                "properties": {
                    "particle_id": particle_id,
                    "lon": round(lon, 6),
                    "lat": round(lat, 6),
                    "status": "active",
                    "forecast_time": forecast_time.isoformat(),
                },
            })
            particle_id += 1

    geojson = {
        "type": "FeatureCollection",
        "properties": {
            "forecast_start": f"{start_date}T00:00:00",
            "forecast_hours": hours,
            "windage": 0.03,
            "particles_per_point": 5,
            "seed_points": len(detections),
            "generation_time": datetime.utcnow().isoformat(),
            "model": "mock_opendrift",
        },
        "features": features,
    }

    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)

    logging.info(f"Created forecast with {len(features)} particles → {output_file}")
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