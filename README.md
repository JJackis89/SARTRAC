# SARTRAC - Ghana Sargassum Detection and Forecasting Pipeline

A production-ready pipeline for detecting Sargassum within 0-20 nautical miles of Ghana's coastline using satellite data and forecasting drift trajectories, coupled with a React-based visualization application.

## 🌊 Overview

This system combines:
1. **Production Pipeline**: Automated satellite data processing, detection, and drift forecasting
2. **Frontend Application**: React-based visualization for Ghana's coastline (port 3850)

### Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Satellite     │    │    Detection     │    │   Forecasting   │
│     Data        │───▶│   & Merging      │───▶│   & Output      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
│                      │                      │
│ • Sentinel-3 OLCI    │ • AFAI/MCI indices   │ • OpenDrift model
│   (via GEE)          │ • Threshold masking  │ • 72h drift forecast
│ • VIIRS AFAI         │ • Point extraction   │ • GeoJSON output
│   (via ERDDAP)       │ • Deduplication      │ • Web-ready artifacts
└─────────────────     └──────────────────    └─────────────────
```

## 🚀 Quick Start Guide

### Frontend Application (Immediate Use)

1. **Start the visualization app**:
   ```bash
   npm install
   npm run dev
   ```
   
2. **Access at**: [http://localhost:3850](http://localhost:3850)

### Production Pipeline Setup

#### Prerequisites
- **Python 3.11+** with pip
- **Google Cloud Project** (for Earth Engine processing)
- **GitHub repository** (for automation)

#### Installation
```bash
# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt
```

#### Configuration

1. **ERDDAP datasets** in `config/datasets.yaml`:
   ```yaml
   viirs_afai:
     dataset_id: "YOUR_VIIRS_DATASET_ID"  # Find from coastwatch.noaa.gov/erddap
     var: "afai"
   ```

2. **Google Earth Engine** (optional but recommended):
   - Create service account in Google Cloud Console
   - Download private key JSON
   - Set environment variables

## 🛠️ Frontend Features

### Map-Based Forecast Visualization
- **Concentration Overlays**: Color-coded heatmaps showing forecasted Sargassum density
- **Interactive Map**: Centered on Ghana's coastline with multiple base map options
- **Regional Focus**: Zoom controls for Western, Central, Greater Accra, Volta regions

### Time-Series Animation
- **Play/Pause Controls**: Animate forecast progression over 3-7 days
- **Date Slider**: Jump to specific forecast days
- **Timeline Preview**: Hover over dates to preview layers

### User Controls
- **Forecast Range**: Toggle between 3, 5, or 7-day forecasts
- **Layer Toggles**: Enable/disable density, drift vectors, uncertainty
- **Opacity Slider**: Adjust transparency (0-100%)
- **Base Map Switcher**: Satellite, terrain, or minimal vector maps

## 🔬 Production Pipeline Usage

### Local Testing

```bash
# 1. Build Ghana 0-20nm offshore ROI
python scripts/build_roi.py --out data/ghana_20nm.geojson --nm 20

# 2. Detect VIIRS AFAI for specific date
python scripts/detect_erddap_afai.py \
  --date 2025-10-12 \
  --dataset viirs_afai \
  --threshold 0.02 \
  --roi data/ghana_20nm.geojson \
  --out data/viirs_detections.geojson

# 3. Merge detection sources
python scripts/merge_geojson_points.py \
  data/viirs_detections.geojson data/olci_detections.geojson \
  --out data/merged_detections.geojson \
  --date 2025-10-12

# 4. Run 72-hour drift forecast
python scripts/forecast_opendrift.py \
  --detections data/merged_detections.geojson \
  --out outputs/forecast.geojson \
  --hours 72 \
  --windage 0.01

# 5. Generate visualization (optional)
python scripts/render_map.py \
  --roi data/ghana_20nm.geojson \
  --detections data/merged_detections.geojson \
  --forecast outputs/forecast.geojson \
  --out outputs/map.png
```

### Automated Processing

The pipeline runs daily at 06:00 UTC via GitHub Actions with full automation.

## ☁️ Cloud Deployment

### Google Cloud Run (Earth Engine Processing)

```bash
# Set up project
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export SERVICE_NAME="sargassum-olci-detector"

# Enable APIs
gcloud services enable run.googleapis.com earthengine.googleapis.com cloudbuild.googleapis.com

# Create service account
gcloud iam service-accounts create ee-sargassum \
  --display-name="Earth Engine Sargassum Detection"

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ee-sargassum@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/earthengine.writer"

# Deploy to Cloud Run
cd cloudrun
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME .
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --timeout 1800 \
  --set-env-vars="EE_SERVICE_ACCOUNT=ee-sargassum@$PROJECT_ID.iam.gserviceaccount.com,GCS_BUCKET=your-bucket,OFFSHORE_NM=20"
```

### GitHub Secrets Configuration

Add to repository settings:

```bash
# Required secrets
GCP_SA_KEY=<base64-encoded-service-account-json>
CURRENTS_URL=https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/forecasts/latest/rtofs_glo_forecast_latest.nc
WINDS_URL=https://nomads.ncep.noaa.gov/dods/gfs_1p00/latest/gfs_1p00_latest_00z

# Variables
CLOUD_RUN_URL=https://sargassum-olci-detector-PROJECT_ID.a.run.app
GCS_BUCKET=your-gcs-bucket-name
```

## 📊 Data Sources & Thresholds

### Detection Parameters

| Index | Threshold | Source | Rationale |
|-------|-----------|--------|-----------|
| AFAI  | ≥ 0.02    | VIIRS/OLCI | Floating algae detection, Gulf of Guinea optimized |
| MCI   | ≥ 0.00    | OLCI | Chlorophyll enhancement, conservative |

### Ocean Data

**Recommended OPeNDAP URLs**:
- **Currents**: RTOFS Global (`https://rtofs.ocean.noaa.gov/thredds/dodsC/rtofs_global/...`)
- **Winds**: GFS (`https://nomads.ncep.noaa.gov/dods/gfs_1p00/...`)

## 📁 Project Structure

### Production Pipeline
```
scripts/
├── build_roi.py              # Ghana ROI generation
├── detect_erddap_afai.py     # ERDDAP data detection
├── merge_geojson_points.py   # Multi-source merging
├── forecast_opendrift.py     # Drift modeling
└── render_map.py             # QA visualization

gee/
└── olci_sargassum.js         # Earth Engine processing

cloudrun/
├── app.py                    # Flask service
├── Dockerfile                # Container configuration
└── requirements.txt          # Python dependencies

config/
└── datasets.yaml            # ERDDAP dataset configuration

.github/workflows/
└── daily_forecast.yml       # Automation workflow
```

### Frontend Application
```
src/
├── components/
│   ├── SargassumOverlay.tsx    # Map overlay
│   ├── TimelineControls.tsx    # Animation controls
│   ├── ControlPanel.tsx        # Settings panel
│   └── InfoPanel.tsx          # Forecast information
├── App.tsx                     # Main application
├── main.tsx                    # React entry point
└── index.css                   # Styles + Tailwind
```

## 🔄 Output Files

### Generated Artifacts
```
data/
├── ghana_20nm.geojson              # ROI polygon
├── viirs_afai_YYYY-MM-DD.geojson   # VIIRS detections
├── olci_afai_YYYY-MM-DD.geojson    # OLCI AFAI
├── olci_mci_YYYY-MM-DD.geojson     # OLCI MCI
└── merged_detections_YYYY-MM-DD.geojson

outputs/
├── forecast_YYYY-MM-DD.geojson     # 72h drift forecast
└── map_YYYY-MM-DD.png             # QA visualization
```

### GeoJSON Schema

**Detection Points**:
```json
{
  "type": "Feature",
  "geometry": {"type": "Point", "coordinates": [lon, lat]},
  "properties": {
    "value": 0.025,
    "source": "viirs_afai", 
    "date": "2025-10-12",
    "point_id": 1
  }
}
```

**Forecast Particles**:
```json
{
  "type": "Feature",
  "geometry": {"type": "Point", "coordinates": [lon, lat]},
  "properties": {
    "particle_id": 1,
    "status": "active",
    "forecast_start": "2025-10-12T06:00:00Z",
    "forecast_hours": 72
  }
}
```

## 🔍 Monitoring & Troubleshooting

### Health Checks
```bash
# Cloud Run service
curl https://your-service-url.a.run.app/health

# Local detection test
python scripts/detect_erddap_afai.py --date $(date +%Y-%m-%d) --dataset viirs_afai --threshold 0.02 --out test.geojson

# ROI validation
python scripts/build_roi.py --out test_roi.geojson && echo "ROI OK"
```

### Common Issues
1. **No ERDDAP data**: Check dataset IDs in `config/datasets.yaml`
2. **GEE authentication**: Verify service account permissions
3. **Empty forecasts**: Lower detection thresholds or check input data
4. **Slow processing**: Reduce ROI size or increase compute resources

## 🎯 Integration Guide

### Connecting Pipeline to Frontend

The production pipeline generates web-ready GeoJSON files that integrate directly with the React visualization:

1. **Replace mock data** in `App.tsx` with pipeline outputs
2. **Update file paths** to point to `outputs/forecast_YYYY-MM-DD.geojson`
3. **Configure API endpoints** for real-time data fetching
4. **Add loading states** for forecast updates

### Ghana Coastal Regions

Predefined zoom areas in the frontend:
- **Western Region**: Takoradi and surroundings
- **Central Region**: Cape Coast area  
- **Greater Accra**: Metropolitan coastal zone
- **Volta Region**: Eastern coastal waters

## 🛡️ Tech Stack

### Production Pipeline
- **Python 3.11**: Core processing language
- **Google Earth Engine**: Sentinel-3 OLCI processing
- **ERDDAP**: NOAA/ESA satellite data access
- **OpenDrift**: Ocean drift modeling
- **Docker + Cloud Run**: Containerized deployment
- **GitHub Actions**: Automated workflows

### Frontend Application
- **React 18 + TypeScript**: Component framework
- **Vite**: Build tool and dev server
- **TailwindCSS**: Styling with ocean theme
- **React Leaflet**: Interactive mapping
- **Lucide React**: Icon library

## 📈 Performance Optimization

- **ERDDAP queries**: Use smaller bounding boxes
- **OpenDrift**: Reduce particle count for speed
- **GEE exports**: Use 300m scale for OLCI native resolution
- **Frontend**: Smooth animations with optimized rendering

## 🔮 Future Enhancements

### Production Pipeline
- **Multi-region support**: Extend beyond Ghana
- **Machine learning**: Enhanced detection algorithms
- **Real-time alerts**: Threshold-based notifications
- **Historical analysis**: Trend identification

### Frontend Application
- **Real-time updates**: Live data integration
- **Advanced overlays**: Uncertainty mapping
- **Click interactions**: Data inspection popups
- **Export features**: Download capabilities
- **Mobile optimization**: Touch-friendly controls

## 📄 License

This project is part of the SARTRAC initiative for Ghana coastal monitoring.

---

**Frontend URL**: [http://localhost:3850](http://localhost:3850)  
**Pipeline Status**: Production Ready  
**Last Updated**: January 2025