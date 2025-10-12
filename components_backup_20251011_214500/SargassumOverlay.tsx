import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface SargassumOverlayProps {
  data: number[][];
  opacity: number;
  bounds: [[number, number], [number, number]];
}

const SargassumOverlay: React.FC<SargassumOverlayProps> = ({ data, opacity, bounds }) => {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !map) return;

    // Create canvas for rendering
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    const width = 200;
    const height = 200;
    canvas.width = width;
    canvas.height = height;

    // Create image data
    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    // Map data to canvas pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dataY = Math.floor((y / height) * data.length);
        const dataX = Math.floor((x / width) * (data[0]?.length || 0));
        
        const concentration = data[dataY]?.[dataX] || 0;
        const pixelIndex = (y * width + x) * 4;

        // Color mapping based on concentration (blue to yellow to red)
        let r, g, b;
        if (concentration < 0.33) {
          // Blue to cyan
          const t = concentration / 0.33;
          r = Math.floor(0 + t * 100);
          g = Math.floor(150 + t * 105);
          b = Math.floor(255 - t * 55);
        } else if (concentration < 0.66) {
          // Cyan to yellow
          const t = (concentration - 0.33) / 0.33;
          r = Math.floor(100 + t * 155);
          g = Math.floor(255);
          b = Math.floor(200 - t * 200);
        } else {
          // Yellow to red
          const t = (concentration - 0.66) / 0.34;
          r = Math.floor(255);
          g = Math.floor(255 - t * 155);
          b = Math.floor(0);
        }

        // Apply alpha based on concentration and opacity
        const alpha = Math.floor(concentration * opacity * 255);

        pixels[pixelIndex] = r;     // Red
        pixels[pixelIndex + 1] = g; // Green
        pixels[pixelIndex + 2] = b; // Blue
        pixels[pixelIndex + 3] = alpha; // Alpha
      }
    }

    // Put image data to canvas
    ctx.putImageData(imageData, 0, 0);

    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL();

    // Remove existing overlay
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
    }

    // Create new image overlay
    const imageOverlay = L.imageOverlay(dataUrl, bounds, {
      opacity: 1, // We handle opacity in the canvas itself
      interactive: false
    });

    // Add to map
    imageOverlay.addTo(map);
    overlayRef.current = imageOverlay;

    // Cleanup function
    return () => {
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current);
        overlayRef.current = null;
      }
    };
  }, [data, opacity, bounds, map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayRef.current && map) {
        map.removeLayer(overlayRef.current);
      }
    };
  }, [map]);

  return null;
};

export default SargassumOverlay;