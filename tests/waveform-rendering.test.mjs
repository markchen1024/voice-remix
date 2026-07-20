import test from "node:test";
import assert from "node:assert/strict";

import { MAX_TRACK_WAVEFORM_RENDER_WIDTH, trackWaveformRenderWidth } from "../app/waveform-rendering.ts";

test("track waveform keeps short arrangements at native timeline resolution", () => {
  assert.equal(trackWaveformRenderWidth(3422), 3422);
});

test("track waveform caps long arrangements to a safe canvas bitmap width", () => {
  assert.equal(trackWaveformRenderWidth(158 * 58), MAX_TRACK_WAVEFORM_RENDER_WIDTH);
});

test("track waveform always returns a valid canvas width", () => {
  assert.equal(trackWaveformRenderWidth(0), 1);
  assert.equal(trackWaveformRenderWidth(Number.NaN), 1);
});
