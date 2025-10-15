# Google Earth Engine Training Setup for Beached Sargassum Detection

## Step-by-Step Training Process

### Step 1: Access Google Earth Engine Code Editor

1. Go to [Google Earth Engine Code Editor](https://code.earthengine.google.com/)
2. Sign in with your Google account
3. Ensure you have Earth Engine access (apply at https://earthengine.google.com/signup/ if needed)

### Step 2: Create Training Polygons for September 2021 Event

The September 2021 Sargassum beaching event was one of the most severe on record for Ghana's coastline. We'll use this event as our training baseline.

#### 2.1 Set Up the Study Area

```javascript
// Ghana coastal region - focus on areas with known September 2021 beaching
var ghana_coast = ee.Geometry.Polygon([
  [[-3.5, 4.3], [1.0, 4.3], [1.0, 6.2], [-3.5, 6.2], [-3.5, 4.3]]
]);

// Center map on Ghana coast
Map.centerObject(ghana_coast, 8);

// Load Sentinel-2 imagery for September 2021
var sept2021_start = '2021-09-01';
var sept2021_end = '2021-09-30';

var s2_collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate(sept2021_start, sept2021_end)
  .filterBounds(ghana_coast)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .median();

// Display RGB composite
Map.addLayer(s2_collection, {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 3000,
  gamma: 1.4
}, 'Sentinel-2 RGB Sept 2021');

// Display False Color (vegetation in red)
Map.addLayer(s2_collection, {
  bands: ['B8', 'B4', 'B3'],
  min: 0,
  max: 3000,
  gamma: 1.4
}, 'Sentinel-2 False Color Sept 2021');
```

#### 2.2 Create Training Polygons

**IMPORTANT**: You need to manually digitize training polygons in the GEE Code Editor. Use the polygon drawing tool to create these feature collections:

##### A. Beached Sargassum Polygons (`beachedSargassum`)
Look for these characteristics on beaches:
- **Brown/orange organic matter** on beach surfaces
- **Distinct from vegetation** (darker, more organic)
- **Linear patterns** along waterline
- **Concentrated in bays and coves**

**Key locations for September 2021 event**:
- Accra beaches (Labadi, Osu)
- Cape Coast area
- Takoradi beaches
- Elmina coastline

```javascript
// Example - you'll create these by drawing polygons
var beachedSargassum = /* Draw 15-20 polygons on confirmed beached Sargassum areas */;
```

##### B. Clean Beach Polygons (`cleanBeach`)
- **Sandy beach areas** without Sargassum
- **Various beach types**: white sand, dark sand, rocky
- **Different moisture levels**: wet, dry

```javascript
var cleanBeach = /* Draw 15-20 polygons on clean beach areas */;
```

##### C. Water Polygons (`water`)
- **Nearshore water** (various depths)
- **Clear water** and **turbid water**
- **With and without floating Sargassum**

```javascript
var water = /* Draw 10-15 polygons on water areas */;
```

##### D. Coastal Vegetation Polygons (`vegetation`)
- **Mangroves**
- **Coastal grasses**
- **Palm trees and coastal forest**

```javascript
var vegetation = /* Draw 10-15 polygons on vegetation areas */;
```

#### 2.3 Training Polygon Guidelines

**For each polygon**:
- **Size**: 50-200 pixels each (moderate size for spectral consistency)
- **Purity**: Ensure polygons contain only the target class
- **Distribution**: Spread across the entire coastline
- **Variety**: Include different lighting conditions, beach types, moisture levels

**Quality checks**:
- Zoom in to 1:5000 scale when drawing
- Use both RGB and false-color imagery
- Cross-reference with Google Earth high-resolution imagery
- Avoid cloud shadows and scan-line gaps

### Step 3: Load and Run the Training Script

#### 3.1 Copy the Training Script

1. Open the file `gee/beached_train_s2_sept2021.js` from your SARTRAC project
2. Copy the entire contents
3. Paste into a new script in Google Earth Engine Code Editor

#### 3.2 Update Asset Paths

Modify these lines in the script to match your username:

```javascript
// Update this path with your GEE username
var assetPath = 'users/YOUR_USERNAME/';

// Export paths
var modelAssetId = assetPath + 'ghana_beached_sargassum_rf_sept2021';
var probabilityAssetId = assetPath + 'ghana_beached_probability_sept2021';
```

#### 3.3 Run the Training Script

1. **Save the script** with a meaningful name (e.g., "Ghana_Beached_Sargassum_Training")
2. **Run the script** by clicking the "Run" button
3. **Monitor the console** for progress messages and any errors
4. **Check the Tasks tab** for export jobs

### Step 4: Export and Validate Results

#### 4.1 Export Tasks

The script will create several export tasks:

```javascript
// 1. Trained classifier model
Export.classifier.toAsset({
  classifier: trainedClassifier,
  assetId: 'users/YOUR_USERNAME/ghana_beached_sargassum_rf_sept2021',
  description: 'Ghana_Beached_Sargassum_RF_Model'
});

// 2. Probability map for validation
Export.image.toDrive({
  image: probabilityMap,
  description: 'Beached_Probability_Sept2021',
  scale: 10,
  region: ghana_coast,
  maxPixels: 1e9
});

// 3. Validation metrics
Export.table.toDrive({
  collection: validationResults,
  description: 'Beached_Validation_Metrics',
  fileFormat: 'CSV'
});
```

#### 4.2 Monitor Export Progress

1. Go to the **Tasks** tab in GEE Code Editor
2. **Start each export task** by clicking "Run" 
3. **Monitor progress** - asset exports can take 10-30 minutes
4. **Download validation results** from Google Drive

#### 4.3 Validation Metrics

Expected performance for a good model:

```
Overall Accuracy: > 80%
Beached Sargassum Precision: > 75%
Beached Sargassum Recall: > 70%
Kappa Coefficient: > 0.7
```

### Step 5: Test the Trained Model

#### 5.1 Load and Test

```javascript
// Load your trained classifier
var trainedModel = ee.Classifier.load('users/YOUR_USERNAME/ghana_beached_sargassum_rf_sept2021');

// Test on a different date
var test_date = '2021-10-15';
var test_image = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate(test_date, ee.Date(test_date).advance(1, 'day'))
  .filterBounds(ghana_coast)
  .first();

// Apply spectral indices (same as training)
var test_with_indices = addSpectralIndices(test_image);

// Classify
var test_probabilities = test_with_indices.select(trainingFeatures).classify(trainedModel, 'probability');

// Display results
Map.addLayer(test_probabilities.select('probability_1'), {
  min: 0, max: 1, 
  palette: ['blue', 'cyan', 'yellow', 'orange', 'red']
}, 'Beached Sargassum Probability');
```

### Step 6: Deploy to SARTRAC System

#### 6.1 Update Environment Variables

Add your trained model asset ID to the Cloud Run environment:

```bash
gcloud run services update sartrac-beached \
  --set-env-vars="BEACHED_MODEL_ASSET=users/YOUR_USERNAME/ghana_beached_sargassum_rf_sept2021"
```

#### 6.2 Test API Integration

```bash
# Test the beached detection endpoint
curl "https://your-cloudrun-service.run.app/beached?date=2021-09-15&threshold=0.35"
```

#### 6.3 Verify Frontend Integration

1. Start your React development server: `npm run dev`
2. Navigate to the SARTRAC application
3. Toggle the "Beached Sargassum" layer
4. Test with dates from September-October 2021

## Troubleshooting

### Common Issues

#### 1. "Collection is empty" Error
- **Solution**: Check date ranges and cloud cover filters
- **Fix**: Expand date range or increase cloud cover threshold

#### 2. "Too many pixels" Error  
- **Solution**: Reduce export region or increase scale parameter
- **Fix**: Use `.limit(50)` on image collections

#### 3. Training Polygons Not Visible
- **Solution**: Check polygon geometry and zoom level
- **Fix**: Redraw polygons at appropriate scale

#### 4. Poor Model Performance
- **Solution**: Review training polygon quality
- **Fix**: Add more diverse training samples

### Validation Checklist

- [ ] Training polygons cover diverse beach conditions
- [ ] Model achieves >80% overall accuracy
- [ ] Confusion matrix shows good class separation
- [ ] Visual inspection confirms reasonable probability maps
- [ ] API integration returns valid detection summaries
- [ ] Frontend displays detections correctly

## Best Practices

### Training Data Quality
- **Minimum 15 polygons** per class
- **Spectral purity** within each polygon
- **Geographic distribution** across entire coastline
- **Temporal consistency** within September 2021 period

### Model Validation
- **Independent test dataset** (different dates)
- **Visual validation** against high-resolution imagery
- **Statistical metrics** (precision, recall, F1-score)
- **Operational testing** with real API calls

### Operational Deployment
- **Monitor API performance** and error rates
- **Regular model updates** with new training data
- **Seasonal calibration** for different Sargassum conditions
- **User feedback integration** for continuous improvement

## Next Steps

After successful training and deployment:

1. **Collect ground truth data** for ongoing validation
2. **Expand training dataset** with additional events
3. **Integrate with floating forecasts** for comprehensive monitoring
4. **Develop alert systems** for high-confidence detections
5. **Scale to regional application** beyond Ghana

## References

- [Google Earth Engine Supervised Classification Guide](https://developers.google.com/earth-engine/guides/classification)
- [Sentinel-2 User Handbook](https://sentinels.copernicus.eu/web/sentinel/user-guides/sentinel-2-msi)
- [Random Forest Classifier Documentation](https://developers.google.com/earth-engine/apidocs/ee-classifier-smilerandomforest)
- Ghana EPA Coastal Monitoring Protocols
- SARTRAC Project Documentation