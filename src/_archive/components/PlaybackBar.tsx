import React, { useCallback, useMemo, useState } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  RotateCcw, 
  Repeat,
  ChevronDown,
  Clock,
  Calendar
} from 'lucide-react';
import { ForecastState, PlaybackControls, AccessibilityProps, KeyboardHandlers } from '../types';

interface PlaybackBarProps extends AccessibilityProps, KeyboardHandlers {
  forecastState: ForecastState;
  controls: PlaybackControls;
  className?: string;
}

const SpeedDropdown: React.FC<{
  speed: number;
  onSpeedChange: (speed: number) => void;
}> = ({ speed, onSpeedChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const speedOptions = [0.25, 0.5, 1, 1.5, 2, 4];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-bg-glass hover:bg-white/10 rounded-lg border border-border-subtle transition-all duration-200 group"
      >
        <Clock className="w-4 h-4 text-text-secondary group-hover:text-accent-primary transition-colors" />
        <span className="text-sm font-medium text-text-primary">{speed}x</span>
        <ChevronDown className={`w-3 h-3 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 bg-bg-glass backdrop-blur-xl border border-border-medium rounded-xl shadow-lg overflow-hidden min-w-[120px]">
          {speedOptions.map((option) => (
            <button
              key={option}
              onClick={() => {
                onSpeedChange(option);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2 text-left text-sm transition-colors duration-150 hover:bg-white/10 ${
                speed === option ? 'bg-accent-primary/20 text-accent-primary font-medium' : 'text-text-primary'
              }`}
            >
              {option}x Speed
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const PlaybackBar: React.FC<PlaybackBarProps> = ({
  forecastState,
  controls,
  className = '',
  onKeyDown,
  ...accessibilityProps
}) => {
  const { dayIndex, playing, loop, speed, availableDays, loading } = forecastState;

  // Calculate timeline progress
  const progress = useMemo(() => {
    if (availableDays.length === 0) return 0;
    return (dayIndex / (availableDays.length - 1)) * 100;
  }, [dayIndex, availableDays.length]);

  // Calculate current date
  const currentDate = useMemo(() => {
    const today = new Date();
    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + dayIndex);
    return forecastDate;
  }, [dayIndex]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case ' ':
        event.preventDefault();
        playing ? controls.pause() : controls.play();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (event.shiftKey) {
          controls.seekToDay(Math.max(0, dayIndex - 1));
        } else {
          controls.previous();
        }
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) {
          controls.seekToDay(Math.min(availableDays.length - 1, dayIndex + 1));
        } else {
          controls.next();
        }
        break;
      case 'Home':
        event.preventDefault();
        controls.seekToDay(0);
        break;
      case 'End':
        event.preventDefault();
        controls.seekToDay(availableDays.length - 1);
        break;
    }
    onKeyDown?.(event);
  }, [playing, dayIndex, availableDays.length, controls, onKeyDown]);

  // Handle timeline scrubber change
  const handleTimelineChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(event.target.value);
    controls.seekToDay(newIndex);
  }, [controls]);

  // Handle speed change
  const handleSpeedChange = useCallback((newSpeed: number) => {
    controls.setSpeed(newSpeed);
  }, [controls]);

  // Format day label for main display
  const formatDayLabel = useCallback((index: number) => {
    if (index === 0) return 'Today';
    if (index === 1) return 'Tomorrow';
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    });
  }, []);

  // Format date for timeline markers
  const formatTimelineDate = useCallback((dayOffset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    
    if (dayOffset === 0) return 'Today';
    if (dayOffset === 1) return 'Tom';
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  }, []);

  // Get forecast confidence for each day
  const getForecastConfidence = useCallback((dayOffset: number) => {
    // Confidence typically decreases over time
    if (dayOffset <= 1) return 'High';
    if (dayOffset <= 3) return 'Medium'; 
    return 'Low';
  }, []);

  // Format date
  const formatDate = useCallback((date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      weekday: 'short'
    });
  }, []);

  return (
    <div 
      className={`
        fixed bottom-8 left-1/2 transform -translate-x-1/2
        panel-floating
        px-4 py-2 z-[1100]
        min-w-[400px] max-w-2xl w-[70vw]
        ${className}
      `}
      onKeyDown={handleKeyDown}
      {...accessibilityProps}
    >
      {/* Minimal Timeline Section */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-3 h-3 text-cyan-400" />
            <span className="text-sm font-medium text-neutral-200">
              {formatDayLabel(dayIndex)}
            </span>
            <span className="text-xs text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
              {formatDate(currentDate)}
            </span>
          </div>
          <div className="text-xs text-neutral-400">
            {dayIndex + 1} / {availableDays.length} days
          </div>
        </div>

        {/* Simplified Timeline Scrubber */}
        <div className="relative group">
          <div className="relative h-2 bg-neutral-800 rounded-full overflow-hidden">
            {/* Progress track */}
            <div 
              className="absolute inset-y-0 left-0 bg-cyan-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
            
            {/* Minimal day markers */}
            <div className="absolute inset-0 flex justify-between items-center px-0.5">
              {availableDays.map((_, index) => (
                <div
                  key={index}
                  className={`w-1 h-1 rounded-full transition-all duration-200 ${
                    index <= dayIndex ? 'bg-white' : 'bg-neutral-600'
                  }`}
                />
              ))}
            </div>
            
            {/* Compact thumb */}
            <div 
              className="absolute top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-sm border border-cyan-500 transition-all duration-200 group-hover:scale-110"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
          
          {/* Invisible range input for interactions */}
          <input
            type="range"
            min="0"
            max={Math.max(0, availableDays.length - 1)}
            value={dayIndex}
            onChange={handleTimelineChange}
            disabled={loading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            aria-label="Forecast timeline scrubber"
            aria-valuemin={0}
            aria-valuemax={availableDays.length - 1}
            aria-valuenow={dayIndex}
            aria-valuetext={formatDayLabel(dayIndex)}
          />
        </div>

        {/* Timeline markers with dates and confidence */}
        <div className="flex justify-between mt-2 px-1">
          {availableDays.map((day, index) => {
            const confidence = getForecastConfidence(index);
            
            return (
              <div key={day} className="flex flex-col items-center gap-1 min-w-0">
                <div 
                  className={`w-1 h-1 rounded-full transition-all duration-200 ${
                    index === dayIndex 
                      ? 'bg-cyan-400 scale-125' 
                      : index < dayIndex 
                        ? 'bg-cyan-500/60' 
                        : 'bg-neutral-600'
                  }`}
                />
                <span className={`text-xs transition-colors text-center leading-tight ${
                  index === dayIndex ? 'text-cyan-400 font-medium' : 'text-neutral-400'
                }`}>
                  {formatTimelineDate(index)}
                </span>
                <div className={`text-xs px-1 py-0.5 rounded border transition-all ${
                  confidence === 'High' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 
                  confidence === 'Medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 
                  'text-red-400 bg-red-500/10 border-red-500/20'
                }`}>
                  {confidence}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enhanced Control Panel */}
      <div className="flex items-center justify-between">
        {/* Left: Navigation Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={controls.previous}
            disabled={dayIndex === 0 || loading}
            className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            aria-label="Previous day"
            title="Previous day (←)"
          >
            <SkipBack className="w-3 h-3 text-neutral-300" />
          </button>

          <button
            onClick={playing ? controls.pause : controls.play}
            disabled={loading}
            className="p-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white transition-all duration-200 disabled:opacity-50"
            aria-label={playing ? 'Pause forecast' : 'Play forecast'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {playing ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          <button
            onClick={controls.next}
            disabled={dayIndex === availableDays.length - 1 || loading}
            className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            aria-label="Next day"
            title="Next day (→)"
          >
            <SkipForward className="w-3 h-3 text-neutral-300" />
          </button>
        </div>

        {/* Center: Current Forecast Info */}
        <div className="text-center">
          <div className="text-xl font-bold text-text-primary mb-1">
            {formatDayLabel(dayIndex)}
          </div>
          <div className="text-sm text-text-secondary">
            Ghana Coastal Forecast
          </div>
        </div>

        {/* Right: Settings Controls */}
        <div className="flex items-center gap-3">
          {/* Speed Control with Dropdown */}
          <SpeedDropdown 
            speed={speed} 
            onSpeedChange={handleSpeedChange} 
          />

          {/* Loop Toggle */}
          <button
            onClick={controls.toggleLoop}
            className={`p-2.5 rounded-xl border transition-all duration-200 ${
              loop 
                ? 'bg-accent-primary/20 border-accent-primary text-accent-primary hover:bg-accent-primary/30' 
                : 'bg-bg-glass border-border-subtle text-text-muted hover:bg-white/10 hover:text-text-secondary'
            }`}
            aria-label={loop ? 'Disable loop' : 'Enable loop'}
            title="Toggle loop"
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Reset Button */}
          <button
            onClick={() => controls.seekToDay(0)}
            disabled={dayIndex === 0 || loading}
            className="p-2.5 rounded-xl bg-bg-glass hover:bg-white/10 border border-border-subtle transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
            aria-label="Reset to first day"
            title="Reset to start (Home)"
          >
            <RotateCcw className="w-4 h-4 text-text-secondary group-hover:text-accent-primary transition-colors" />
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-bg-glass backdrop-blur-sm rounded-2xl flex items-center justify-center">
          <div className="flex items-center gap-3 text-accent-primary">
            <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading forecast data...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaybackBar;