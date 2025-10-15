import React from 'react';
import { StatusData } from '../types';

interface StatusCardProps {
  status: StatusData;
  className?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({ 
  status, 
  className = '' 
}) => {
  const getStatusColor = (systemStatus: StatusData['system']) => {
    switch (systemStatus) {
      case 'operational':
        return 'var(--success)';
      case 'degraded':
        return 'var(--warning)';
      case 'offline':
        return 'var(--error)';
      default:
        return 'var(--neutral-400)';
    }
  };

  const getStatusIcon = (systemStatus: StatusData['system']) => {
    switch (systemStatus) {
      case 'operational':
        return '🟢';
      case 'degraded':
        return '🟡';
      case 'offline':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div 
      className={`bg-panel backdrop-blur-panel border border-panel rounded-lg p-4 elevation-2 ${className}`}
      role="status"
      aria-label="System status information"
    >
      {/* Status Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div 
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: getStatusColor(status.system) }}
            aria-hidden="true"
          />
          <span 
            className="text-sm font-medium"
            style={{ color: getStatusColor(status.system) }}
          >
            {getStatusIcon(status.system)} System {status.system.charAt(0).toUpperCase() + status.system.slice(1)}
          </span>
        </div>
        <span className="text-xs text-ocean-foam">Live Data</span>
      </div>

      {/* Status Details Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col">
          <span className="text-neutral-300 font-medium mb-1">Last Update</span>
          <span className="text-neutral-100">{formatTime(status.lastUpdate)}</span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-neutral-300 font-medium mb-1">Data Source</span>
          <span className="text-neutral-100">{status.dataSource}</span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-neutral-300 font-medium mb-1">Coverage</span>
          <span className="text-neutral-100">{status.coverage}</span>
        </div>
        
        {status.nextUpdate && (
          <div className="flex flex-col">
            <span className="text-neutral-300 font-medium mb-1">Next Update</span>
            <span className="text-neutral-100">{formatTime(status.nextUpdate)}</span>
          </div>
        )}
      </div>

      {/* Performance Indicator */}
      <div className="mt-3 pt-3 border-t border-panel">
        <div className="flex items-center justify-between text-xs">
          <span className="text-neutral-300">Data Quality</span>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-success rounded-full" aria-hidden="true" />
            <span className="text-success">Excellent</span>
          </div>
        </div>
      </div>
    </div>
  );
};