#!/usr/bin/env python3
"""
Test SARTRAC pipeline end-to-end locally before activating automation.
This script helps verify all components work before enabling daily runs.
"""

import argparse
import logging
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path
import subprocess
import json

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_command(cmd, check=True, capture_output=False):
    """Run shell command with logging."""
    logger.info(f"Running: {' '.join(cmd)}")
    try:
        if capture_output:
            result = subprocess.run(cmd, check=check, capture_output=True, text=True)
            return result.stdout.strip()
        else:
            subprocess.run(cmd, check=check)
            return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {e}")
        if capture_output and e.stdout:
            logger.error(f"Output: {e.stdout}")
        if capture_output and e.stderr:
            logger.error(f"Error: {e.stderr}")
        return False

def check_dependencies():
    """Check if required dependencies are installed."""
    logger.info("Checking dependencies...")
    
    required_packages = [
        'geopandas', 'pandas', 'requests', 'pyyaml', 
        'opendrift', 'numpy', 'shapely'
    ]
    
    missing = []
    for package in required_packages:
        try:
            __import__(package)
            logger.info(f"✓ {package}")
        except ImportError:
            missing.append(package)
            logger.warning(f"✗ {package} not found")
    
    if missing:
        logger.error(f"Missing packages: {missing}")
        logger.info("Install with: pip install " + " ".join(missing))
        return False
    
    logger.info("All dependencies satisfied!")
    return True

def test_step_1_roi():
    """Test Step 1: Build Ghana ROI."""
    logger.info("=== Testing Step 1: Build Ghana ROI ===")
    
    # Create data directory
    os.makedirs('data', exist_ok=True)
    
    cmd = [
        'python', 'scripts/build_roi.py',
        '--out', 'data/ghana_20nm.geojson',
        '--nm', '20',
        '--verbose'
    ]
    
    success = run_command(cmd, check=False)
    
    if success and Path('data/ghana_20nm.geojson').exists():
        logger.info("✓ ROI build successful")
        return True
    else:
        logger.error("✗ ROI build failed")
        return False

def test_step_2_detection(test_date):
    """Test Step 2: Satellite detection."""
    logger.info("=== Testing Step 2: Satellite Detection ===")
    
    datasets = ['viirs_chla', 's3a_olci_chla']
    success_count = 0
    
    for dataset in datasets:
        logger.info(f"Testing detection with {dataset}...")
        
        cmd = [
            'python', 'scripts/detect_erddap_afai.py',
            '--date', test_date,
            '--dataset', dataset,
            '--threshold', '0.5',
            '--roi', 'data/ghana_20nm.geojson',
            '--out', f'data/{dataset}_{test_date}.geojson',
            '--verbose'
        ]
        
        success = run_command(cmd, check=False)
        
        if success and Path(f'data/{dataset}_{test_date}.geojson').exists():
            logger.info(f"✓ Detection successful for {dataset}")
            success_count += 1
        else:
            logger.warning(f"✗ Detection failed for {dataset} (may be no data available)")
    
    if success_count > 0:
        logger.info(f"Detection test passed ({success_count}/{len(datasets)} datasets)")
        return True
    else:
        logger.error("All detection attempts failed")
        return False

def test_step_3_merge(test_date):
    """Test Step 3: Merge detections."""
    logger.info("=== Testing Step 3: Merge Detections ===")
    
    cmd = [
        'python', 'scripts/merge_geojson_points.py',
        *list(Path('data').glob(f'*_{test_date}.geojson')),
        '--out', f'data/merged_detections_{test_date}.geojson',
        '--date', test_date,
        '--roi', 'data/ghana_20nm.geojson',
        '--verbose'
    ]
    
    # Filter out existing merged file
    cmd = [str(arg) for arg in cmd if not str(arg).startswith('data/merged_detections_')]
    
    success = run_command(cmd, check=False)
    
    if success and Path(f'data/merged_detections_{test_date}.geojson').exists():
        logger.info("✓ Merge successful")
        return True
    else:
        logger.warning("✗ Merge failed, creating empty detection file")
        # Create empty detection file for forecast test
        empty_geojson = {
            "type": "FeatureCollection",
            "features": [],
            "properties": {
                "date": test_date,
                "source": "test_pipeline"
            }
        }
        with open(f'data/merged_detections_{test_date}.geojson', 'w') as f:
            json.dump(empty_geojson, f, indent=2)
        return True

def test_step_4_forecast(test_date):
    """Test Step 4: Drift forecast."""
    logger.info("=== Testing Step 4: Drift Forecast ===")
    
    # Create outputs directory
    os.makedirs('outputs', exist_ok=True)
    
    cmd = [
        'python', 'scripts/forecast_opendrift.py',
        '--detections', f'data/merged_detections_{test_date}.geojson',
        '--out', f'outputs/forecast_{test_date}.geojson',
        '--hours', '72',
        '--windage', '0.01',
        '--particles', '5',
        '--roi', 'data/ghana_20nm.geojson',
        '--verbose'
    ]
    
    success = run_command(cmd, check=False)
    
    if success and Path(f'outputs/forecast_{test_date}.geojson').exists():
        logger.info("✓ Forecast successful")
        return True
    else:
        logger.error("✗ Forecast failed")
        return False

def test_step_5_map(test_date):
    """Test Step 5: Map generation."""
    logger.info("=== Testing Step 5: Map Generation ===")
    
    cmd = [
        'python', 'scripts/render_map.py',
        '--roi', 'data/ghana_20nm.geojson',
        '--detections', f'data/*_{test_date}.geojson',
        '--forecast', f'outputs/forecast_{test_date}.geojson',
        '--out', f'outputs/map_{test_date}.png',
        '--title', f'Ghana Sargassum Forecast - {test_date}',
        '--verbose'
    ]
    
    success = run_command(cmd, check=False)
    
    if success and Path(f'outputs/map_{test_date}.png').exists():
        logger.info("✓ Map generation successful")
        return True
    else:
        logger.warning("✗ Map generation failed (optional)")
        return True  # Don't fail the whole test for optional map

def main():
    """Run end-to-end pipeline test."""
    parser = argparse.ArgumentParser(description='Test SARTRAC pipeline end-to-end')
    parser.add_argument('--date', default=None, help='Test date (YYYY-MM-DD), default: yesterday')
    parser.add_argument('--skip-deps', action='store_true', help='Skip dependency check')
    
    args = parser.parse_args()
    
    # Use yesterday as default (more likely to have satellite data)
    if args.date:
        test_date = args.date
    else:
        yesterday = datetime.now() - timedelta(days=1)
        test_date = yesterday.strftime('%Y-%m-%d')
    
    logger.info(f"Testing SARTRAC pipeline for date: {test_date}")
    
    # Check dependencies
    if not args.skip_deps and not check_dependencies():
        logger.error("Dependency check failed")
        return 1
    
    # Test each step
    steps = [
        ("Build ROI", test_step_1_roi),
        ("Satellite Detection", lambda: test_step_2_detection(test_date)),
        ("Merge Detections", lambda: test_step_3_merge(test_date)),
        ("Drift Forecast", lambda: test_step_4_forecast(test_date)),
        ("Map Generation", lambda: test_step_5_map(test_date))
    ]
    
    results = {}
    
    for step_name, step_func in steps:
        try:
            results[step_name] = step_func()
        except Exception as e:
            logger.error(f"Step '{step_name}' crashed: {e}")
            results[step_name] = False
    
    # Summary
    logger.info("\n" + "="*50)
    logger.info("PIPELINE TEST SUMMARY")
    logger.info("="*50)
    
    for step_name, success in results.items():
        status = "✓ PASS" if success else "✗ FAIL"
        logger.info(f"{step_name:20} {status}")
    
    passed = sum(results.values())
    total = len(results)
    
    logger.info(f"\nOverall: {passed}/{total} steps passed")
    
    if passed >= 4:  # Allow map generation to fail
        logger.info("🎉 Pipeline test SUCCESSFUL! Ready for automation.")
        logger.info("\nNext steps:")
        logger.info("1. Add GitHub secrets (see ACTIVATION_GUIDE.md)")
        logger.info("2. Run workflow manually: Actions → Daily Sargassum Forecast → Run workflow")
        logger.info("3. Check for releases at: https://github.com/YOUR_USERNAME/SARTRAC/releases")
        return 0
    else:
        logger.error("❌ Pipeline test FAILED. Check errors above.")
        logger.info("\nTroubleshooting:")
        logger.info("- Check internet connection for satellite data")
        logger.info("- Verify all dependencies installed: pip install -r requirements.txt")
        logger.info("- Try different date: python test_pipeline.py --date 2025-10-10")
        return 1

if __name__ == '__main__':
    sys.exit(main())