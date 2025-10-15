// Beached Sargassum Detection Training System
// Sentinel-2 L2A Random Forest Classifier for Ghana Coast
// Training Period: September 2021 (extreme beaching event)
// Authors: SARTRAC Team
// Last Updated: October 2025

// =============================================================================
// CONFIGURATION
// =============================================================================

// Training Labels Asset - Replace with your labeled polygons
// Labels should have property 'class': 1=sargassum wrack, 0=non-wrack
var LABELS_ASSET = 'users/YOUR_USERNAME/ghana_beach_labels_sept2021';

// Study Area: Ghana nearshore belt (0-2km from coast)
var GHANA_COAST = ee.Geometry.Polygon([
  [[-3.5, 4.3], [1.0, 4.3], [1.0, 6.2], [-3.5, 6.2], [-3.5, 4.3]]
]);

// Nearshore belt buffer (2km from coastline)
var NEARSHORE_BUFFER = 2000; // meters

// Training period: September 2021 (peak beaching event)
var TRAINING_START = '2021-09-01';
var TRAINING_END = '2021-09-30';

// Additional validation scenes for robustness
var VALIDATION_DATES = [
  '2020-09-15', '2020-09-30',
  '2022-08-15', '2022-09-15'
];

// Cloud cover threshold
var CLOUD_THRESHOLD = 20;

// =============================================================================
// SPECTRAL INDICES AND FEATURE ENGINEERING
// =============================================================================

// Calculate enhanced spectral indices for beached Sargassum detection
function addSpectralIndices(image) {
  // NDVI: Normalized Difference Vegetation Index
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  
  // MNDWI: Modified Normalized Difference Water Index
  var mndwi = image.normalizedDifference(['B3', 'B11']).rename('MNDWI');
  
  // S2-AFAI: Sentinel-2 Alternative Floating Algae Index
  // Adapted for beached Sargassum detection
  var afai_s2 = image.expression(
    '(NIR - RED) / (NIR + RED) - (SWIR1 - RED) / (SWIR1 + RED)', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'SWIR1': image.select('B11')
    }).rename('AFAI_S2');
  
  // Beach Sargassum Index (BSI) - custom index for wrack detection
  var bsi = image.expression(
    '(NIR - BLUE) / (NIR + BLUE + SWIR1)', {
      'NIR': image.select('B8'),
      'BLUE': image.select('B2'),
      'SWIR1': image.select('B11')
    }).rename('BSI');
  
  // Moisture Index for wet vs dry sand separation
  var moisture = image.normalizedDifference(['B8A', 'B11']).rename('MOISTURE');
  
  // Brown/Organic Matter Index
  var brown = image.expression(
    '(SWIR1 - GREEN) / (SWIR1 + GREEN)', {
      'SWIR1': image.select('B11'),
      'GREEN': image.select('B3')
    }).rename('BROWN');
  
  return image.addBands([ndvi, mndwi, afai_s2, bsi, moisture, brown]);
}

// Cloud and shadow masking using SCL band
function maskCloudsAndShadows(image) {
  var scl = image.select('SCL');
  
  // SCL values: 3=cloud shadows, 6=water, 8=cloud medium, 9=cloud high, 10=thin cirrus, 11=snow
  var cloudMask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  
  return image.updateMask(cloudMask);
}

// =============================================================================
// DATA PREPARATION
// =============================================================================

// Load and preprocess Sentinel-2 L2A collection
function loadSentinel2(startDate, endDate, aoi) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(startDate, endDate)
    .filterBounds(aoi)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_THRESHOLD))
    .map(maskCloudsAndShadows)
    .map(addSpectralIndices)
    .median() // Create composite to reduce noise
    .clip(aoi);
}

// Create nearshore belt mask
function createNearshoreBelt(coastGeometry, bufferDistance) {
  // Load Global Surface Water for coastline delineation
  var gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('max_extent');
  
  // Create land/water boundary
  var coastline = gsw.eq(1).distance(ee.Kernel.euclidean(1000, 'meters'));
  
  // Create nearshore belt (land within buffer distance of water)
  var nearshoreMask = coastline.lte(bufferDistance).and(gsw.eq(0));
  
  return nearshoreMask;
}

// =============================================================================
// TRAINING DATA PREPARATION
// =============================================================================

// Load training labels
var trainingLabels = ee.FeatureCollection(LABELS_ASSET);

print('Training labels loaded:', trainingLabels.size());
print('Label classes:', trainingLabels.aggregate_histogram('class'));

// Load training imagery
var trainingImage = loadSentinel2(TRAINING_START, TRAINING_END, GHANA_COAST);

// Feature bands for classification
var FEATURE_BANDS = [
  'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12', // S2 bands
  'NDVI', 'MNDWI', 'AFAI_S2', 'BSI', 'MOISTURE', 'BROWN' // Spectral indices
];

// Sample training data
var trainingData = trainingImage.select(FEATURE_BANDS)
  .sampleRegions({
    collection: trainingLabels,
    properties: ['class'],
    scale: 10,
    geometries: true
  });

print('Training samples:', trainingData.size());

// Split into training and validation
var withRandom = trainingData.randomColumn('random');
var split = 0.8;
var trainingSet = withRandom.filter(ee.Filter.lt('random', split));
var validationSet = withRandom.filter(ee.Filter.gte('random', split));

print('Training set size:', trainingSet.size());
print('Validation set size:', validationSet.size());

// =============================================================================
// MODEL TRAINING
// =============================================================================

// Random Forest Classifier with class balancing
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 100,
  variablesPerSplit: null, // sqrt(features)
  minLeafPopulation: 5,
  bagFraction: 0.8,
  maxNodes: null,
  seed: 42
}).train({
  features: trainingSet,
  classProperty: 'class',
  inputProperties: FEATURE_BANDS
});

// Variable importance
var importance = classifier.explain();
print('Feature importance:', importance);

// =============================================================================
// MODEL VALIDATION
// =============================================================================

// Classify validation set
var validated = validationSet.classify(classifier);

// Confusion matrix
var confusionMatrix = validated.errorMatrix('class', 'classification');
print('Confusion Matrix:', confusionMatrix);
print('Overall Accuracy:', confusionMatrix.accuracy());
print('Kappa:', confusionMatrix.kappa());
print('Producer Accuracy (Sargassum):', confusionMatrix.producersAccuracy().get([1, 1]));
print('Consumer Accuracy (Sargassum):', confusionMatrix.consumersAccuracy().get([1, 1]));

// =============================================================================
// INFERENCE FUNCTIONS
// =============================================================================

// Generate probability map for a given date
function generateProbabilityMap(targetDate, exportName) {
  var targetImage = loadSentinel2(targetDate, 
    ee.Date(targetDate).advance(1, 'day').format('YYYY-MM-dd'), 
    GHANA_COAST);
  
  // Create nearshore mask
  var nearshoreMask = createNearshoreBelt(GHANA_COAST, NEARSHORE_BUFFER);
  
  // Classify and get probabilities
  var probabilities = targetImage.select(FEATURE_BANDS)
    .classify(classifier, 'probability')
    .updateMask(nearshoreMask);
  
  // Extract probability for Sargassum class (class 1)
  var sargassumProb = probabilities.select('probability_1')
    .rename('sargassum_probability');
  
  // Apply threshold for binary classification
  var threshold = 0.35; // Adjust based on validation results
  var binaryClass = sargassumProb.gt(threshold).rename('sargassum_binary');
  
  // Combine probability and binary
  var outputImage = sargassumProb.addBands(binaryClass);
  
  // Export probability raster
  Export.image.toDrive({
    image: outputImage,
    description: exportName + '_probability_raster',
    folder: 'SARTRAC_Beached',
    scale: 10,
    region: GHANA_COAST,
    crs: 'EPSG:4326',
    maxPixels: 1e9,
    fileFormat: 'GeoTIFF',
    formatOptions: {
      cloudOptimized: true
    }
  });
  
  // Create polygons from high-probability areas
  var vectors = binaryClass.eq(1).selfMask()
    .reduceToVectors({
      geometry: GHANA_COAST,
      scale: 10,
      geometryType: 'polygon',
      eightConnected: false,
      maxPixels: 1e9
    })
    .map(function(feature) {
      return feature.set({
        'date': targetDate,
        'detection_method': 'S2_RF_Sept2021',
        'area_m2': feature.geometry().area(),
        'confidence': 'high'
      });
    });
  
  // Export vector polygons
  Export.table.toDrive({
    collection: vectors,
    description: exportName + '_polygons',
    folder: 'SARTRAC_Beached',
    fileFormat: 'GeoJSON'
  });
  
  return outputImage;
}

// =============================================================================
// VISUALIZATION AND EXPORT
// =============================================================================

// Add training image to map
Map.centerObject(GHANA_COAST, 8);
Map.addLayer(trainingImage, {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 3000
}, 'Training Image (RGB)');

// Add AFAI for quick visual check
Map.addLayer(trainingImage.select('AFAI_S2'), {
  min: -0.1,
  max: 0.3,
  palette: ['blue', 'cyan', 'yellow', 'orange', 'red']
}, 'AFAI_S2');

// Add training labels
Map.addLayer(trainingLabels.filter(ee.Filter.eq('class', 1)), 
  {color: 'red'}, 'Sargassum Labels');
Map.addLayer(trainingLabels.filter(ee.Filter.eq('class', 0)), 
  {color: 'blue'}, 'Non-Sargassum Labels');

// =============================================================================
// OPERATIONAL INFERENCE EXAMPLE
// =============================================================================

// Example: Generate prediction for a specific date
var TARGET_DATE = '2021-09-15'; // Peak beaching event
var predictionMap = generateProbabilityMap(TARGET_DATE, 'ghana_beached_20210915');

// Add prediction to map
Map.addLayer(predictionMap.select('sargassum_probability'), {
  min: 0,
  max: 1,
  palette: ['darkblue', 'blue', 'cyan', 'yellow', 'orange', 'red']
}, 'Sargassum Probability');

Map.addLayer(predictionMap.select('sargassum_binary'), {
  min: 0,
  max: 1,
  palette: ['transparent', 'red']
}, 'Sargassum Detection');

// =============================================================================
// EXPORT TRAINED MODEL
// =============================================================================

// Export classifier for operational use
Export.classifier.toDrive({
  classifier: classifier,
  description: 'ghana_beached_sargassum_rf_sept2021',
  folder: 'SARTRAC_Models'
});

// Export training metadata
var metadata = ee.FeatureCollection([
  ee.Feature(null, {
    'model_name': 'ghana_beached_sargassum_rf_sept2021',
    'training_period': TRAINING_START + '_to_' + TRAINING_END,
    'feature_bands': FEATURE_BANDS.join(','),
    'training_samples': trainingData.size(),
    'accuracy': confusionMatrix.accuracy(),
    'kappa': confusionMatrix.kappa(),
    'created_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
    'version': '1.0'
  })
]);

Export.table.toDrive({
  collection: metadata,
  description: 'model_metadata_sept2021',
  folder: 'SARTRAC_Models',
  fileFormat: 'JSON'
});

// =============================================================================
// USAGE INSTRUCTIONS
// =============================================================================

print('='.repeat(80));
print('BEACHED SARGASSUM DETECTION MODEL - SEPTEMBER 2021');
print('='.repeat(80));
print('');
print('NEXT STEPS:');
print('1. Create training labels asset with polygons (class: 1=wrack, 0=non-wrack)');
print('2. Update LABELS_ASSET variable with your asset path');
print('3. Run script to train model and export results');
print('4. Use exported classifier for daily operational inference');
print('5. Integrate with Cloud Run for automated daily processing');
print('');
print('EXPORTS:');
print('- Trained Random Forest classifier');
print('- Example probability raster for', TARGET_DATE);
print('- Example detection polygons for', TARGET_DATE);
print('- Model metadata and performance metrics');
print('');
print('For operational deployment, see:');
print('- scripts/beached_detection_service.py');
print('- cloudrun/routes/beached.py');
print('='.repeat(80));