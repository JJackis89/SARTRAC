#!/usr/bin/env python3
"""
GitHub Secrets Configuration Helper
Generates and tests the required secrets/variables for SARTRAC pipeline
"""

import base64
import json
import logging
import requests
import os
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_ocean_data_urls():
    """Test accessibility of ocean and wind data URLs"""
    
    urls = {
        'CURRENTS_URL': 'https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc',
        'WINDS_URL': 'https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z',
        'ALTERNATIVE_CURRENTS': 'https://nrt.cmems-du.eu/thredds/dodsC/global-analysis-forecast-phy-001-024',
        'ALTERNATIVE_WINDS': 'https://nomads.ncep.noaa.gov/dods/wave/nww3/latest/nww3_global_latest'
    }
    
    logger.info("Testing ocean data URL accessibility...")
    logger.info("=" * 60)
    
    accessible_urls = {}
    
    for name, url in urls.items():
        try:
            logger.info(f"Testing {name}...")
            response = requests.head(url, timeout=10)
            
            if response.status_code in [200, 301, 302]:
                logger.info(f"  ✓ {name}: ACCESSIBLE (Status: {response.status_code})")
                accessible_urls[name] = url
            else:
                logger.warning(f"  ⚠ {name}: Status {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            logger.warning(f"  ✗ {name}: NOT ACCESSIBLE ({e})")
    
    return accessible_urls

def encode_service_account_key(key_file_path):
    """Encode Google Cloud service account key for GitHub Secrets"""
    
    if not Path(key_file_path).exists():
        logger.error(f"Service account key file not found: {key_file_path}")
        return None
    
    try:
        with open(key_file_path, 'r') as f:
            key_content = f.read()
        
        # Validate JSON
        json.loads(key_content)
        
        # Base64 encode
        encoded_key = base64.b64encode(key_content.encode()).decode()
        
        logger.info(f"✓ Service account key encoded successfully")
        logger.info(f"  File: {key_file_path}")
        logger.info(f"  Encoded length: {len(encoded_key)} characters")
        
        return encoded_key
        
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON in service account key: {key_file_path}")
        return None
    except Exception as e:
        logger.error(f"Error encoding service account key: {e}")
        return None

def generate_secrets_config():
    """Generate configuration for GitHub Secrets"""
    
    logger.info("GITHUB SECRETS CONFIGURATION")
    logger.info("=" * 60)
    
    # Test ocean data URLs
    accessible_urls = test_ocean_data_urls()
    
    # Check for service account key
    possible_key_paths = [
        'sartrac-key.json',
        'service-account-key.json', 
        'gcp-key.json',
        os.path.expanduser('~/sartrac-key.json')
    ]
    
    encoded_key = None
    for key_path in possible_key_paths:
        if Path(key_path).exists():
            logger.info(f"\nFound service account key: {key_path}")
            encoded_key = encode_service_account_key(key_path)
            break
    
    if not encoded_key:
        logger.warning("\nNo service account key found. Google Cloud features will be disabled.")
        logger.info("To enable Google Cloud, create a service account key:")
        logger.info("  gcloud iam service-accounts keys create sartrac-key.json \\")
        logger.info("    --iam-account=sartrac-pipeline@sartrac-ghana.iam.gserviceaccount.com")
    
    # Generate configuration
    logger.info("\n" + "=" * 60)
    logger.info("GITHUB SECRETS CONFIGURATION")
    logger.info("=" * 60)
    
    print("\n🔐 REPOSITORY SECRETS (Settings > Secrets and Variables > Actions > Secrets)")
    print("=" * 80)
    
    # Ocean data URLs
    if 'CURRENTS_URL' in accessible_urls:
        print(f"Name: CURRENTS_URL")
        print(f"Value: {accessible_urls['CURRENTS_URL']}")
        print()
    elif 'ALTERNATIVE_CURRENTS' in accessible_urls:
        print(f"Name: CURRENTS_URL")
        print(f"Value: {accessible_urls['ALTERNATIVE_CURRENTS']}")
        print()
    else:
        print("Name: CURRENTS_URL")
        print("Value: https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc")
        print("⚠️  WARNING: URL not accessible, may need alternative source")
        print()
    
    if 'WINDS_URL' in accessible_urls:
        print(f"Name: WINDS_URL")
        print(f"Value: {accessible_urls['WINDS_URL']}")
        print()
    elif 'ALTERNATIVE_WINDS' in accessible_urls:
        print(f"Name: WINDS_URL") 
        print(f"Value: {accessible_urls['ALTERNATIVE_WINDS']}")
        print()
    else:
        print("Name: WINDS_URL")
        print("Value: https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z")
        print("⚠️  WARNING: URL not accessible, may need alternative source")
        print()
    
    # Google Cloud service account key
    if encoded_key:
        print("Name: GCP_SA_KEY")
        print(f"Value: {encoded_key[:50]}...{encoded_key[-20:]}")
        print("📋 Copy the full encoded key from the log above")
        print()
    else:
        print("Name: GCP_SA_KEY")
        print("Value: [OPTIONAL - Create service account key first]")
        print()
    
    print("\n📊 REPOSITORY VARIABLES (Settings > Secrets and Variables > Actions > Variables)")
    print("=" * 80)
    
    print("Name: PROJECT_ID")
    print("Value: sartrac-ghana")
    print()
    
    print("Name: GCS_BUCKET") 
    print("Value: sartrac-ghana-data")
    print()
    
    print("Name: CLOUD_RUN_URL")
    print("Value: [YOUR_CLOUD_RUN_URL] (e.g., https://sartrac-olci-xxx-uc.a.run.app)")
    print()
    
    # Validation script
    logger.info("\n" + "=" * 60)
    logger.info("VALIDATION")
    logger.info("=" * 60)
    
    if encoded_key:
        logger.info("✓ GCP_SA_KEY: Ready")
    else:
        logger.warning("⚠ GCP_SA_KEY: Not configured (optional)")
    
    if accessible_urls:
        logger.info(f"✓ Ocean Data: {len(accessible_urls)} sources accessible")
    else:
        logger.warning("⚠ Ocean Data: No sources accessible (check network/permissions)")
    
    logger.info("\n🎯 Next Steps:")
    logger.info("1. Copy the secrets/variables above to your GitHub repository")
    logger.info("2. Go to: Repository Settings > Secrets and Variables > Actions")
    logger.info("3. Add each secret/variable as shown")
    logger.info("4. Run the GitHub Actions workflow to test configuration")

if __name__ == "__main__":
    try:
        generate_secrets_config()
    except KeyboardInterrupt:
        logger.info("\nConfiguration cancelled by user")
    except Exception as e:
        logger.error(f"Configuration failed: {e}")
        raise