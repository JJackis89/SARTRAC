/*
 * SARTRAC Beached Sargassum Detection Training Script
 * Google Earth Engine Code Editor Version
 * 
 * INSTRUCTIONS:
 * 1. Copy this entire script into GEE Code Editor
 * 2. Create training polygons manually (see GEE_TRAINING_SETUP.md)
 * 3. Update the assetPath variable with your username
 * 4. Run the script
 * 5. Monitor Tasks tab for export progress
 */

// ==================== CONFIGURATION ====================

// UPDATE THIS with your GEE username
var assetPath = 'users/sartrac/';

// Study region: Ghana coastal zone
var ghana_coast = ee.Geometry.Polygon([
  [[-3.5, 4.3], [1.0, 4.3], [1.0, 6.2], [-3.5, 6.2], [-3.5, 4.3]]
]);

// Training period: September 2021 extreme beaching event
var training_start = '2021-09-01';
var training_end = '2021-09-30';

// ==================== TRAINING POLYGONS ====================
// YOU MUST CREATE THESE MANUALLY using the polygon drawing tool

// var beachedSargassum = /* Draw 15-20 polygons on beached Sargassum */;
// var cleanBeach = /* Draw 15-20 polygons on clean beach areas */;  
// var water = /* Draw 10-15 polygons on water areas */;
// var vegetation = /* Draw 10-15 polygons on coastal vegetation */;

// EXAMPLE TRAINING POLYGONS (replace with your manually drawn polygons)
var beachedSargassum = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Polygon([[[-0.2, 5.5], [-0.18, 5.5], [-0.18, 5.52], [-0.2, 5.52]]]), {class: 1, name: 'beached_sargassum'}),
  // Add more polygons here after manual digitization
]);

var cleanBeach = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Polygon([[[-0.15, 5.48], [-0.13, 5.48], [-0.13, 5.5], [-0.15, 5.5]]]), {class: 0, name: 'clean_beach'}),
  // Add more polygons here after manual digitization
]);

var water = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Polygon([[[-0.25, 5.45], [-0.23, 5.45], [-0.23, 5.47], [-0.25, 5.47]]]), {class: 2, name: 'water'}),
  // Add more polygons here after manual digitization
]);

var vegetation = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Polygon([[[-0.1, 5.53], [-0.08, 5.53], [-0.08, 5.55], [-0.1, 5.55]]]), {class: 3, name: 'vegetation'}),
  // Add more polygons here after manual digitization
]);

// ==================== SENTINEL-2 DATA PREPARATION ====================

// Load Sentinel-2 L2A collection
var s2_collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate(training_start, training_end)
  .filterBounds(ghana_coast)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));

print('Available S2 images:', s2_collection.size());

// Function to mask clouds using SCL band
function maskClouds(image) {
  var scl = image.select('SCL');
  // Mask clouds (8,9), cloud shadows (3), and cirrus (10)
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
  return image.updateMask(mask);
}

// Function to add spectral indices
function addSpectralIndices(image) {
  // NDVI: Normalized Difference Vegetation Index
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  
  // MNDWI: Modified Normalized Difference Water Index  
  var mndwi = image.normalizedDifference(['B3', 'B11']).rename('MNDWI');
  
  // S2-AFAI: Sentinel-2 Alternative Floating Algae Index
  var afai_s2 = image.expression(
    '(NIR - RED) / (NIR + RED) - (SWIR1 - RED) / (SWIR1 + RED)', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'), 
      'SWIR1': image.select('B11')
    }).rename('AFAI_S2');
  
  // BSI: Beach Sargassum Index
  var bsi = image.expression(
    '(NIR - BLUE) / (NIR + BLUE + SWIR1)', {
      'NIR': image.select('B8'),
      'BLUE': image.select('B2'),
      'SWIR1': image.select('B11')
    }).rename('BSI');
  
  // Moisture Index
  var moisture = image.normalizedDifference(['B8A', 'B11']).rename('MOISTURE');
  
  // Brown/Organic Matter Index
  var brown = image.expression(
    '(SWIR1 - GREEN) / (SWIR1 + GREEN)', {
      'SWIR1': image.select('B11'),
      'GREEN': image.select('B3')
    }).rename('BROWN');
  
  return image.addBands([ndvi, mndwi, afai_s2, bsi, moisture, brown]);
}

// Process Sentinel-2 data
var processed_s2 = s2_collection
  .map(maskClouds)
  .map(addSpectralIndices)
  .median()
  .clip(ghana_coast);

// Training bands
var training_bands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12',
                     'NDVI', 'MNDWI', 'AFAI_S2', 'BSI', 'MOISTURE', 'BROWN'];

print('Training bands:', training_bands);

// ==================== VISUALIZATION ====================

// Display processed image
Map.centerObject(ghana_coast, 8);
Map.addLayer(processed_s2, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}, 'Sentinel-2 RGB');
Map.addLayer(processed_s2, {bands: ['B8', 'B4', 'B3'], min: 0, max: 3000}, 'False Color');

// Display training polygons
Map.addLayer(beachedSargassum, {color: 'red'}, 'Beached Sargassum');
Map.addLayer(cleanBeach, {color: 'yellow'}, 'Clean Beach');
Map.addLayer(water, {color: 'blue'}, 'Water');
Map.addLayer(vegetation, {color: 'green'}, 'Vegetation');

// ==================== TRAINING DATA PREPARATION ====================

// Combine all training polygons
var training_polygons = beachedSargassum
  .merge(cleanBeach)
  .merge(water) 
  .merge(vegetation);

print('Training polygons:', training_polygons.size());

// Sample training points
var training_points = processed_s2.select(training_bands)
  .sampleRegions({
    collection: training_polygons,
    properties: ['class'],
    scale: 10,
    tileScale: 2
  });

print('Training samples:', training_points.size());

// ==================== MODEL TRAINING ====================

// Split data for training and validation (80/20)
var training_data = training_points.randomColumn('random', 42);
var train_set = training_data.filter(ee.Filter.lt('random', 0.8));
var validation_set = training_data.filter(ee.Filter.gte('random', 0.8));

print('Training set size:', train_set.size());
print('Validation set size:', validation_set.size());

// Train Random Forest classifier
var rf_classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 100,
  minLeafPopulation: 5,
  bagFraction: 0.7,
  seed: 42
}).train({
  features: train_set,
  classProperty: 'class',
  inputProperties: training_bands
});

// ==================== MODEL VALIDATION ====================

// Validate model
var validation_classified = validation_set.classify(rf_classifier);
var validation_accuracy = validation_classified.errorMatrix('class', 'classification');

print('Validation Confusion Matrix:', validation_accuracy);
print('Validation Overall Accuracy:', validation_accuracy.accuracy());
print('Validation Kappa:', validation_accuracy.kappa());

// Class-specific accuracy
var producers_accuracy = validation_accuracy.producersAccuracy();
var consumers_accuracy = validation_accuracy.consumersAccuracy();

print('Producers Accuracy:', producers_accuracy);
print('Consumers Accuracy:', consumers_accuracy);

// ==================== PROBABILITY MAPPING ====================

// Create probability maps
var probability_image = processed_s2.select(training_bands)
  .classify(rf_classifier, 'probability');

// Extract beached sargassum probability (class 1)
var beached_probability = probability_image.select(['probability_1'])
  .rename('beached_sargassum_probability');

// Apply nearshore mask (optional)
var nearshore_buffer = 2000; // 2km buffer
var land_mask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('max_extent').eq(0); // Land areas

var distance_to_water = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('max_extent').eq(1)
  .distance(ee.Kernel.euclidean(1000, 'meters'));

var nearshore_mask = distance_to_water.lte(nearshore_buffer).and(land_mask);
var masked_probability = beached_probability.updateMask(nearshore_mask);

// Display probability maps
Map.addLayer(beached_probability, {
  min: 0, max: 1,
  palette: ['blue', 'cyan', 'yellow', 'orange', 'red']
}, 'Beached Sargassum Probability');

Map.addLayer(masked_probability, {
  min: 0, max: 1,
  palette: ['blue', 'cyan', 'yellow', 'orange', 'red']
}, 'Beached Probability (Nearshore)');

// ==================== FEATURE IMPORTANCE ====================

// Get feature importance
var feature_importance = rf_classifier.explain();
print('Feature Importance:', feature_importance);

// ==================== EXPORT TASKS ====================

// 1. Export trained classifier to assets
Export.classifier.toAsset({
  classifier: rf_classifier,
  assetId: assetPath + 'ghana_beached_sargassum_rf_sept2021',
  description: 'Ghana_Beached_Sargassum_RF_Classifier'
});

// 2. Export probability map to Drive
Export.image.toDrive({
  image: masked_probability,
  description: 'Ghana_Beached_Probability_Sept2021',
  folder: 'SARTRAC_Training',
  fileNamePrefix: 'beached_probability_sept2021',
  region: ghana_coast,
  scale: 10,
  maxPixels: 1e9,
  formatOptions: {
    cloudOptimized: true
  }
});

// 3. Export validation metrics to Drive
var validation_results = ee.FeatureCollection([
  ee.Feature(null, {
    'overall_accuracy': validation_accuracy.accuracy(),
    'kappa': validation_accuracy.kappa(),
    'training_samples': train_set.size(),
    'validation_samples': validation_set.size(),
    'training_date': training_start + '_to_' + training_end,
    'model_type': 'Random_Forest_100_trees'
  })
]);

Export.table.toDrive({
  collection: validation_results,
  description: 'Ghana_Beached_Validation_Metrics',
  folder: 'SARTRAC_Training',
  fileFormat: 'CSV'
});

// 4. Export confusion matrix details
var confusion_matrix_fc = ee.FeatureCollection([
  ee.Feature(null, validation_accuracy.getInfo())
]);

Export.table.toDrive({
  collection: confusion_matrix_fc, 
  description: 'Ghana_Beached_Confusion_Matrix',
  folder: 'SARTRAC_Training',
  fileFormat: 'CSV'
});

// ==================== SUMMARY ====================

print('=== TRAINING SUMMARY ===');
print('Study Area: Ghana Coastal Zone');
print('Training Period:', training_start, 'to', training_end);
print('Image Collection Size:', s2_collection.size());
print('Training Features:', training_bands.length);
print('Training Polygons:', training_polygons.size());
print('Training Samples:', training_points.size());
print('Model Type: Random Forest (100 trees)');
print('');
print('=== NEXT STEPS ===');
print('1. Monitor Tasks tab for export completion');
print('2. Download validation results from Google Drive');
print('3. Update Cloud Run environment with asset ID:');
print('   ', assetPath + 'ghana_beached_sargassum_rf_sept2021');
print('4. Test API integration with trained model');
print('5. Validate results in SARTRAC frontend');

// ==================== QUALITY CHECKS ====================

// Check for potential issues
var sample_counts = training_points.aggregate_histogram('class');
print('Sample distribution by class:', sample_counts);

// Check for missing data
var band_stats = processed_s2.select(training_bands).reduceRegion({
  reducer: ee.Reducer.count(),
  geometry: ghana_coast,
  scale: 100,
  maxPixels: 1e6
});
print('Band pixel counts:', band_stats);

print('Training setup complete! Check Tasks tab to start exports.');