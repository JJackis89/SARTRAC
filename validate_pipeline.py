#!/usr/bin/env python3
"""
Validate pipeline outputs and create summary report
"""
import json
import logging
from pathlib import Path
from datetime import datetime

def validate_roi(roi_file):
    """Validate ROI GeoJSON file"""
    try:
        with open(roi_file, 'r') as f:
            data = json.load(f)
        
        # Check structure
        assert data['type'] == 'FeatureCollection'
        assert len(data['features']) > 0
        assert data['features'][0]['geometry']['type'] == 'Polygon'
        
        # Get bounds
        coords = data['features'][0]['geometry']['coordinates'][0]
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        
        result = {
            'valid': True,
            'feature_count': len(data['features']),
            'bounds': {
                'west': min(lons),
                'east': max(lons),
                'south': min(lats),
                'north': max(lats)
            }
        }
        
        logging.info(f"✓ ROI valid: {result['feature_count']} features")
        return result
        
    except Exception as e:
        logging.error(f"✗ ROI invalid: {e}")
        return {'valid': False, 'error': str(e)}

def validate_detections(detection_file):
    """Validate detection GeoJSON file"""
    try:
        with open(detection_file, 'r') as f:
            data = json.load(f)
        
        # Check structure
        assert data['type'] == 'FeatureCollection'
        assert 'metadata' in data
        assert len(data['features']) > 0
        
        # Check detection features
        for feature in data['features']:
            assert feature['geometry']['type'] == 'Point'
            assert 'detection_value' in feature['properties']
            assert 'confidence' in feature['properties']
        
        result = {
            'valid': True,
            'detection_count': len(data['features']),
            'date': data['metadata']['date'],
            'threshold': data['metadata']['threshold'],
            'avg_confidence': round(sum(f['properties']['confidence'] for f in data['features']) / len(data['features']), 3)
        }
        
        logging.info(f"✓ Detections valid: {result['detection_count']} detections, avg confidence {result['avg_confidence']}")
        return result
        
    except Exception as e:
        logging.error(f"✗ Detections invalid: {e}")
        return {'valid': False, 'error': str(e)}

def validate_forecast(forecast_file):
    """Validate forecast GeoJSON file"""
    try:
        with open(forecast_file, 'r') as f:
            data = json.load(f)
        
        # Check structure
        assert data['type'] == 'FeatureCollection'
        assert 'metadata' in data
        assert len(data['features']) > 0
        
        # Check forecast features
        for feature in data['features']:
            assert feature['geometry']['type'] == 'LineString'
            assert 'forecast_hours' in feature['properties']
            assert 'total_drift_km' in feature['properties']
        
        # Calculate stats
        drift_distances = [f['properties']['total_drift_km'] for f in data['features']]
        
        result = {
            'valid': True,
            'trajectory_count': len(data['features']),
            'forecast_hours': data['metadata']['forecast_hours'],
            'avg_drift_km': round(sum(drift_distances) / len(drift_distances), 2),
            'max_drift_km': max(drift_distances),
            'min_drift_km': min(drift_distances)
        }
        
        logging.info(f"✓ Forecast valid: {result['trajectory_count']} trajectories, {result['forecast_hours']}h duration")
        return result
        
    except Exception as e:
        logging.error(f"✗ Forecast invalid: {e}")
        return {'valid': False, 'error': str(e)}

def create_pipeline_report(roi_result, detection_result, forecast_result, output_file):
    """Create comprehensive pipeline validation report"""
    
    report = {
        "pipeline_validation": {
            "timestamp": datetime.now().isoformat(),
            "overall_status": "PASS" if all(r.get('valid', False) for r in [roi_result, detection_result, forecast_result]) else "FAIL",
            "components": {
                "roi_generation": roi_result,
                "sargassum_detection": detection_result,
                "drift_forecast": forecast_result
            },
            "summary": {
                "roi_bounds": roi_result.get('bounds', {}),
                "detection_count": detection_result.get('detection_count', 0),
                "trajectory_count": forecast_result.get('trajectory_count', 0),
                "forecast_duration_hours": forecast_result.get('forecast_hours', 0)
            }
        }
    }
    
    # Write report
    with open(output_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    return report

def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    logging.info("Validating Ghana Sargassum Pipeline Components")
    logging.info("=" * 50)
    
    # Validate components
    roi_result = validate_roi('data/test_roi.geojson')
    detection_result = validate_detections('test_detection.geojson') 
    forecast_result = validate_forecast('test_forecast.geojson')
    
    # Create report
    report = create_pipeline_report(roi_result, detection_result, forecast_result, 'pipeline_validation_report.json')
    
    # Print summary
    logging.info("=" * 50)
    logging.info("PIPELINE VALIDATION SUMMARY")
    logging.info("=" * 50)
    
    status = report['pipeline_validation']['overall_status']
    logging.info(f"Overall Status: {status}")
    
    if status == "PASS":
        summary = report['pipeline_validation']['summary']
        logging.info(f"✓ ROI Coverage: {summary['roi_bounds']['west']:.3f},{summary['roi_bounds']['south']:.3f} to {summary['roi_bounds']['east']:.3f},{summary['roi_bounds']['north']:.3f}")
        logging.info(f"✓ Detections Generated: {summary['detection_count']}")
        logging.info(f"✓ Trajectories Generated: {summary['trajectory_count']}")
        logging.info(f"✓ Forecast Duration: {summary['forecast_duration_hours']} hours")
        logging.info("")
        logging.info("🎉 Pipeline validation SUCCESSFUL! All components working correctly.")
        logging.info("📄 Detailed report saved to: pipeline_validation_report.json")
    else:
        logging.error("❌ Pipeline validation FAILED. Check individual component errors above.")
    
    return 0 if status == "PASS" else 1

if __name__ == "__main__":
    exit(main())