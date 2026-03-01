import { useState, useEffect, useCallback } from 'react';

export interface PlaybackState {
  isPlaying: boolean;
  playbackSpeed: number;
  loopEnabled: boolean;
  compareMode: boolean;
}

export interface PlaybackActions {
  setIsPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
  setPlaybackSpeed: (speed: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  setCompareMode: (enabled: boolean) => void;
  togglePlay: () => void;
}

export function usePlayback(
  forecastCount: number,
  setCurrentForecastIndex: (fn: (prev: number) => number) => void
): PlaybackState & PlaybackActions {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying || forecastCount === 0) return;

    const interval = setInterval(() => {
      setCurrentForecastIndex(prev => {
        const next = prev >= forecastCount - 1 ? (loopEnabled ? 0 : prev) : prev + 1;
        if (!loopEnabled && next === prev) {
          setIsPlaying(false);
        }
        return next;
      });
    }, 1500 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, forecastCount, playbackSpeed, loopEnabled, setCurrentForecastIndex]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentForecastIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentForecastIndex(prev => Math.min(forecastCount - 1, prev + 1));
          break;
        case 'Home':
          e.preventDefault();
          setCurrentForecastIndex(() => 0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentForecastIndex(() => Math.max(0, forecastCount - 1));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forecastCount, setCurrentForecastIndex]);

  return {
    isPlaying,
    playbackSpeed,
    loopEnabled,
    compareMode,
    setIsPlaying,
    setPlaybackSpeed,
    setLoopEnabled,
    setCompareMode,
    togglePlay,
  };
}
