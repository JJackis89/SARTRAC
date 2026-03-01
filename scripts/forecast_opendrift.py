#!/usr/bin/env python3
"""
Sargassum drift forecast using OpenDrift.
Uses OceanDrift model with CF-compliant ocean and wind data.
"""

import argparse
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import geopandas as gpd
from opendrift.models.oceandrift import OceanDrift
from opendrift.readers import reader_netCDF_CF_generic, reader_constant

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SargassumForecaster:
    """Sargassum drift forecasting using OpenDrift."""
    
    def __init__(self):
        """Initialize forecaster."""
        self.model = None
        self.readers_added = []
        
    def setup_model(self, windage=0.01):
        """
        Setup OpenDrift OceanDrift model.
        
        Args:
            windage: Wind drift factor (default 1%)
        """
        logger.info("Setting up OpenDrift OceanDrift model")
        
        self.model = OceanDrift(loglevel=20)  # INFO level
        
        # Configure wind drift
        self.model.set_config('seed:wind_drift_factor', windage)
        
        # Set other relevant parameters
        self.model.set_config('drift:current_uncertainty', 0.1)  # 10% current uncertainty
        self.model.set_config('drift:wind_uncertainty', 2.0)     # 2 m/s wind uncertainty
        self.model.set_config('vertical_mixing:diffusivitymodel', 'environment')
        
        logger.info(f"Model configured with windage: {windage}")
        
    def add_readers(self, currents_url=None, winds_url=None):
        """
        Add data readers for ocean currents and winds.
        
        Args:
            currents_url: OPeNDAP URL for ocean currents (CF-compliant)
            winds_url: OPeNDAP URL for wind data (CF-compliant)
        """
        readers_added = 0
        
        # Add ocean currents reader
        if currents_url:
            try:
                logger.info(f"Adding currents reader: {currents_url}")
                currents_reader = reader_netCDF_CF_generic.Reader(currents_url)
                self.model.add_reader(currents_reader)
                self.readers_added.append('currents')
                readers_added += 1
                logger.info("Ocean currents reader added successfully")
            except Exception as e:
                logger.error(f"Failed to add currents reader: {e}")
        
        # Add winds reader
        if winds_url:
            try:
                logger.info(f"Adding winds reader: {winds_url}")
                winds_reader = reader_netCDF_CF_generic.Reader(winds_url)
                self.model.add_reader(winds_reader)
                self.readers_added.append('winds')
                readers_added += 1
                logger.info("Winds reader added successfully")
            except Exception as e:
                logger.error(f"Failed to add winds reader: {e}")
        
        # Add fallback readers if needed
        if 'currents' not in self.readers_added:
            logger.warning("Adding fallback constant current reader — forecast accuracy will be reduced")
            # Representative westward surface current for Gulf of Guinea
            fallback_current = reader_constant.Reader({
                'x_sea_water_velocity': -0.3,  # m/s westward
                'y_sea_water_velocity': 0.1,   # m/s northward
            })
            self.model.add_reader(fallback_current)
            self.readers_added.append('fallback_currents')
            readers_added += 1
        
        if 'winds' not in self.readers_added:
            logger.warning("Adding fallback constant wind reader — forecast accuracy will be reduced")
            # Representative SW winds for Gulf of Guinea
            fallback_winds = reader_constant.Reader({
                'x_wind': -3.0,  # m/s
                'y_wind': -2.0,  # m/s
            })
            self.model.add_reader(fallback_winds)
            self.readers_added.append('fallback_winds')
            readers_added += 1
        
        logger.info(f"Total readers added: {readers_added}")
        
    def load_seed_points(self, detections_path):
        """
        Load Sargassum detection points for seeding.
        
        Args:
            detections_path: Path to GeoJSON file with detections
            
        Returns:
            Tuple of (longitudes, latitudes) arrays
        """
        try:
            gdf = gpd.read_file(detections_path)
            
            if gdf.empty:
                logger.warning("No detection points found")
                return np.array([]), np.array([])
            
            # Extract coordinates
            lons = gdf.geometry.x.values
            lats = gdf.geometry.y.values
            
            # Validate coordinates
            valid_mask = (
                (lons >= -180) & (lons <= 180) &
                (lats >= -90) & (lats <= 90)
            )
            
            lons = lons[valid_mask]
            lats = lats[valid_mask]
            
            logger.info(f"Loaded {len(lons)} valid seed points")
            
            return lons, lats
            
        except Exception as e:
            logger.error(f"Failed to load seed points: {e}")
            return np.array([]), np.array([])
    
    def seed_particles(self, lons, lats, start_time, particles_per_point=5):
        """
        Seed particles at detection locations.
        
        Args:
            lons: Longitude array
            lats: Latitude array
            start_time: Start time for seeding
            particles_per_point: Number of particles per detection point
        """
        if len(lons) == 0:
            logger.warning("No seed points provided")
            return
        
        # Repeat coordinates for multiple particles per point
        seed_lons = np.repeat(lons, particles_per_point)
        seed_lats = np.repeat(lats, particles_per_point)
        
        # Add small random offset to particles
        np.random.seed(42)  # For reproducible results
        offset = 0.01  # ~1 km offset
        seed_lons += np.random.uniform(-offset, offset, len(seed_lons))
        seed_lats += np.random.uniform(-offset, offset, len(seed_lats))
        
        total_particles = len(seed_lons)
        
        logger.info(f"Seeding {total_particles} particles at {len(lons)} locations")
        
        # Seed particles
        self.model.seed_elements(
            lon=seed_lons,
            lat=seed_lats,
            time=start_time,
            number=total_particles
        )
        
        logger.info(f"Seeded {total_particles} particles successfully")
    
    def run_forecast(self, start_time, duration_hours=72, time_step=900):
        """
        Run drift forecast.
        
        Args:
            start_time: Start time for forecast
            duration_hours: Forecast duration in hours
            time_step: Time step in seconds
        """
        end_time = start_time + timedelta(hours=duration_hours)
        
        logger.info(f"Running forecast from {start_time} to {end_time}")
        logger.info(f"Duration: {duration_hours} hours, time step: {time_step} seconds")
        
        try:
            self.model.run(
                end_time=end_time,
                time_step=time_step,
                export_buffer_length=1  # Keep all time steps in memory
            )
            
            logger.info("Forecast completed successfully")
            
        except Exception as e:
            logger.error(f"Forecast failed: {e}")
            raise
    
    def extract_results(self, roi_path=None):
        """
        Extract forecast results as GeoDataFrame.
        
        Args:
            roi_path: Optional ROI file for clipping results
            
        Returns:
            GeoDataFrame with particle trajectories
        """
        try:
            # Get final particle positions
            final_lons = self.model.elements.lon
            final_lats = self.model.elements.lat
            
            # Get particle status (active particles only)
            active_mask = self.model.elements.status == 0  # 0 = active
            
            final_lons = final_lons[active_mask]
            final_lats = final_lats[active_mask]
            
            logger.info(f"Extracted {len(final_lons)} active particles from forecast")
            
            if len(final_lons) == 0:
                logger.warning("No active particles found")
                return gpd.GeoDataFrame()
            
            # Create GeoDataFrame
            from shapely.geometry import Point
            
            geometry = [Point(lon, lat) for lon, lat in zip(final_lons, final_lats)]
            
            gdf = gpd.GeoDataFrame({
                'particle_id': range(len(final_lons)),
                'lon': final_lons,
                'lat': final_lats,
                'status': 'active'
            }, geometry=geometry, crs='EPSG:4326')
            
            # Clip to ROI if provided
            if roi_path and Path(roi_path).exists():
                gdf = self.clip_to_roi(gdf, roi_path)
            
            return gdf
            
        except Exception as e:
            logger.error(f"Failed to extract results: {e}")
            return gpd.GeoDataFrame()
    
    def clip_to_roi(self, gdf, roi_path):
        """
        Clip results to ROI.
        
        Args:
            gdf: GeoDataFrame with particles
            roi_path: Path to ROI file
            
        Returns:
            Clipped GeoDataFrame
        """
        try:
            roi = gpd.read_file(roi_path)
            
            if roi.crs != gdf.crs:
                roi = roi.to_crs(gdf.crs)
            
            # Clip to ROI
            gdf_clipped = gpd.clip(gdf, roi)
            
            logger.info(f"Clipped to ROI: {len(gdf_clipped)} particles within ROI")
            
            return gdf_clipped
            
        except Exception as e:
            logger.error(f"Failed to clip to ROI: {e}")
            return gdf
    
    def save_results(self, gdf, output_path, metadata=None):
        """
        Save forecast results to GeoJSON.
        
        Args:
            gdf: GeoDataFrame with results
            output_path: Output file path
            metadata: Additional metadata dictionary
        """
        try:
            # Add metadata
            if metadata:
                for key, value in metadata.items():
                    gdf[key] = value
            
            # Add forecast timestamp and data source info
            from datetime import timezone
            gdf['forecast_time'] = datetime.now(timezone.utc).isoformat()
            gdf['data_source'] = ','.join(self.readers_added)
            gdf['uses_fallback'] = any('fallback' in r for r in self.readers_added)
            
            # Ensure output directory exists
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Save to GeoJSON
            gdf.to_file(output_path, driver='GeoJSON')
            
            logger.info(f"Saved {len(gdf)} forecast particles to {output_path}")
            
        except Exception as e:
            logger.error(f"Failed to save results: {e}")
            raise

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Forecast Sargassum drift with OpenDrift')
    parser.add_argument('--detections', required=True,
                       help='GeoJSON file with Sargassum detections')
    parser.add_argument('--out', required=True,
                       help='Output GeoJSON file for forecast')
    parser.add_argument('--hours', type=int, default=72,
                       help='Forecast duration in hours')
    parser.add_argument('--windage', type=float, default=0.01,
                       help='Wind drift factor (default 0.01 = 1%)')
    parser.add_argument('--particles', type=int, default=5,
                       help='Particles per detection point')
    parser.add_argument('--currents-url', help='OPeNDAP URL for ocean currents')
    parser.add_argument('--winds-url', help='OPeNDAP URL for winds')
    parser.add_argument('--roi', help='ROI file for clipping results')
    parser.add_argument('--start-time', help='Start time (YYYY-MM-DD HH:MM), default: now UTC')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        # Parse start time
        if args.start_time:
            start_time = datetime.strptime(args.start_time, '%Y-%m-%d %H:%M')
        else:
            start_time = datetime.utcnow()
        
        logger.info(f"Starting Sargassum drift forecast")
        logger.info(f"Start time: {start_time}")
        logger.info(f"Duration: {args.hours} hours")
        
        # Initialize forecaster
        forecaster = SargassumForecaster()
        
        # Setup model
        forecaster.setup_model(windage=args.windage)
        
        # Add readers
        forecaster.add_readers(args.currents_url, args.winds_url)
        
        # Load seed points
        lons, lats = forecaster.load_seed_points(args.detections)
        
        if len(lons) == 0:
            logger.warning("No seed points available - creating empty forecast")
            # Create empty GeoDataFrame with proper geometry
            from shapely.geometry import Point
            empty_gdf = gpd.GeoDataFrame(
                columns=['particle_id', 'lon', 'lat', 'status', 'forecast_time'],
                geometry=[],
                crs='EPSG:4326'
            )
            # Save empty forecast directly
            output_path = Path(args.out)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Create minimal empty GeoJSON structure
            empty_geojson = {
                "type": "FeatureCollection",
                "features": [],
                "properties": {
                    "forecast_time": datetime.now(timezone.utc).isoformat() if 'timezone' in dir() else datetime.utcnow().isoformat(),
                    "message": "No detection points found for forecast",
                    "data_source": "none",
                    "uses_fallback": False
                }
            }
            
            import json
            with open(output_path, 'w') as f:
                json.dump(empty_geojson, f, indent=2)
            
            logger.info(f"Saved empty forecast to {output_path}")
            return 0
        
        # Seed particles
        forecaster.seed_particles(lons, lats, start_time, args.particles)
        
        # Run forecast
        forecaster.run_forecast(start_time, args.hours)
        
        # Extract results
        results_gdf = forecaster.extract_results(args.roi)
        
        # Save results
        metadata = {
            'forecast_start': start_time.isoformat(),
            'forecast_hours': args.hours,
            'windage': args.windage,
            'particles_per_point': args.particles,
            'seed_points': len(lons)
        }
        
        forecaster.save_results(results_gdf, args.out, metadata)
        
        logger.info("Forecast completed successfully")
        
        return 0
        
    except Exception as e:
        logger.error(f"Forecast failed: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())