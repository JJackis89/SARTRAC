#!/usr/bin/env python3
"""
Complete end-to-end pipeline test with professional libraries.
Tests the full Ghana Sargassum detection and forecasting pipeline.
"""

import logging
import subprocess
import sys
from pathlib import Path
import json
import time

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_command(cmd, description, check_file=None):
    """Run a command and check results."""
    logger.info(f"Starting: {description}")
    logger.info(f"Command: {' '.join(cmd)}")
    
    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    duration = time.time() - start_time
    
    if result.returncode == 0:
        logger.info(f"✓ SUCCESS ({duration:.1f}s): {description}")
        if check_file and Path(check_file).exists():
            size = Path(check_file).stat().st_size
            logger.info(f"  Created: {check_file} ({size:,} bytes)")
        return True
    else:
        logger.error(f"✗ FAILED ({duration:.1f}s): {description}")
        logger.error(f"Error: {result.stderr}")
        return False

def validate_geojson(filepath):
    """Validate and report GeoJSON file contents."""
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        features = len(data.get('features', []))
        logger.info(f"  ✓ Valid GeoJSON with {features} features")
        return features > 0
    except Exception as e:
        logger.error(f"  ✗ Invalid GeoJSON: {e}")
        return False

def test_full_pipeline():
    """Test the complete Sargassum detection and forecasting pipeline."""
    
    logger.info("=" * 60)
    logger.info("GHANA SARGASSUM PIPELINE - FULL PROFESSIONAL TEST")
    logger.info("=" * 60)
    
    # Test results
    results = {}
    
    # 1. Test ROI Generation (with full geopandas)
    logger.info("\n1. Testing ROI Generation with Professional Libraries")
    success = run_command([
        "python", "scripts/build_roi.py", 
        "--out", "data/test_roi_professional.geojson", 
        "--nm", "25"
    ], "Generate 25nm Ghana offshore ROI", "data/test_roi_professional.geojson")
    
    if success and validate_geojson("data/test_roi_professional.geojson"):
        results['roi_generation'] = "✓ PASS"
    else:
        results['roi_generation'] = "✗ FAIL"
    
    # 2. Test ERDDAP Detection (mock mode)
    logger.info("\n2. Testing Sargassum Detection")
    success = run_command([
        "python", "scripts/detect_erddap_afai.py",
        "--date", "2024-06-15",
        "--dataset", "viirs_chla", 
        "--threshold", "0.3",
        "--roi", "data/test_roi_professional.geojson",
        "--out", "professional_detection.geojson"
    ], "Detect Sargassum with VIIRS data", "professional_detection.geojson")
    
    if success and validate_geojson("professional_detection.geojson"):
        results['detection'] = "✓ PASS"
    else:
        results['detection'] = "✗ FAIL"
    
    # 3. Test OpenDrift Forecast
    logger.info("\n3. Testing OpenDrift Ocean Drift Forecast")
    success = run_command([
        "python", "scripts/forecast_opendrift.py",
        "--detections", "professional_detection.geojson",
        "--out", "professional_forecast.geojson",
        "--hours", "96",  # 4-day forecast
        "--windage", "0.015",  # 1.5% wind drift
        "--particles", "10"  # More particles per detection
    ], "Generate 96-hour drift forecast", "professional_forecast.geojson")
    
    if success and validate_geojson("professional_forecast.geojson"):
        results['forecast'] = "✓ PASS"
    else:
        results['forecast'] = "✗ FAIL"
    
    # 4. Test Professional Map Rendering
    logger.info("\n4. Testing Professional Map Visualization")
    success = run_command([
        "python", "scripts/render_map.py",
        "--roi", "data/test_roi_professional.geojson",
        "--detections", "professional_detection.geojson",
        "--forecast", "professional_forecast.geojson",
        "--out", "professional_sargassum_map.png",
        "--title", "Ghana Sargassum Forecast - Professional Pipeline"
    ], "Render professional map visualization", "professional_sargassum_map.png")
    
    if success and Path("professional_sargassum_map.png").exists():
        results['visualization'] = "✓ PASS"
    else:
        results['visualization'] = "✗ FAIL"
    
    # 5. Package Verification
    logger.info("\n5. Verifying Professional Library Installation")
    packages = {
        'opendrift': 'OpenDrift ocean modeling',
        'geopandas': 'Geospatial data processing', 
        'contextily': 'Basemap tiles',
        'folium': 'Interactive mapping',
        'cartopy': 'Cartographic projections',
        'netCDF4': 'Climate data access'
    }
    
    for package, description in packages.items():
        try:
            __import__(package)
            logger.info(f"  ✓ {package}: {description}")
            results[f'package_{package}'] = "✓ INSTALLED"
        except ImportError:
            logger.warning(f"  ✗ {package}: {description} - NOT INSTALLED")
            results[f'package_{package}'] = "✗ MISSING"
    
    # Generate Summary Report
    logger.info("\n" + "=" * 60)
    logger.info("PIPELINE TEST RESULTS SUMMARY")
    logger.info("=" * 60)
    
    for component, status in results.items():
        logger.info(f"{component:.<30} {status}")
    
    # Overall Assessment
    passed = sum(1 for status in results.values() if status.startswith("✓"))
    total = len(results)
    success_rate = (passed / total) * 100
    
    logger.info(f"\nOverall Success Rate: {passed}/{total} ({success_rate:.1f}%)")
    
    if success_rate >= 80:
        logger.info("🎉 PIPELINE STATUS: PRODUCTION READY")
        logger.info("The Ghana Sargassum pipeline is ready for operational deployment!")
    elif success_rate >= 60:
        logger.info("⚠️  PIPELINE STATUS: MOSTLY FUNCTIONAL")
        logger.info("Pipeline has minor issues but core functionality works.")
    else:
        logger.info("❌ PIPELINE STATUS: NEEDS ATTENTION")
        logger.info("Pipeline requires fixes before deployment.")
    
    # File Summary
    logger.info("\n" + "=" * 60)
    logger.info("GENERATED FILES")
    logger.info("=" * 60)
    
    output_files = [
        "data/test_roi_professional.geojson",
        "professional_detection.geojson", 
        "professional_forecast.geojson",
        "professional_sargassum_map.png"
    ]
    
    for filepath in output_files:
        if Path(filepath).exists():
            size = Path(filepath).stat().st_size
            logger.info(f"  ✓ {filepath} ({size:,} bytes)")
        else:
            logger.info(f"  ✗ {filepath} (missing)")
    
    logger.info("\n🌊 Professional Ghana Sargassum Pipeline Test Complete! 🌊")
    
    return success_rate >= 80

if __name__ == "__main__":
    try:
        success = test_full_pipeline()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Test failed with error: {e}")
        sys.exit(1)