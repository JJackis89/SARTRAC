import React from 'react';

interface SatelliteStatusIndicatorProps {
  isLoading: boolean;
  totalObservations: number;
  qualityScore: number;
  error?: string | null;
  lastUpdate?: Date;
}

const SatelliteStatusIndicator: React.FC<SatelliteStatusIndicatorProps> = ({
  isLoading,
  totalObservations,
  qualityScore,
  error,
  lastUpdate
}) => {
  const getStatusColor = () => {
    if (error) return 'text-red-400';
    if (isLoading) return 'text-yellow-400';
    if (qualityScore > 0.8) return 'text-green-400';
    if (qualityScore > 0.6) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getStatusIcon = () => {
    if (error) return '❌';
    if (isLoading) return '🔄';
    if (qualityScore > 0.8) return '🛰️';
    if (qualityScore > 0.6) return '📡';
    return '⚠️';
  };

  const getStatusText = () => {
    if (error) return 'Satellite Error';
    if (isLoading) return 'Loading...';
    if (qualityScore > 0.8) return 'Excellent';
    if (qualityScore > 0.6) return 'Good';
    return 'Limited';
  };

  return (
    <div className="satellite-status fixed top-24 right-6 bg-gray-800/90 backdrop-blur-lg rounded-2xl shadow-xl p-4 z-[1000] min-w-[220px] border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{getStatusIcon()}</span>
          <span className="text-sm font-semibold text-white">Satellite Data</span>
        </div>
        <span className={`text-xs font-bold ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      <div className="space-y-2 text-xs text-gray-300">
        <div className="flex justify-between">
          <span>Observations:</span>
          <span className="font-semibold text-white">{totalObservations}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Quality Score:</span>
          <span className={`font-semibold ${getStatusColor()}`}>
            {(qualityScore * 100).toFixed(1)}%
          </span>
        </div>

        {lastUpdate && (
          <div className="flex justify-between">
            <span>Updated:</span>
            <span className="font-semibold text-blue-300">
              {lastUpdate.toLocaleTimeString()}
            </span>
          </div>
        )}

        {error && (
          <div className="mt-2 p-2 bg-red-900/50 rounded border border-red-500/50">
            <div className="text-xs text-red-200">{error}</div>
          </div>
        )}

        {isLoading && (
          <div className="mt-2">
            <div className="w-full bg-gray-700 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SatelliteStatusIndicator;