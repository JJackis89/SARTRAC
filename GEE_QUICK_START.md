# 🎯 Quick Start: GEE Beached Sargassum Training

## 🚀 **5-Minute Setup**

### **Step 1**: Access Google Earth Engine
- Go to: https://code.earthengine.google.com/
- Sign in with Google account
- Apply for access if needed: https://earthengine.google.com/signup/

### **Step 2**: Load Training Script
- Copy contents of `gee/beached_train_s2_sept2021_simplified.js`
- Paste into new GEE Code Editor script
- Save as "SARTRAC_Beached_Training"

### **Step 3**: Create Training Polygons
**CRITICAL**: You must manually draw these polygons in the Code Editor

#### **Draw Beached Sargassum Polygons** (15-20 polygons)
```javascript
var beachedSargassum = /* Click polygon tool, draw on beached Sargassum areas */;
```
**Look for**: Brown/orange organic matter on beaches, distinct from vegetation

#### **Draw Clean Beach Polygons** (15-20 polygons)  
```javascript
var cleanBeach = /* Draw on clean sandy beach areas */;
```
**Look for**: Sandy areas without Sargassum, various moisture levels

#### **Draw Water Polygons** (10-15 polygons)
```javascript
var water = /* Draw on nearshore water areas */;
```
**Look for**: Clear and turbid water, with/without floating Sargassum

#### **Draw Vegetation Polygons** (10-15 polygons)
```javascript
var vegetation = /* Draw on coastal vegetation */;
```
**Look for**: Mangroves, coastal grasses, palm trees

### **Step 4**: Update Configuration
```javascript
// Line 12: Update with your GEE username
var assetPath = 'users/YOUR_ACTUAL_USERNAME/';
```

### **Step 5**: Run Training
- Click **"Run"** button in Code Editor
- Monitor **Console** for progress messages  
- Check **Tasks** tab for export jobs
- **Start each export task** manually

### **Step 6**: Deploy to SARTRAC
```bash
# Update Cloud Run environment
gcloud run services update sartrac-beached \
  --set-env-vars="BEACHED_MODEL_ASSET=users/YOUR_USERNAME/ghana_beached_sargassum_rf_sept2021"
```

## 🎨 **Polygon Drawing Tips**

### **Beached Sargassum Characteristics**
- **Color**: Brown, orange, dark organic matter
- **Texture**: Fibrous, accumulated material
- **Location**: Beach surface, waterline, coves
- **Pattern**: Linear deposits, concentrated areas

### **Polygon Quality Guidelines**
- **Size**: 50-200 pixels each
- **Purity**: Single class only per polygon  
- **Scale**: Zoom to 1:5000 when drawing
- **Distribution**: Spread across entire coastline

### **September 2021 Event Hotspots**
Focus on these areas with confirmed beaching:
- **Accra**: Labadi Beach, Osu Castle area
- **Cape Coast**: Central beach areas
- **Takoradi**: Harbor and nearby beaches  
- **Elmina**: Castle vicinity coastline

## 📊 **Expected Results**

### **Model Performance Targets**
```
Overall Accuracy: > 80%
Beached Sargassum Precision: > 75%
Beached Sargassum Recall: > 70%
Kappa Coefficient: > 0.7
```

### **Export Assets Created**
1. **Trained Classifier**: `users/YOUR_USERNAME/ghana_beached_sargassum_rf_sept2021`
2. **Probability Map**: Downloaded to Google Drive
3. **Validation Metrics**: CSV file in Google Drive
4. **Confusion Matrix**: Detailed performance stats

## 🔧 **Troubleshooting**

### **"Collection is empty" Error**
- Check internet connection
- Verify date ranges (Sept 2021)
- Increase cloud cover threshold

### **"Too many pixels" Error**
- Reduce export region size
- Increase scale parameter (10→20m)
- Use `.limit(50)` on collections

### **Poor Accuracy (<70%)**
- Review polygon placement quality
- Add more diverse training samples
- Check for cloud contamination
- Ensure class balance

### **Export Tasks Failing**
- Check asset naming conflicts
- Verify Google Drive storage space
- Restart failed tasks manually

## 🎯 **Success Checklist**

- [ ] GEE account access confirmed
- [ ] Training script loaded and saved
- [ ] 60+ training polygons drawn (15+ per class)
- [ ] Asset path updated with username
- [ ] Script runs without errors
- [ ] All export tasks completed successfully
- [ ] Validation accuracy >80%
- [ ] Cloud Run environment updated
- [ ] API integration tested
- [ ] Frontend displays beached detections

## 📞 **Support Resources**

- **GEE Documentation**: https://developers.google.com/earth-engine
- **Sentinel-2 Guide**: https://sentinels.copernicus.eu/web/sentinel/user-guides/sentinel-2-msi
- **Random Forest Classifier**: https://developers.google.com/earth-engine/apidocs/ee-classifier-smilerandomforest
- **SARTRAC Documentation**: `BEACHED_DETECTION_GUIDE.md`

## ⚡ **One-Line Commands**

```bash
# Copy training script
cat gee/beached_train_s2_sept2021_simplified.js

# Test API after training  
curl "https://your-service.run.app/beached?date=2021-09-15"

# Start development server
npm run dev
```

---
**🎯 Ready to train? Open Google Earth Engine Code Editor and start digitizing!**