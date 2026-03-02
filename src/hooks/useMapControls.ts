import { useRef, useCallback } from 'react';
import L from 'leaflet';
import html2canvas from 'html2canvas';
import { LatLngExpression } from 'leaflet';

// Centred on Ghana's coastline (Half Assini → Aflao)
export const GHANA_CENTER: LatLngExpression = [5.25, -0.90];
export const GHANA_BOUNDS: [[number, number], [number, number]] = [
  [4.2, -3.5],
  [6.8, 1.5],
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
    mapRef.current?.setView(GHANA_CENTER, 8);
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

  const showToast = useCallback((message: string) => {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10000;
      background:rgba(20,184,166,0.95);color:#fff;padding:10px 20px;border-radius:8px;
      font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);
      transition:opacity 0.3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    setTimeout(() => document.body.removeChild(toast), 2400);
  }, []);

  const handleShare = useCallback((forecastDate?: string) => {
    const url = window.location.href;
    const text = `Ghana Sargassum Early Advisory System - ${forecastDate || 'Current'} Forecast`;

    if (navigator.share) {
      navigator.share({ title: 'Ghana Sargassum Forecast', text, url });
    } else {
      navigator.clipboard.writeText(`${text}\n${url}`).then(
        () => showToast('Forecast link copied to clipboard'),
        () => { /* clipboard write failed — silent fallback */ }
      );
    }
  }, [showToast]);

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
