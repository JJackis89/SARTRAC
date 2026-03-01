#!/usr/bin/env python3
"""
validate_forecast.py — Compare a past forecast against later satellite observations.

For a given forecast date D, finds the detection data from date D+N (where N is the
forecast horizon in days) and measures spatial overlap / accuracy.

Metrics produced:
  • hit_rate (recall): fraction of forecast particles within 0.3° of an actual detection
  • false_alarm_rate: fraction of forecast particles NOT near any real detection
  • miss_rate: fraction of detections NOT predicted by the forecast
  • mean_distance_km: average distance from each detection to the nearest forecast particle
  • spatial_correlation: Jaccard-like metric on 0.1° grid cells

Usage:
  python scripts/validate_forecast.py \
      --forecast outputs/forecast_2025-03-01_3d.geojson \
      --observations data/merged_detections_2025-03-04.geojson \
      --out outputs/accuracy_2025-03-01_3d.json \
      --verbose
"""

import argparse
import json
import logging
import math
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(min(1.0, math.sqrt(a)))


def _extract_coords(fc):
    """Return list of (lon, lat) from a GeoJSON FeatureCollection."""
    coords = []
    for feat in fc.get("features", []):
        geom = feat.get("geometry", {})
        if geom.get("type") == "Point":
            c = geom["coordinates"]
            coords.append((c[0], c[1]))
    return coords


def _grid_cells(coords, resolution=0.1):
    """Return set of grid cell keys for given coords."""
    cells = set()
    for lon, lat in coords:
        cells.add((round(lon / resolution), round(lat / resolution)))
    return cells


def validate(forecast_path: str, observations_path: str, proximity_km: float = 30.0) -> dict:
    """
    Compare forecast against observations and return accuracy metrics.
    """
    with open(forecast_path) as f:
        fc_forecast = json.load(f)
    with open(observations_path) as f:
        fc_obs = json.load(f)

    pred = _extract_coords(fc_forecast)
    obs = _extract_coords(fc_obs)

    logger.info(f"Forecast particles: {len(pred)}  Observations: {len(obs)}")

    if not pred or not obs:
        return {
            "forecast_particles": len(pred),
            "observation_points": len(obs),
            "hit_rate": None,
            "false_alarm_rate": None,
            "miss_rate": None,
            "mean_distance_km": None,
            "spatial_correlation": None,
            "status": "insufficient_data",
        }

    # For each forecast particle, find nearest observation
    hits = 0
    for plon, plat in pred:
        min_dist = min(_haversine_km(plat, plon, olat, olon) for olon, olat in obs)
        if min_dist <= proximity_km:
            hits += 1

    hit_rate = hits / len(pred) if pred else 0
    false_alarm_rate = 1 - hit_rate

    # For each observation, find nearest forecast particle
    obs_hits = 0
    dists = []
    for olon, olat in obs:
        min_dist = min(_haversine_km(olat, olon, plat, plon) for plon, plat in pred)
        dists.append(min_dist)
        if min_dist <= proximity_km:
            obs_hits += 1

    miss_rate = 1 - (obs_hits / len(obs)) if obs else 0
    mean_dist = sum(dists) / len(dists) if dists else 0

    # Grid-based spatial correlation (Jaccard index)
    pred_cells = _grid_cells(pred)
    obs_cells = _grid_cells(obs)
    intersection = pred_cells & obs_cells
    union = pred_cells | obs_cells
    spatial_corr = len(intersection) / len(union) if union else 0

    return {
        "forecast_particles": len(pred),
        "observation_points": len(obs),
        "hit_rate": round(hit_rate, 4),
        "false_alarm_rate": round(false_alarm_rate, 4),
        "miss_rate": round(miss_rate, 4),
        "mean_distance_km": round(mean_dist, 2),
        "spatial_correlation": round(spatial_corr, 4),
        "proximity_threshold_km": proximity_km,
        "status": "valid",
    }


def main():
    parser = argparse.ArgumentParser(description="Validate Sargassum forecast accuracy")
    parser.add_argument("--forecast", required=True, help="Path to forecast GeoJSON")
    parser.add_argument("--observations", required=True, help="Path to later detections GeoJSON")
    parser.add_argument("--out", required=True, help="Output JSON path for accuracy metrics")
    parser.add_argument("--proximity-km", type=float, default=30.0,
                        help="Distance threshold for a 'hit' (default: 30 km)")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    metrics = validate(args.forecast, args.observations, args.proximity_km)
    metrics["forecast_file"] = str(Path(args.forecast).name)
    metrics["observation_file"] = str(Path(args.observations).name)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(metrics, f, indent=2)

    logger.info(f"Accuracy metrics written to {args.out}")
    logger.info(f"  Hit rate:       {metrics['hit_rate']}")
    logger.info(f"  Miss rate:      {metrics['miss_rate']}")
    logger.info(f"  Spatial corr:   {metrics['spatial_correlation']}")
    logger.info(f"  Mean dist (km): {metrics['mean_distance_km']}")


if __name__ == "__main__":
    main()
