import { useRef, useCallback } from 'react';
import L from 'leaflet';
import html2canvas from 'html2canvas';
import { LatLngExpression } from 'leaflet';

export const GHANA_CENTER: LatLngExpression = [5.6037, -0.1870];
export const GHANA_BOUNDS: [[number, number], [number, number]] = [
  [4.5, -3.5],
  [11.5, 1.5],
];

export function useMapControls() {
  const mapRef = useRef<L.Map | null>(null);

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  const handleResetView = useCallback(() => {
    mapRef.current?.setView(GHANA_CENTER, 7);
  }, []);

  const handleResetNorth = useCallback(() => {
    if (mapRef.current) {
      mapRef.current.setView(mapRef.current.getCenter(), mapRef.current.getZoom());
    }
  }, []);

  const handleMyLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        mapRef.current?.setView(
          [position.coords.latitude, position.coords.longitude],
          10
        );
      });
    }
  }, []);

  const handleScreenshot = useCallback(async (forecastDate?: string) => {
    try {
      const loadingDiv = document.createElement('div');
      loadingDiv.innerHTML = 'Capturing screenshot...';
      loadingDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: rgba(45, 62, 80, 0.95); color: #5eead4;
        padding: 12px 20px; border-radius: 6px;
        font-family: system-ui; font-size: 14px;
        border: 1px solid rgba(94, 234, 212, 0.3);
      `;
      document.body.appendChild(loadingDiv);

      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const mapContainer = document.querySelector('.leaflet-container')?.parentElement;
        const targetElement = mapContainer || document.body;

        const canvas = await html2canvas(targetElement as HTMLElement, {
          useCORS: true,
          allowTaint: false,
          height: window.innerHeight,
          width: window.innerWidth,
        });

        const link = document.createElement('a');
        link.download = `ghana-sargassum-forecast-${forecastDate || 'current'}-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png', 0.8);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        document.body.removeChild(loadingDiv);
      } catch {
        document.body.removeChild(loadingDiv);
        window.print();
      }
    } catch (err) {
      console.error('Screenshot failed:', err);
    }
  }, []);

  const handleShare = useCallback((forecastDate?: string) => {
    const url = window.location.href;
    const text = `Ghana Sargassum Early Advisory System - ${forecastDate || 'Current'} Forecast`;

    if (navigator.share) {
      navigator.share({ title: 'Ghana Sargassum Forecast', text, url });
    } else {
      navigator.clipboard.writeText(`${text}\n${url}`).then(
        () => alert('Forecast link copied to clipboard!'),
        () => prompt('Copy this link to share:', url)
      );
    }
  }, []);

  return {
    mapRef,
    handleMapReady,
    handleZoomIn,
    handleZoomOut,
    handleResetView,
    handleResetNorth,
    handleMyLocation,
    handleScreenshot,
    handleShare,
  };
}
