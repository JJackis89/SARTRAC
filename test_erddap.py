#!/usr/bin/env python3
"""
Test script to find working ERDDAP datasets
"""
import requests
import json

def test_erddap_datasets():
    """Test various ERDDAP dataset IDs to find working ones"""
    
    # Common NOAA CoastWatch dataset patterns
    test_datasets = [
        # VIIRS datasets
        "erdVHNchla1day",  # VIIRS NPP chlorophyll 
        "erdVH2chla1day",  # VIIRS NOAA-20 chlorophyll
        "nesdisVHNSQchlaDaily",  # Alternative VIIRS
        
        # MODIS datasets  
        "erdMH1chla1day",  # MODIS Aqua chlorophyll
        "erdMH1chlamday",  # MODIS monthly
        
        # Simpler test datasets
        "jplMURSST41",     # Sea surface temperature
        "ncdcOw9nrt",      # Simple ocean dataset
    ]
    
    base_url = "https://coastwatch.noaa.gov/erddap/griddap"
    
    print("Testing ERDDAP datasets...\n")
    
    working_datasets = []
    
    for dataset_id in test_datasets:
        try:
            # Test dataset info page first
            info_url = f"{base_url}/{dataset_id}.html"
            resp = requests.get(info_url, timeout=10)
            
            if resp.status_code == 200:
                print(f"✓ {dataset_id}: Dataset exists")
                
                # Test a simple data query
                data_url = f"{base_url}/{dataset_id}.csv?latitude[0:1:1],longitude[0:1:1]"
                data_resp = requests.get(data_url, timeout=10)
                
                if data_resp.status_code == 200:
                    print(f"  ✓ Data query successful")
                    working_datasets.append(dataset_id)
                else:
                    print(f"  ✗ Data query failed: {data_resp.status_code}")
            else:
                print(f"✗ {dataset_id}: Dataset not found ({resp.status_code})")
                
        except Exception as e:
            print(f"✗ {dataset_id}: Error - {e}")
        
        print()
    
    print(f"\nWorking datasets found: {len(working_datasets)}")
    for dataset in working_datasets:
        print(f"  - {dataset}")
    
    return working_datasets

if __name__ == "__main__":
    working = test_erddap_datasets()
    
    if working:
        print(f"\nYou can update config/datasets.yaml to use: {working[0]}")
    else:
        print("\nNo working datasets found. May need to check ERDDAP server status.")