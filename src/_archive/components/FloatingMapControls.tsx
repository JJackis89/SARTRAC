import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Compass, 
  MapPin, 
  RotateCcw,
  Maximize,
  Eye,
  EyeOff,
  Settings
} from 'lucide-react';

interface FloatingMapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleLayers: () => void;
  onToggleFullscreen: () => void;
  onCenterOnGhana: () => void;
  currentZoom?: number;
  maxZoom?: number;
  minZoom?: number;
  className?: string;
}

interface ControlButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  active?: boolean;
  badge?: string | number;
}

const ControlButton: React.FC<ControlButtonProps> = ({
  onClick,
  icon,
  label,
  disabled = false,
  active = false,
  badge
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      relative w-11 h-11 rounded-xl backdrop-blur-xl border transition-all duration-200
      flex items-center justify-center group hover:scale-105 active:scale-95
      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
      ${active 
        ? 'bg-accent-primary/20 border-accent-primary text-accent-primary' 
        : 'bg-bg-glass border-border-medium text-text-secondary hover:bg-white/10 hover:border-border-medium hover:text-text-primary'
      }
    `}
    title={label}
    aria-label={label}
  >
    <div className="w-5 h-5">
      {icon}
    </div>
    {badge && (
      <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-accent-coral text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
        {badge}
      </div>
    )}
  </button>
);

export const FloatingMapControls: React.FC<FloatingMapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleLayers,
  onToggleFullscreen,
  onCenterOnGhana,
  currentZoom = 7,
  maxZoom = 18,
  minZoom = 3,
  className = ''
}) => {
  const [layersVisible, setLayersVisible] = useState(true);
  const [compassHeading, setCompassHeading] = useState(0);

  const handleToggleLayers = () => {
    setLayersVisible(!layersVisible);
    onToggleLayers();
  };

  const handleResetView = () => {
    setCompassHeading(0);
    onResetView();
  };

  return (
    <div 
      className={`
        fixed top-24 right-6 z-[1050] 
        flex flex-col gap-3 pointer-events-auto
        ${className}
      `}
    >
      {/* Zoom Controls Group */}
      <div className="flex flex-col gap-1 p-2 bg-bg-glass backdrop-blur-xl border border-border-medium rounded-2xl shadow-lg">
        <ControlButton
          onClick={onZoomIn}
          icon={<ZoomIn />}
          label="Zoom in"
          disabled={currentZoom >= maxZoom}
        />
        
        <div className="mx-2 my-1">
          <div className="text-xs text-text-muted text-center font-mono">
            {currentZoom.toFixed(0)}x
          </div>
          <div className="w-full h-1 bg-bg-tertiary rounded-full mt-1">
            <div 
              className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary rounded-full transition-all duration-200"
              style={{ 
                width: `${((currentZoom - minZoom) / (maxZoom - minZoom)) * 100}%` 
              }}
            />
          </div>
        </div>
        
        <ControlButton
          onClick={onZoomOut}
          icon={<ZoomOut />}
          label="Zoom out"
          disabled={currentZoom <= minZoom}
        />
      </div>

      {/* Navigation Controls Group */}
      <div className="flex flex-col gap-1 p-2 bg-bg-glass backdrop-blur-xl border border-border-medium rounded-2xl shadow-lg">
        <ControlButton
          onClick={handleResetView}
          icon={
            <div 
              className="transition-transform duration-500"
              style={{ transform: `rotate(${compassHeading}deg)` }}
            >
              <Compass />
            </div>
          }
          label="Reset view to Ghana"
        />
        
        <ControlButton
          onClick={onCenterOnGhana}
          icon={<MapPin />}
          label="Center on Ghana coastline"
        />
        
        <ControlButton
          onClick={handleResetView}
          icon={<RotateCcw />}
          label="Reset rotation"
        />
      </div>

      {/* Layer & Display Controls Group */}
      <div className="flex flex-col gap-1 p-2 bg-bg-glass backdrop-blur-xl border border-border-medium rounded-2xl shadow-lg">
        <ControlButton
          onClick={handleToggleLayers}
          icon={layersVisible ? <Eye /> : <EyeOff />}
          label={layersVisible ? 'Hide layers' : 'Show layers'}
          active={layersVisible}
          badge={layersVisible ? '2' : undefined}
        />
        
        <ControlButton
          onClick={onToggleFullscreen}
          icon={<Maximize />}
          label="Toggle fullscreen"
        />
        
        <ControlButton
          onClick={() => {/* Settings handler */}}
          icon={<Settings />}
          label="Map settings"
        />
      </div>

      {/* Quick Info Display */}
      <div className="p-3 bg-bg-glass backdrop-blur-xl border border-border-medium rounded-xl shadow-lg max-w-[200px]">
        <div className="text-xs text-text-muted mb-1">Current View</div>
        <div className="text-sm font-semibold text-text-primary mb-2">Ghana Coastline</div>
        
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-text-muted">Zoom</div>
            <div className="font-mono text-text-primary">{currentZoom.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-text-muted">Layers</div>
            <div className="font-mono text-text-primary">{layersVisible ? '2/2' : '0/2'}</div>
          </div>
        </div>
        
        <div className="mt-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-accent-primary rounded-full animate-pulse" />
            <span className="text-xs text-text-secondary">Live Data</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloatingMapControls;