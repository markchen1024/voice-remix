export const MAX_TRACK_WAVEFORM_RENDER_WIDTH = 4096;

/**
 * Long arrangements can exceed the browser/GPU texture limit when a canvas is
 * created at one pixel per timeline pixel. Keep the backing bitmap bounded and
 * let CSS scale it across the full lane instead.
 */
export function trackWaveformRenderWidth(displayWidth: number) {
  if (!Number.isFinite(displayWidth)) return 1;
  return Math.max(1, Math.min(MAX_TRACK_WAVEFORM_RENDER_WIDTH, Math.round(displayWidth)));
}
