#!/usr/bin/env python3
"""
Render static map for visual QA of Sargassum detections and forecast.
Optional script for quick visualization.
"""

import argparse
import logging
import sys
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.colors import ListedColormap
import contextily as ctx

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def create_map(roi_path, detections_paths=None, forecast_path=None, output_path=None, title=None):
    """
    Create static map with ROI, detections, and forecast.
    
    Args:
        roi_path: Path to ROI GeoJSON
        detections_paths: List of detection GeoJSON paths
        forecast_path: Path to forecast GeoJSON
        output_path: Output PNG path
        title: Map title
    """
    try:
        fig, ax = plt.subplots(figsize=(12, 10))
        
        # Load and plot ROI
        roi = gpd.read_file(roi_path)
        roi_bounds = roi.total_bounds
        
        # Plot ROI outline
        roi.boundary.plot(ax=ax, color='navy', linewidth=2, alpha=0.8, label='20nm Offshore Band')
        
        # Plot detections if provided
        colors = ['red', 'orange', 'yellow']
        if detections_paths:
            for i, det_path in enumerate(detections_paths):
                if Path(det_path).exists():
                    try:
                        det_gdf = gpd.read_file(det_path)
                        if not det_gdf.empty:
                            color = colors[i % len(colors)]
                            det_gdf.plot(ax=ax, color=color, markersize=30, alpha=0.7, 
                                       label=f'Detections {Path(det_path).stem}')
                            logger.info(f"Plotted {len(det_gdf)} detections from {det_path}")
                    except Exception as e:
                        logger.warning(f"Failed to plot detections from {det_path}: {e}")
        
        # Plot forecast if provided
        if forecast_path and Path(forecast_path).exists():
            try:
                forecast_gdf = gpd.read_file(forecast_path)
                if not forecast_gdf.empty:
                    forecast_gdf.plot(ax=ax, color='blue', markersize=10, alpha=0.6, 
                                    label='Forecast Particles')
                    logger.info(f"Plotted {len(forecast_gdf)} forecast particles")
            except Exception as e:
                logger.warning(f"Failed to plot forecast: {e}")
        
        # Set map extent with some padding
        padding = 0.5  # degrees
        ax.set_xlim(roi_bounds[0] - padding, roi_bounds[2] + padding)
        ax.set_ylim(roi_bounds[1] - padding, roi_bounds[3] + padding)
        
        # Add basemap
        try:
            # Convert to Web Mercator for basemap
            roi_mercator = roi.to_crs('EPSG:3857')
            
            # Add contextily basemap
            ctx.add_basemap(ax, crs=roi.crs, source=ctx.providers.OpenStreetMap.Mapnik, alpha=0.7)
            
        except Exception as e:
            logger.warning(f"Failed to add basemap: {e}")
            # Add simple grid background
            ax.grid(True, alpha=0.3)
        
        # Formatting
        ax.set_xlabel('Longitude')
        ax.set_ylabel('Latitude')
        
        if title:
            ax.set_title(title, fontsize=14, fontweight='bold')
        else:
            ax.set_title('Ghana Sargassum Detection and Forecast', fontsize=14, fontweight='bold')
        
        # Add legend
        ax.legend(loc='upper right', framealpha=0.9)
        
        # Add north arrow and scale (simplified)
        ax.text(0.02, 0.98, 'N ↑', transform=ax.transAxes, fontsize=12, 
                verticalalignment='top', bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        
        # Tight layout
        plt.tight_layout()
        
        # Save if output path provided
        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            plt.savefig(output_path, dpi=300, bbox_inches='tight')
            logger.info(f"Saved map to {output_path}")
        
        # Don't try to show in headless CI environments
        import os
        if os.environ.get('DISPLAY') or sys.platform == 'win32':
            plt.show()
        
        plt.close()
        
    except Exception as e:
        logger.error(f"Failed to create map: {e}")
        raise

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Render static map for QA')
    parser.add_argument('--roi', required=True, help='ROI GeoJSON file')
    parser.add_argument('--detections', nargs='*', help='Detection GeoJSON files')
    parser.add_argument('--forecast', help='Forecast GeoJSON file')
    parser.add_argument('--out', help='Output PNG file')
    parser.add_argument('--title', help='Map title')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        logger.info("Creating map visualization")
        
        create_map(
            roi_path=args.roi,
            detections_paths=args.detections or [],
            forecast_path=args.forecast,
            output_path=args.out,
            title=args.title
        )
        
        logger.info("Map rendering completed")
        return 0
        
    except Exception as e:
        logger.error(f"Map rendering failed: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())