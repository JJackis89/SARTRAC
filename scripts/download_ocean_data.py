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
# GFS winds — download as NetCDF via THREDDS NCSS
# ---------------------------------------------------------------------------

def download_gfs(date_str: str, hours: int, out_dir: Path) -> str | None:
    """
    Download GFS 10-m wind data as NetCDF via UCAR THREDDS NCSS.

    Uses the NetCDF Subset Service to get CF-compliant NetCDF that
    OpenDrift's reader_netCDF_CF_generic can read directly.

    Falls back to NCEP reanalysis winds if GFS is unavailable.

    Args:
        date_str: Forecast start date (YYYY-MM-DD)
        hours: Forecast duration in hours
        out_dir: Output directory

    Returns:
        Path to downloaded NetCDF file, or None on failure
    """
    start = datetime.strptime(date_str, '%Y-%m-%d')
    end = start + timedelta(hours=hours + 24)
    out_file = out_dir / f'gfs_winds_{date_str}.nc'

    # --- Method 1: UCAR THREDDS NCSS (NetCDF format) ---
    # This gives us CF-compliant NetCDF that OpenDrift can read directly
    base = 'https://thredds.ucar.edu/thredds/ncss/grib/NCEP/GFS/Global_0p25deg/Best'
    params = {
        'var': ['u-component_of_wind_height_above_ground',
                'v-component_of_wind_height_above_ground'],
        'north': ROI['north'],
        'south': ROI['south'],
        'east': ROI['east'],
        'west': ROI['west'],
        'disableProjSubset': 'on',
        'horizStride': 4,           # ~1° resolution (save bandwidth)
        'time_start': start.strftime('%Y-%m-%dT00:00:00Z'),
        'time_end': end.strftime('%Y-%m-%dT00:00:00Z'),
        'timeStride': 2,            # every other time step
        'vertCoord': 10,            # 10m above ground
        'addLatLon': 'true',
        'accept': 'netcdf',
    }

    query_parts = []
    for k, v in params.items():
        if isinstance(v, list):
            for item in v:
                query_parts.append(f'var={item}')
        else:
            query_parts.append(f'{k}={v}')
    url = f'{base}?{"&".join(query_parts)}'

    logger.info(f'Downloading GFS winds (THREDDS NCSS) for {date_str} ({hours}h)...')
    logger.debug(f'URL: {url}')

    for attempt in range(2):
        try:
            req = Request(url, headers={'User-Agent': 'SARTRAC/1.0'})
            with urlopen(req, timeout=90) as resp:
                data = resp.read()

            if len(data) < 1000:
                logger.warning(f'GFS THREDDS response too small ({len(data)} bytes)')
                break

            out_file.write_bytes(data)
            size_kb = len(data) / 1024
            logger.info(f'GFS winds downloaded: {out_file} ({size_kb:.0f} KB)')
            return str(out_file)

        except (URLError, HTTPError, TimeoutError, OSError) as e:
            logger.warning(f'GFS THREDDS attempt {attempt + 1} failed: {e}')
            time.sleep(5)

    # --- Method 2: NCEP reanalysis winds via xarray OPeNDAP ---
    logger.info('GFS THREDDS failed, trying NCEP reanalysis winds...')
    try:
        import xarray as xr
        ncep_url = 'https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis2/gaussian_grid/uwnd.10m.gauss.latest.nc'
        ds = xr.open_dataset(ncep_url)
        subset = ds.sel(
            lat=slice(ROI['north'], ROI['south']),
            lon=slice(360 + ROI['west'], 360 + ROI['east']),  # NCEP uses 0-360 lon
        )
        ncep_out = out_dir / f'ncep_winds_{date_str}.nc'
        subset.to_netcdf(str(ncep_out))
        logger.info(f'NCEP reanalysis winds downloaded: {ncep_out}')
        return str(ncep_out)
    except Exception as e:
        logger.debug(f'NCEP reanalysis failed: {e}')

    logger.error('All wind download methods failed')
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
# Validation
# ---------------------------------------------------------------------------

def validate_netcdf(filepath: str) -> bool:
    """Quick check that a NetCDF file opens and has data variables."""
    try:
        import netCDF4
        with netCDF4.Dataset(filepath, 'r') as ds:
            if len(ds.variables) < 2:
                logger.warning(f'NetCDF has only {len(ds.variables)} variables: {list(ds.variables)}')
                return False
            logger.debug(f'Validated NetCDF: {filepath} — vars: {list(ds.variables.keys())}')
            return True
    except ImportError:
        # netCDF4 not available, skip validation
        return True
    except Exception as e:
        logger.warning(f'NetCDF validation failed for {filepath}: {e}')
        return False


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
    if currents_file and not validate_netcdf(currents_file):
        logger.warning('HYCOM file failed validation, discarding')
        currents_file = None
    if not currents_file:
        logger.info('HYCOM failed, trying Copernicus Marine...')
        currents_file = download_cmems(args.date, args.hours, out_dir)

    results['currents_file'] = currents_file or ''

    # --- Winds: try GFS (THREDDS NCSS → NCEP reanalysis) ---
    winds_file = download_gfs(args.date, args.hours, out_dir)
    if winds_file and winds_file.endswith('.nc') and not validate_netcdf(winds_file):
        logger.warning('GFS winds file failed validation, discarding')
        winds_file = None
    results['winds_file'] = winds_file or ''

    # --- Summary ---
    success_count = sum(1 for v in results.values() if v)
    logger.info(f'Download complete: {success_count}/2 datasets obtained')
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
