#!/usr/bin/env python3
"""
ERDDAP-based Sargassum screening using chlorophyll-a proxy.

IMPORTANT — scientific caveat:
The ERDDAP datasets used here expose **chlorophyll-a** (chlor_a), *not*
raw reflectance bands needed for true AFAI/MCI indices.  Elevated chlorophyll
is a necessary but not sufficient indicator of Sargassum.  Results should be
treated as a *coarse screen* and validated with the GEE OLCI pipeline
(detect_gee_olci.py) which computes actual AFAI and MCI.

A spatial-clustering filter is applied to reduce isolated false positives:
only detection pixels with ≥MIN_NEIGHBOURS neighbours within CLUSTER_RADIUS
are kept.

Supports configurable datasets via YAML config.
"""

import argparse
import logging
import sys
from datetime import datetime
from io import StringIO
from pathlib import Path
import yaml

import pandas as pd
import geopandas as gpd
import numpy as np
import requests
from shapely.geometry import Point

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ERDDAPDetector:
    """ERDDAP data detector for Sargassum indices."""
    
    def __init__(self, config_path='config/datasets.yaml'):
        """Initialize with dataset configuration."""
        self.config = self.load_config(config_path)
        
    def load_config(self, config_path):
        """Load dataset configuration from YAML file."""
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
            logger.info(f"Loaded configuration from {config_path}")
            return config
        except Exception as e:
            logger.error(f"Failed to load config from {config_path}: {e}")
            raise
    
    def build_erddap_url(self, dataset_key, date_str, bbox=None):
        """
        Build ERDDAP CSV query URL.
        
        Args:
            dataset_key: Key in config (e.g., 'viirs_afai')
            date_str: Date string YYYY-MM-DD
            bbox: (minLon, maxLon, minLat, maxLat) or None for default
            
        Returns:
            ERDDAP query URL
        """
        if dataset_key not in self.config:
            raise ValueError(f"Dataset '{dataset_key}' not found in config")
            
        dataset = self.config[dataset_key]
        
        # Use provided bbox or default Ghana region
        if bbox is None:
            bbox = dataset.get('default_bbox', [-4.5, 2.5, 3.0, 7.0])
        
        min_lon, max_lon, min_lat, max_lat = bbox
        
        # Build URL components
        server = dataset['server'].rstrip('/')
        dataset_id = dataset['dataset_id']
        var = dataset['var']
        lat_var = dataset.get('lat', 'latitude')
        lon_var = dataset.get('lon', 'longitude')
        time_var = dataset.get('time', 'time')
        
        # Format date for ERDDAP
        date_formatted = f"{date_str}T00:00:00Z"
        
        # Build query parameters
        vars_str = f"{var},{lat_var},{lon_var}"
        if time_var:
            vars_str = f"{vars_str},{time_var}"
        
        time_constraint = f"[({date_formatted})]" if time_var else ""
        lat_constraint = f"[({min_lat}):1:({max_lat})]"
        lon_constraint = f"[({min_lon}):1:({max_lon})]"
        
        url = f"{server}/griddap/{dataset_id}.csv?{vars_str}{time_constraint}{lat_constraint}{lon_constraint}"
        
        logger.info(f"Built ERDDAP URL for {dataset_key}: {url}")
        return url
    
    def fetch_data(self, url, dataset_key):
        """
        Fetch data from ERDDAP URL.
        
        Args:
            url: ERDDAP query URL
            dataset_key: Dataset configuration key
            
        Returns:
            pandas.DataFrame with cleaned data
        """
        try:
            logger.info(f"Fetching data from ERDDAP...")
            
            # Make request with timeout
            response = requests.get(url, timeout=300)
            response.raise_for_status()
            
            # Parse CSV response
            # ERDDAP griddap CSV: line 0 = column names, line 1 = units, data from line 2+
            lines = response.text.strip().split('\n')
            if len(lines) < 3:
                logger.warning("Empty or invalid response from ERDDAP")
                return pd.DataFrame()
            
            # Keep header (line 0) and data (line 2+), skip units row (line 1)
            data_lines = [lines[0]] + lines[2:]
            
            # Create DataFrame
            df = pd.read_csv(StringIO('\n'.join(data_lines)))
            
            logger.info(f"Retrieved {len(df)} raw data points")
            
            # Clean data
            df_cleaned = self.clean_data(df, dataset_key)
            
            return df_cleaned
            
        except requests.RequestException as e:
            logger.error(f"Failed to fetch ERDDAP data: {e}")
            return pd.DataFrame()
        except Exception as e:
            logger.error(f"Failed to parse ERDDAP response: {e}")
            return pd.DataFrame()
    
    def clean_data(self, df, dataset_key):
        """
        Clean ERDDAP data by removing fill values and invalid data.
        
        Args:
            df: Raw DataFrame from ERDDAP
            dataset_key: Dataset configuration key
            
        Returns:
            Cleaned DataFrame
        """
        if df.empty:
            return df
        
        dataset = self.config[dataset_key]
        var = dataset['var']
        lat_var = dataset.get('lat', 'latitude')
        lon_var = dataset.get('lon', 'longitude')
        
        # Get fill values
        fill_values = dataset.get('fill_values', [9999, -9999, 99999, -99999])
        
        logger.info(f"Cleaning data with fill values: {fill_values}")
        
        # Remove fill values
        mask = ~df[var].isin(fill_values)
        df_clean = df[mask].copy()
        
        # Remove NaN values
        df_clean = df_clean.dropna(subset=[var, lat_var, lon_var])
        
        # Remove extreme values (basic sanity check)
        df_clean = df_clean[
            (df_clean[lat_var] >= -90) & (df_clean[lat_var] <= 90) &
            (df_clean[lon_var] >= -180) & (df_clean[lon_var] <= 180)
        ]
        
        logger.info(f"Cleaned data: {len(df_clean)} valid points")
        
        return df_clean
    
    def apply_threshold(self, df, dataset_key, threshold,
                         cluster_radius=0.05, min_neighbours=2):
        """
        Apply threshold **and spatial-clustering filter** to detect Sargassum.

        The clustering step keeps only pixels that have at least
        *min_neighbours* other above-threshold pixels within
        *cluster_radius* degrees.  This dramatically reduces isolated
        false-positives from high-chlorophyll upwelling zones.

        Args:
            df: Cleaned DataFrame
            dataset_key: Dataset configuration key
            threshold: Chlorophyll-a threshold (mg/m³)
            cluster_radius: Max distance (°) for neighbour check
            min_neighbours: Minimum neighbours to keep a pixel

        Returns:
            DataFrame with detections only
        """
        if df.empty:
            return df

        dataset = self.config[dataset_key]
        var = dataset['var']
        lat_var = dataset.get('lat', 'latitude')
        lon_var = dataset.get('lon', 'longitude')

        # Step 1 — simple threshold
        detections = df[df[var] >= threshold].copy()
        logger.info(f"Threshold {threshold}: {len(detections)} raw detections")

        if len(detections) < min_neighbours + 1:
            return detections  # too few to cluster

        # Step 2 — spatial-clustering filter
        from scipy.spatial import cKDTree
        coords = detections[[lon_var, lat_var]].values
        tree = cKDTree(coords)
        neighbours = tree.query_ball_point(coords, r=cluster_radius)
        # -1 because each point is its own neighbour
        keep = np.array([len(n) - 1 >= min_neighbours for n in neighbours])
        detections = detections[keep].copy()
        logger.info(f"After clustering (r={cluster_radius}°, min={min_neighbours}): "
                    f"{len(detections)} detections")

        return detections
    
    def convert_to_points(self, df, dataset_key):
        """
        Convert DataFrame to GeoDataFrame with Point geometries.
        
        Args:
            df: DataFrame with detections
            dataset_key: Dataset configuration key
            
        Returns:
            GeoDataFrame with Point geometries
        """
        if df.empty:
            return gpd.GeoDataFrame()
        
        dataset = self.config[dataset_key]
        var = dataset['var']
        lat_var = dataset.get('lat', 'latitude')
        lon_var = dataset.get('lon', 'longitude')
        
        # Create Point geometries
        geometry = [Point(row[lon_var], row[lat_var]) for _, row in df.iterrows()]
        
        # Create GeoDataFrame
        gdf = gpd.GeoDataFrame(
            df[[var, lat_var, lon_var]].copy(),
            geometry=geometry,
            crs='EPSG:4326'
        )
        
        # Add metadata
        gdf['source'] = dataset_key
        gdf['value'] = gdf[var]
        gdf['detection_method'] = 'erddap_chlor_a_proxy'
        gdf['caveat'] = 'chlorophyll proxy — validate with AFAI/MCI'
        
        logger.info(f"Created {len(gdf)} point geometries")
        
        return gdf
    
    def clip_to_roi(self, gdf, roi_path):
        """
        Clip detections to ROI polygon.
        
        Args:
            gdf: GeoDataFrame with detections
            roi_path: Path to ROI GeoJSON file
            
        Returns:
            Clipped GeoDataFrame
        """
        if gdf.empty:
            return gdf
        
        try:
            # Load ROI
            roi = gpd.read_file(roi_path)
            
            # Ensure same CRS
            if roi.crs != gdf.crs:
                roi = roi.to_crs(gdf.crs)
            
            # Clip to ROI
            gdf_clipped = gpd.clip(gdf, roi)
            
            logger.info(f"Clipped to ROI: {len(gdf_clipped)} points within ROI")
            
            return gdf_clipped
            
        except Exception as e:
            logger.error(f"Failed to clip to ROI: {e}")
            return gdf
    
    def detect(self, dataset_key, date_str, threshold, roi_path=None, bbox=None):
        """
        Main detection workflow.
        
        Args:
            dataset_key: Dataset configuration key
            date_str: Date string YYYY-MM-DD
            threshold: Detection threshold
            roi_path: Path to ROI file for clipping
            bbox: Custom bounding box
            
        Returns:
            GeoDataFrame with detections
        """
        try:
            # Build ERDDAP URL
            url = self.build_erddap_url(dataset_key, date_str, bbox)
            
            # Fetch data
            df = self.fetch_data(url, dataset_key)
            
            if df.empty:
                logger.warning("No data retrieved from ERDDAP")
                return gpd.GeoDataFrame()
            
            # Apply threshold
            detections = self.apply_threshold(df, dataset_key, threshold)
            
            if detections.empty:
                logger.warning("No detections above threshold")
                return gpd.GeoDataFrame()
            
            # Convert to points
            gdf = self.convert_to_points(detections, dataset_key)
            
            # Clip to ROI if provided
            if roi_path and Path(roi_path).exists():
                gdf = self.clip_to_roi(gdf, roi_path)
            
            return gdf
            
        except Exception as e:
            logger.error(f"Detection failed: {e}")
            return gpd.GeoDataFrame()

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Detect Sargassum from ERDDAP data')
    parser.add_argument('--date', required=True, help='Date YYYY-MM-DD')
    parser.add_argument('--dataset', required=True, 
                       choices=['viirs_chla', 'viirs_npp_chla', 's3a_olci_chla', 's3b_olci_chla'],
                       help='Dataset to query')
    parser.add_argument('--threshold', type=float, default=0.02,
                       help='Detection threshold')
    parser.add_argument('--roi', help='ROI GeoJSON file for clipping')
    parser.add_argument('--out', required=True, help='Output GeoJSON file')
    parser.add_argument('--bbox', nargs=4, type=float, metavar=('minLon', 'maxLon', 'minLat', 'maxLat'),
                       help='Custom bounding box')
    parser.add_argument('--config', default='config/datasets.yaml',
                       help='Dataset configuration file')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        # Validate date format
        datetime.strptime(args.date, '%Y-%m-%d')
        
        # Initialize detector
        detector = ERDDAPDetector(args.config)
        
        # Run detection
        logger.info(f"Detecting {args.dataset} for {args.date} with threshold {args.threshold}")
        
        gdf = detector.detect(
            dataset_key=args.dataset,
            date_str=args.date,
            threshold=args.threshold,
            roi_path=args.roi,
            bbox=args.bbox
        )
        
        # Save results
        output_path = Path(args.out)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        if not gdf.empty:
            gdf.to_file(output_path, driver='GeoJSON')
            logger.info(f"Saved {len(gdf)} detections to {output_path}")
        else:
            # Save empty GeoJSON
            empty_gdf = gpd.GeoDataFrame(columns=['source', 'value'], crs='EPSG:4326')
            empty_gdf.to_file(output_path, driver='GeoJSON')
            logger.info(f"No detections found. Saved empty file to {output_path}")
        
        return 0
        
    except Exception as e:
        logger.error(f"Detection failed: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())