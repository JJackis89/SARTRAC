import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface SargassumOverlayProps {
  data: number[][];
  opacity: number;
  bounds: [[number, number], [number, number]];
  renderMode?: 'native' | 'smooth';
}

const SargassumOverlay: React.FC<SargassumOverlayProps> = ({ 
  data, 
  opacity, 
  bounds, 
  renderMode = 'smooth' 
}) => {
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
        
        let concentration: number;
        
        if (renderMode === 'native') {
          // Native grid - use exact data values without interpolation
          concentration = data[dataY]?.[dataX] || 0;
        } else {
          // Smooth - apply bilinear interpolation for smoother appearance
          const y1 = Math.floor((y / height) * data.length);
          const y2 = Math.min(y1 + 1, data.length - 1);
          const x1 = Math.floor((x / width) * (data[0]?.length || 0));
          const x2 = Math.min(x1 + 1, (data[0]?.length || 1) - 1);
          
          const dy = ((y / height) * data.length) - y1;
          const dx = ((x / width) * (data[0]?.length || 0)) - x1;
          
          const val11 = data[y1]?.[x1] || 0;
          const val12 = data[y1]?.[x2] || 0;
          const val21 = data[y2]?.[x1] || 0;
          const val22 = data[y2]?.[x2] || 0;
          
          // Bilinear interpolation
          const top = val11 * (1 - dx) + val12 * dx;
          const bottom = val21 * (1 - dx) + val22 * dx;
          concentration = top * (1 - dy) + bottom * dy;
        }
        
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

    // Apply different rendering styles
    if (renderMode === 'native') {
      // For native grid, disable image smoothing for pixelated look
      ctx.imageSmoothingEnabled = false;
    } else {
      // For smooth mode, enable high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
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
      interactive: false,
      className: renderMode === 'native' ? 'native-grid-rendering' : 'smooth-rendering'
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
  }, [data, opacity, bounds, map, renderMode]);

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