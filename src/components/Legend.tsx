import React, { useMemo } from 'react';
import { RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { LegendConfig } from '../types';

interface LegendProps {
  config: LegendConfig;
  onCycle?: () => void;
  onReset?: () => void;
  showControls?: boolean;
  className?: string;
}

const GradientLegend: React.FC<{
  gradient: NonNullable<LegendConfig['gradient']>;
  title: string;
}> = ({ gradient, title }) => {
  const gradientStyle = useMemo(() => {
    const stops = gradient.stops
      .map(stop => `${stop.color} ${stop.offset * 100}%`)
      .join(', ');
    return `linear-gradient(to right, ${stops})`;
  }, [gradient.stops]);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-neutral-100">{title}</h4>
      
      {/* Gradient Bar */}
      <div className="relative">
        <div 
          className="h-4 rounded-lg border border-panel"
          style={{ background: gradientStyle }}
          role="img"
          aria-label={`${title} gradient scale from ${gradient.min} to ${gradient.max}`}
        />
        
        {/* Scale Labels */}
        <div className="flex justify-between mt-1 text-xs">
          <span className="text-neutral-400">
            {gradient.min} {gradient.unit && <span className="text-neutral-500">{gradient.unit}</span>}
          </span>
          <span className="text-neutral-400">
            {gradient.max} {gradient.unit && <span className="text-neutral-500">{gradient.unit}</span>}
          </span>
        </div>
      </div>
    </div>
  );
};

const CategoricalLegend: React.FC<{
  items: NonNullable<LegendConfig['items']>;
  title: string;
}> = ({ items, title }) => {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-neutral-100">{title}</h4>
      
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={index} className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded border border-panel flex-shrink-0"
              style={{ backgroundColor: item.color }}
              role="img"
              aria-label={`${item.label} color indicator`}
            />
            <span className="text-xs text-neutral-300 flex-1">
              {item.label}
            </span>
            {item.value && (
              <span className="text-xs text-neutral-400 font-mono">
                {item.value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export const Legend: React.FC<LegendProps> = ({
  config,
  onCycle,
  onReset,
  showControls = true,
  className = ''
}) => {
  if (config.type === 'none') {
    return null;
  }

  return (
    <div 
      className={`
        bg-panel backdrop-blur-panel border border-panel 
        rounded-lg p-4 elevation-2 ${className}
      `}
      role="region"
      aria-label="Map legend"
    >
      {/* Header with Controls */}
      {showControls && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-neutral-300 uppercase tracking-wide">
            Legend
          </span>
          
          <div className="flex items-center space-x-1">
            {onCycle && (
              <>
                <button
                  onClick={onCycle}
                  className="
                    p-1 rounded hover:bg-overlay-light transition-colors
                    focus-ring text-neutral-400 hover:text-neutral-200
                  "
                  aria-label="Cycle to previous legend"
                  title="Previous legend"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                
                <button
                  onClick={onCycle}
                  className="
                    p-1 rounded hover:bg-overlay-light transition-colors
                    focus-ring text-neutral-400 hover:text-neutral-200
                  "
                  aria-label="Cycle to next legend"
                  title="Next legend"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </>
            )}
            
            {onReset && (
              <button
                onClick={onReset}
                className="
                  p-1 rounded hover:bg-overlay-light transition-colors
                  focus-ring text-neutral-400 hover:text-neutral-200
                "
                aria-label="Reset legend to default"
                title="Reset"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Legend Content */}
      {config.type === 'gradient' && config.gradient && (
        <GradientLegend 
          gradient={config.gradient} 
          title={config.title}
        />
      )}
      
      {config.type === 'categorical' && config.items && (
        <CategoricalLegend 
          items={config.items} 
          title={config.title}
        />
      )}
    </div>
  );
};

// Predefined legend configurations for common SARTRAC layers
export const SARGASSUM_DENSITY_LEGEND: LegendConfig = {
  type: 'gradient',
  title: 'Sargassum Density',
  gradient: {
    stops: [
      { offset: 0, color: 'var(--sargassum-trace)' },
      { offset: 0.25, color: 'var(--sargassum-low)' },
      { offset: 0.5, color: 'var(--sargassum-medium)' },
      { offset: 0.75, color: 'var(--sargassum-high)' },
      { offset: 1, color: 'var(--sargassum-extreme)' }
    ],
    min: 'Low',
    max: 'High',
    unit: 'kg/m²'
  }
};

export const BEACHING_PROBABILITY_LEGEND: LegendConfig = {
  type: 'categorical',
  title: 'Beaching Probability',
  items: [
    { color: 'var(--probability-low)', label: 'Low Risk', value: '< 30%' },
    { color: 'var(--probability-medium)', label: 'Medium Risk', value: '30-70%' },
    { color: 'var(--probability-high)', label: 'High Risk', value: '> 70%' }
  ]
};

export const UNCERTAINTY_LEGEND: LegendConfig = {
  type: 'categorical',
  title: 'Forecast Uncertainty',
  items: [
    { color: 'var(--success)', label: 'High Confidence', value: '> 80%' },
    { color: 'var(--warning)', label: 'Medium Confidence', value: '50-80%' },
    { color: 'var(--error)', label: 'Low Confidence', value: '< 50%' }
  ]
};