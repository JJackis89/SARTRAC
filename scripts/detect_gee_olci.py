#!/usr/bin/env python3
"""
Detect Sargassum from Sentinel-3 OLCI via Google Earth Engine.

Computes AFAI (Alternative Floating Algae Index) and MCI (Maximum
Chlorophyll Index) from OLCI Level-1 TOA radiance bands available in
the GEE catalog (COPERNICUS/S3/OLCI).

OLCI band mapping (centre wavelengths):
  Oa08_radiance → 665 nm     Oa10_radiance → 681 nm
  Oa11_radiance → 709 nm     Oa12_radiance → 754 nm
  Oa17_radiance → 865 nm     Oa21_radiance → 1020 nm

Requires:
  - earthengine-api  (pip install earthengine-api)
  - EE_SERVICE_ACCOUNT + EE_PRIVATE_KEY env vars  (CI), or user auth (local)
"""

import argparse
import json
import logging
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# GEE helpers
# ---------------------------------------------------------------------------

def _authenticate_ee():
    """
    Authenticate & initialise Earth Engine.
    Tries (in order): service-account env vars → default credentials.
    """
    import ee

    sa = os.getenv('EE_SERVICE_ACCOUNT')
    pk = os.getenv('EE_PRIVATE_KEY')

    if sa and pk:
        # Write private key to temp file (GH Actions stores it as a secret)
        key_file = Path(tempfile.gettempdir()) / 'ee_key.json'
        # If the secret is the raw JSON
        if pk.strip().startswith('{'):
            key_file.write_text(pk)
        else:
            # Assume it's the key string itself — wrap it
            key_file.write_text(json.dumps({
                'type': 'service_account',
                'client_email': sa,
                'private_key': pk.replace('\\n', '\n'),
                'token_uri': 'https://oauth2.googleapis.com/token',
            }))
        credentials = ee.ServiceAccountCredentials(sa, str(key_file))
        ee.Initialize(credentials)
        logger.info('Authenticated with service account')
    else:
        ee.Initialize()
        logger.info('Authenticated with default credentials')


def _build_roi(ee_module):
    """Create Ghana 0-20 nm offshore band geometry."""
    ee = ee_module
    countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
    ghana = countries.filter(ee.Filter.eq('country_na', 'Ghana'))
    buffered = ghana.geometry().buffer(37_040)          # 20 nm ≈ 37.04 km
    offshore = buffered.difference(ghana.geometry())
    bounds = ee.Geometry.Rectangle([-4.5, 3.0, 2.5, 7.0])
    return offshore.intersection(bounds)


# ---------------------------------------------------------------------------
# OLCI index computation
# ---------------------------------------------------------------------------

def detect_olci(date_str: str, lookback: int = 3) -> dict:
    """
    Run AFAI + MCI detection on Sentinel-3 OLCI for *date_str*.
    If no images found, tries up to *lookback* days back.

    Uses COPERNICUS/S3/OLCI (Level-1 TOA radiance).
    Returns a GeoJSON FeatureCollection dict with detection centroids.
    """
    import ee
    _authenticate_ee()

    roi = _build_roi(ee)

    for offset in range(lookback + 1):
        from datetime import timedelta
        check_date = datetime.strptime(date_str, '%Y-%m-%d') - timedelta(days=offset)
        check_str = check_date.strftime('%Y-%m-%d')
        start = ee.Date(check_str)
        end = start.advance(1, 'day')

        col = (ee.ImageCollection('COPERNICUS/S3/OLCI')
               .filterDate(start, end)
               .filterBounds(roi))

        count = col.size().getInfo()
        logger.info(f'OLCI images for {check_str}: {count}')

        if count > 0:
            break
    else:
        logger.warning(f'No OLCI images found in {lookback+1} days — returning empty collection')
        return _empty_fc(date_str)

    # Quality mask — use quality_flags band
    def quality_mask(img):
        qf = img.select('quality_flags').toInt()
        # Bit 27 = land, Bit 24 = invalid, Bit 25 = bright (cloud/glint)
        land    = qf.bitwiseAnd(1 << 27).eq(0)
        invalid = qf.bitwiseAnd(1 << 24).eq(0)
        bright  = qf.bitwiseAnd(1 << 25).eq(0)
        mask = land.And(invalid).And(bright)

        # Require positive radiance in key bands
        for band in ['Oa08_radiance', 'Oa10_radiance', 'Oa11_radiance',
                      'Oa12_radiance', 'Oa17_radiance', 'Oa21_radiance']:
            mask = mask.And(img.select(band).gt(0))

        return img.updateMask(mask)

    col = col.map(quality_mask)

    # AFAI = L_865 − baseline(L_665, L_1020)
    # Using radiance: same spectral shape analysis, thresholds scaled
    def compute_afai(img):
        r665  = img.select('Oa08_radiance')   # 665 nm
        r865  = img.select('Oa17_radiance')   # 865 nm
        r1020 = img.select('Oa21_radiance')   # 1020 nm
        weight = (865.0 - 665.0) / (1020.0 - 665.0)
        baseline = r665.add(r1020.subtract(r665).multiply(weight))
        return r865.subtract(baseline).rename('afai')

    # MCI = L_709 − baseline(L_681, L_754)
    def compute_mci(img):
        r681 = img.select('Oa10_radiance')   # 681 nm
        r709 = img.select('Oa11_radiance')   # 709 nm
        r754 = img.select('Oa12_radiance')   # 754 nm
        weight = (709.0 - 681.0) / (754.0 - 681.0)
        baseline = r681.add(r754.subtract(r681).multiply(weight))
        return r709.subtract(baseline).rename('mci')

    afai_max = col.map(compute_afai).max().clip(roi)
    mci_max  = col.map(compute_mci).max().clip(roi)

    # Radiance-based thresholds (empirical; radiance units ~mW/m²/sr/nm)
    # AFAI > 2.0 or MCI > 1.0 indicates floating vegetation
    detect = afai_max.gte(2.0).Or(mci_max.gte(1.0)).rename('detect')

    # Vectorise detection pixels → centroids
    vectors = (detect.selfMask()
               .reduceToVectors(
                   geometry=roi,
                   scale=300,
                   maxPixels=1e9,
                   geometryType='centroid',
                   eightConnected=False,
               ))

    vectors = vectors.map(lambda f: f.set({
        'date': date_str,
        'source': 'gee_olci_afai_mci',
        'afai_threshold': 2.0,
        'mci_threshold': 1.0,
    }))

    n = vectors.size().getInfo()
    logger.info(f'GEE OLCI detections: {n}')

    if n == 0:
        return _empty_fc(date_str)

    # Pull GeoJSON to local (server-side → client)
    geojson = vectors.getInfo()
    geojson['properties'] = {
        'date': date_str,
        'source': 'gee_olci_afai_mci',
        'image_count': count,
    }
    return geojson


def _empty_fc(date_str: str) -> dict:
    return {
        'type': 'FeatureCollection',
        'features': [],
        'properties': {'date': date_str, 'source': 'gee_olci_afai_mci', 'count': 0},
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='GEE OLCI AFAI/MCI Sargassum detection')
    parser.add_argument('--date', required=True, help='YYYY-MM-DD')
    parser.add_argument('--out', required=True, help='Output GeoJSON path')
    parser.add_argument('--lookback', type=int, default=3, help='Days to look back if no data')
    parser.add_argument('--verbose', '-v', action='store_true')
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
    )

    datetime.strptime(args.date, '%Y-%m-%d')  # validate

    geojson = detect_olci(args.date, lookback=args.lookback)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(geojson, indent=2))
    logger.info(f'Wrote {len(geojson["features"])} features → {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
