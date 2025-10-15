import React, { useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Info, Settings } from 'lucide-react';
import { Layer, LayerEvent } from '../types';

interface LayerListProps {
  layers: Layer[];
  onLayerEvent: (event: LayerEvent) => void;
  className?: string;
}

interface LayerGroupProps {
  title: string;
  layers: Layer[];
  onLayerEvent: (event: LayerEvent) => void;
  defaultExpanded?: boolean;
}

const LayerRow: React.FC<{
  layer: Layer;
  onLayerEvent: (event: LayerEvent) => void;
}> = React.memo(({ layer, onLayerEvent }) => {
  const handleVisibilityToggle = useCallback(() => {
    onLayerEvent({ type: 'TOGGLE_VISIBILITY', layerId: layer.id });
  }, [layer.id, onLayerEvent]);

  const handleOpacityChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const opacity = parseFloat(event.target.value);
    onLayerEvent({ type: 'UPDATE_OPACITY', layerId: layer.id, opacity });
  }, [layer.id, onLayerEvent]);

  return (
    <div className="group border-b border-panel last:border-b-0">
      <div className="flex items-center justify-between p-3 hover:bg-overlay-light transition-colors">
        {/* Layer Info */}
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <button
            onClick={handleVisibilityToggle}
            className="
              p-1 rounded hover:bg-overlay-medium transition-colors
              focus-ring flex-shrink-0
            "
            aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.label}`}
          >
            {layer.visible ? (
              <Eye className="w-4 h-4 text-ocean-light" />
            ) : (
              <EyeOff className="w-4 h-4 text-neutral-400" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-neutral-100 truncate">
                {layer.label}
              </span>
              
              {/* Layer Type Badge */}
              <span className={`
                px-1.5 py-0.5 rounded text-xs font-mono flex-shrink-0
                ${layer.type === 'raster' 
                  ? 'bg-ocean-mid text-ocean-foam' 
                  : 'bg-neutral-700 text-neutral-200'
                }
              `}>
                {layer.type}
              </span>
            </div>
            
            {layer.description && (
              <p className="text-xs text-neutral-400 mt-0.5 truncate">
                {layer.description}
              </p>
            )}
          </div>

          {/* Layer Actions */}
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {layer.legendType !== 'none' && (
              <button
                className="p-1 rounded hover:bg-overlay-medium transition-colors focus-ring"
                aria-label={`Show ${layer.label} legend`}
                title="Show legend"
              >
                <Info className="w-3 h-3 text-neutral-400" />
              </button>
            )}
            
            {layer.supportsStyles.length > 0 && (
              <button
                className="p-1 rounded hover:bg-overlay-medium transition-colors focus-ring"
                aria-label={`Configure ${layer.label} styles`}
                title="Style options"
              >
                <Settings className="w-3 h-3 text-neutral-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Opacity Control */}
      {layer.visible && (
        <div className="px-3 pb-3">
          <div className="flex items-center space-x-3">
            <span className="text-xs text-neutral-400 flex-shrink-0 w-12">
              Opacity
            </span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={layer.opacity}
              onChange={handleOpacityChange}
              className="
                flex-1 h-1.5 rounded-full appearance-none cursor-pointer
                bg-neutral-600 focus-ring
              "
              style={{
                background: `linear-gradient(
                  to right, 
                  var(--ocean-light) 0%, 
                  var(--ocean-light) ${layer.opacity * 100}%, 
                  var(--neutral-600) ${layer.opacity * 100}%, 
                  var(--neutral-600) 100%
                )`
              }}
              aria-label={`${layer.label} opacity`}
            />
            <span className="text-xs text-neutral-300 flex-shrink-0 w-8 text-right">
              {Math.round(layer.opacity * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

const LayerGroup: React.FC<LayerGroupProps> = ({
  title,
  layers,
  onLayerEvent,
  defaultExpanded = false
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  const visibleCount = useMemo(() => 
    layers.filter(layer => layer.visible).length
  , [layers]);

  const handleToggleGroup = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleToggleAllInGroup = useCallback(() => {
    onLayerEvent({ type: 'TOGGLE_GROUP', group: layers[0]?.group || 'sargassum' });
  }, [layers, onLayerEvent]);

  if (layers.length === 0) return null;

  return (
    <div className="border border-panel rounded-lg mb-3 overflow-hidden">
      {/* Group Header */}
      <div className="bg-ocean-mid border-b border-panel">
        <button
          onClick={handleToggleGroup}
          className="
            w-full flex items-center justify-between p-3
            hover:bg-overlay-light transition-colors focus-ring
          "
          aria-expanded={expanded}
          aria-controls={`layer-group-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <div className="flex items-center space-x-2">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-neutral-300" />
            ) : (
              <ChevronRight className="w-4 h-4 text-neutral-300" />
            )}
            <span className="font-medium text-neutral-100">{title}</span>
            <span className="text-xs text-neutral-400">
              ({visibleCount}/{layers.length})
            </span>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleAllInGroup();
            }}
            className="
              px-2 py-1 rounded text-xs transition-colors
              hover:bg-overlay-medium focus-ring
              text-neutral-300 hover:text-neutral-100
            "
            aria-label={`Toggle all ${title.toLowerCase()} layers`}
          >
            Toggle All
          </button>
        </button>
      </div>

      {/* Group Content */}
      {expanded && (
        <div 
          id={`layer-group-${title.toLowerCase().replace(/\s+/g, '-')}`}
          className="bg-ocean-deep"
        >
          {layers.map(layer => (
            <LayerRow
              key={layer.id}
              layer={layer}
              onLayerEvent={onLayerEvent}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const LayerList: React.FC<LayerListProps> = ({
  layers,
  onLayerEvent,
  className = ''
}) => {
  // Group layers by category
  const groupedLayers = useMemo(() => {
    const groups = {
      sargassum: layers.filter(layer => layer.group === 'sargassum'),
      environment: layers.filter(layer => layer.group === 'environment'),
      utilities: layers.filter(layer => layer.group === 'utilities')
    };
    return groups;
  }, [layers]);

  const handleResetAll = useCallback(() => {
    onLayerEvent({ type: 'RESET_LAYERS' });
  }, [onLayerEvent]);

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-100">
          Map Layers
        </h3>
        <button
          onClick={handleResetAll}
          className="
            px-3 py-1.5 rounded-lg text-xs
            bg-ocean-mid hover:bg-ocean-shelf
            text-neutral-300 hover:text-neutral-100
            transition-colors focus-ring
          "
          aria-label="Reset all layers to default"
        >
          Reset All
        </button>
      </div>

      {/* Layer Groups */}
      <div className="space-y-3">
        <LayerGroup
          title="Sargassum Data"
          layers={groupedLayers.sargassum}
          onLayerEvent={onLayerEvent}
          defaultExpanded={true}
        />
        
        <LayerGroup
          title="Environmental Data"
          layers={groupedLayers.environment}
          onLayerEvent={onLayerEvent}
          defaultExpanded={false}
        />
        
        <LayerGroup
          title="Utilities"
          layers={groupedLayers.utilities}
          onLayerEvent={onLayerEvent}
          defaultExpanded={false}
        />
      </div>

      {/* Empty State */}
      {layers.length === 0 && (
        <div className="text-center py-8">
          <div className="text-neutral-400 mb-2">No layers available</div>
          <div className="text-xs text-neutral-500">
            Layers will appear here when data is loaded
          </div>
        </div>
      )}
    </div>
  );
};