import React from 'react';
import { Play, Pause } from 'lucide-react';

interface ForecastData {
  date: string;
  concentration: number[][];
  driftDirection: number[][];
  uncertainty: 'Low' | 'Medium' | 'High';
}

interface TimelineControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentDay: number;
  totalDays: number;
  onDayChange: (day: number) => void;
  forecastData: ForecastData[];
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  isPlaying,
  onPlayPause,
  currentDay,
  totalDays,
  onDayChange,
  forecastData
}) => {
  return (
    <div className="p-3 min-w-96">
      <div className="flex items-center space-x-3">
        {/* Compact Play/Pause Button */}
        <button
          onClick={onPlayPause}
          className="p-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isPlaying ? (
            <Pause size={16} />
          ) : (
            <Play size={16} className="ml-0.5" />
          )}
        </button>

        {/* Compact Timeline */}
        <div className="flex-1 space-y-2">
          {/* Header */}
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-cyan-100 flex items-center space-x-1.5">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
              <span>Day {currentDay}/{totalDays}</span>
            </span>
            <span className="text-xs text-cyan-200">
              {forecastData[currentDay - 1]?.date && 
                new Date(forecastData[currentDay - 1].date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })
              }
            </span>
          </div>
          
          {/* Compact Slider */}
          <div className="relative">
            <input
              type="range"
              min={1}
              max={totalDays}
              value={currentDay}
              onChange={(e) => onDayChange(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-700/50 rounded-lg appearance-none cursor-pointer border border-cyan-400/20"
              style={{
                background: `linear-gradient(to right, 
                  rgb(34 211 238 / 0.8) 0%, 
                  rgb(34 211 238 / 0.8) ${((currentDay - 1) / (totalDays - 1)) * 100}%, 
                  rgb(51 65 85 / 0.5) ${((currentDay - 1) / (totalDays - 1)) * 100}%, 
                  rgb(51 65 85 / 0.5) 100%)`
              }}
            />
            
            {/* Compact Day Dots */}
            <div className="flex justify-between mt-2">
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => (
                <button
                  key={day}
                  onClick={() => onDayChange(day)}
                  className={`w-6 h-6 rounded-full text-xs font-bold transition-all duration-300 border ${
                    day === currentDay 
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white border-cyan-300 shadow-lg scale-110' 
                      : day < currentDay
                      ? 'bg-cyan-500/40 text-cyan-200 border-cyan-400/40 hover:bg-cyan-500/60'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-600/50'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          
          {/* Compact Confidence */}
          {forecastData[currentDay - 1]?.uncertainty && (
            <div className="flex justify-center mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                forecastData[currentDay - 1].uncertainty === 'Low' 
                  ? 'bg-green-500/80 text-green-100 border-green-400/30' :
                forecastData[currentDay - 1].uncertainty === 'Medium' 
                  ? 'bg-yellow-500/80 text-yellow-100 border-yellow-400/30' :
                  'bg-red-500/80 text-red-100 border-red-400/30'
              }`}>
                {forecastData[currentDay - 1].uncertainty === 'Low' && '✓ '}
                {forecastData[currentDay - 1].uncertainty === 'Medium' && '⚠ '}
                {forecastData[currentDay - 1].uncertainty === 'High' && '✕ '}
                {forecastData[currentDay - 1].uncertainty}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelineControls;