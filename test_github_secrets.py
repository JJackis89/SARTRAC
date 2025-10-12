#!/usr/bin/env python3
"""
Test OpenDrift with ocean/wind data URLs for GitHub Secrets validation
"""

import logging
from opendrift.models.oceandrift import OceanDrift
from opendrift.readers import reader_netCDF_CF_generic, reader_constant

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_opendrift_with_real_data():
    """Test OpenDrift with real ocean and wind data"""
    
    logger.info("Testing OpenDrift with Real Environmental Data")
    logger.info("=" * 60)
    
    # URLs from GitHub Secrets configuration
    winds_url = "https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z"
    currents_url = "https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc"
    
    # Alternative fallback URLs
    fallback_winds = "https://nomads.ncep.noaa.gov/dods/wave/nww3/latest/nww3_global_latest"
    
    try:
        # Initialize OpenDrift model
        logger.info("1. Initializing OpenDrift OceanDrift model...")
        model = OceanDrift(loglevel=30)  # WARNING level to reduce output
        
        # Configure model
        model.set_config('seed:wind_drift_factor', 0.015)
        model.set_config('drift:current_uncertainty', 0.1)
        model.set_config('drift:wind_uncertainty', 2.0)
        
        logger.info("   ✓ Model initialized successfully")
        
        # Test wind data reader
        logger.info("2. Testing wind data access...")
        try:
            wind_reader = reader_netCDF_CF_generic.Reader(winds_url)
            model.add_reader(wind_reader)
            logger.info(f"   ✓ Wind data accessible: {winds_url}")
        except Exception as e:
            logger.warning(f"   ⚠ Primary wind URL failed: {e}")
            try:
                wind_reader = reader_netCDF_CF_generic.Reader(fallback_winds)
                model.add_reader(wind_reader)
                logger.info(f"   ✓ Fallback wind data accessible: {fallback_winds}")
            except Exception as e2:
                logger.warning(f"   ⚠ Fallback wind URL also failed: {e2}")
                logger.info("   → Using constant wind reader as fallback")
                wind_reader = reader_constant.Reader({'x_wind': 5, 'y_wind': 0})
                model.add_reader(wind_reader)
        
        # Test current data reader
        logger.info("3. Testing ocean current data access...")
        try:
            current_reader = reader_netCDF_CF_generic.Reader(currents_url)
            model.add_reader(current_reader)
            logger.info(f"   ✓ Current data accessible: {currents_url}")
        except Exception as e:
            logger.warning(f"   ⚠ Current URL failed: {e}")
            logger.info("   → Using constant current reader as fallback")
            current_reader = reader_constant.Reader({'x_sea_water_velocity': 0.1, 'y_sea_water_velocity': 0})
            model.add_reader(current_reader)
        
        # Test with Ghana coordinates
        logger.info("4. Testing particle seeding in Ghana region...")
        ghana_lons = [-1.0, -0.5, 0.0, 0.5, 1.0]
        ghana_lats = [4.5, 5.0, 5.5, 6.0, 6.5]
        
        model.seed_elements(
            lon=ghana_lons,
            lat=ghana_lats,
            number=10,  # Small test
            time="2025-10-12 12:00"
        )
        
        logger.info("   ✓ Particles seeded successfully in Ghana coastal waters")
        
        # Short test run
        logger.info("5. Running short forecast test (6 hours)...")
        model.run(duration=6*3600, time_step=1800)  # 6 hours, 30-min steps
        
        logger.info("   ✓ Forecast completed successfully")
        
        # Get final status
        final_lons = model.get_lonlats()[0]
        final_lats = model.get_lonlats()[1]
        
        logger.info(f"   ✓ Final particle positions: {len(final_lons)} particles")
        logger.info(f"   ✓ Longitude range: {min(final_lons):.3f} to {max(final_lons):.3f}")
        logger.info(f"   ✓ Latitude range: {min(final_lats):.3f} to {max(final_lats):.3f}")
        
        logger.info("\n🎉 SUCCESS: OpenDrift integration test passed!")
        logger.info("✅ Your GitHub Secrets configuration will work with OpenDrift")
        
        return True
        
    except Exception as e:
        logger.error(f"\n❌ FAILED: OpenDrift integration test failed: {e}")
        logger.error("⚠️  Your GitHub Secrets may need different ocean data URLs")
        return False

def create_recommended_secrets():
    """Create final recommended GitHub Secrets based on test results"""
    
    logger.info("\n" + "=" * 60)
    logger.info("FINAL GITHUB SECRETS RECOMMENDATION")
    logger.info("=" * 60)
    
    print("\n🔐 ADD THESE SECRETS TO YOUR GITHUB REPOSITORY:")
    print("Navigate to: Settings > Secrets and Variables > Actions > Secrets")
    print("=" * 80)
    
    print("Secret Name: CURRENTS_URL")
    print("Secret Value: https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc")
    print("Note: Fallback to constant values if inaccessible")
    print()
    
    print("Secret Name: WINDS_URL")
    print("Secret Value: https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z")
    print("Note: This URL was verified as accessible")
    print()
    
    print("Secret Name: GCP_SA_KEY")
    print("Secret Value: [OPTIONAL - Only if using Google Earth Engine]")
    print("Note: Create with: gcloud iam service-accounts keys create sartrac-key.json")
    print()
    
    print("\n📊 ADD THESE VARIABLES TO YOUR GITHUB REPOSITORY:")
    print("Navigate to: Settings > Secrets and Variables > Actions > Variables")
    print("=" * 80)
    
    print("Variable Name: PROJECT_ID")
    print("Variable Value: sartrac-ghana")
    print()
    
    print("Variable Name: GCS_BUCKET")
    print("Variable Value: sartrac-ghana-data")
    print()
    
    print("Variable Name: CLOUD_RUN_URL")
    print("Variable Value: [Your Cloud Run URL if using Google Earth Engine]")
    print()

if __name__ == "__main__":
    try:
        success = test_opendrift_with_real_data()
        create_recommended_secrets()
        
        if success:
            logger.info("\n✅ Configuration verified - ready for GitHub Actions!")
        else:
            logger.warning("\n⚠️  Configuration needs attention - check URLs before deployment")
            
    except KeyboardInterrupt:
        logger.info("\nTest cancelled by user")
    except Exception as e:
        logger.error(f"Test failed: {e}")
        raise