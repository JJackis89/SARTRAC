# 🚀 SARTRAC Deployment Checklist

Complete this checklist to deploy your Ghana Sargassum detection and forecasting pipeline.

## ✅ Prerequisites Setup

### System Requirements
- [ ] Python 3.11+ installed
- [ ] Node.js 16+ and npm installed
- [ ] Git repository set up
- [ ] Google Cloud account (optional for GEE)
- [ ] GitHub repository for automation

### Local Environment
- [ ] Clone repository: `git clone <your-repo>`
- [ ] Create Python virtual environment: `python -m venv venv`
- [ ] Activate environment: `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Linux/Mac)
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Install Node.js dependencies: `npm install`

## 📊 Data Source Configuration

### ERDDAP Datasets (Required)
- [ ] Review current dataset IDs in `config/datasets.yaml`
- [ ] Test dataset access:
  ```bash
  python scripts/detect_erddap_afai.py --date 2025-10-10 --dataset viirs_chla --threshold 0.5 --roi data/test_roi.geojson --out test.geojson
  ```
- [ ] Verify data availability for Ghana region (3°N-7°N, 4.5°W-2.5°E)
- [ ] Optional: Find more specific AFAI/MCI datasets at https://coastwatch.noaa.gov/erddap

### Ocean/Wind Data (Recommended)
- [ ] Set ocean currents URL (RTOFS): `https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc`
- [ ] Set wind data URL (GFS): `https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z`

## ☁️ Google Cloud Setup (Optional)

### Project Setup
- [ ] Create Google Cloud project: `gcloud projects create sartrac-ghana`
- [ ] Enable billing on project
- [ ] Set active project: `gcloud config set project sartrac-ghana`

### APIs and Services
- [ ] Enable Earth Engine API: `gcloud services enable earthengine.googleapis.com`
- [ ] Enable Cloud Run: `gcloud services enable run.googleapis.com`
- [ ] Enable Cloud Build: `gcloud services enable cloudbuild.googleapis.com`
- [ ] Enable Cloud Storage: `gcloud services enable storage-component.googleapis.com`

### Service Account
- [ ] Create service account:
  ```bash
  gcloud iam service-accounts create sartrac-pipeline --display-name="SARTRAC Pipeline"
  ```
- [ ] Add Earth Engine permissions:
  ```bash
  gcloud projects add-iam-policy-binding sartrac-ghana \
    --member="serviceAccount:sartrac-pipeline@sartrac-ghana.iam.gserviceaccount.com" \
    --role="roles/earthengine.writer"
  ```
- [ ] Create and download service account key:
  ```bash
  gcloud iam service-accounts keys create sartrac-key.json \
    --iam-account=sartrac-pipeline@sartrac-ghana.iam.gserviceaccount.com
  ```

### Cloud Storage
- [ ] Create GCS bucket: `gsutil mb gs://sartrac-ghana-data`
- [ ] Set bucket permissions for service account

## 🐳 Cloud Run Deployment (Optional)

### Container Build
- [ ] Navigate to cloudrun directory: `cd cloudrun`
- [ ] Build container: `gcloud builds submit --tag gcr.io/sartrac-ghana/sartrac-olci`

### Service Deployment
- [ ] Deploy Cloud Run service:
  ```bash
  gcloud run deploy sartrac-olci \
    --image gcr.io/sartrac-ghana/sartrac-olci \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --memory 2Gi \
    --timeout 1800 \
    --set-env-vars="PROJECT_ID=sartrac-ghana,GCS_BUCKET=sartrac-ghana-data" \
    --set-secrets="EE_PRIVATE_KEY=sartrac-key:latest"
  ```
- [ ] Get service URL and note for GitHub configuration
- [ ] Test service health: `curl https://your-service-url/health`

## 🔐 GitHub Secrets Configuration

### Repository Secrets
Navigate to: Repository Settings > Secrets and Variables > Actions > Secrets

- [ ] Add `GCP_SA_KEY`: Base64-encoded service account key
  ```bash
  base64 -w 0 sartrac-key.json
  ```
- [ ] Add `CURRENTS_URL`: Ocean current data OPeNDAP URL
- [ ] Add `WINDS_URL`: Wind data OPeNDAP URL

### Repository Variables  
Navigate to: Repository Settings > Secrets and Variables > Actions > Variables

- [ ] Add `CLOUD_RUN_URL`: Your Cloud Run service URL (if using GEE)
- [ ] Add `GCS_BUCKET`: Your GCS bucket name (if using GEE)
- [ ] Add `PROJECT_ID`: Your Google Cloud project ID (if using GEE)

## 🧪 Local Testing

### Pipeline Components
- [ ] Test ROI generation:
  ```bash
  python scripts/build_roi.py --out data/test_roi.geojson --nm 20
  ```
- [ ] Test ERDDAP detection:
  ```bash
  python scripts/detect_erddap_afai.py \
    --date 2025-10-10 \
    --dataset viirs_chla \
    --threshold 0.5 \
    --roi data/test_roi.geojson \
    --out data/test_detections.geojson
  ```
- [ ] Test drift forecast:
  ```bash
  python scripts/forecast_opendrift.py \
    --detections data/test_detections.geojson \
    --out outputs/test_forecast.geojson \
    --hours 24
  ```
- [ ] Test visualization:
  ```bash
  python scripts/render_map.py \
    --roi data/test_roi.geojson \
    --detections data/test_detections.geojson \
    --forecast outputs/test_forecast.geojson \
    --out outputs/test_map.png
  ```

### Frontend Application
- [ ] Start development server: `npm run dev`
- [ ] Access application: http://localhost:3850
- [ ] Verify map loads and controls work
- [ ] Test timeline animation and layer toggles

## ⚙️ GitHub Actions Setup

### Workflow Validation
- [ ] Push code to trigger GitHub Actions workflow
- [ ] Check workflow runs in Actions tab
- [ ] Verify daily schedule is set (06:00 UTC)
- [ ] Confirm artifact generation in releases

### Data Output Validation
- [ ] Check generated files in repository:
  - `data/ghana_20nm.geojson` (ROI)
  - `data/*_detections_YYYY-MM-DD.geojson` (detections)
  - `outputs/forecast_YYYY-MM-DD.geojson` (forecasts)
- [ ] Validate GeoJSON format:
  ```bash
  python -c "import json; json.load(open('outputs/forecast_latest.geojson'))"
  ```

## 🔄 Frontend Integration

### API Endpoints (Optional)
- [ ] Set up backend API server for data serving
- [ ] Create endpoints:
  - `GET /api/detections/latest` 
  - `GET /api/forecast/latest`
- [ ] Update frontend to load real data instead of mock data

### Data Loading
- [ ] Update `src/App.tsx` to load pipeline outputs
- [ ] Add error handling and fallback to mock data
- [ ] Implement real-time data refresh (hourly)
- [ ] Add data freshness indicators

## 📊 Monitoring & Validation

### Health Checks
- [ ] Set up monitoring for pipeline execution
- [ ] Create alerts for failed workflows
- [ ] Monitor ERDDAP data availability
- [ ] Track detection counts and forecast quality

### Performance Optimization
- [ ] Monitor processing times
- [ ] Optimize detection thresholds for Ghana region
- [ ] Tune forecast parameters based on validation data
- [ ] Consider regional high-resolution datasets

## 🎯 Production Deployment

### Domain and Hosting
- [ ] Deploy frontend to production hosting (Vercel, Netlify, etc.)
- [ ] Set up custom domain (optional)
- [ ] Configure HTTPS and security headers

### Data Persistence
- [ ] Set up data archival strategy
- [ ] Configure backup for critical forecast data
- [ ] Plan for data retention and cleanup

### User Access
- [ ] Create user documentation
- [ ] Set up monitoring and analytics
- [ ] Plan for user feedback and improvements

## 📋 Post-Deployment

### Validation Period
- [ ] Monitor daily forecast generation for 1 week
- [ ] Validate forecast accuracy against observations
- [ ] Adjust detection thresholds based on results
- [ ] Document any issues and solutions

### Optimization
- [ ] Fine-tune parameters for Ghana coastal conditions
- [ ] Add additional data sources if needed
- [ ] Implement user feedback features
- [ ] Plan for seasonal variations

### Documentation
- [ ] Update README with final configuration
- [ ] Document any custom modifications
- [ ] Create user guide for forecast interpretation
- [ ] Set up change log for future updates

---

## 🆘 Troubleshooting Resources

### Common Issues
- **No ERDDAP data**: Check dataset IDs and date formats
- **Earth Engine errors**: Verify service account permissions and API quotas
- **Empty forecasts**: Lower detection thresholds or check ocean data
- **Slow processing**: Reduce ROI size or increase compute resources

### Support Contacts
- **ERDDAP issues**: Check https://coastwatch.noaa.gov/erddap/info/index.html
- **Earth Engine**: Google Earth Engine documentation and forums
- **GitHub Actions**: GitHub community and documentation
- **Pipeline issues**: Check repository README and configuration guide

### Success Criteria
✅ **Pipeline Deployed**: Daily forecasts generate automatically  
✅ **Data Flowing**: ERDDAP detections and forecasts available  
✅ **Frontend Working**: Map visualization displays real data  
✅ **Monitoring Active**: Health checks and alerts configured  
✅ **Documentation Complete**: Users can understand and use the system

---

**🎉 Congratulations!** Your Ghana Sargassum detection and forecasting pipeline is now ready for operational use!