#!/usr/bin/env python3
"""
Quick script to help set up GitHub secrets for SARTRAC real forecast activation.
This script provides the exact values and instructions needed.
"""

import json
from datetime import datetime

def main():
    print("🌊 SARTRAC Real Forecast Activation")
    print("=" * 50)
    
    print("\n📋 STEP 1: Add GitHub Repository Secrets")
    print("-" * 40)
    print("Go to: https://github.com/JJackis89/SARTRAC/settings/secrets/actions")
    print("\nAdd these repository secrets (click 'New repository secret'):")
    
    # Current date for GFS winds
    today = datetime.now().strftime('%Y%m%d')
    
    secrets = {
        "CURRENTS_URL": "https://tds.hycom.org/thredds/dodsC/GLBy0.08/latest",
        "WINDS_URL": f"https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs{today}/gfs_0p25_00z"
    }
    
    for name, value in secrets.items():
        print(f"\n🔑 Secret Name: {name}")
        print(f"📝 Secret Value: {value}")
        print("   (Copy and paste exactly)")
    
    print(f"\n📅 Note: WINDS_URL uses today's date ({today})")
    print("   The workflow will automatically use current date when running")
    
    print("\n🚀 STEP 2: Trigger First Real Forecast")
    print("-" * 40)
    print("After adding secrets:")
    print("1. Go to: https://github.com/JJackis89/SARTRAC/actions")
    print("2. Click: 'Daily Sargassum Forecast' workflow")
    print("3. Click: 'Run workflow' button (top right)")
    print("4. Leave default values and click 'Run workflow'")
    
    print("\n⏱️  STEP 3: Monitor Progress")
    print("-" * 40)
    print("• Workflow takes ~5-10 minutes to complete")
    print("• Watch progress in Actions tab")
    print("• Green checkmark = Success")
    print("• Red X = Check logs for issues")
    
    print("\n🎯 STEP 4: Verify Real Data")
    print("-" * 40)
    print("After successful run:")
    print(f"• Check releases: https://github.com/JJackis89/SARTRAC/releases")
    print(f"• Look for: 'forecast-{datetime.now().strftime('%Y-%m-%d')}'")
    print("• Refresh your app: http://localhost:3850")
    print("• Status should change from 'Using demo data' to 'Live'")
    
    print("\n🔄 STEP 5: Daily Automation")
    print("-" * 40)
    print("• After first successful run, forecasts run automatically")
    print("• Schedule: Daily at 06:00 UTC")
    print("• No further action needed")
    
    print("\n🛠️  Troubleshooting")
    print("-" * 40)
    print("If workflow fails:")
    print("• Check Actions logs for error details")
    print("• Common issues: Ocean data unavailable, no satellite data")
    print("• System will fallback to demo data automatically")
    print("• Try running again tomorrow")
    
    print("\n🎉 Ready to activate? Follow Step 1 above!")

if __name__ == '__main__':
    main()