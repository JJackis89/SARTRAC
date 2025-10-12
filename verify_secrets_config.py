#!/usr/bin/env python3
"""
Test script to verify GitHub Secrets configuration after adding to repository.
Run this after you've added the secrets to test the configuration.
"""

import os
import requests
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_secrets_locally():
    """Test the secret values that should be added to GitHub"""
    
    logger.info("Testing GitHub Secrets Configuration Values")
    logger.info("=" * 60)
    
    # Test URLs that will be used as secrets
    test_urls = {
        'CURRENTS_URL': 'https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc',
        'WINDS_URL': 'https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z'
    }
    
    results = {}
    
    for name, url in test_urls.items():
        logger.info(f"Testing {name}...")
        try:
            # Test if URL is reachable
            response = requests.head(url, timeout=10)
            if response.status_code in [200, 301, 302, 404]:  # 404 is OK for OPeNDAP
                logger.info(f"  ✅ {name}: Server accessible (Status: {response.status_code})")
                results[name] = "✅ ACCESSIBLE"
            else:
                logger.warning(f"  ⚠️ {name}: Unexpected status {response.status_code}")
                results[name] = f"⚠️ STATUS {response.status_code}"
                
        except requests.exceptions.Timeout:
            logger.warning(f"  ⚠️ {name}: Server timeout (may be slow but working)")
            results[name] = "⚠️ TIMEOUT"
            
        except requests.exceptions.ConnectionError:
            logger.warning(f"  ❌ {name}: Cannot connect to server")
            results[name] = "❌ CONNECTION ERROR"
            
        except Exception as e:
            logger.warning(f"  ❌ {name}: Error - {e}")
            results[name] = f"❌ ERROR: {e}"
    
    # Test variables
    variables = {
        'PROJECT_ID': 'sartrac-ghana',
        'GCS_BUCKET': 'sartrac-ghana-data'
    }
    
    logger.info("\nTesting GitHub Variables values...")
    for name, value in variables.items():
        if value and len(value) > 0:
            logger.info(f"  ✅ {name}: Valid value '{value}'")
            results[name] = "✅ VALID"
        else:
            logger.warning(f"  ❌ {name}: Empty or invalid value")
            results[name] = "❌ INVALID"
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("CONFIGURATION SUMMARY")
    logger.info("=" * 60)
    
    for item, status in results.items():
        logger.info(f"{item:.<20} {status}")
    
    # Overall assessment
    accessible_count = sum(1 for status in results.values() if status.startswith("✅"))
    total_count = len(results)
    success_rate = (accessible_count / total_count) * 100
    
    logger.info(f"\nOverall Success Rate: {accessible_count}/{total_count} ({success_rate:.1f}%)")
    
    if success_rate >= 75:
        logger.info("🎉 CONFIGURATION READY: Your secrets should work in GitHub Actions!")
    elif success_rate >= 50:
        logger.info("⚠️ PARTIAL SUCCESS: Some issues but pipeline should still work with fallbacks")
    else:
        logger.info("❌ NEEDS ATTENTION: Multiple issues detected")
    
    return results

def show_github_instructions():
    """Show GitHub configuration instructions"""
    
    logger.info("\n" + "=" * 60)
    logger.info("GITHUB CONFIGURATION INSTRUCTIONS")
    logger.info("=" * 60)
    
    print("\n🔐 ADD THESE SECRETS TO YOUR GITHUB REPOSITORY:")
    print("Navigate to: Settings → Secrets and Variables → Actions → Secrets")
    print("-" * 60)
    
    print("1. CURRENTS_URL")
    print("   Value: https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc")
    print()
    
    print("2. WINDS_URL")
    print("   Value: https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z")
    print()
    
    print("📊 ADD THESE VARIABLES TO YOUR GITHUB REPOSITORY:")
    print("Navigate to: Settings → Secrets and Variables → Actions → Variables")
    print("-" * 60)
    
    print("1. PROJECT_ID")
    print("   Value: sartrac-ghana")
    print()
    
    print("2. GCS_BUCKET")
    print("   Value: sartrac-ghana-data")
    print()
    
    print("\n🚀 AFTER ADDING SECRETS:")
    print("1. Go to Actions → Daily Sargassum Forecast → Run workflow")
    print("2. Click 'Run workflow' to test the configuration")
    print("3. Monitor the workflow execution for success")
    
def main():
    """Main test function"""
    try:
        results = test_secrets_locally()
        show_github_instructions()
        
        logger.info("\n🎯 Next Steps:")
        logger.info("1. Copy the secrets/variables shown above to your GitHub repository")
        logger.info("2. Run the GitHub Actions workflow to test end-to-end")
        logger.info("3. Check for successful artifact generation")
        
        return True
        
    except KeyboardInterrupt:
        logger.info("\nTest cancelled by user")
        return False
        
    except Exception as e:
        logger.error(f"Test failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)