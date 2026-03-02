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
        
    def setup_model(self, windage=0.02):
        """
        Setup OpenDrift OceanDrift model.
        
        Args:
            windage: Wind drift factor (default 2% — literature range for
                     Sargassum is 1-3%, Wang & Hu 2017)
        """
        logger.info("Setting up OpenDrift OceanDrift model")
        
        self.model = OceanDrift(loglevel=20)  # INFO level
        
        # Configure wind drift — 2% is central estimate for Sargassum
        # (pelagic mats have higher windage than subsurface algae)
        self.model.set_config('seed:wind_drift_factor', windage)
        
        # Uncertainty parameters calibrated for Gulf of Guinea conditions
        # HYCOM currents have ~0.08 m/s RMS error in this region
        self.model.set_config('drift:current_uncertainty', 0.08)
        # GFS 10m winds have ~1.5 m/s RMS error
        self.model.set_config('drift:wind_uncertainty', 1.5)
        self.model.set_config('vertical_mixing:diffusivitymodel', 'environment')
        
        logger.info(f"Model configured with windage: {windage}")
        
    def add_readers(self, currents_url=None, winds_url=None,
                     currents_file=None, winds_file=None):
        """
        Add data readers for ocean currents and winds.

        Priority: local files → OPeNDAP URLs → constant fallback.

        Args:
            currents_url: OPeNDAP URL for ocean currents
            winds_url: OPeNDAP URL for wind data
            currents_file: Local NetCDF file with ocean currents
            winds_file: Local NetCDF/GRIB file with wind data
        """
        readers_added = 0

        # --- Currents: local file first, then OPeNDAP ---
        currents_sources = []
        if currents_file and Path(currents_file).exists():
            currents_sources.append(('file', currents_file))
        if currents_url:
            currents_sources.append(('url', currents_url))

        for src_type, src in currents_sources:
            try:
                logger.info(f"Adding currents reader ({src_type}): {src}")
                reader = reader_netCDF_CF_generic.Reader(src)
                self.model.add_reader(reader)
                self.readers_added.append(f'currents_{src_type}')
                readers_added += 1
                logger.info(f"Ocean currents reader added from {src_type}")
                break
            except Exception as e:
                logger.warning(f"Currents reader failed ({src_type}): {e}")

        # --- Winds: local file first, then OPeNDAP ---
        winds_sources = []
        if winds_file and Path(winds_file).exists():
            winds_sources.append(('file', winds_file))
        if winds_url:
            winds_sources.append(('url', winds_url))

        for src_type, src in winds_sources:
            try:
                logger.info(f"Adding winds reader ({src_type}): {src}")
                reader = reader_netCDF_CF_generic.Reader(src)
                self.model.add_reader(reader)
                self.readers_added.append(f'winds_{src_type}')
                readers_added += 1
                logger.info(f"Winds reader added from {src_type}")
                break
            except Exception as e:
                logger.warning(f"Winds reader failed ({src_type}): {e}")

        # --- Fallback constant readers ---
        has_currents = any('currents' in r and 'fallback' not in r for r in self.readers_added)
        has_winds = any('winds' in r and 'fallback' not in r for r in self.readers_added)

        if not has_currents:
            logger.warning("Adding fallback constant current reader — forecast accuracy will be reduced")
            fallback_current = reader_constant.Reader({
                'x_sea_water_velocity': -0.3,  # m/s westward
                'y_sea_water_velocity': 0.1,   # m/s northward
            })
            self.model.add_reader(fallback_current)
            self.readers_added.append('fallback_currents')
            readers_added += 1

        if not has_winds:
            logger.warning("Adding fallback constant wind reader — forecast accuracy will be reduced")
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
    
    def seed_particles(self, lons, lats, start_time, particles_per_point=15):
        """
        Seed particles at detection locations with ensemble diversity.
        
        Uses multiple random seeds and a range of spatial offsets to
        create an ensemble-like spread, improving statistical
        representation of drift uncertainty.
        
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
        
        # Use a different seed each run (reproducible within a day via date-based seed)
        # This creates natural ensemble diversity across daily runs
        from datetime import timezone
        day_seed = int(start_time.strftime('%Y%m%d')) if hasattr(start_time, 'strftime') else 42
        rng = np.random.RandomState(day_seed)

        # Spatial offset: ~1.5 km spread (larger than before for better coverage)
        offset = 0.015
        seed_lons += rng.uniform(-offset, offset, len(seed_lons))
        seed_lats += rng.uniform(-offset, offset, len(seed_lats))
        
        total_particles = len(seed_lons)
        
        logger.info(f"Seeding {total_particles} particles at {len(lons)} locations "
                    f"(seed={day_seed}, offset=±{offset}°)")
        
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
        Extract forecast results as GeoDataFrame with trajectory info.
        
        Includes start→end drift distance and direction for each particle,
        enabling drift vector rendering on the frontend.
        
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
            
            # Try to extract initial positions for trajectory info
            start_lons = None
            start_lats = None
            try:
                # OpenDrift stores history as 2D arrays [time, particle]
                hist_lon = self.model.history['lon']
                hist_lat = self.model.history['lat']
                if hist_lon is not None and len(hist_lon) > 0:
                    start_lons = hist_lon[0][active_mask]
                    start_lats = hist_lat[0][active_mask]
            except Exception:
                pass

            # Calculate drift distance (haversine approximation)
            drift_km = np.zeros(len(final_lons))
            if start_lons is not None:
                # Haversine at ~5° latitude: 1° ≈ 111 km lat, ~110.6 km lon
                dlat = (final_lats - start_lats) * 111.0
                dlon = (final_lons - start_lons) * 110.6
                drift_km = np.sqrt(dlat**2 + dlon**2)

            # Create GeoDataFrame
            from shapely.geometry import Point
            
            geometry = [Point(lon, lat) for lon, lat in zip(final_lons, final_lats)]
            
            data = {
                'particle_id': range(len(final_lons)),
                'lon': final_lons,
                'lat': final_lats,
                'status': 'active',
                'total_drift_km': np.round(drift_km, 2),
            }

            if start_lons is not None:
                data['start_lon'] = start_lons
                data['start_lat'] = start_lats

            gdf = gpd.GeoDataFrame(data, geometry=geometry, crs='EPSG:4326')
            
            logger.info(f"Mean drift: {drift_km.mean():.1f} km, max: {drift_km.max():.1f} km")

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
        Save forecast results to GeoJSON with collection-level metadata.

        The output GeoJSON has top-level ``properties`` so the frontend
        can inspect ``data_sources``, ``uses_fallback``, etc. without
        scanning every feature.

        Args:
            gdf: GeoDataFrame with results
            output_path: Output file path
            metadata: Additional metadata dictionary
        """
        try:
            import json as _json
            from datetime import timezone

            # Per-feature columns
            if metadata:
                for key, value in metadata.items():
                    gdf[key] = value

            now_iso = datetime.now(timezone.utc).isoformat()
            gdf['forecast_time'] = now_iso

            # Determine data quality
            data_sources = list(self.readers_added)
            uses_fallback = any('fallback' in r for r in data_sources)
            has_real_currents = any(r in ('currents_file', 'currents_url') for r in data_sources)
            has_real_winds = any(r in ('winds_file', 'winds_url') for r in data_sources)

            # Per-feature source tag
            gdf['data_source'] = ','.join(data_sources)
            gdf['uses_fallback'] = uses_fallback

            # Ensure output directory exists
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Write GeoJSON manually so we can add top-level "properties"
            geo_dict = _json.loads(gdf.to_json())
            geo_dict['properties'] = {
                'forecast_time': now_iso,
                'forecast_start': metadata.get('forecast_start', now_iso) if metadata else now_iso,
                'forecast_hours': metadata.get('forecast_hours', 72) if metadata else 72,
                'windage': metadata.get('windage', 0.01) if metadata else 0.01,
                'particles_per_point': metadata.get('particles_per_point', 0) if metadata else 0,
                'seed_points': metadata.get('seed_points', 0) if metadata else 0,
                'data_sources': data_sources,
                'uses_fallback': uses_fallback,
                'has_real_currents': has_real_currents,
                'has_real_winds': has_real_winds,
                'data_quality': (
                    'high' if has_real_currents and has_real_winds else
                    'medium' if has_real_currents else
                    'low'
                ),
            }

            with open(output_path, 'w') as f:
                _json.dump(geo_dict, f)

            logger.info(f"Saved {len(gdf)} forecast particles to {output_path}")
            logger.info(f"Data quality: {geo_dict['properties']['data_quality']} "
                        f"(sources: {', '.join(data_sources)})")

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
    parser.add_argument('--windage', type=float, default=0.02,
                       help='Wind drift factor (default 0.02 = 2%%)')
    parser.add_argument('--particles', type=int, default=15,
                       help='Particles per detection point')
    parser.add_argument('--currents-url', help='OPeNDAP URL for ocean currents')
    parser.add_argument('--winds-url', help='OPeNDAP URL for winds')
    parser.add_argument('--currents-file', help='Local NetCDF file with ocean currents')
    parser.add_argument('--winds-file', help='Local NetCDF/GRIB file with wind data')
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
        
        # Add readers (prefer local files over OPeNDAP)
        forecaster.add_readers(
            currents_url=args.currents_url,
            winds_url=args.winds_url,
            currents_file=args.currents_file,
            winds_file=args.winds_file,
        )
        
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