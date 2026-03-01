#!/usr/bin/env python3
"""
notify_alerts.py — Analyse forecast GeoJSON for coast-proximity and raise alerts.

Notification channels:
  1. GitHub Issue (always, if GITHUB_TOKEN set)
  2. Email via SMTP (if SMTP_* env vars set)
  3. Webhook / SMS via generic POST (if ALERT_WEBHOOK_URL set)

Usage:
  python scripts/notify_alerts.py \
      --forecast outputs/forecast_2025-03-01.geojson \
      --detections data/merged_detections_2025-03-01.geojson \
      --date 2025-03-01
"""

import argparse
import json
import logging
import math
import os
import smtplib
import sys
from datetime import datetime
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# Ghana coastline reference points (lon, lat)
COAST_POINTS = [
    (-3.11, 4.74),   # Cape Three Points
    (-2.35, 4.89),   # Takoradi
    (-1.70, 5.04),   # Cape Coast
    (-1.17, 5.10),   # Winneba
    (-0.60, 5.28),   # Tema
    (-0.20, 5.55),   # Ada Foah
    (0.30, 5.65),    # Keta
    (0.80, 5.80),    # Aflao
    (1.10, 6.10),    # Lomé border
]

REGION_NAMES = {
    0: "Cape Three Points",
    1: "Takoradi / Western",
    2: "Cape Coast / Central",
    3: "Winneba",
    4: "Tema / Greater Accra",
    5: "Ada Foah / Volta",
    6: "Keta / East",
    7: "Aflao Border",
    8: "Lomé Border",
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _nearest_coast(lon: float, lat: float):
    best_dist = float("inf")
    best_idx = 0
    for i, (cx, cy) in enumerate(COAST_POINTS):
        d = _haversine_km(lat, lon, cy, cx)
        if d < best_dist:
            best_dist = d
            best_idx = i
    return best_dist, best_idx


def analyse_forecast(forecast_path: str, detections_path: Optional[str], date_str: str) -> dict:
    """Return an alert summary dict."""
    with open(forecast_path) as f:
        fc = json.load(f)

    features = fc.get("features", [])
    total = len(features)

    beaching = []    # within 2 km
    near_coast = []  # within 20 km
    offshore = []

    region_counts: dict[str, int] = {}

    for feat in features:
        coords = feat.get("geometry", {}).get("coordinates", [None, None])
        if coords[0] is None:
            continue
        lon, lat = coords[0], coords[1]
        dist, idx = _nearest_coast(lon, lat)
        region = REGION_NAMES.get(idx, f"Region {idx}")

        if dist < 2:
            beaching.append({"lon": lon, "lat": lat, "region": region, "dist_km": round(dist, 1)})
            region_counts[region] = region_counts.get(region, 0) + 1
        elif dist < 20:
            near_coast.append({"lon": lon, "lat": lat, "region": region, "dist_km": round(dist, 1)})

    det_count = 0
    if detections_path and Path(detections_path).exists():
        with open(detections_path) as f:
            d = json.load(f)
        det_count = len(d.get("features", []))

    severity = "none"
    if len(beaching) >= 50:
        severity = "critical"
    elif len(beaching) >= 10:
        severity = "high"
    elif len(beaching) > 0:
        severity = "moderate"
    elif len(near_coast) > 20:
        severity = "low"

    return {
        "date": date_str,
        "severity": severity,
        "total_particles": total,
        "detections": det_count,
        "beaching_count": len(beaching),
        "near_coast_count": len(near_coast),
        "offshore_count": total - len(beaching) - len(near_coast),
        "regions_affected": region_counts,
        "beaching_samples": beaching[:10],
    }


def _build_issue_body(alert: dict) -> str:
    sev = alert["severity"].upper()
    lines = [
        f"# ⚠️ Sargassum Alert — {alert['date']} [{sev}]",
        "",
        f"**Severity:** {sev}",
        f"**Satellite detections:** {alert['detections']}",
        f"**Total forecast particles:** {alert['total_particles']}",
        f"**Beaching (< 2 km):** {alert['beaching_count']}",
        f"**Near coast (< 20 km):** {alert['near_coast_count']}",
        "",
    ]

    if alert["regions_affected"]:
        lines.append("## Regions Affected")
        lines.append("| Region | Beaching Particles |")
        lines.append("|--------|-------------------|")
        for region, count in sorted(alert["regions_affected"].items(), key=lambda x: -x[1]):
            lines.append(f"| {region} | {count} |")
        lines.append("")

    if alert["beaching_samples"]:
        lines.append("## Sample Beaching Locations")
        lines.append("| Lat | Lon | Region | Distance |")
        lines.append("|-----|-----|--------|----------|")
        for s in alert["beaching_samples"]:
            lines.append(f"| {s['lat']:.4f} | {s['lon']:.4f} | {s['region']} | {s['dist_km']} km |")
        lines.append("")

    lines.append(f"[View forecast →](https://github.com/{os.getenv('GITHUB_REPOSITORY', 'JJackis89/SARTRAC')}/releases/tag/forecast-{alert['date']})")
    return "\n".join(lines)


def notify_github_issue(alert: dict):
    token = os.getenv("GITHUB_TOKEN")
    repo = os.getenv("GITHUB_REPOSITORY", "JJackis89/SARTRAC")
    if not token:
        logger.warning("GITHUB_TOKEN not set — skipping Issue notification")
        return

    title = f"🌊 Sargassum Alert [{alert['severity'].upper()}] — {alert['date']}"
    body = _build_issue_body(alert)
    labels = ["sargassum-alert", f"severity-{alert['severity']}"]

    resp = requests.post(
        f"https://api.github.com/repos/{repo}/issues",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        json={"title": title, "body": body, "labels": labels},
    )
    if resp.ok:
        logger.info(f"GitHub Issue created: {resp.json().get('html_url')}")
    else:
        logger.error(f"Failed to create Issue: {resp.status_code} {resp.text}")


def notify_email(alert: dict):
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    recipients = os.getenv("ALERT_EMAIL_TO", "").split(",")

    if not all([host, user, password, recipients[0]]):
        logger.info("SMTP not configured — skipping email notification")
        return

    body = _build_issue_body(alert)
    msg = MIMEText(body, "plain")
    msg["Subject"] = f"SARTRAC Alert [{alert['severity'].upper()}] — {alert['date']}"
    msg["From"] = user
    msg["To"] = ", ".join(recipients)

    try:
        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, password)
            server.send_message(msg)
        logger.info(f"Email sent to {msg['To']}")
    except Exception as e:
        logger.error(f"Email failed: {e}")


def notify_webhook(alert: dict):
    url = os.getenv("ALERT_WEBHOOK_URL")
    if not url:
        logger.info("ALERT_WEBHOOK_URL not set — skipping webhook notification")
        return

    payload = {
        "text": f"🌊 SARTRAC Alert [{alert['severity'].upper()}] — {alert['date']}\n"
                f"Beaching: {alert['beaching_count']} particles\n"
                f"Regions: {', '.join(alert['regions_affected'].keys()) or 'none'}",
        **alert,
    }
    try:
        resp = requests.post(url, json=payload, timeout=15)
        logger.info(f"Webhook response: {resp.status_code}")
    except Exception as e:
        logger.error(f"Webhook failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="SARTRAC Forecast Alert Notification")
    parser.add_argument("--forecast", required=True, help="Path to forecast GeoJSON")
    parser.add_argument("--detections", help="Path to merged detections GeoJSON")
    parser.add_argument("--date", required=True, help="Forecast date YYYY-MM-DD")
    parser.add_argument("--min-severity", default="low",
                        choices=["none", "low", "moderate", "high", "critical"],
                        help="Minimum severity to trigger notifications")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    alert = analyse_forecast(args.forecast, args.detections, args.date)
    logger.info(f"Alert analysis: severity={alert['severity']}  "
                f"beaching={alert['beaching_count']}  near_coast={alert['near_coast_count']}")

    severity_order = ["none", "low", "moderate", "high", "critical"]
    if severity_order.index(alert["severity"]) < severity_order.index(args.min_severity):
        logger.info(f"Severity {alert['severity']} below threshold {args.min_severity} — no notifications sent")
        return

    # Fire all notification channels
    notify_github_issue(alert)
    notify_email(alert)
    notify_webhook(alert)


if __name__ == "__main__":
    main()
