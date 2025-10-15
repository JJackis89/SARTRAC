"""
Flask Cloud Run service for SARTRAC - Ghana Sargassum Tracking and Forecasting System
Supports both floating (OLCI) and beached (Sentinel-2) Sargassum detection
"""

import os
import json
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, request, jsonify
import ee

# Add scripts directory for imports
sys.path.append(str(Path(__file__).parent.parent / 'scripts'))

try:
    from beached_detection_service import BeachedSargassumDetector
except ImportError:
    BeachedSargassumDetector = None
    logging.warning("BeachedSargassumDetector not available")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

def initialize_earth_engine():
    """Initialize Earth Engine with service account credentials."""
    try:
        # Get service account info from environment
        service_account = os.environ.get('EE_SERVICE_ACCOUNT')
        private_key_json = os.environ.get('EE_PRIVATE_KEY')
        
        if not service_account or not private_key_json:
            raise ValueError("Missing EE_SERVICE_ACCOUNT or EE_PRIVATE_KEY environment variables")
        
        # Parse private key JSON
        private_key_info = json.loads(private_key_json)
        
        # Create credentials
        credentials = ee.ServiceAccountCredentials(service_account, key_data=private_key_info)
        
        # Initialize Earth Engine
        ee.Initialize(credentials)
        
        logger.info("Earth Engine initialized successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize Earth Engine: {e}")
        return False

def create_ghana_offshore_band(nautical_miles=20):
    """
    Create Ghana offshore band server-side in Earth Engine.
    
    Args:
        nautical_miles: Distance offshore in nautical miles
        
    Returns:
        ee.Geometry of offshore band
    """
    try:
        # Get Ghana country boundary
        countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
        ghana = countries.filter(ee.Filter.eq('country_na', 'Ghana'))
        
        # Convert nautical miles to meters and buffer
        buffer_distance = nautical_miles * 1852  # 1 nm = 1852 m
        ghana_buffered = ghana.geometry().buffer(buffer_distance, 100)
        
        # Subtract original Ghana to get offshore band
        offshore_band = ghana_buffered.difference(ghana.geometry())
        
        # Clip to reasonable bounds
        bounds = ee.Geometry.Rectangle([-4.5, 3.0, 2.5, 7.0])
        roi = offshore_band.intersection(bounds)
        
        logger.info(f"Created {nautical_miles} nm offshore band")
        return roi
        
    except Exception as e:
        logger.error(f"Failed to create offshore band: {e}")
        raise

def run_olci_pipeline(date_str, roi, gcs_bucket):
    """
    Run OLCI Sargassum detection pipeline in Earth Engine.
    
    Args:
        date_str: Date string YYYY-MM-DD
        roi: Earth Engine geometry for ROI
        gcs_bucket: GCS bucket name for exports
        
    Returns:
        Dictionary with task IDs
    """
    try:
        # Parse date
        target_date = ee.Date(date_str)
        end_date = target_date.advance(1, 'day')
        
        logger.info(f"Processing OLCI data for {date_str}")
        
        # Load OLCI collection
        olci_collection = (ee.ImageCollection('COPERNICUS/S3/OLCI/OL_2_WFR')
                          .filterDate(target_date, end_date)
                          .filterBounds(roi))
        
        # Check if data is available
        collection_size = olci_collection.size()
        logger.info(f"Found {collection_size.getInfo()} OLCI images")
        
        # Apply quality mask
        def apply_quality_mask(image):
            # Basic quality masking
            quality_flags = image.select(['quality_flags']).toInt()
            
            # Mask clouds, glint, and suspicious pixels
            cloud_mask = quality_flags.bitwiseAnd(2**18).eq(0)
            glint_mask = quality_flags.bitwiseAnd(2**21).eq(0)
            suspicious_mask = quality_flags.bitwiseAnd(2**24).eq(0)
            
            quality_mask = cloud_mask.And(glint_mask).And(suspicious_mask)
            
            # Mask negative and extreme Rrs values
            bands = ['Rrs_665', 'Rrs_681', 'Rrs_709', 'Rrs_754', 'Rrs_865', 'Rrs_1020']
            valid_mask = ee.Image(1)
            
            for band in bands:
                band_data = image.select(band)
                band_mask = band_data.gt(0).And(band_data.lt(0.1))
                valid_mask = valid_mask.And(band_mask)
            
            final_mask = quality_mask.And(valid_mask)
            return image.updateMask(final_mask)
        
        # Compute AFAI
        def compute_afai(image):
            rrs665 = image.select('Rrs_665')
            rrs865 = image.select('Rrs_865')
            rrs1020 = image.select('Rrs_1020')
            
            baseline = rrs665.add(
                rrs1020.subtract(rrs665).multiply((865 - 665) / (1020 - 665))
            )
            
            afai = rrs865.subtract(baseline)
            return afai.rename('afai')
        
        # Compute MCI
        def compute_mci(image):
            rrs681 = image.select('Rrs_681')
            rrs709 = image.select('Rrs_709')
            rrs754 = image.select('Rrs_754')
            
            baseline = rrs681.add(
                rrs754.subtract(rrs681).multiply((709 - 681) / (754 - 681))
            )
            
            mci = rrs709.subtract(baseline)
            return mci.rename('mci')
        
        # Process collection
        masked_collection = olci_collection.map(apply_quality_mask)
        afai_collection = masked_collection.map(compute_afai)
        mci_collection = masked_collection.map(compute_mci)
        
        # Create daily composites
        afai_max = afai_collection.max().clip(roi)
        mci_max = mci_collection.max().clip(roi)
        
        # Apply thresholds
        afai_threshold = 0.02
        mci_threshold = 0.00
        
        afai_detect = afai_max.gte(afai_threshold)
        mci_detect = mci_max.gte(mci_threshold)
        detect_mask = afai_detect.Or(mci_detect).rename('detect')
        
        # Export parameters
        export_scale = 300
        max_pixels = 1e9
        
        # Start export tasks
        task_ids = {}
        
        # Export AFAI max
        afai_task = ee.batch.Export.image.toCloudStorage(
            image=afai_max,
            description=f'AFAI_Max_{date_str}',
            bucket=gcs_bucket,
            fileNamePrefix=f'sargassum/olci/afai_max_{date_str}',
            region=roi,
            scale=export_scale,
            maxPixels=max_pixels,
            formatOptions={'cloudOptimized': True}
        )
        afai_task.start()
        task_ids['afai_max'] = afai_task.id
        
        # Export MCI max
        mci_task = ee.batch.Export.image.toCloudStorage(
            image=mci_max,
            description=f'MCI_Max_{date_str}',
            bucket=gcs_bucket,
            fileNamePrefix=f'sargassum/olci/mci_max_{date_str}',
            region=roi,
            scale=export_scale,
            maxPixels=max_pixels,
            formatOptions={'cloudOptimized': True}
        )
        mci_task.start()
        task_ids['mci_max'] = mci_task.id
        
        # Export detection mask
        detect_task = ee.batch.Export.image.toCloudStorage(
            image=detect_mask,
            description=f'Detect_Mask_{date_str}',
            bucket=gcs_bucket,
            fileNamePrefix=f'sargassum/olci/detect_{date_str}',
            region=roi,
            scale=export_scale,
            maxPixels=max_pixels,
            formatOptions={'cloudOptimized': True}
        )
        detect_task.start()
        task_ids['detect_mask'] = detect_task.id
        
        # Export detection centroids
        detection_vectors = (detect_mask.select('detect').selfMask()
                           .reduceToVectors(
                               geometry=roi,
                               scale=export_scale,
                               maxPixels=max_pixels,
                               geometryType='centroid',
                               eightConnected=False
                           ))
        
        # Add date property
        detection_vectors = detection_vectors.map(
            lambda feature: feature.set('date', date_str)
        )
        
        centroids_task = ee.batch.Export.table.toCloudStorage(
            collection=detection_vectors,
            description=f'Detection_Centroids_{date_str}',
            bucket=gcs_bucket,
            fileNamePrefix=f'sargassum/olci/centroids_{date_str}',
            fileFormat='GeoJSON'
        )
        centroids_task.start()
        task_ids['centroids'] = centroids_task.id
        
        logger.info(f"Started {len(task_ids)} export tasks")
        
        return task_ids
        
    except Exception as e:
        logger.error(f"OLCI pipeline failed: {e}")
        raise

@app.route('/health')
def health():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

@app.route('/run', methods=['GET', 'POST'])
def run_detection():
    """Main endpoint to trigger OLCI detection."""
    try:
        # Get parameters
        if request.method == 'GET':
            date_str = request.args.get('date')
        else:
            data = request.get_json() or {}
            date_str = data.get('date')
        
        # Validate date
        if not date_str:
            return jsonify({'error': 'Missing date parameter (YYYY-MM-DD)'}), 400
        
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        # Get configuration
        gcs_bucket = os.environ.get('GCS_BUCKET')
        offshore_nm = float(os.environ.get('OFFSHORE_NM', '20'))
        
        if not gcs_bucket:
            return jsonify({'error': 'Missing GCS_BUCKET environment variable'}), 500
        
        logger.info(f"Processing request for date: {date_str}")
        
        # Initialize Earth Engine if not already done
        if not hasattr(app, 'ee_initialized'):
            if not initialize_earth_engine():
                return jsonify({'error': 'Failed to initialize Earth Engine'}), 500
            app.ee_initialized = True
        
        # Create ROI
        roi = create_ghana_offshore_band(offshore_nm)
        
        # Run OLCI pipeline
        task_ids = run_olci_pipeline(date_str, roi, gcs_bucket)
        
        response = {
            'status': 'success',
            'date': date_str,
            'gcs_bucket': gcs_bucket,
            'offshore_nm': offshore_nm,
            'task_ids': task_ids,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Successfully started OLCI processing for {date_str}")
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Request failed: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

@app.route('/beached', methods=['GET', 'POST'])
def run_beached_detection():
    """Endpoint to trigger beached Sargassum detection using Sentinel-2."""
    try:
        # Check if beached detection is available
        if BeachedSargassumDetector is None:
            return jsonify({'error': 'Beached detection service not available'}), 500
        
        # Get parameters
        if request.method == 'GET':
            date_str = request.args.get('date')
            export_cloud = request.args.get('export', 'false').lower() == 'true'
            threshold = float(request.args.get('threshold', '0.35'))
        else:
            data = request.get_json() or {}
            date_str = data.get('date')
            export_cloud = data.get('export', False)
            threshold = float(data.get('threshold', 0.35))
        
        # Validate date
        if not date_str:
            return jsonify({'error': 'Missing date parameter (YYYY-MM-DD)'}), 400
        
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        # Get configuration
        model_asset = os.environ.get('BEACHED_MODEL_ASSET')
        
        logger.info(f"Processing beached detection for date: {date_str}")
        
        # Initialize Earth Engine if not already done
        if not hasattr(app, 'ee_initialized'):
            if not initialize_earth_engine():
                return jsonify({'error': 'Failed to initialize Earth Engine'}), 500
            app.ee_initialized = True
        
        # Initialize detector
        detector = BeachedSargassumDetector(model_asset=model_asset)
        detector.detection_threshold = threshold
        
        # Run detection
        results = detector.detect_beached_sargassum(
            target_date=date_str,
            export_assets=export_cloud
        )
        
        # Generate summary
        summary = detector.get_detection_summary(results)
        
        response = {
            'status': 'success',
            'date': date_str,
            'detection_summary': summary,
            'threshold': threshold,
            'export_requested': export_cloud,
            'model_asset': model_asset,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Add export task IDs if cloud export was requested
        if export_cloud and hasattr(results, 'export_tasks'):
            response['export_task_ids'] = results.export_tasks
        
        logger.info(f"Successfully completed beached detection for {date_str}")
        logger.info(f"Summary: {summary}")
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Beached detection failed: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

@app.route('/status/<task_id>')
def get_task_status(task_id):
    """Get status of an Earth Engine task."""
    try:
        if not hasattr(app, 'ee_initialized'):
            return jsonify({'error': 'Earth Engine not initialized'}), 500
        
        # Get task status
        task = ee.batch.Task.status(task_id)
        
        return jsonify({
            'task_id': task_id,
            'status': task,
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Failed to get task status: {e}")
        return jsonify({
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)