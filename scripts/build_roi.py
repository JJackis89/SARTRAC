#!/usr/bin/env python3
"""
Build Ghana 0-20 nautical mile offshore band for Sargassum detection.
Creates water-only polygon from Natural Earth coastline data.
"""

import argparse
import logging
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box
from shapely.ops import unary_union
import pyproj

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_ghana_geometry():
    """Get Ghana geometry from Natural Earth dataset."""
    try:
        # Load world data using more compatible approach
        try:
            # Try the new method first
            world = gpd.read_file("https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/110m/cultural/ne_110m_admin_0_countries.zip")
        except Exception:
            # Fallback to creating a simple Ghana polygon
            logger.warning("Could not load Natural Earth data, using simplified Ghana polygon")
            return create_simple_ghana_polygon()
            
        ghana = world[world['NAME'] == 'Ghana'].copy()
        
        if ghana.empty:
            # Try alternative name variations
            ghana = world[world['NAME_EN'] == 'Ghana'].copy()
            if ghana.empty:
                logger.warning("Ghana not found in dataset, using simplified polygon")
                return create_simple_ghana_polygon()
            
        return ghana.geometry.iloc[0]
    except Exception as e:
        logger.error(f"Failed to load Ghana geometry: {e}")
        raise

def create_simple_ghana_polygon():
    """Create a simplified Ghana polygon when Natural Earth data is not available."""
    from shapely.geometry import Polygon
    
    # Simplified Ghana boundary coordinates (approximate)
    ghana_coords = [
        (-3.2, 4.7),  # Southwest corner
        (-1.2, 4.7),  # Southeast corner
        (-1.2, 11.2), # Northeast corner
        (-3.2, 11.2), # Northwest corner
        (-3.2, 4.7)   # Close polygon
    ]
    
    return Polygon(ghana_coords)

def build_offshore_band(ghana_geom, nautical_miles=20):
    """
    Build offshore band around Ghana coastline.
    
    Args:
        ghana_geom: Ghana geometry in WGS84
        nautical_miles: Distance offshore in nautical miles
        
    Returns:
        Offshore band geometry in WGS84
    """
    # Convert to meters
    buffer_distance = nautical_miles * 1852  # 1 nautical mile = 1852 meters
    
    # Ghana approximate center for Azimuthal Equidistant projection
    ghana_center_lon = -1.0
    ghana_center_lat = 7.5
    
    # Create Azimuthal Equidistant projection centered on Ghana
    aeqd_proj = pyproj.CRS(f"+proj=aeqd +lat_0={ghana_center_lat} +lon_0={ghana_center_lon} +datum=WGS84")
    
    logger.info(f"Projecting to Azimuthal Equidistant centered on {ghana_center_lat:.1f}°N, {ghana_center_lon:.1f}°E")
    
    # Create transformer
    transformer_to_aeqd = pyproj.Transformer.from_crs("EPSG:4326", aeqd_proj, always_xy=True)
    transformer_to_wgs84 = pyproj.Transformer.from_crs(aeqd_proj, "EPSG:4326", always_xy=True)
    
    # Transform Ghana to projected coordinates
    ghana_projected = transform_geometry(ghana_geom, transformer_to_aeqd)
    
    # Buffer outward by specified distance
    logger.info(f"Creating {nautical_miles} nm ({buffer_distance} m) buffer")
    ghana_buffered = ghana_projected.buffer(buffer_distance)
    
    # Transform back to WGS84
    offshore_band_wgs84 = transform_geometry(ghana_buffered, transformer_to_wgs84)
    
    # Subtract land from the buffered area to get water-only band
    offshore_band_water = offshore_band_wgs84.difference(ghana_geom)
    
    # Clean geometry
    if hasattr(offshore_band_water, 'buffer'):
        offshore_band_water = offshore_band_water.buffer(0)
    
    logger.info(f"Created offshore band with area: {offshore_band_water.area:.6f} square degrees")
    
    return offshore_band_water

def transform_geometry(geom, transformer):
    """Transform geometry using pyproj transformer."""
    from shapely.ops import transform
    return transform(transformer.transform, geom)

def clip_to_water_only(offshore_band):
    """
    Remove any land areas from the offshore band using world land data.
    
    Args:
        offshore_band: Offshore band geometry
        
    Returns:
        Water-only offshore band
    """
    try:
        # Load world land data
        world = gpd.read_file(gpd.datasets.get_path('naturalearth_lowres'))
        
        # Get bounding box of offshore band to limit processing
        bounds = offshore_band.bounds
        bbox = box(bounds[0] - 1, bounds[1] - 1, bounds[2] + 1, bounds[3] + 1)
        
        # Clip world to region of interest for performance
        world_clipped = world[world.intersects(bbox)].copy()
        
        if not world_clipped.empty:
            # Union all land geometries
            land_union = unary_union(world_clipped.geometry.tolist())
            
            # Remove land from offshore band
            water_only = offshore_band.difference(land_union)
            
            # Clean geometry
            if hasattr(water_only, 'buffer'):
                water_only = water_only.buffer(0)
                
            logger.info("Removed land areas from offshore band")
            return water_only
        else:
            logger.warning("No land geometries found in region")
            return offshore_band
            
    except Exception as e:
        logger.warning(f"Failed to remove land areas: {e}. Using original band.")
        return offshore_band

def save_roi(geometry, output_path):
    """Save ROI geometry to GeoJSON file."""
    try:
        # Create GeoDataFrame
        gdf = gpd.GeoDataFrame([{'id': 1, 'name': 'Ghana_offshore_band'}], 
                              geometry=[geometry], 
                              crs='EPSG:4326')
        
        # Ensure output directory exists
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save to GeoJSON
        gdf.to_file(output_path, driver='GeoJSON')
        
        logger.info(f"Saved ROI to {output_path}")
        logger.info(f"ROI bounds: {geometry.bounds}")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to save ROI: {e}")
        return False

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Build Ghana offshore band ROI')
    parser.add_argument('--out', default='data/ghana_20nm.geojson', 
                       help='Output GeoJSON path')
    parser.add_argument('--nm', type=float, default=20.0,
                       help='Distance offshore in nautical miles')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        logger.info(f"Building Ghana {args.nm} nm offshore band")
        
        # Get Ghana geometry
        ghana_geom = get_ghana_geometry()
        logger.info("Loaded Ghana geometry from Natural Earth")
        
        # Build offshore band
        offshore_band = build_offshore_band(ghana_geom, args.nm)
        
        # Remove land areas
        water_only_band = clip_to_water_only(offshore_band)
        
        # Save ROI
        success = save_roi(water_only_band, args.out)
        
        if success:
            logger.info("ROI build completed successfully")
            return 0
        else:
            logger.error("ROI build failed")
            return 1
            
    except Exception as e:
        logger.error(f"ROI build failed: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())