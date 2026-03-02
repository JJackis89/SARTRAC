"""Quick diagnostic: check ERDDAP S3A/S3B data availability in the Western Region vs Volta."""
import requests, io, pandas as pd
from datetime import datetime, timedelta

DATASETS = {
    's3a_olci': 'noaacwS3AOLCIchlaDaily',
    's3b_olci': 'noaacwS3BOLCIchlaDaily',
}

REGIONS = {
    'Western (CoastSnap zone)': {'lon': (-3.2, -1.5), 'lat': (4.5, 5.3)},
    'Volta / Eastern':          {'lon': (0.0, 1.5),    'lat': (5.0, 6.2)},
}

base_date = datetime.strptime('2026-03-02', '%Y-%m-%d')

for ds_name, ds_id in DATASETS.items():
    print(f'\n=== {ds_name} ({ds_id}) ===')
    for region_name, bounds in REGIONS.items():
        print(f'\n  Region: {region_name}')
        for offset in range(0, 8):
            date = (base_date - timedelta(days=offset)).strftime('%Y-%m-%d')
            url = (
                f'https://coastwatch.noaa.gov/erddap/griddap/{ds_id}.csv?'
                f'chlor_a[({date}T00:00:00Z)][(0.0)]'
                f'[({bounds["lat"][0]}):1:({bounds["lat"][1]})]'
                f'[({bounds["lon"][0]}):1:({bounds["lon"][1]})]'
            )
            try:
                resp = requests.get(url, timeout=60)
                if resp.status_code != 200:
                    print(f'    {date}: HTTP {resp.status_code}')
                    continue
                lines = resp.text.strip().split('\n')
                if len(lines) < 3:
                    print(f'    {date}: empty response')
                    continue
                data_lines = [lines[0]] + lines[2:]
                df = pd.read_csv(io.StringIO('\n'.join(data_lines)))
                valid = df.dropna(subset=['chlor_a'])
                valid = valid[~valid['chlor_a'].isin([9999, -9999, 99999, -99999])]
                above = valid[valid['chlor_a'] >= 0.3] if len(valid) > 0 else pd.DataFrame()
                pct_cloud = 100 * (1 - len(valid) / max(len(df), 1))
                print(f'    {date}: {len(df):5d} px, {len(valid):4d} valid ({pct_cloud:.0f}% cloud), '
                      f'{len(above):3d} above 0.3 mg/m³'
                      + (f', max={valid["chlor_a"].max():.2f}' if len(valid) > 0 else ''))
            except Exception as e:
                print(f'    {date}: ERROR {e}')
