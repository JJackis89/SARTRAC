import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

interface LegendItem {
  color: string;
  label: string;
  value: string;
  description?: string;
}

interface FloatingLegendProps {
  title: string;
  items: LegendItem[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

export const FloatingLegend: React.FC<FloatingLegendProps & { 
  enabledLevels?: Record<string, boolean>;
  onLevelToggle?: (level: string) => void;
}> = ({
  title,
  items,
  position = 'top-right',
  collapsed = false,
  onToggle,
  className = '',
  enabledLevels = {},
  onLevelToggle
}) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  const handleToggle = () => {
    setIsCollapsed(!isCollapsed);
    onToggle?.();
  };

  const positionClasses = {
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6'
  };

  return (
    <div 
      className={`
        fixed ${positionClasses[position]} z-[1100]
        panel-floating min-w-[160px] max-w-[200px]
        transition-all duration-300 ease-out
        ${isCollapsed ? 'w-auto' : 'w-44'}
        ${className}
      `}
      style={{
        background: 'var(--glass-minimal)',
        backdropFilter: 'blur(20px) saturate(120%)',
        border: '1px solid var(--glass-border)'
      }}
    >
      {/* Legend Header */}
      <div className="flex items-center justify-between p-2 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <Info className="w-3 h-3 text-accent-glass" />
          <h3 className="font-medium text-text-glass-primary text-xs">{title}</h3>
        </div>
        <button
          onClick={handleToggle}
          className="p-1 rounded hover:bg-glass-secondary transition-colors"
          aria-label={isCollapsed ? 'Expand legend' : 'Collapse legend'}
        >
          {isCollapsed ? (
            <ChevronDown className="w-3 h-3 text-text-glass-muted" />
          ) : (
            <ChevronUp className="w-3 h-3 text-text-glass-muted" />
          )}
        </button>
      </div>

      {/* Legend Content */}
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-96 opacity-100'
        }`}
      >
        <div className="p-3 space-y-2.5">
          {items.map((item, index) => {
            const levelKey = item.label.toLowerCase().replace(' ', '-');
            const isEnabled = enabledLevels[levelKey] ?? true;
            
            return (
              <div
                key={index}
                className={`flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-all group cursor-pointer ${
                  !isEnabled ? 'opacity-60' : ''
                }`}
                onClick={() => onLevelToggle?.(levelKey)}
              >
                {/* Minimal Toggle Switch */}
                <div 
                  className={`w-6 h-3 rounded-full transition-all cursor-pointer ${
                    isEnabled ? 'bg-cyan-500' : 'bg-neutral-700'
                  }`}
                  role="switch"
                  aria-checked={isEnabled}
                  aria-label={`Toggle ${item.label} visibility`}
                >
                  <div className={`w-2 h-2 bg-white rounded-full transition-all ${
                    isEnabled ? 'translate-x-3.5 mt-0.5' : 'translate-x-0.5 mt-0.5'
                  }`} />
                </div>
                
                {/* Color Swatch */}
                <div 
                  className={`w-3 h-3 rounded border border-glass-border flex-shrink-0 transition-all ${
                    isEnabled ? '' : 'grayscale opacity-50'
                  }`}
                  style={{ backgroundColor: item.color }}
                  aria-label={`${item.label} color indicator`}
                />
                
                {/* Label and Value */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium truncate transition-colors ${
                      isEnabled ? 'text-text-glass-primary' : 'text-text-glass-muted'
                    }`}>
                      {item.label}
                    </span>
                    <span className="text-xs text-text-glass-secondary font-mono ml-2">
                      {item.value}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend Footer with Tooltip */}
        <div className="px-4 pb-4 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-3 h-3 text-aqua-mid" />
              <p className="text-xs text-text-muted">
                Interactive density layers
              </p>
            </div>
            <div className="group relative">
              <Info className="w-3 h-3 text-text-muted hover:text-aqua-mid cursor-help transition-colors" />
              <div className="absolute bottom-6 right-0 w-48 p-2 bg-ocean-deep border border-aqua-mid/30 rounded-lg text-xs text-text-primary opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <strong>Density:</strong> Sargassum biomass probability per pixel based on satellite imagery and oceanographic models.
              </div>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Click toggles to show/hide density levels
          </p>
        </div>
      </div>
    </div>
  );
};

// Pre-configured Sargassum density legend with interactive toggles
export const SargassumLegend: React.FC<{
  position?: FloatingLegendProps['position'];
  collapsed?: boolean;
  onToggle?: () => void;
  onDensityToggle?: (level: string, enabled: boolean) => void;
}> = ({ position, collapsed, onToggle, onDensityToggle }) => {
  const [enabledLevels, setEnabledLevels] = React.useState({
    'very-low': true,
    'low': true,
    'medium': true,
    'high': true,
    'very-high': true
  });

  const handleLevelToggle = (level: string) => {
    const newState = !enabledLevels[level as keyof typeof enabledLevels];
    setEnabledLevels(prev => ({
      ...prev,
      [level]: newState
    }));
    onDensityToggle?.(level, newState);
  };

  const sargassumItems: LegendItem[] = [
    {
      color: '#06b6d4', // Refined cyan
      label: 'Very Low',
      value: '0-20%',
      description: 'Minimal sargassum presence'
    },
    {
      color: '#0891b2', // Deeper cyan
      label: 'Low',
      value: '20-40%',
      description: 'Light scattered patches'
    },
    {
      color: '#0e7490', // Teal transition
      label: 'Medium',
      value: '40-60%',
      description: 'Moderate coverage'
    },
    {
      color: '#f59e0b', // Amber
      label: 'High',
      value: '60-80%',
      description: 'Dense accumulations'
    },
    {
      color: '#dc2626', // Deep red
      label: 'Very High',
      value: '80-100%',
      description: 'Heavy mats and windrows'
    }
  ];

  return (
    <FloatingLegend
      title="Sargassum Density"
      items={sargassumItems}
      position={position}
      collapsed={collapsed}
      onToggle={onToggle}
      enabledLevels={enabledLevels}
      onLevelToggle={handleLevelToggle}
    />
  );
};

export default FloatingLegend;