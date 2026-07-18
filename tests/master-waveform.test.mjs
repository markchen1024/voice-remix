import assert from "node:assert/strict";
import test from "node:test";
import { buildMasterWaveform } from "../app/master-waveform.ts";

function project(overrides = {}) {
  return {
    version: 1,
    totalBars: 8,
    bpm: 120,
    sections: [
      { id: "verse", kind: "verse", label: "Verse", startBar: 0, sourceStartBar: 0, lengthBars: 4, energy: 1 },
      { id: "chorus", kind: "chorus", label: "Chorus", startBar: 4, sourceStartBar: 4, lengthBars: 4, energy: 1 },
    ],
    tracks: [
      { id: "drums", label: "DRUMS", role: "stem", color: "red", enabled: true, level: 1, audioUrl: "", peaksUrl: "", meanDb: -12, maxDb: -1 },
      { id: "bass", label: "BASS", role: "stem", color: "purple", enabled: true, level: 1, audioUrl: "", peaksUrl: "", meanDb: -12, maxDb: -1 },
    ],
    ...overrides,
  };
}

const envelopes = {
  drums: { peaks: Array.from({ length: 8 }, (_, index) => [-(index + 1) / 20, (index + 1) / 20]) },
  bass: { peaks: Array.from({ length: 8 }, () => [-0.1, 0.1]) },
};

test("master overview is derived from the imported stem peaks", () => {
  const result = buildMasterWaveform(project(), envelopes, 8);
  assert.equal(result.length, 8);
  assert.ok(result[0][0] < 0);
  assert.ok(result[7][1] > result[0][1]);
});

test("master overview reflects section-scoped mute and gain automation", () => {
  const muted = buildMasterWaveform(project({ automation: [
    { sectionId: "chorus", trackId: "drums", enabled: false },
    { sectionId: "chorus", trackId: "bass", enabled: false },
  ] }), envelopes, 8);
  assert.deepEqual(muted.slice(4), [[0, 0], [0, 0], [0, 0], [0, 0]]);

  const baseline = buildMasterWaveform(project(), { drums: envelopes.drums }, 8);
  const boosted = buildMasterWaveform(project({ automation: [{ sectionId: "chorus", trackId: "drums", level: 1.5 }] }), { drums: envelopes.drums }, 8);
  assert.ok(boosted[6][1] > baseline[6][1]);
  assert.equal(boosted[2][1], baseline[2][1]);
});

test("master overview follows a moved section's original source peaks", () => {
  const moved = project({ sections: [
    { id: "chorus", kind: "chorus", label: "Chorus", startBar: 0, sourceStartBar: 4, lengthBars: 4, energy: 1 },
    { id: "verse", kind: "verse", label: "Verse", startBar: 4, sourceStartBar: 0, lengthBars: 4, energy: 1 },
  ] });
  const result = buildMasterWaveform(moved, { drums: envelopes.drums }, 8);
  assert.ok(result[0][1] > result[4][1]);
});
