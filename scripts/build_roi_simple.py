#!/usr/bin/env python3
"""
Simple Ghana ROI generator for testing purposes.
Creates a basic offshore polygon for the Ghana coastline.
"""

import argparse
import json
import logging
import sys
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def create_ghana_offshore_roi(nautical_miles=20):
    """
    Create a simple offshore ROI around Ghana's coastline.
    Returns GeoJSON polygon covering 0-20nm offshore waters.
    """
    # Ghana coastal boundaries (approximate)
    # Western boundary: ~3.2°W, Eastern boundary: ~1.2°E
    # Southern boundary: ~4.7°N, Northern boundary: ~6.2°N (coastal region)
    
    # Convert nautical miles to degrees (rough approximation)
    # 1 nautical mile ≈ 1/60 degree latitude ≈ 0.0167 degrees
    buffer_deg = nautical_miles * 0.0167
    
    # Define Ghana coastal region with offshore buffer
    west_bound = -3.2 - buffer_deg
    east_bound = 1.2 + buffer_deg  
    south_bound = 4.7 - buffer_deg
    north_bound = 6.2 + buffer_deg
    
    # Create offshore polygon (simplified rectangular region)
    coordinates = [[
        [west_bound, south_bound],  # Southwest
        [east_bound, south_bound],  # Southeast  
        [east_bound, north_bound],  # Northeast
        [west_bound, north_bound],  # Northwest
        [west_bound, south_bound]   # Close polygon
    ]]
    
    geojson = {
        "type": "FeatureCollection", 
        "features": [{
            "type": "Feature",
            "properties": {
                "name": f"Ghana {nautical_miles}nm Offshore ROI",
                "nautical_miles": nautical_miles,
                "created": "2025-10-12",
                "bounds": {
                    "west": west_bound,
                    "east": east_bound,
                    "south": south_bound,
                    "north": north_bound
                }
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": coordinates
            }
        }]
    }
    
    return geojson

def main():
    parser = argparse.ArgumentParser(description="Generate Ghana offshore ROI")
    parser.add_argument('--out', required=True, help='Output GeoJSON file path')
    parser.add_argument('--nm', type=float, default=20, help='Nautical miles offshore (default: 20)')
    
    args = parser.parse_args()
    
    try:
        logger.info(f"Generating Ghana {args.nm} nm offshore ROI")
        
        # Create output directory if needed
        output_path = Path(args.out)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Generate ROI
        roi_geojson = create_ghana_offshore_roi(args.nm)
        
        # Save to file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(roi_geojson, f, indent=2)
        
        logger.info(f"ROI saved to {output_path}")
        logger.info(f"Bounds: {roi_geojson['features'][0]['properties']['bounds']}")
        logger.info("✅ ROI generation completed successfully")
        
    except Exception as e:
        logger.error(f"Failed to generate ROI: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()