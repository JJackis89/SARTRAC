# Google Earth Engine Setup for SARTRAC

## Overview

SARTRAC can use Google Earth Engine (GEE) as an additional detection source alongside ERDDAP.
The `detect_gee_olci.py` script computes **AFAI** (Alternative Floating Algae Index) and **MCI**
(Maximum Chlorophyll Index) from **Sentinel-3 OLCI** Level-2 imagery.

This step is **optional** — the pipeline will skip it if credentials are not configured.

## 1. Create a GEE Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable the **Earth Engine API**: `APIs & Services → Library → "Earth Engine API" → Enable`
4. Create a service account: `IAM & Admin → Service Accounts → Create`
   - Name: `sartrac-gee`
   - Role: *no role needed* (Earth Engine handles its own access)
5. Create a JSON key: click the service account → `Keys → Add Key → JSON`
6. Save the downloaded JSON file securely

## 2. Register the Service Account with Earth Engine

1. Go to [code.earthengine.google.com](https://code.earthengine.google.com)
2. Sign in with a Google account that has Earth Engine access
3. Navigate to: `Assets → Service Accounts` or visit [signup.earthengine.google.com/#!/service_accounts](https://signup.earthengine.google.com/#!/service_accounts)
4. Register the service account email (e.g. `sartrac-gee@your-project.iam.gserviceaccount.com`)
5. Wait for approval (usually instant for existing EE users)

## 3. Add GitHub Secrets

Add two repository secrets at `Settings → Secrets and variables → Actions`:

| Secret Name | Value |
|---|---|
| `EE_SERVICE_ACCOUNT` | The service account email, e.g. `sartrac-gee@your-project.iam.gserviceaccount.com` |
| `EE_PRIVATE_KEY` | The **entire contents** of the JSON key file |

## 4. Verify

Trigger the pipeline manually (`Actions → Daily Sargassum Forecast → Run workflow`).

Look for the **"Run GEE OLCI detection"** step in the log. It should show:
```
Running GEE OLCI AFAI/MCI detection...
OLCI images for 2025-03-01: 2
Detected 15 Sargassum features
```

## How It Works

1. **ROI**: 0–20 nautical miles offshore along Ghana's coastline (Cape Three Points to Keta)
2. **Quality masking**: Removes cloud, sun-glint, and atmospheric correction failures
3. **AFAI**: `Rrs_865 - (Rrs_681 + (865-681)/(709-681) * (Rrs_709 - Rrs_681))`
   - Threshold: ≥ 0.02
4. **MCI**: `Rrs_709 - (Rrs_681 + (709-681)/(754-681) * (Rrs_754 - Rrs_681))`
   - Threshold: ≥ 0.005
5. **Lookback**: If no imagery exists for the target date, checks up to 3 previous days
6. **Output**: GeoJSON FeatureCollection with centroid points for each detected region

## Local Testing

```bash
# With default credentials (after `earthengine authenticate`)
python scripts/detect_gee_olci.py --date 2025-03-01 --out test_gee.geojson --verbose

# With service account
export EE_SERVICE_ACCOUNT="sartrac-gee@your-project.iam.gserviceaccount.com"
export EE_PRIVATE_KEY="$(cat path/to/key.json)"
python scripts/detect_gee_olci.py --date 2025-03-01 --out test_gee.geojson --verbose
```
