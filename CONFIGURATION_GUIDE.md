# SARTRAC Configuration Guide

This guide will help you configure the data sources and deploy the production pipeline.

## 📊 Step 1: Configure ERDDAP Data Sources

### Finding Real Dataset IDs

The current `config/datasets.yaml` includes working dataset IDs, but you may want to find more specific AFAI/MCI datasets:

#### Search Strategy
1. **Browse ERDDAP servers**:
   - Primary: https://coastwatch.noaa.gov/erddap/info/index.html
   - Alternative: https://coastwatch.pfeg.noaa.gov/erddap/info/index.html

2. **Search for keywords**:
   - `floating algae`
   - `sargassum` 
   - `afai`
   - `mci`
   - `viirs`
   - `olci`

3. **Regional sectors for high resolution**:
   - Look for "Sector" datasets covering West Africa
   - Sectors CG, CH, CF, DF, DG may cover Ghana region
   - 300m resolution vs 4km global

#### Current Working Datasets
```yaml
# These are confirmed working dataset IDs:
- noaacwNPPN20VIIRSchlociDaily     # VIIRS NOAA-20 Chlorophyll 4km
- noaacwNPPVIIRSchlociDaily        # VIIRS NPP Chlorophyll 4km  
- noaacwS3AOLCIchlaDaily           # S3A OLCI Chlorophyll 4km
- noaacwS3BOLCIchlaDaily           # S3B OLCI Chlorophyll 4km
- noaacwS3AOLCIchlaSectorCGDaily   # S3A OLCI Sector CG 300m
```

### Variable Names
- **Chlorophyll**: `chlor_a` or `CHL`
- **AFAI**: `afai` or `AFAI` 
- **MCI**: `mci` or `MCI`
- **Coordinates**: `latitude`, `longitude`, `time`

### Testing Dataset Access
```bash
# Test a dataset URL
curl "https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPN20VIIRSchlociDaily.htmlTable?chlor_a[0:1:0][-4.5:1:2.5][3.0:1:7.0]"

# Check variable names  
curl "https://coastwatch.noaa.gov/erddap/info/noaacwNPPN20VIIRSchlociDaily/index.html"
```

## ☁️ Step 2: Google Cloud Setup (Optional)

### Prerequisites
- Google Cloud Project with billing enabled
- Earth Engine API access

### Setup Commands
```bash
# Create project
gcloud projects create sartrac-ghana --name="SARTRAC Ghana"
gcloud config set project sartrac-ghana

# Enable APIs
gcloud services enable earthengine.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable storage-component.googleapis.com

# Create service account
gcloud iam service-accounts create sartrac-pipeline \
  --display-name="SARTRAC Pipeline Service Account"

# Add Earth Engine permissions
gcloud projects add-iam-policy-binding sartrac-ghana \
  --member="serviceAccount:sartrac-pipeline@sartrac-ghana.iam.gserviceaccount.com" \
  --role="roles/earthengine.writer"

# Create GCS bucket
gsutil mb gs://sartrac-ghana-data

# Download service account key
gcloud iam service-accounts keys create sartrac-key.json \
  --iam-account=sartrac-pipeline@sartrac-ghana.iam.gserviceaccount.com
```

### Environment Variables
```bash
export PROJECT_ID="sartrac-ghana"
export GCS_BUCKET="sartrac-ghana-data"
export EE_SERVICE_ACCOUNT="sartrac-pipeline@sartrac-ghana.iam.gserviceaccount.com"
```

## 🚀 Step 3: Deploy Cloud Run Service

### Build and Deploy
```bash
cd cloudrun

# Build container
gcloud builds submit --tag gcr.io/$PROJECT_ID/sartrac-olci .

# Deploy to Cloud Run
gcloud run deploy sartrac-olci \
  --image gcr.io/$PROJECT_ID/sartrac-olci \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 1800 \
  --set-env-vars="PROJECT_ID=$PROJECT_ID,GCS_BUCKET=$GCS_BUCKET,EE_SERVICE_ACCOUNT=$EE_SERVICE_ACCOUNT" \
  --set-secrets="EE_PRIVATE_KEY=sartrac-key:latest"

# Get service URL
gcloud run services describe sartrac-olci --region=us-central1 --format="value(status.url)"
```

### Create Secret for Private Key
```bash
gcloud secrets create sartrac-key --data-file=sartrac-key.json
```

## 🔧 Step 4: GitHub Repository Setup

### Required Secrets
Add these secrets in your GitHub repository settings:

```bash
# Settings > Secrets and Variables > Actions > Secrets

# Google Cloud Service Account (base64 encoded)
GCP_SA_KEY=$(base64 -w 0 sartrac-key.json)

# Ocean current data (recommended)
CURRENTS_URL=https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc

# Wind data (recommended)  
WINDS_URL=https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z
```

### Repository Variables
```bash
# Settings > Secrets and Variables > Actions > Variables

CLOUD_RUN_URL=https://sartrac-olci-HASH-uc.a.run.app
GCS_BUCKET=sartrac-ghana-data
PROJECT_ID=sartrac-ghana
```

## 🔄 Step 5: Test Local Pipeline

### Prerequisites
```bash
# Install Python dependencies
pip install -r requirements.txt

# Create data directories
mkdir -p data outputs
```

### Test Commands
```bash
# 1. Test ROI generation
python scripts/build_roi.py --out data/test_roi.geojson --nm 20

# 2. Test ERDDAP detection (use recent date)
python scripts/detect_erddap_afai.py \
  --date 2025-10-10 \
  --dataset viirs_chla \
  --threshold 0.5 \
  --roi data/test_roi.geojson \
  --out data/test_detections.geojson

# 3. Test forecast (if detections found)
python scripts/forecast_opendrift.py \
  --detections data/test_detections.geojson \
  --out outputs/test_forecast.geojson \
  --hours 24

# 4. Generate visualization
python scripts/render_map.py \
  --roi data/test_roi.geojson \
  --detections data/test_detections.geojson \
  --forecast outputs/test_forecast.geojson \
  --out outputs/test_map.png
```

### Expected Output Files
```
data/
├── test_roi.geojson              # Ghana 20nm offshore polygon
├── test_detections.geojson       # Chlorophyll detection points
└── ghana_20nm.geojson           # Production ROI

outputs/  
├── test_forecast.geojson         # 24h drift forecast
├── test_map.png                 # QA visualization
└── forecast_YYYY-MM-DD.geojson  # Production forecasts
```

## 🎯 Step 6: Frontend Integration

### Replace Mock Data in React App

Update `src/App.tsx`:

```typescript
// Replace mock data generation with real data loading
const [forecastData, setForecastData] = useState<ForecastData[]>([]);

// Load real forecast data
useEffect(() => {
  const loadForecastData = async () => {
    try {
      const response = await fetch('/api/forecast/latest');
      const data = await response.json();
      setForecastData(data);
    } catch (error) {
      console.error('Failed to load forecast data:', error);
      // Fall back to mock data
      setForecastData(generateMockForecast());
    }
  };
  
  loadForecastData();
}, []);
```

### Create API Endpoints

Add to `src/api/` directory:

```typescript
// src/api/forecast.ts
export async function fetchLatestForecast(): Promise<ForecastData[]> {
  const response = await fetch('/data/outputs/forecast_latest.geojson');
  const geojson = await response.json();
  
  return geojson.features.map(feature => ({
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0], 
    density: feature.properties.particle_density || 'low',
    timestamp: feature.properties.forecast_start
  }));
}
```

### Add Real-Time Updates

```typescript
// Poll for new forecast data every hour
useEffect(() => {
  const interval = setInterval(loadForecastData, 3600000); // 1 hour
  return () => clearInterval(interval);
}, []);
```

## 📋 Step 7: Monitoring & Validation

### Health Checks
```bash
# Cloud Run service
curl https://your-service-url.a.run.app/health

# Local pipeline
python scripts/build_roi.py --out test.geojson && echo "✅ ROI OK"

# ERDDAP connectivity  
python scripts/detect_erddap_afai.py --date $(date +%Y-%m-%d) --dataset viirs_chla --threshold 0.5 --out test.geojson && echo "✅ ERDDAP OK"
```

### GitHub Actions Monitoring
- Check daily workflow runs in Actions tab
- Monitor artifact generation in releases
- Review logs for any ERDDAP or processing errors

### Data Quality Checks
```bash
# Validate GeoJSON outputs
python -c "import json; json.load(open('outputs/forecast_latest.geojson'))" && echo "✅ Valid GeoJSON"

# Check detection counts
python -c "
import json
data = json.load(open('data/merged_detections_latest.geojson'))
print(f'Detections found: {len(data[\"features\"])}')"
```

## 🐛 Troubleshooting

### Common Issues

1. **No ERDDAP data**: 
   - Check dataset IDs in `config/datasets.yaml`
   - Verify date format (YYYY-MM-DD)
   - Try different threshold values

2. **Earth Engine errors**:
   - Verify service account permissions
   - Check quota limits in Google Cloud Console
   - Ensure Earth Engine API is enabled

3. **Empty forecasts**:
   - Lower detection thresholds
   - Check ocean current/wind data availability
   - Verify ROI polygon covers target area

4. **Slow processing**:
   - Reduce ROI size for testing
   - Use higher thresholds to limit detections
   - Increase Cloud Run memory/CPU

### Debug Commands
```bash
# Verbose logging
python scripts/detect_erddap_afai.py --verbose --date 2025-10-10 --dataset viirs_chla

# Test specific ERDDAP URL
curl "https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPN20VIIRSchlociDaily.json?chlor_a[0:1:0][-4:1:2][3:1:7]"

# Validate GitHub secrets
env | grep -E "CURRENTS_URL|WINDS_URL|GCP_SA_KEY"
```

## 📚 Next Steps

1. **Optimize thresholds** based on regional validation
2. **Add more data sources** (MODIS, MERIS, etc.)
3. **Implement machine learning** detection algorithms
4. **Set up monitoring alerts** for high Sargassum events
5. **Create mobile-friendly** visualization interface
6. **Add historical analysis** and trend identification

---

**Need Help?** Check the main README.md for comprehensive deployment instructions and troubleshooting guides.