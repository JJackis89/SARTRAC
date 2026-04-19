#!/usr/bin/env python3
"""
Merge multiple GeoJSON point files and deduplicate by coordinates.
"""

import argparse
import logging
import sys
from datetime import datetime
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

    # Ensure 'confidence' column exists (older detectors may not emit it)
    if 'confidence' not in gdf.columns:
        gdf['confidence'] = 0.3  # Default moderate-low confidence
    # Ensure 'detection_value' column exists
    if 'detection_value' not in gdf.columns:
        gdf['detection_value'] = gdf.get('value', 0.0)

    # Ensure per-feature 'data_quality' exists; rank low < medium < high
    if 'data_quality' not in gdf.columns:
        gdf['data_quality'] = 'low'
    _quality_rank = {'low': 0, 'medium': 1, 'high': 2}
    _rank_to_quality = {v: k for k, v in _quality_rank.items()}
    gdf['_quality_rank'] = gdf['data_quality'].map(_quality_rank).fillna(0).astype(int)

    # Group by rounded coordinates and aggregate
    agg_dict = {
        'value': 'max',  # Take maximum value for duplicates
        'source': lambda x: ','.join(sorted(set(x))),  # Combine unique sources
        'confidence': 'max',  # Take best confidence from per-source detections
        'detection_value': 'max',
        '_quality_rank': 'max',  # Best quality across sources for this point
        'lon': 'first',  # Keep original coordinates
        'lat': 'first'
    }
    # Only aggregate columns that exist
    agg_dict = {k: v for k, v in agg_dict.items() if k in gdf.columns}
    grouped = gdf.groupby(['lon_rounded', 'lat_rounded']).agg(agg_dict).reset_index()

    if '_quality_rank' in grouped.columns:
        grouped['data_quality'] = grouped['_quality_rank'].map(_rank_to_quality)
        grouped = grouped.drop(columns=['_quality_rank'])

    # Count unique sources per deduplicated point for fusion scoring
    source_counts = gdf.groupby(['lon_rounded', 'lat_rounded'])['source'].nunique().reset_index()
    source_counts.columns = ['lon_rounded', 'lat_rounded', 'n_sources']
    grouped = grouped.merge(source_counts, on=['lon_rounded', 'lat_rounded'], how='left')

    # Multi-source fusion: boost confidence when a detection appears in
    # multiple independent datasets (ERDDAP S3A + S3B + GEE, etc.)
    # Single source → no boost, 2 sources → +0.15, 3+ → +0.25
    fusion_boost = np.where(
        grouped['n_sources'] >= 3, 0.25,
        np.where(grouped['n_sources'] >= 2, 0.15, 0.0)
    )
    if 'confidence' in grouped.columns:
        grouped['confidence'] = np.clip(grouped['confidence'] + fusion_boost, 0.0, 1.0)
        grouped['confidence'] = np.round(grouped['confidence'], 3)

    grouped['n_sources'] = grouped['n_sources'].fillna(1).astype(int)
    
    # Recreate geometries
    grouped['geometry'] = [Point(lon, lat) for lon, lat in zip(grouped['lon'], grouped['lat'])]
    
    # Create new GeoDataFrame
    keep_cols = ['value', 'source', 'confidence', 'detection_value', 'n_sources',
                 'data_quality', 'geometry']
    keep_cols = [c for c in keep_cols if c in grouped.columns or c == 'geometry']
    gdf_deduped = gpd.GeoDataFrame(
        grouped[keep_cols],
        crs=gdf.crs
    )
    
    count_after = len(gdf_deduped)
    duplicates_removed = count_before - count_after
    
    logger.info(f"Deduplication: {count_before} -> {count_after} points ({duplicates_removed} duplicates removed)")
    multi_src = (gdf_deduped.get('n_sources', pd.Series()) > 1).sum() if 'n_sources' in gdf_deduped.columns else 0
    if multi_src > 0:
        logger.info(f"Multi-source fusion: {multi_src} points confirmed by ≥2 independent sources")
    
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
        
        # Save merged file — write as JSON with top-level FeatureCollection
        # properties so the frontend can surface overall data_quality.
        import json
        output_path = Path(args.out)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Compute overall data_quality (max rank across all features)
        _quality_rank = {'low': 0, 'medium': 1, 'high': 2}
        overall_quality = 'low'
        if 'data_quality' in validated_gdf.columns and not validated_gdf.empty:
            best = max(
                (_quality_rank.get(q, 0) for q in validated_gdf['data_quality']),
                default=0,
            )
            overall_quality = {v: k for k, v in _quality_rank.items()}[best]

        # Serialize to file then rewrite with injected top-level properties
        validated_gdf.to_file(output_path, driver='GeoJSON')
        try:
            with open(output_path, 'r', encoding='utf-8') as fh:
                fc = json.load(fh)
            fc['properties'] = {
                **(fc.get('properties') or {}),
                'data_quality': overall_quality,
                'date': args.date,
                'processed_at': datetime.utcnow().isoformat(),
                'n_features': len(validated_gdf),
            }
            with open(output_path, 'w', encoding='utf-8') as fh:
                json.dump(fc, fh)
        except Exception as _e:
            logger.warning(f"Could not inject top-level properties: {_e}")
        
        logger.info(f"Successfully merged and saved {len(validated_gdf)} points to {output_path}")
        logger.info(f"Overall data_quality: {overall_quality}")
        
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