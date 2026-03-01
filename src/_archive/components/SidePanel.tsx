import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  RefreshCw,
  ChevronDown,
  MapPin,
  Map,
  Cog,
  TrendingUp
} from 'lucide-react';
import { LayerList } from './LayerList';
import { Layer, LayerEvent } from '../types';

interface SidePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  layers: Layer[];
  onLayerEvent: (event: LayerEvent) => void;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
  badge
}) => (
  <div className="panel-floating mb-4 overflow-hidden transition-all duration-300 hover:shadow-lg">
    <button
      onClick={onToggle}
      className="collapsible-header w-full"
      aria-expanded={isExpanded}
    >
      <div className="flex items-center gap-3">
        <div className="text-aqua-mid group-hover:text-aqua-surface transition-colors">
          {icon}
        </div>
        <h3 className="font-semibold text-text-primary text-sm">{title}</h3>
        {badge && (
          <span className="px-2 py-0.5 text-xs font-medium bg-aqua-mid/20 text-aqua-mid rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div className="collapsible-icon text-text-muted group-hover:text-text-secondary transition-colors">
        <ChevronDown size={16} />
      </div>
    </button>
    <div 
      className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="px-4 pb-4">
        {children}
      </div>
    </div>
  </div>
);

export const SidePanel: React.FC<SidePanelProps> = ({
  isOpen,
  onToggle,
  layers,
  onLayerEvent
}) => {
  const [expandedSections, setExpandedSections] = useState({
    status: true,
    layers: true,
    forecast: false,
    advanced: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <div 
      className={`
        fixed left-0 top-[48px] h-[calc(100vh-48px)] z-[1200]
        backdrop-blur-xl border-r border-glass-border
        transition-all duration-300 ease-out flex flex-col
        w-14 hover:w-64 group
      `}
      style={{
        background: 'var(--glass-minimal)',
        backdropFilter: 'blur(24px) saturate(120%)',
        borderRight: '1px solid var(--glass-border)'
      }}
    >
      {/* Icon-only header */}
      <div className="p-3 border-b border-glass-border">
        <div className="flex items-center justify-center group-hover:justify-between">
          <div className="hidden group-hover:flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-glass" />
            <h2 className="text-sm font-medium text-text-glass-primary">Controls</h2>
          </div>
          <div className="group-hover:hidden flex items-center justify-center">
            <Layers className="w-4 h-4 text-accent-glass" />
          </div>
          <button
            onClick={onToggle}
            className="hidden group-hover:flex p-2 rounded-lg bg-glass-secondary hover:bg-glass-accent transition-all duration-200"
            aria-label="Close panel"
          >
            <X className="h-3 w-3 text-text-glass-secondary" />
          </button>
        </div>
      </div>

      {/* Icon navigation when collapsed, full content on hover */}
      <div className="flex-1 overflow-y-auto">
        {/* Icon-only navigation */}
        <div className="group-hover:hidden flex flex-col items-center gap-4 p-3">
          <button 
            className="p-3 rounded-lg bg-glass-secondary hover:bg-accent-glass transition-all"
            title="Map Layers"
          >
            <Map className="w-4 h-4 text-text-glass-secondary" />
          </button>
          <button 
            className="p-3 rounded-lg bg-glass-secondary hover:bg-accent-glass transition-all"
            title="Forecasts"
          >
            <TrendingUp className="w-4 h-4 text-text-glass-secondary" />
          </button>
          <button 
            className="p-3 rounded-lg bg-glass-secondary hover:bg-accent-glass transition-all"
            title="Settings"
          >
            <Cog className="w-4 h-4 text-text-glass-secondary" />
          </button>
        </div>

        {/* Full content on hover */}
        <div className="hidden group-hover:block p-4 space-y-4">
          {/* 🗺️ Map Layers Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4 text-accent-glass" />
              <h3 className="text-sm font-medium text-text-glass-primary">Layers</h3>
              <span className="text-xs text-text-glass-muted bg-glass-accent px-2 py-0.5 rounded">
                {layers.filter(l => l.visible).length}/{layers.length}
              </span>
            </div>
            <LayerList 
              layers={layers}
              onLayerEvent={onLayerEvent}
            />
          </div>
          
          {/* Section Divider */}
          <div className="h-px bg-glass-border my-4"></div>
          
          {/* 📊 Forecasts Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent-glass" />
              <h3 className="text-sm font-medium text-text-glass-primary">Forecasts</h3>
            </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-bg-glass rounded-lg border border-border-subtle">
                  <div className="text-xs text-text-muted">Coverage</div>
                  <div className="text-lg font-bold text-text-primary">Ghana Coast</div>
                </div>
                <div className="p-3 bg-bg-glass rounded-lg border border-border-subtle">
                  <div className="text-xs text-text-muted">Resolution</div>
                  <div className="text-lg font-bold text-text-primary">1km²</div>
                </div>
              </div>
              
              <div className="p-3 bg-accent-warning/10 border border-accent-warning/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="w-4 h-4 text-accent-warning" />
                  <span className="text-sm font-medium text-accent-warning">Forecast Status</span>
                </div>
                <div className="text-xs text-text-secondary">
                  7-day forecast available • Updated every 6 hours
                </div>
              </div>
            </div>
          </CollapsibleSection>
          
          {/* Section Divider */}
          <div className="section-divider"></div>
          
          {/* ⚙️ Advanced Settings Section */}
          <CollapsibleSection
            title="Advanced Settings"
            icon={<Cog size={18} />}
            isExpanded={expandedSections.advanced}
            onToggle={() => toggleSection('advanced')}
          >
            <div className="pt-4 space-y-3">
              {/* Beached Sargassum Placeholder */}
              <div className="p-4 bg-gradient-to-r from-accent-coral/10 to-accent-warning/10 rounded-lg border border-accent-coral/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-accent-coral" />
                    <span className="text-sm font-medium text-text-primary">
                      Beached Detection
                    </span>
                  </div>
                  <span className="text-xs bg-accent-warning text-bg-primary px-2 py-1 rounded-full font-semibold">
                    COMING SOON
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  AI-powered coastal beaching probability using Sentinel-2 satellite imagery
                </p>
              </div>
              
              {/* Render Quality Settings */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-secondary">Render Quality</label>
                <select className="w-full p-2 bg-bg-glass border border-border-subtle rounded-lg text-sm text-text-primary focus:border-accent-primary focus:outline-none">
                  <option value="smooth">Smooth (Default)</option>
                  <option value="pixelated">Pixelated</option>
                  <option value="high">High Quality</option>
                </select>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Modern Footer */}
      {isOpen && (
        <div className="p-4 bg-gradient-to-r from-bg-primary to-bg-secondary border-t border-border-medium">
          <div className="text-center">
            <div className="text-xs font-semibold text-text-secondary mb-1">
              SARTRAC v2.1
            </div>
            <div className="text-xs text-text-muted">
              Real-time Marine Intelligence Platform
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SidePanel;