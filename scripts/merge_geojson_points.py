#!/usr/bin/env python3
"""
Merge multiple GeoJSON point files and deduplicate by coordinates.
"""

import argparse
import logging
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import numpy as np
from shapely.geometry import Point

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def load_geojson_files(file_paths):
    """
    Load multiple GeoJSON files and combine them.
    
    Args:
        file_paths: List of file paths
        
    Returns:
        Combined GeoDataFrame
    """
    gdfs = []
    
    for file_path in file_paths:
        try:
            if Path(file_path).exists():
                gdf = gpd.read_file(file_path)
                if not gdf.empty:
                    gdfs.append(gdf)
                    logger.info(f"Loaded {len(gdf)} points from {file_path}")
                else:
                    logger.info(f"Empty file: {file_path}")
            else:
                logger.warning(f"File not found: {file_path}")
        except Exception as e:
            logger.error(f"Failed to load {file_path}: {e}")
    
    if not gdfs:
        logger.warning("No valid files loaded")
        return gpd.GeoDataFrame()
    
    # Combine all GeoDataFrames
    combined = pd.concat(gdfs, ignore_index=True)
    
    # Ensure it's a GeoDataFrame with consistent CRS
    if not isinstance(combined, gpd.GeoDataFrame):
        combined = gpd.GeoDataFrame(combined)
    
    # Set CRS if not set
    if combined.crs is None:
        combined = combined.set_crs('EPSG:4326')
    
    logger.info(f"Combined {len(combined)} total points from {len(gdfs)} files")
    
    return combined

def deduplicate_points(gdf, precision=4):
    """
    Deduplicate points by rounded coordinates.
    
    Args:
        gdf: GeoDataFrame with point geometries
        precision: Decimal places for coordinate rounding
        
    Returns:
        Deduplicated GeoDataFrame
    """
    if gdf.empty:
        return gdf
    
    # Extract coordinates
    gdf = gdf.copy()
    gdf['lon'] = gdf.geometry.x
    gdf['lat'] = gdf.geometry.y
    
    # Round coordinates for deduplication
    gdf['lon_rounded'] = np.round(gdf['lon'], precision)
    gdf['lat_rounded'] = np.round(gdf['lat'], precision)
    
    # Count before deduplication
    count_before = len(gdf)
    
    # Group by rounded coordinates and aggregate
    grouped = gdf.groupby(['lon_rounded', 'lat_rounded']).agg({
        'value': 'max',  # Take maximum value for duplicates
        'source': lambda x: ','.join(x.unique()),  # Combine sources
        'lon': 'first',  # Keep original coordinates
        'lat': 'first'
    }).reset_index()
    
    # Recreate geometries
    grouped['geometry'] = [Point(lon, lat) for lon, lat in zip(grouped['lon'], grouped['lat'])]
    
    # Create new GeoDataFrame
    gdf_deduped = gpd.GeoDataFrame(
        grouped[['value', 'source', 'geometry']],
        crs=gdf.crs
    )
    
    count_after = len(gdf_deduped)
    duplicates_removed = count_before - count_after
    
    logger.info(f"Deduplication: {count_before} -> {count_after} points ({duplicates_removed} duplicates removed)")
    
    return gdf_deduped

def add_metadata(gdf, date_str=None):
    """
    Add metadata to the merged GeoDataFrame.
    
    Args:
        gdf: GeoDataFrame
        date_str: Date string for metadata
        
    Returns:
        GeoDataFrame with metadata
    """
    if gdf.empty:
        return gdf
    
    gdf = gdf.copy()
    
    # Add date if provided
    if date_str:
        gdf['date'] = date_str
    
    # Add detection timestamp
    from datetime import datetime
    gdf['processed_at'] = datetime.utcnow().isoformat()
    
    # Add point ID
    gdf['point_id'] = range(1, len(gdf) + 1)
    
    logger.info("Added metadata to merged points")
    
    return gdf

def validate_output(gdf, roi_path=None):
    """
    Validate that all points are within expected bounds.
    
    Args:
        gdf: GeoDataFrame to validate
        roi_path: Optional ROI file for validation
        
    Returns:
        Validated GeoDataFrame
    """
    if gdf.empty:
        return gdf
    
    # Basic coordinate validation
    invalid_coords = (
        (gdf.geometry.x < -180) | (gdf.geometry.x > 180) |
        (gdf.geometry.y < -90) | (gdf.geometry.y > 90)
    )
    
    if invalid_coords.any():
        logger.warning(f"Removing {invalid_coords.sum()} points with invalid coordinates")
        gdf = gdf[~invalid_coords]
    
    # ROI validation if provided
    if roi_path and Path(roi_path).exists():
        try:
            roi = gpd.read_file(roi_path)
            if roi.crs != gdf.crs:
                roi = roi.to_crs(gdf.crs)
            
            # Check which points are within ROI
            within_roi = gdf.within(roi.unary_union)
            outside_count = (~within_roi).sum()
            
            if outside_count > 0:
                logger.warning(f"Removing {outside_count} points outside ROI")
                gdf = gdf[within_roi]
                
        except Exception as e:
            logger.error(f"ROI validation failed: {e}")
    
    logger.info(f"Validation complete: {len(gdf)} valid points")
    
    return gdf

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Merge and deduplicate GeoJSON point files')
    parser.add_argument('inputs', nargs='+', help='Input GeoJSON files')
    parser.add_argument('--out', required=True, help='Output merged GeoJSON file')
    parser.add_argument('--precision', type=int, default=4,
                       help='Decimal places for coordinate deduplication')
    parser.add_argument('--date', help='Date string for metadata')
    parser.add_argument('--roi', help='ROI file for validation')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        logger.info(f"Merging {len(args.inputs)} input files")
        
        # Load and combine files
        combined_gdf = load_geojson_files(args.inputs)
        
        if combined_gdf.empty:
            logger.warning("No data to merge")
            # Create empty output file
            empty_gdf = gpd.GeoDataFrame(columns=['value', 'source', 'date', 'processed_at', 'point_id'], 
                                        crs='EPSG:4326')
            output_path = Path(args.out)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            empty_gdf.to_file(output_path, driver='GeoJSON')
            logger.info(f"Saved empty merged file to {output_path}")
            return 0
        
        # Deduplicate points
        deduped_gdf = deduplicate_points(combined_gdf, args.precision)
        
        # Add metadata
        final_gdf = add_metadata(deduped_gdf, args.date)
        
        # Validate output
        validated_gdf = validate_output(final_gdf, args.roi)
        
        # Save merged file
        output_path = Path(args.out)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        validated_gdf.to_file(output_path, driver='GeoJSON')
        
        logger.info(f"Successfully merged and saved {len(validated_gdf)} points to {output_path}")
        
        # Print summary
        if not validated_gdf.empty:
            sources = validated_gdf['source'].str.split(',').explode().value_counts()
            logger.info(f"Source summary: {dict(sources)}")
        
        return 0
        
    except Exception as e:
        logger.error(f"Merge failed: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())