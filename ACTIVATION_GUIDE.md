# SARTRAC Real Forecast Activation Guide

## 🚀 Quick Activation Steps

### Step 1: GitHub Secrets Configuration
Add these secrets to your GitHub repository settings:

1. Go to: **Settings → Secrets and variables → Actions**
2. Add these repository secrets:

```
CURRENTS_URL=https://tds.hycom.org/thredds/dodsC/GLBy0.08/latest
WINDS_URL=https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs20251014/gfs_0p25_00z
GEE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GEE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

### Step 2: Ocean Data Sources (Choose one option)

#### Option A: Free Public Data (Recommended for testing)
```bash
# HYCOM Global Ocean Analysis
CURRENTS_URL=https://tds.hycom.org/thredds/dodsC/GLBy0.08/latest

# NOAA GFS Winds
WINDS_URL=https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs20251014/gfs_0p25_00z
```

#### Option B: Copernicus Marine Service (Best quality)
1. Register at: https://marine.copernicus.eu/
2. Get access credentials
3. Use CMEMS ocean current and wind products

### Step 3: Manual Test Run

Test the pipeline locally first:

```bash
# 1. Build Ghana ROI
python scripts/build_roi.py --out data/ghana_20nm.geojson --nm 20

# 2. Test ERDDAP detection
python scripts/detect_erddap_afai.py \
  --date 2025-10-14 \
  --dataset viirs_chla \
  --threshold 0.5 \
  --roi data/ghana_20nm.geojson \
  --out data/test_detection.geojson

# 3. Test forecast
python scripts/forecast_opendrift.py \
  --detections data/test_detection.geojson \
  --out outputs/test_forecast.geojson \
  --hours 72 \
  --windage 0.01
```

### Step 4: Enable Workflow

#### Method A: Manual Trigger (Recommended first)
1. Go to **Actions** tab in your GitHub repository
2. Select **"Daily Sargassum Forecast"** workflow  
3. Click **"Run workflow"**
4. Check results in **Actions** tab

#### Method B: Automatic Daily Runs
The workflow is already scheduled to run daily at **06:00 UTC**
- No additional setup needed
- Will start running automatically tomorrow

### Step 5: Verify Frontend Integration

After successful workflow run:
1. Check **Releases** tab for new `forecast-YYYY-MM-DD` release
2. Refresh your frontend app at http://localhost:3850
3. Verify real forecast data appears instead of demo data

## 🔍 Troubleshooting

### Common Issues:

#### 1. "No data found for date"
- **Cause**: Satellite data not available for that date
- **Solution**: Try previous day or check ERDDAP data availability

#### 2. "OpenDrift model failed"
- **Cause**: Ocean data URLs not accessible
- **Solution**: Verify CURRENTS_URL and WINDS_URL are working

#### 3. "GitHub release failed"
- **Cause**: Repository permissions or token issues
- **Solution**: Ensure `GITHUB_TOKEN` has release permissions

### Data Quality Notes:

- **VIIRS AFAI**: Good cloud-free coverage, daily revisit
- **Sentinel-3 OLCI**: Higher resolution, may have gaps
- **Best results**: Combine multiple sensors for robust detection

## 📊 Expected Output

After successful run, you'll get:

1. **GitHub Release** `forecast-YYYY-MM-DD` containing:
   - `forecast_YYYY-MM-DD.geojson` - Main forecast file
   - `merged_detections_YYYY-MM-DD.geojson` - Satellite detections
   - `map_YYYY-MM-DD.png` - Visualization

2. **Frontend App** automatically displays:
   - Real Sargassum positions from satellites
   - 72-hour drift predictions
   - Confidence indicators
   - Multiple forecast days

## 🎯 Success Criteria

✅ **Pipeline Working** when:
- Daily releases appear automatically
- Frontend shows "Live" status (not "Using demo data")
- Forecast particles move realistically
- Timeline shows actual dates

## 🚨 Emergency Fallback

If real data fails, the system automatically:
- Falls back to demo data
- Shows "Using demonstration data" message
- Continues functioning for users
- Logs errors for debugging

---

**Ready to activate? Start with Step 1! 🚀**