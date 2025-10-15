#!/usr/bin/env python3
"""
Beached Sargassum Detection Service
Daily operational inference using trained Sentinel-2 Random Forest model
Part of SARTRAC - Ghana Sargassum Tracking and Forecasting System

Usage:
    python beached_detection_service.py --date 2024-10-12 --export-cloud
    
Features:
    - Loads trained GEE Random Forest classifier
    - Processes Sentinel-2 L2A imagery for target date
    - Generates probability raster and detection polygons
    - Exports to Google Cloud Storage as COG/GeoJSON
    - Integrates with existing forecast pipeline
"""

import ee
import argparse
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
import sys
import os

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from scripts.gee_auth import authenticate_gee

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class BeachedSargassumDetector:
    """Beached Sargassum detection using trained Sentinel-2 Random Forest model"""
    
    def __init__(self, model_asset=None, region=None):
        """
        Initialize detector with trained model and region
        
        Args:
            model_asset: GEE asset path to trained classifier
            region: Study region geometry
        """
        # Authenticate GEE
        authenticate_gee()
        ee.Initialize()
        
        # Default trained model (update with your asset path)
        self.model_asset = model_asset or 'users/YOUR_USERNAME/ghana_beached_sargassum_rf_sept2021'
        
        # Ghana coastal region
        self.region = region or ee.Geometry.Polygon([
            [[-3.5, 4.3], [1.0, 4.3], [1.0, 6.2], [-3.5, 6.2], [-3.5, 4.3]]
        ])
        
        # Nearshore buffer distance (meters)
        self.nearshore_buffer = 2000
        
        # Feature bands used in training
        self.feature_bands = [
            'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12',
            'NDVI', 'MNDWI', 'AFAI_S2', 'BSI', 'MOISTURE', 'BROWN'
        ]
        
        # Detection threshold (optimize based on validation)
        self.detection_threshold = 0.35
        
        # Cloud cover threshold
        self.cloud_threshold = 30
        
        # Load trained classifier
        try:
            self.classifier = ee.Classifier.load(self.model_asset)
            logger.info(f"Loaded trained classifier: {self.model_asset}")
        except Exception as e:
            logger.warning(f"Could not load classifier {self.model_asset}: {e}")
            self.classifier = None
    
    def add_spectral_indices(self, image):
        """Calculate spectral indices for beached Sargassum detection"""
        
        # NDVI: Normalized Difference Vegetation Index
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        
        # MNDWI: Modified Normalized Difference Water Index
        mndwi = image.normalizedDifference(['B3', 'B11']).rename('MNDWI')
        
        # S2-AFAI: Sentinel-2 Alternative Floating Algae Index
        afai_s2 = image.expression(
            '(NIR - RED) / (NIR + RED) - (SWIR1 - RED) / (SWIR1 + RED)', {
                'NIR': image.select('B8'),
                'RED': image.select('B4'),
                'SWIR1': image.select('B11')
            }).rename('AFAI_S2')
        
        # Beach Sargassum Index (BSI)
        bsi = image.expression(
            '(NIR - BLUE) / (NIR + BLUE + SWIR1)', {
                'NIR': image.select('B8'),
                'BLUE': image.select('B2'),
                'SWIR1': image.select('B11')
            }).rename('BSI')
        
        # Moisture Index
        moisture = image.normalizedDifference(['B8A', 'B11']).rename('MOISTURE')
        
        # Brown/Organic Matter Index
        brown = image.expression(
            '(SWIR1 - GREEN) / (SWIR1 + GREEN)', {
                'SWIR1': image.select('B11'),
                'GREEN': image.select('B3')
            }).rename('BROWN')
        
        return image.addBands([ndvi, mndwi, afai_s2, bsi, moisture, brown])
    
    def mask_clouds_and_shadows(self, image):
        """Cloud and shadow masking using SCL band"""
        scl = image.select('SCL')
        
        # SCL values to mask: 3=cloud shadows, 8=cloud medium, 9=cloud high, 10=thin cirrus, 11=snow
        cloud_mask = (scl.neq(3).And(scl.neq(8)).And(scl.neq(9))
                     .And(scl.neq(10)).And(scl.neq(11)))
        
        return image.updateMask(cloud_mask)
    
    def create_nearshore_mask(self):
        """Create nearshore belt mask using Global Surface Water"""
        try:
            # Load Global Surface Water for coastline delineation
            gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('max_extent')
            
            # Create distance to water
            water_distance = gsw.eq(1).distance(ee.Kernel.euclidean(1000, 'meters'))
            
            # Nearshore belt: land areas within buffer distance of water
            nearshore_mask = (water_distance.lte(self.nearshore_buffer)
                            .And(gsw.eq(0)))  # Only land areas
            
            return nearshore_mask
            
        except Exception as e:
            logger.warning(f"Could not create nearshore mask: {e}")
            # Fallback: use simple land mask
            return ee.Image(1)
    
    def load_sentinel2_image(self, target_date):
        """Load and preprocess Sentinel-2 L2A image for target date"""
        
        # Parse date
        if isinstance(target_date, str):
            target_date = datetime.strptime(target_date, '%Y-%m-%d')
        
        start_date = target_date.strftime('%Y-%m-%d')
        end_date = (target_date + timedelta(days=3)).strftime('%Y-%m-%d')
        
        logger.info(f"Loading Sentinel-2 imagery for {start_date} to {end_date}")
        
        # Load Sentinel-2 L2A collection
        collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                     .filterDate(start_date, end_date)
                     .filterBounds(self.region)
                     .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', self.cloud_threshold)))
        
        # Check if images are available
        image_count = collection.size().getInfo()
        logger.info(f"Found {image_count} Sentinel-2 images")
        
        if image_count == 0:
            raise ValueError(f"No Sentinel-2 images found for {start_date}")
        
        # Process and composite
        processed = (collection
                    .map(self.mask_clouds_and_shadows)
                    .map(self.add_spectral_indices)
                    .median()  # Create composite
                    .clip(self.region))
        
        return processed
    
    def detect_beached_sargassum(self, target_date, export_assets=False):
        """
        Detect beached Sargassum for target date
        
        Args:
            target_date: Date string (YYYY-MM-DD) or datetime object
            export_assets: Whether to export results to Google Cloud Storage
            
        Returns:
            dict: Detection results with probability map and polygons
        """
        
        if self.classifier is None:
            raise ValueError("No trained classifier available")
        
        logger.info(f"Processing beached Sargassum detection for {target_date}")
        
        # Load target image
        target_image = self.load_sentinel2_image(target_date)
        
        # Create nearshore mask
        nearshore_mask = self.create_nearshore_mask()
        
        # Classify using trained model
        probabilities = (target_image.select(self.feature_bands)
                        .classify(self.classifier, 'probability'))
        
        # Extract Sargassum probability (class 1)
        sargassum_prob = (probabilities.select('probability_1')
                         .rename('sargassum_probability')
                         .updateMask(nearshore_mask))
        
        # Binary classification using threshold
        binary_detection = (sargassum_prob.gt(self.detection_threshold)
                           .rename('sargassum_binary'))
        
        # Combine probability and binary
        output_image = sargassum_prob.addBands(binary_detection)
        
        # Create detection polygons
        vectors = (binary_detection.eq(1).selfMask()
                  .reduceToVectors(
                      geometry=self.region,
                      scale=10,
                      geometryType='polygon',
                      eightConnected=False,
                      maxPixels=1e9
                  ))
        
        # Add metadata to polygons
        detection_date = target_date if isinstance(target_date, str) else target_date.strftime('%Y-%m-%d')
        
        def add_properties(feature):
            return feature.set({
                'date': detection_date,
                'detection_method': 'S2_RF_Sept2021',
                'area_m2': feature.geometry().area(),
                'confidence': 'high',
                'threshold': self.detection_threshold,
                'processing_time': datetime.now().isoformat()
            })
        
        vectors_with_metadata = vectors.map(add_properties)
        
        results = {
            'date': detection_date,
            'probability_image': output_image,
            'detection_polygons': vectors_with_metadata,
            'image_count': target_image.get('system:image_count'),
            'cloud_cover': target_image.get('CLOUDY_PIXEL_PERCENTAGE')
        }
        
        # Export assets if requested
        if export_assets:
            self.export_results(results, detection_date)
        
        return results
    
    def export_results(self, results, date_str):
        """Export detection results to Google Cloud Storage"""
        
        logger.info(f"Exporting results for {date_str}")
        
        # Export probability raster as COG
        probability_task = ee.batch.Export.image.toCloudStorage(
            image=results['probability_image'],
            description=f'beached_probability_{date_str}',
            bucket='sartrac-forecasts',  # Update with your bucket
            fileNamePrefix=f'sargassum/beached/{date_str}/probability',
            scale=10,
            region=self.region,
            crs='EPSG:4326',
            maxPixels=1e9,
            fileFormat='GeoTIFF',
            formatOptions={
                'cloudOptimized': True
            }
        )
        
        # Export detection polygons as GeoJSON
        vectors_task = ee.batch.Export.table.toCloudStorage(
            collection=results['detection_polygons'],
            description=f'beached_polygons_{date_str}',
            bucket='sartrac-forecasts',
            fileNamePrefix=f'sargassum/beached/{date_str}/detections',
            fileFormat='GeoJSON'
        )
        
        # Start export tasks
        probability_task.start()
        vectors_task.start()
        
        logger.info(f"Started export tasks: {probability_task.id}, {vectors_task.id}")
        
        return {
            'probability_task': probability_task.id,
            'vectors_task': vectors_task.id
        }
    
    def get_detection_summary(self, results):
        """Generate summary statistics for detection results"""
        
        try:
            # Calculate total detection area
            total_area = results['detection_polygons'].aggregate_sum('area_m2').getInfo()
            detection_count = results['detection_polygons'].size().getInfo()
            
            # Get probability statistics
            prob_stats = (results['probability_image'].select('sargassum_probability')
                         .reduceRegion(
                             reducer=ee.Reducer.minMax().combine(
                                 ee.Reducer.mean(), sharedInputs=True
                             ),
                             geometry=self.region,
                             scale=50,
                             maxPixels=1e8
                         ).getInfo())
            
            summary = {
                'date': results['date'],
                'detection_count': detection_count,
                'total_area_m2': total_area,
                'total_area_hectares': total_area / 10000 if total_area else 0,
                'probability_min': prob_stats.get('sargassum_probability_min', 0),
                'probability_max': prob_stats.get('sargassum_probability_max', 0),
                'probability_mean': prob_stats.get('sargassum_probability_mean', 0),
                'threshold_used': self.detection_threshold
            }
            
            return summary
            
        except Exception as e:
            logger.error(f"Error calculating summary: {e}")
            return {
                'date': results['date'],
                'error': str(e)
            }

def main():
    """Command line interface for beached Sargassum detection"""
    
    parser = argparse.ArgumentParser(description='Beached Sargassum Detection Service')
    parser.add_argument('--date', type=str, required=True,
                       help='Target date for detection (YYYY-MM-DD)')
    parser.add_argument('--model-asset', type=str,
                       help='GEE asset path to trained classifier')
    parser.add_argument('--export-cloud', action='store_true',
                       help='Export results to Google Cloud Storage')
    parser.add_argument('--threshold', type=float, default=0.35,
                       help='Detection threshold (0-1)')
    parser.add_argument('--output-dir', type=str, default='outputs',
                       help='Output directory for local results')
    
    args = parser.parse_args()
    
    try:
        # Initialize detector
        detector = BeachedSargassumDetector(model_asset=args.model_asset)
        detector.detection_threshold = args.threshold
        
        # Run detection
        logger.info(f"Starting beached Sargassum detection for {args.date}")
        results = detector.detect_beached_sargassum(
            target_date=args.date,
            export_assets=args.export_cloud
        )
        
        # Generate summary
        summary = detector.get_detection_summary(results)
        
        # Save summary locally
        output_dir = Path(args.output_dir)
        output_dir.mkdir(exist_ok=True)
        
        summary_file = output_dir / f'beached_summary_{args.date}.json'
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)
        
        logger.info(f"Detection completed successfully")
        logger.info(f"Summary: {summary}")
        logger.info(f"Results saved to: {summary_file}")
        
        return 0
        
    except Exception as e:
        logger.error(f"Detection failed: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())