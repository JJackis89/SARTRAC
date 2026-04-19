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
        
        # Build dimensional constraints for the science variable.
        # In ERDDAP griddap, constraints attach to the *variable* not as
        # separate parameters.  Coordinate columns (time, latitude, longitude)
        # are returned automatically — we must NOT list them as extra vars,
        # otherwise ERDDAP tries to apply 4-D constraints to a 1-D variable
        # and returns HTTP 500.
        time_constraint = f"[({date_formatted})]" if time_var else ""
        
        # Some griddap datasets have an altitude/elevation dimension between
        # time and lat/lon.  When present we must include [(0.0)] for surface.
        altitude_constraint = ""
        if dataset.get('has_altitude', False):
            altitude_val = dataset.get('altitude_value', 0.0)
            altitude_constraint = f"[({altitude_val})]"
        
        lat_constraint = f"[({min_lat}):1:({max_lat})]"
        lon_constraint = f"[({min_lon}):1:({max_lon})]"
        
        url = (f"{server}/griddap/{dataset_id}.csv?"
               f"{var}{time_constraint}{altitude_constraint}"
               f"{lat_constraint}{lon_constraint}")
        
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
        Apply threshold, spatial-clustering filter, and confidence scoring.

        The clustering step keeps only pixels that have at least
        *min_neighbours* other above-threshold pixels within
        *cluster_radius* degrees.  This dramatically reduces isolated
        false-positives from high-chlorophyll upwelling zones.

        IMPORTANT — for real AFAI/FAI datasets we relax clustering because
        floating-mat windrows are often only 1-pixel wide. A dataset whose
        ``index_type`` is ``'afai'`` or ``'fai'`` overrides
        ``min_neighbours`` down to 1 and tightens ``cluster_radius``.

        Confidence score (0.0-1.0) is computed from two factors:
          1. Threshold exceedance ratio: how far above threshold (40% weight)
          2. Cluster density: number of neighbours in radius (60% weight)

        Args:
            df: Cleaned DataFrame
            dataset_key: Dataset configuration key
            threshold: Chlorophyll-a threshold (mg/m³)
            cluster_radius: Max distance (°) for neighbour check
            min_neighbours: Minimum neighbours to keep a pixel

        Returns:
            DataFrame with detections and confidence scores
        """
        if df.empty:
            return df

        dataset = self.config[dataset_key]
        var = dataset['var']
        lat_var = dataset.get('lat', 'latitude')
        lon_var = dataset.get('lon', 'longitude')

        # Real AFAI/FAI datasets: relax clustering so linear windrows survive.
        index_type = dataset.get('index_type')
        if index_type in ('afai', 'fai'):
            min_neighbours = 1
            cluster_radius = min(cluster_radius, 0.03)
            logger.info(
                f"index_type={index_type}: relaxed clustering "
                f"(min_neighbours={min_neighbours}, radius={cluster_radius}°)"
            )

        # Step 1 — simple threshold
        detections = df[df[var] >= threshold].copy()
        logger.info(f"Threshold {threshold}: {len(detections)} raw detections")

        if len(detections) < min_neighbours + 1:
            # Still add confidence even for sparse detections
            if not detections.empty:
                detections['confidence'] = 0.2  # Low confidence for isolated points
            return detections

        # Step 2 — spatial-clustering filter with DBSCAN-style density
        from scipy.spatial import cKDTree
        coords = detections[[lon_var, lat_var]].values
        tree = cKDTree(coords)
        neighbours = tree.query_ball_point(coords, r=cluster_radius)
        neighbour_counts = np.array([len(n) - 1 for n in neighbours])

        keep = neighbour_counts >= min_neighbours
        detections = detections[keep].copy()
        neighbour_counts = neighbour_counts[keep]
        logger.info(f"After clustering (r={cluster_radius}°, min={min_neighbours}): "
                    f"{len(detections)} detections")

        if detections.empty:
            return detections

        # Step 3 — compute confidence scores
        values = detections[var].values

        # Factor 1: Threshold exceedance ratio (0-1)
        # How many multiples above threshold: ratio=1 at threshold, capped at 5x
        exceedance = np.clip((values / threshold - 1.0) / 4.0, 0.0, 1.0)

        # Factor 2: Cluster density (0-1)
        # Normalise neighbour count: 0 at min_neighbours, 1 at 10+ neighbours
        max_density_neighbours = 10
        density = np.clip(
            (neighbour_counts - min_neighbours) / (max_density_neighbours - min_neighbours),
            0.0, 1.0
        )

        # Combined confidence: density-weighted (chlorophyll is a proxy, cluster
        # density is a stronger indicator of real Sargassum aggregation)
        confidence = 0.4 * exceedance + 0.6 * density

        # Floor at 0.15 (any point that survives clustering has some credibility)
        confidence = np.clip(confidence, 0.15, 1.0)

        detections['confidence'] = np.round(confidence, 3)
        detections['neighbour_count'] = neighbour_counts

        logger.info(f"Confidence scores: min={confidence.min():.2f}, "
                    f"mean={confidence.mean():.2f}, max={confidence.max():.2f}")

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
        gdf['detection_value'] = gdf[var]
        index_type = dataset.get('index_type')
        if index_type in ('afai', 'fai'):
            gdf['detection_method'] = f'erddap_{index_type}'
            gdf['caveat'] = f'real {index_type.upper()} index — scientific standard'
            gdf['data_quality'] = 'high'
        else:
            gdf['detection_method'] = 'erddap_chlor_a_proxy'
            gdf['caveat'] = 'chlorophyll proxy — validate with AFAI/MCI'
            gdf['data_quality'] = 'low'

        # Carry confidence from clustering step if present
        if 'confidence' in df.columns:
            gdf['confidence'] = df['confidence'].values[:len(gdf)]
        else:
            gdf['confidence'] = 0.3  # Default low confidence for unclustered
        if 'neighbour_count' in df.columns:
            gdf['neighbour_count'] = df['neighbour_count'].values[:len(gdf)]
        
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
    
    def detect(self, dataset_key, date_str, threshold, roi_path=None, bbox=None,
               lookback_days=7):
        """
        Main detection workflow with date lookback.

        Satellite data typically has 1-7 day latency and individual days can
        be fully cloud-covered.  When the requested *date_str* yields no
        valid pixels we retry up to *lookback_days* earlier dates.
        
        Args:
            dataset_key: Dataset configuration key
            date_str: Date string YYYY-MM-DD
            threshold: Detection threshold
            roi_path: Path to ROI file for clipping
            bbox: Custom bounding box
            lookback_days: How many days back to search for cloud-free data
            
        Returns:
            GeoDataFrame with detections
        """
        from datetime import timedelta

        base_date = datetime.strptime(date_str, '%Y-%m-%d')

        for offset in range(0, lookback_days + 1):
            try_date = (base_date - timedelta(days=offset)).strftime('%Y-%m-%d')
            try:
                gdf = self._detect_single_date(
                    dataset_key, try_date, threshold, roi_path, bbox
                )
                if not gdf.empty:
                    logger.info(f"Got {len(gdf)} detections from {try_date} "
                                f"(offset={offset} days)")
                    gdf['detection_date'] = try_date
                    return gdf
                # Date yielded data but nothing above threshold
                if offset == 0:
                    logger.info(f"{try_date}: no detections above threshold "
                                f"— will look back")
            except Exception as e:
                logger.warning(f"{try_date}: {e} — will look back")

        logger.warning(f"No cloud-free data found in last {lookback_days} days")
        return gpd.GeoDataFrame()

    # ------------------------------------------------------------------
    def _detect_single_date(self, dataset_key, date_str, threshold,
                            roi_path=None, bbox=None):
        """Run detection for a single date (no lookback)."""
        try:
            # Build ERDDAP URL
            url = self.build_erddap_url(dataset_key, date_str, bbox)
            
            # Fetch data
            df = self.fetch_data(url, dataset_key)
            
            if df.empty:
                logger.info(f"{date_str}: no valid data from ERDDAP")
                return gpd.GeoDataFrame()
            
            # Apply threshold
            detections = self.apply_threshold(df, dataset_key, threshold)
            
            if detections.empty:
                logger.info(f"{date_str}: no detections above threshold")
                return gpd.GeoDataFrame()
            
            # Convert to points
            gdf = self.convert_to_points(detections, dataset_key)
            
            # Clip to ROI if provided
            if roi_path and Path(roi_path).exists():
                gdf = self.clip_to_roi(gdf, roi_path)
            
            return gdf
            
        except Exception as e:
            logger.error(f"Detection failed for {date_str}: {e}")
            return gpd.GeoDataFrame()

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Detect Sargassum from ERDDAP data')
    parser.add_argument('--date', required=True, help='Date YYYY-MM-DD')
    parser.add_argument('--dataset', required=True, 
                       choices=['s3a_olci_chla', 's3b_olci_chla', 'viirs_chla',
                                's3a_olci_sector',
                                'modis_aqua_afai', 's3a_olci_fai'],
                       help='Dataset to query (modis_aqua_afai/s3a_olci_fai '
                            'are real AFAI/FAI; s3*_chla are proxies; '
                            'viirs_chla is legacy)')
    parser.add_argument('--threshold', type=float, default=0.02,
                       help='Detection threshold')
    parser.add_argument('--roi', help='ROI GeoJSON file for clipping')
    parser.add_argument('--out', required=True, help='Output GeoJSON file')
    parser.add_argument('--bbox', nargs=4, type=float, metavar=('minLon', 'maxLon', 'minLat', 'maxLat'),
                       help='Custom bounding box')
    parser.add_argument('--lookback', type=int, default=14,
                       help='Days to look back for cloud-free data (default 14)')
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
            bbox=args.bbox,
            lookback_days=args.lookback
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