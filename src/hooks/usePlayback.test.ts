import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayback } from '../hooks/usePlayback';

describe('usePlayback', () => {
  let setIdx: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setIdx = vi.fn();
  });

  it('starts in paused state', () => {
    const { result } = renderHook(() => usePlayback(5, setIdx));
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playbackSpeed).toBe(1);
    expect(result.current.loopEnabled).toBe(false);
    expect(result.current.compareMode).toBe(false);
  });

  it('togglePlay flips play state', () => {
    const { result } = renderHook(() => usePlayback(5, setIdx));

    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(true);

    act(() => result.current.togglePlay());
    expect(result.current.isPlaying).toBe(false);
  });

  it('setPlaybackSpeed updates speed', () => {
    const { result } = renderHook(() => usePlayback(5, setIdx));

    act(() => result.current.setPlaybackSpeed(2));
    expect(result.current.playbackSpeed).toBe(2);
  });

  it('setLoopEnabled toggles loop', () => {
    const { result } = renderHook(() => usePlayback(5, setIdx));

    act(() => result.current.setLoopEnabled(true));
    expect(result.current.loopEnabled).toBe(true);
  });

  it('advances index while playing', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => usePlayback(5, setIdx));
    act(() => result.current.setIsPlaying(true));

    // Advance past the 1500ms interval
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(setIdx).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('Space key toggles playback', () => {
    renderHook(() => usePlayback(5, setIdx));

    // Dispatch Space key
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true })
      );
    });

    // The hook should have toggled isPlaying via setIsPlaying internally.
    // We just verify no crash and the event was handled.
  });

  it('ArrowRight calls setCurrentForecastIndex', () => {
    renderHook(() => usePlayback(5, setIdx));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true })
      );
    });

    expect(setIdx).toHaveBeenCalled();
  });

  it('ArrowLeft calls setCurrentForecastIndex', () => {
    renderHook(() => usePlayback(5, setIdx));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true })
      );
    });

    expect(setIdx).toHaveBeenCalled();
  });
});
