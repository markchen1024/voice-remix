import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDecodedAudio, createFullMixProject, filenameTitle, projectBarsForDuration, replaceProjectStem } from "../app/local-audio-import.ts";

const asset = {
  audioUrl: "blob:audio",
  duration: 120,
  filename: "My Song.wav",
  maxDb: -1,
  meanDb: -18,
  nearSilent: false,
  peaksUrl: "blob:peaks",
};

const project = {
  version: 2,
  totalBars: 8,
  bpm: 120,
  sections: [{ id: "verse-1", kind: "verse", label: "Verse", startBar: 0, lengthBars: 8, energy: 0.5 }],
  tracks: [
    { id: "drums", label: "DRUMS", role: "stem", color: "red", enabled: true, level: 1, audioUrl: "old", peaksUrl: "old-peaks", meanDb: -20, maxDb: -3 },
    { id: "bass", label: "BASS", role: "stem", color: "purple", enabled: true, level: 1, audioUrl: "bass", peaksUrl: "bass-peaks", meanDb: -20, maxDb: -3 },
  ],
  automation: [{ sectionId: "verse-1", trackId: "drums", enabled: false }],
};

test("decoded browser audio produces honest peak envelopes and levels", () => {
  const samples = Float32Array.from([-0.5, -0.25, 0.25, 0.5]);
  const analysis = analyzeDecodedAudio({ duration: 2, numberOfChannels: 1, sampleRate: 2, getChannelData: () => samples }, 2);
  assert.deepEqual(analysis.envelope.peaks, [[-0.5, 0], [0, 0.5]]);
  assert.equal(analysis.duration, 2);
  assert.equal(Math.round(analysis.maxDb), -6);
  assert.equal(analysis.nearSilent, false);
});

test("full song imports become a single editable master mix", () => {
  const imported = createFullMixProject(project, asset, 120);
  assert.equal(imported.totalBars, projectBarsForDuration(120, 120));
  assert.equal(imported.tracks.length, 1);
  assert.equal(imported.tracks[0].id, "mix");
  assert.equal(imported.tracks[0].label, "MASTER MIX");
  assert.equal(imported.sections[0].startBar, 0);
  assert.equal(imported.sections.at(-1).startBar + imported.sections.at(-1).lengthBars, imported.totalBars);
  imported.sections.slice(1).forEach((section, index) => {
    const previous = imported.sections[index];
    assert.equal(section.startBar, previous.startBar + previous.lengthBars);
  });
  assert.equal(filenameTitle("My Song.wav"), "My Song");
});

test("stem replacement preserves the arrangement and other tracks", () => {
  const imported = replaceProjectStem(project, "drums", asset);
  assert.equal(imported.tracks.find((track) => track.id === "drums").audioUrl, "blob:audio");
  assert.equal(imported.tracks.find((track) => track.id === "bass").audioUrl, "bass");
  assert.equal(imported.sections[0].id, "verse-1");
  assert.deepEqual(imported.automation, []);
  assert.equal(project.tracks[0].audioUrl, "old");
});
