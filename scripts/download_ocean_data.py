#!/usr/bin/env python3
"""
Download ocean current and wind data as local NetCDF files.

Uses HYCOM NCSS (NetCDF Subset Service) and GFS from NOMADS to download
data subsets for the Ghana ROI.  These local files are then passed to
OpenDrift, avoiding unreliable OPeNDAP connections from CI runners.

Usage:
    python scripts/download_ocean_data.py \
        --date 2026-03-02 --hours 72 \
        --out-dir data/ocean \
        --verbose
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlretrieve, Request, urlopen
from urllib.error import URLError, HTTPError
import json
import time

logger = logging.getLogger(__name__)

# Ghana ROI with generous padding for drift trajectories
ROI = {
    'north': 8.0,
    'south': 2.0,
    'west': -6.0,
    'east': 3.0,
}


# ---------------------------------------------------------------------------
# HYCOM ocean currents
# ---------------------------------------------------------------------------

def download_hycom(date_str: str, hours: int, out_dir: Path) -> str | None:
    """
    Download HYCOM ocean currents as NetCDF via NCSS (subset service).

    Args:
        date_str: Forecast start date (YYYY-MM-DD)
        hours: Forecast duration in hours
        out_dir: Output directory

    Returns:
        Path to downloaded NetCDF file, or None on failure
    """
    start = datetime.strptime(date_str, '%Y-%m-%d')
    end = start + timedelta(hours=hours + 24)  # pad 24h

    # HYCOM NCSS endpoint — subset download (NOT OPeNDAP)
    base = 'https://tds.hycom.org/thredds/ncss/GLBy0.08/latest'
    params = {
        'var': ['water_u', 'water_v'],
        'north': ROI['north'],
        'south': ROI['south'],
        'east': ROI['east'],
        'west': ROI['west'],
        'disableProjSubset': 'on',
        'horizStride': 2,          # ~18 km resolution (save bandwidth)
        'time_start': start.strftime('%Y-%m-%dT00:00:00Z'),
        'time_end': end.strftime('%Y-%m-%dT00:00:00Z'),
        'timeStride': 3,           # every 9 hours
        'vertCoord': 0,            # surface only
        'addLatLon': 'true',
        'accept': 'netcdf',
    }

    # Build URL
    query_parts = []
    for k, v in params.items():
        if isinstance(v, list):
            for item in v:
                query_parts.append(f'var={item}')
        else:
            query_parts.append(f'{k}={v}')
    url = f'{base}?{"&".join(query_parts)}'

    out_file = out_dir / f'hycom_{date_str}.nc'

    logger.info(f'Downloading HYCOM currents for {date_str} ({hours}h)...')
    logger.debug(f'URL: {url}')

    for attempt in range(3):
        try:
            req = Request(url, headers={'User-Agent': 'SARTRAC/1.0'})
            with urlopen(req, timeout=120) as resp:
                data = resp.read()

            if len(data) < 1000:
                logger.warning(f'HYCOM response too small ({len(data)} bytes), attempt {attempt + 1}')
                time.sleep(5)
                continue

            out_file.write_bytes(data)
            size_mb = len(data) / 1024 / 1024
            logger.info(f'HYCOM downloaded: {out_file} ({size_mb:.1f} MB)')
            return str(out_file)

        except (URLError, HTTPError, TimeoutError, OSError) as e:
            logger.warning(f'HYCOM download attempt {attempt + 1} failed: {e}')
            time.sleep(5 * (attempt + 1))

    logger.error('HYCOM download failed after 3 attempts')
    return None


# ---------------------------------------------------------------------------
# GFS winds
# ---------------------------------------------------------------------------

def download_gfs(date_str: str, hours: int, out_dir: Path) -> str | None:
    """
    Download GFS wind data as GRIB2 from NOMADS.

    Falls back to previous cycle if current isn't available yet.

    Args:
        date_str: Forecast start date (YYYY-MM-DD)
        hours: Forecast duration in hours
        out_dir: Output directory

    Returns:
        Path to downloaded GRIB file, or None on failure
    """
    start = datetime.strptime(date_str, '%Y-%m-%d')
    out_file = out_dir / f'gfs_{date_str}.grb2'

    # Try current day 00z, then yesterday 12z, then yesterday 00z
    cycles = [
        (start, '00'),
        (start - timedelta(days=1), '12'),
        (start - timedelta(days=1), '00'),
    ]

    for cycle_date, cycle_hour in cycles:
        ds = cycle_date.strftime('%Y%m%d')
        # GFS filter service — download only u/v winds at 10m for our subregion
        base = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl'

        # Download a few forecast hours to cover our time range
        forecast_hours = list(range(0, min(hours + 24, 120), 6))
        downloaded_any = False

        for fhr in forecast_hours[:1]:  # Just get analysis (f000) for simplicity
            params = {
                'file': f'gfs.t{cycle_hour}z.pgrb2.0p25.f{fhr:03d}',
                'lev_10_m_above_ground': 'on',
                'var_UGRD': 'on',
                'var_VGRD': 'on',
                'subregion': '',
                'leftlon': ROI['west'],
                'rightlon': ROI['east'],
                'toplat': ROI['north'],
                'bottomlat': ROI['south'],
                'dir': f'/gfs.{ds}/{cycle_hour}/atmos',
            }
            query = '&'.join(f'{k}={v}' for k, v in params.items())
            url = f'{base}?{query}'

            logger.debug(f'GFS URL: {url}')

            try:
                req = Request(url, headers={'User-Agent': 'SARTRAC/1.0'})
                with urlopen(req, timeout=60) as resp:
                    data = resp.read()

                if len(data) < 500:
                    logger.debug(f'GFS {ds}/{cycle_hour}z f{fhr:03d} too small, skipping')
                    continue

                out_file.write_bytes(data)
                size_kb = len(data) / 1024
                logger.info(f'GFS downloaded: {out_file} ({size_kb:.0f} KB) — cycle {ds}/{cycle_hour}z')
                return str(out_file)

            except (URLError, HTTPError, TimeoutError, OSError) as e:
                logger.debug(f'GFS {ds}/{cycle_hour}z failed: {e}')
                continue

    logger.error('GFS download failed — all cycles attempted')
    return None


# ---------------------------------------------------------------------------
# Copernicus Marine (CMEMS) — alternative current source
# ---------------------------------------------------------------------------

def download_cmems(date_str: str, hours: int, out_dir: Path) -> str | None:
    """
    Try downloading currents from Copernicus Marine Service via their
    public data store (no credentials needed for some datasets).

    Uses the GLORYS daily reanalysis or IBI analysis/forecast.
    """
    try:
        import xarray as xr

        start = datetime.strptime(date_str, '%Y-%m-%d')
        end = start + timedelta(hours=hours)

        # Copernicus Marine public OPeNDAP for GLORYS12V1
        url = (
            'https://nrt.cmems-du.eu/thredds/dodsC/'
            'cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i'
        )

        logger.info(f'Trying Copernicus Marine currents: {url}')

        ds = xr.open_dataset(url)
        subset = ds.sel(
            latitude=slice(ROI['south'], ROI['north']),
            longitude=slice(ROI['west'], ROI['east']),
            time=slice(start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')),
            depth=0.494,  # surface
            method='nearest',
        )[['uo', 'vo']]

        out_file = out_dir / f'cmems_{date_str}.nc'
        subset.to_netcdf(str(out_file))
        size_mb = out_file.stat().st_size / 1024 / 1024
        logger.info(f'CMEMS downloaded: {out_file} ({size_mb:.1f} MB)')
        return str(out_file)

    except Exception as e:
        logger.debug(f'CMEMS download failed: {e}')
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Download ocean data for drift forecasting')
    parser.add_argument('--date', required=True, help='Forecast date YYYY-MM-DD')
    parser.add_argument('--hours', type=int, default=72, help='Forecast duration hours')
    parser.add_argument('--out-dir', default='data/ocean', help='Output directory')
    parser.add_argument('--verbose', '-v', action='store_true')
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
    )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    results = {}

    # --- Currents: try HYCOM first, then CMEMS ---
    currents_file = download_hycom(args.date, args.hours, out_dir)
    if not currents_file:
        logger.info('HYCOM failed, trying Copernicus Marine...')
        currents_file = download_cmems(args.date, args.hours, out_dir)

    results['currents_file'] = currents_file or ''

    # --- Winds: try GFS ---
    winds_file = download_gfs(args.date, args.hours, out_dir)
    results['winds_file'] = winds_file or ''

    # --- Summary ---
    if currents_file:
        logger.info(f'✓ Currents: {currents_file}')
    else:
        logger.warning('✗ No currents data — forecast will use fallback constants')

    if winds_file:
        logger.info(f'✓ Winds: {winds_file}')
    else:
        logger.warning('✗ No winds data — forecast will use fallback constants')

    # Write results as env vars for GitHub Actions
    github_env = os.environ.get('GITHUB_ENV')
    if github_env:
        with open(github_env, 'a') as f:
            f.write(f'CURRENTS_FILE={results["currents_file"]}\n')
            f.write(f'WINDS_FILE={results["winds_file"]}\n')
        logger.info('Wrote CURRENTS_FILE and WINDS_FILE to GITHUB_ENV')

    # Also write to stdout as JSON for local use
    print(json.dumps(results))
    return 0 if currents_file else 1


if __name__ == '__main__':
    sys.exit(main())
