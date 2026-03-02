#!/usr/bin/env python3
"""
Inject CoastSnap ground-truth monitoring locations as supplementary
seed points into the merged-detections GeoJSON.

These are physical monitoring stations where sargassum beaching has been
confirmed.  Satellite detection (ERDDAP chlorophyll-a proxy) often misses
the Western Region of Ghana due to cloud cover, algorithm sensitivity,
or nearshore turbidity.  Adding these points ensures the drift forecast
always covers known beaching hotspots.

The points carry a lower confidence than satellite detections and are
tagged with source='coastsnap_ground_truth' so downstream consumers
can distinguish them.

Usage (standalone):
    python scripts/inject_coastsnap_seeds.py \
        --detections data/merged_detections_2026-03-02.geojson \
        --out data/merged_detections_2026-03-02.geojson

Usage in pipeline: called between "Merge detections" and "Run drift forecasts".
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ── CoastSnap monitoring points (from KML data) ─────────────────────
# Coordinates are [lon, lat] (GeoJSON order).
# Each point is placed ~1-3 km offshore (seaward of the beaching zone)
# so the drift model seeds in water, not on the beach itself.
COASTSNAP_SEEDS = [
    {"name": "BEYIN",        "lon": -2.591, "lat": 4.975},
    {"name": "EGBAZO",       "lon": -2.796, "lat": 5.018},
    {"name": "ESIAMA",       "lon": -2.352, "lat": 4.920},
    {"name": "JAWAY",        "lon": -2.934, "lat": 5.045},
    {"name": "NEWTOWN",      "lon": -3.098, "lat": 5.078},
    {"name": "PRINCES TOWN", "lon": -2.137, "lat": 4.780},
    {"name": "SANZULE",      "lon": -2.457, "lat": 4.948},
]

# Additional well-known beaching areas in the Western Region that are
# NOT covered by CoastSnap but commonly report sargassum landings.
SUPPLEMENTARY_SEEDS = [
    {"name": "AXIM",              "lon": -2.240, "lat": 4.860},
    {"name": "DIXCOVE",           "lon": -1.960, "lat": 4.780},
    {"name": "CAPE THREE POINTS", "lon": -2.090, "lat": 4.740},
    # Central Region coast — fills the detection gap between lon -1.7 and 0.0
    {"name": "TAKORADI",          "lon": -1.760, "lat": 4.890},
    {"name": "SEKONDI",           "lon": -1.720, "lat": 4.920},
    {"name": "SHAMA",             "lon": -1.620, "lat": 4.950},
    {"name": "KOMENDA",           "lon": -1.490, "lat": 5.020},
    {"name": "ELMINA",            "lon": -1.350, "lat": 5.080},
    {"name": "CAPE COAST",        "lon": -1.250, "lat": 5.100},
    {"name": "MOREE",             "lon": -1.130, "lat": 5.110},
    {"name": "ANOMABO",           "lon": -1.080, "lat": 5.130},
    {"name": "SALTPOND",          "lon": -1.060, "lat": 5.190},
    {"name": "WINNEBA",           "lon": -0.630, "lat": 5.340},
    # Greater Accra coast
    {"name": "TEMA",              "lon":  0.010, "lat": 5.640},
    {"name": "KOKROBITE",         "lon": -0.350, "lat": 5.480},
]


def build_seed_feature(seed: dict, date_str: str) -> dict:
    """Create a GeoJSON Point feature for one seed location."""
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [seed["lon"], seed["lat"]],
        },
        "properties": {
            "value": 0.35,                         # moderate proxy value
            "confidence": 0.70,
            "source": "coastsnap_ground_truth",
            "name": seed["name"],
            "date": date_str,
            "detection_method": "ground_truth_monitoring",
            "note": "Supplementary seed from CoastSnap beaching observation",
        },
    }


def inject_seeds(detections_path: str, output_path: str | None = None,
                 date_str: str | None = None, include_supplementary: bool = True,
                 skip_if_covered: bool = True, coverage_radius_deg: float = 0.08):
    """
    Read an existing merged-detections GeoJSON, add CoastSnap seeds where
    satellite coverage is sparse, and write the result.

    Parameters
    ----------
    detections_path : str
        Path to the existing merged_detections GeoJSON.
    output_path : str, optional
        Output path (defaults to overwriting *detections_path*).
    date_str : str, optional
        Forecast date string (used in feature properties).
    include_supplementary : bool
        Also inject SUPPLEMENTARY_SEEDS (Axim, Dixcove, Cape Three Points).
    skip_if_covered : bool
        If True, skip a seed when a satellite detection already exists
        within *coverage_radius_deg* degrees.
    coverage_radius_deg : float
        Radius (degrees) to check for existing satellite coverage.
    """
    if output_path is None:
        output_path = detections_path

    if date_str is None:
        date_str = datetime.utcnow().strftime("%Y-%m-%d")

    # Load existing detections
    with open(detections_path, "r") as f:
        data = json.load(f)

    features = data.get("features", [])
    existing_count = len(features)

    # Collect existing detection coordinates for coverage check
    existing_coords = []
    for feat in features:
        coords = feat.get("geometry", {}).get("coordinates", [])
        if len(coords) >= 2:
            existing_coords.append((coords[0], coords[1]))

    # Build the full seed list
    all_seeds = list(COASTSNAP_SEEDS)
    if include_supplementary:
        all_seeds.extend(SUPPLEMENTARY_SEEDS)

    added = 0
    skipped = 0

    for seed in all_seeds:
        # Check if satellite already covers this location
        if skip_if_covered and existing_coords:
            covered = any(
                abs(lon - seed["lon"]) < coverage_radius_deg and
                abs(lat - seed["lat"]) < coverage_radius_deg
                for lon, lat in existing_coords
            )
            if covered:
                logger.info(f"  SKIP {seed['name']}: satellite coverage exists within {coverage_radius_deg}°")
                skipped += 1
                continue

        features.append(build_seed_feature(seed, date_str))
        added += 1
        logger.info(f"  ADD  {seed['name']} ({seed['lon']:.3f}, {seed['lat']:.3f})")

    data["features"] = features

    # Update metadata
    meta = data.get("metadata", data.get("properties", {}))
    if meta:
        meta["coastsnap_seeds_added"] = added
        meta["coastsnap_seeds_skipped"] = skipped

    with open(output_path, "w") as f:
        json.dump(data, f)

    logger.info(
        f"Injected {added} CoastSnap seeds (skipped {skipped} with existing coverage). "
        f"Total: {existing_count} → {len(features)}"
    )
    return added


def main():
    parser = argparse.ArgumentParser(
        description="Inject CoastSnap ground-truth seeds into merged detections"
    )
    parser.add_argument("--detections", required=True, help="Merged detections GeoJSON")
    parser.add_argument("--out", default=None, help="Output path (default: overwrite input)")
    parser.add_argument("--date", default=None, help="Forecast date YYYY-MM-DD")
    parser.add_argument("--no-supplementary", action="store_true",
                        help="Only inject the 7 official CoastSnap points")
    parser.add_argument("--force", action="store_true",
                        help="Inject even when satellite already covers the area")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    inject_seeds(
        detections_path=args.detections,
        output_path=args.out,
        date_str=args.date,
        include_supplementary=not args.no_supplementary,
        skip_if_covered=not args.force,
    )


if __name__ == "__main__":
    main()
