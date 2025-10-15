#!/usr/bin/env python3
"""
Google Earth Engine Authentication Helper
Handles GEE authentication for SARTRAC services

Usage:
    from scripts.gee_auth import authenticate_gee
    authenticate_gee()
"""

import ee
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def authenticate_gee(service_account_file=None):
    """
    Authenticate Google Earth Engine
    
    Args:
        service_account_file: Path to service account JSON file
    """
    
    try:
        # Try service account authentication first (for production)
        if service_account_file and Path(service_account_file).exists():
            logger.info(f"Authenticating with service account: {service_account_file}")
            credentials = ee.ServiceAccountCredentials(
                email=None,  # Will be read from file
                key_file=service_account_file
            )
            ee.Initialize(credentials)
            logger.info("GEE authenticated with service account")
            return True
            
        # Check for service account in environment
        service_account_env = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
        if service_account_env and Path(service_account_env).exists():
            logger.info("Authenticating with service account from environment")
            ee.Initialize()
            logger.info("GEE authenticated with service account")
            return True
            
        # Try user authentication (for development)
        try:
            ee.Initialize()
            logger.info("GEE authenticated with user credentials")
            return True
        except ee.EEException:
            logger.info("No user credentials found, attempting authentication...")
            ee.Authenticate()
            ee.Initialize()
            logger.info("GEE authentication completed")
            return True
            
    except Exception as e:
        logger.error(f"GEE authentication failed: {e}")
        raise

def check_gee_access():
    """Test GEE access by loading a simple image"""
    try:
        # Test access with a simple operation
        test_image = ee.Image('LANDSAT/LC08/C02/T1_L2/LC08_190030_20201012')
        info = test_image.getInfo()
        logger.info("GEE access verified successfully")
        return True
    except Exception as e:
        logger.error(f"GEE access check failed: {e}")
        return False

if __name__ == '__main__':
    # Test authentication
    try:
        authenticate_gee()
        if check_gee_access():
            print("✅ Google Earth Engine authentication successful")
        else:
            print("❌ Google Earth Engine access test failed")
    except Exception as e:
        print(f"❌ Authentication failed: {e}")