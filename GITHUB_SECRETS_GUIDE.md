# 🔐 GitHub Secrets Configuration Guide

This guide helps you configure GitHub Secrets for the Ghana Sargassum pipeline following DEPLOYMENT_CHECKLIST.md.

## 🎯 Required GitHub Secrets

### 1. Repository Secrets
Navigate to: **Repository Settings > Secrets and Variables > Actions > Secrets**

#### GCP_SA_KEY (Required for Google Cloud/Earth Engine)
```bash
# Create service account key (if not done already)
gcloud iam service-accounts keys create sartrac-key.json \
  --iam-account=sartrac-pipeline@sartrac-ghana.iam.gserviceaccount.com

# Base64 encode the key for GitHub Secrets
base64 -w 0 sartrac-key.json
```
**Secret Name**: `GCP_SA_KEY`  
**Secret Value**: The base64-encoded content from above

#### CURRENTS_URL (Ocean Current Data)
**Secret Name**: `CURRENTS_URL`  
**Secret Value**: 
```
https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc
```

#### WINDS_URL (Wind Data)
**Secret Name**: `WINDS_URL`  
**Secret Value**: 
```
https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z
```

### 2. Repository Variables
Navigate to: **Repository Settings > Secrets and Variables > Actions > Variables**

#### CLOUD_RUN_URL (If using Google Earth Engine)
**Variable Name**: `CLOUD_RUN_URL`  
**Variable Value**: Your Cloud Run service URL (e.g., `https://sartrac-olci-xxx-uc.a.run.app`)

#### GCS_BUCKET (If using Google Cloud Storage)
**Variable Name**: `GCS_BUCKET`  
**Variable Value**: Your GCS bucket name (e.g., `sartrac-ghana-data`)

#### PROJECT_ID (If using Google Cloud)
**Variable Name**: `PROJECT_ID`  
**Variable Value**: Your Google Cloud project ID (e.g., `sartrac-ghana`)

## 🌊 Alternative Ocean Data Sources

If the primary sources are unavailable, use these alternatives:

### COPERNICUS Marine Service (Recommended)
**CURRENTS_URL**: 
```
https://nrt.cmems-du.eu/thredds/dodsC/global-analysis-forecast-phy-001-024
```

**WINDS_URL**: 
```
https://nrt.cmems-du.eu/thredds/dodsC/global-analysis-forecast-wav-001-027
```

### NOAA Alternative Sources
**CURRENTS_URL**: 
```
https://opendap.oceanobservatories.org/thredds/dodsC/ooi/20230101T000000-HYPM-CTDPF-Streamed-ctdpf_ckl_wfp_instrument_recovered/deployment0001_CE01ISSM-MFD35-03-CTDPFA301-streamed-ctdpf_ckl_wfp_instrument_recovered_20230101T000000.nc
```

**WINDS_URL**: 
```
https://nomads.ncep.noaa.gov/dods/wave/nww3/latest/nww3_global_latest
```

## 🛠️ Setup Instructions

### Step 1: Create GitHub Secrets
1. Go to your GitHub repository
2. Click **Settings** > **Secrets and Variables** > **Actions**
3. Click **New repository secret**
4. Add each secret from the list above

### Step 2: Create GitHub Variables
1. In the same Actions page, click the **Variables** tab
2. Click **New repository variable**
3. Add each variable from the list above

### Step 3: Test Configuration
Create a test workflow to verify secrets are accessible:

```yaml
# .github/workflows/test-secrets.yml
name: Test Secrets Configuration
on:
  workflow_dispatch:

jobs:
  test-secrets:
    runs-on: ubuntu-latest
    steps:
      - name: Test Ocean Data URLs
        run: |
          echo "Testing CURRENTS_URL accessibility..."
          curl -I "${{ secrets.CURRENTS_URL }}" || echo "CURRENTS_URL not accessible"
          
          echo "Testing WINDS_URL accessibility..."
          curl -I "${{ secrets.WINDS_URL }}" || echo "WINDS_URL not accessible"
      
      - name: Test GCP Service Account
        if: ${{ secrets.GCP_SA_KEY }}
        run: |
          echo "GCP_SA_KEY is configured"
          echo "${{ secrets.GCP_SA_KEY }}" | base64 -d > /tmp/key.json
          echo "Service account key decoded successfully"
```

## 🔍 Verification Commands

### Test Ocean Data Access
```bash
# Test RTOFS currents
curl -I "https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc"

# Test GFS winds  
curl -I "https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z"
```

### Test Google Cloud Connectivity
```bash
# Authenticate with service account
gcloud auth activate-service-account --key-file=sartrac-key.json

# Test Earth Engine access
python -c "import ee; ee.Initialize(); print('Earth Engine initialized successfully')"
```

## 🚨 Security Best Practices

### Secret Management
- ✅ Never commit secrets to repository
- ✅ Use GitHub Secrets for sensitive data
- ✅ Use Variables for non-sensitive configuration
- ✅ Rotate service account keys regularly
- ✅ Limit secret access to required workflows only

### Access Control
- ✅ Use least-privilege principle for service accounts
- ✅ Enable audit logging for secret access
- ✅ Review secret usage in workflow logs
- ✅ Remove unused secrets promptly

## 📊 Required Secrets Summary

| Secret/Variable | Type | Purpose | Required |
|----------------|------|---------|----------|
| `GCP_SA_KEY` | Secret | Google Cloud authentication | Optional |
| `CURRENTS_URL` | Secret | Ocean current data source | **Required** |
| `WINDS_URL` | Secret | Wind data source | **Required** |
| `CLOUD_RUN_URL` | Variable | Cloud Run service endpoint | Optional |
| `GCS_BUCKET` | Variable | Cloud Storage bucket | Optional |
| `PROJECT_ID` | Variable | Google Cloud project ID | Optional |

## ✅ Validation Checklist

- [ ] `CURRENTS_URL` is accessible via HTTP/OPeNDAP
- [ ] `WINDS_URL` is accessible via HTTP/OPeNDAP  
- [ ] `GCP_SA_KEY` decodes to valid JSON service account key
- [ ] Test workflow runs successfully
- [ ] OpenDrift can access ocean/wind data
- [ ] Pipeline generates forecasts with real environmental data

## 🆘 Troubleshooting

### Common Issues
- **401/403 errors**: Check service account permissions
- **Connection timeouts**: Try alternative data sources
- **Invalid JSON**: Verify base64 encoding of GCP_SA_KEY
- **Empty forecasts**: Check ocean data availability for Ghana region

### Support Resources
- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [NOAA ERDDAP Data Sources](https://coastwatch.noaa.gov/erddap/)
- [Google Cloud Service Accounts](https://cloud.google.com/iam/docs/service-accounts)
- [OpenDrift Documentation](https://opendrift.github.io/)

---

**🎯 Next Steps**: After configuring secrets, run the pipeline workflow to test end-to-end functionality!