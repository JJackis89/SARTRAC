// SARTRAC Type Definitions for Modern UI Components

// Core data interfaces
export interface ForecastData {
  date: string;
  concentration: number[][];
  driftDirection: number[][];
  uncertainty: 'Low' | 'Medium' | 'High';
}

export interface LayerSettings {
  density: { visible: boolean; opacity: number };
  drift: { visible: boolean; opacity: number; animated?: boolean };
  uncertainty: { visible: boolean; opacity: number; style?: 'alpha' | 'contour' | 'hatching' };
  bathymetry: { visible: boolean; opacity: number };
  grid: { visible: boolean; opacity: number };
  coastsnap: { visible: boolean; opacity: number };
}

export interface AppSettings {
  baseMap: string;
  renderMode: 'native' | 'smooth';
  playbackSpeed: number;
  loopEnabled: boolean;
  compareMode: boolean;
  sidePanelOpen: boolean;
}

export interface Layer {
  id: string;
  group: 'sargassum' | 'environment' | 'utilities';
  label: string;
  type: 'raster' | 'vector';
  opacity: number;
  visible: boolean;
  supportsStyles: string[];
  legendType: 'gradient' | 'categorical' | 'none';
  description?: string;
  source?: string;
  metadata?: Record<string, any>;
}

export interface ForecastState {
  dayIndex: number;
  playing: boolean;
  loop: boolean;
  speed: number; // playback speed multiplier
  availableDays: number[];
  loading: boolean;
  error?: string;
}

export interface BeachedSegment {
  id: string;
  geometry: GeoJSON.Geometry;
  properties: {
    density: 'low' | 'medium' | 'high';
    probability: number; // 0-1
    eta_hours: number;
    uncertainty: 'low' | 'medium' | 'high';
    confidence: number;
    source: string;
    timestamp: string;
  };
}

export interface SegmentDetail {
  density: 'low' | 'medium' | 'high';
  probability: number;
  etaWindow: {
    min: number;
    max: number;
    unit: 'hours' | 'days';
  };
  uncertainty: 'low' | 'medium' | 'high';
  confidence: number;
  location: {
    lat: number;
    lng: number;
    name?: string;
  };
}

export interface Theme {
  colors: {
    ocean: {
      deep: string;
      mid: string;
      shelf: string;
      light: string;
      foam: string;
    };
    sargassum: {
      none: string;
      trace: string;
      low: string;
      medium: string;
      high: string;
      extreme: string;
    };
    probability: {
      low: string;
      medium: string;
      high: string;
    };
  };
  spacing: Record<string, string>;
  radius: Record<string, string>;
  elevation: Record<string, string>;
  transition: Record<string, string>;
}

export interface AccessibilityProps {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  role?: string;
  tabIndex?: number;
}

export interface KeyboardHandlers {
  onKeyDown?: (event: React.KeyboardEvent) => void;
  onKeyUp?: (event: React.KeyboardEvent) => void;
}

export interface PlaybackControls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seekToDay: (day: number) => void;
  setSpeed: (speed: number) => void;
  toggleLoop: () => void;
}

export interface LegendConfig {
  type: 'gradient' | 'categorical' | 'none';
  title: string;
  items?: {
    color: string;
    label: string;
    value?: number | string;
  }[];
  gradient?: {
    stops: { offset: number; color: string }[];
    min: string;
    max: string;
    unit?: string;
  };
}

export interface StatusData {
  system: 'operational' | 'degraded' | 'offline';
  lastUpdate: string;
  dataSource: string;
  coverage: string;
  nextUpdate?: string;
}

// Event types for component communication
export type LayerEvent = 
  | { type: 'TOGGLE_VISIBILITY'; layerId: string }
  | { type: 'UPDATE_OPACITY'; layerId: string; opacity: number }
  | { type: 'TOGGLE_GROUP'; group: string }
  | { type: 'RESET_LAYERS' };

export type PlaybackEvent =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK'; dayIndex: number }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'TOGGLE_LOOP' };

export type MapEvent =
  | { type: 'ZOOM_TO_BOUNDS'; bounds: [[number, number], [number, number]] }
  | { type: 'SET_BASE_MAP'; mapType: string }
  | { type: 'TOGGLE_LAYER'; layerId: string };