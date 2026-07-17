import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const assetUrl = new URL("../public/audio/neon-pulse-loop/", import.meta.url);

async function readPeaks(stem) {
  return JSON.parse(await readFile(new URL(`${stem}-peaks.json`, assetUrl), "utf8"));
}

test("waveform envelopes preserve the source duration and timeline resolution", async () => {
  for (const stem of ["drums", "percussion", "bass", "synth", "fx"]) {
    const data = await readPeaks(stem);
    assert.equal(data.version, 1);
    assert.equal(data.bins, 3422);
    assert.equal(data.peaks.length, 3422);
    assert.ok(Math.abs(data.duration - 119.4) < 0.01);
    assert.ok(data.peaks.every((peak) => peak.length === 2 && peak[0] <= peak[1]));
  }
});

test("near-silent stems remain identifiable instead of being visually normalized", async () => {
  const drums = await readPeaks("drums");
  const fx = await readPeaks("fx");
  assert.equal(drums.nearSilent, false);
  assert.equal(fx.nearSilent, true);
  assert.ok(fx.maxDb < -50);
  assert.ok(drums.maxDb > -10);
});
