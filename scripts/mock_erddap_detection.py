#!/usr/bin/env python3
"""
Create mock ERDDAP detection output for pipeline testing
This simulates what the real ERDDAP detection would produce
"""
import json
import logging
import argparse
from datetime import datetime
import random
from pathlib import Path

def create_mock_detection(roi_file, output_file, date, threshold):
    """Create mock Sargassum detection data"""
    
    # Load ROI to get bounds
    with open(roi_file, 'r') as f:
        roi_data = json.load(f)
    
    # Extract bounds from ROI
    coords = roi_data['features'][0]['geometry']['coordinates'][0]
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)
    
    logging.info(f"Creating mock detection for bounds: {min_lon:.3f},{min_lat:.3f} to {max_lon:.3f},{max_lat:.3f}")
    
    # Create mock detection points
    features = []
    
    # Generate 5-15 random Sargassum detection points within ROI
    num_detections = random.randint(5, 15)
    
    for i in range(num_detections):
        # Random point within ROI bounds
        lon = random.uniform(min_lon, max_lon)
        lat = random.uniform(min_lat, max_lat)
        
        # Mock AFAI/MCI value above threshold
        detection_value = random.uniform(threshold, threshold + 0.3)
        confidence = random.uniform(0.6, 0.95)
        
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            },
            "properties": {
                "detection_value": round(detection_value, 4),
                "threshold": threshold,
                "confidence": round(confidence, 3),
                "date": date,
                "source": "mock_erddap",
                "pixel_count": random.randint(10, 100),
                "area_km2": round(random.uniform(0.1, 2.0), 2)
            }
        }
        features.append(feature)
    
    # Create GeoJSON
    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "date": date,
            "threshold": threshold,
            "roi_file": str(roi_file),
            "detection_count": len(features),
            "generated": datetime.now().isoformat(),
            "note": "Mock data for pipeline testing"
        },
        "features": features
    }
    
    # Write output
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    logging.info(f"Created {len(features)} mock detections in {output_file}")
    return output_file

def main():
    parser = argparse.ArgumentParser(description='Create mock ERDDAP detection data')
    parser.add_argument('--date', required=True, help='Date YYYY-MM-DD')
    parser.add_argument('--dataset', required=True, help='Dataset name (ignored in mock)')
    parser.add_argument('--threshold', type=float, default=0.5, help='Detection threshold')
    parser.add_argument('--roi', required=True, help='ROI GeoJSON file')
    parser.add_argument('--out', required=True, help='Output GeoJSON file')
    
    args = parser.parse_args()
    
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    logging.info(f"Creating mock ERDDAP detection for {args.dataset} on {args.date}")
    logging.info(f"Using threshold {args.threshold} and ROI {args.roi}")
    
    # Create mock detection
    create_mock_detection(args.roi, args.out, args.date, args.threshold)
    
    logging.info(f"Mock detection complete: {args.out}")

if __name__ == "__main__":
    main()