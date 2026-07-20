import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDecodedAudio, createFullMixProject, createStemProject, detectAudioSections, filenameTitle, mapStemFilenames, matchStemTrackId, projectBarsForDuration, replaceProjectStem, validateMappedStemAssets } from "../app/local-audio-import.ts";

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
  const imported = createFullMixProject(project, asset, 96);
  assert.equal(imported.bpm, 96);
  assert.equal(imported.totalBars, projectBarsForDuration(120, 96));
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
  assert.equal(imported.sections.some((section) => /verse|chorus/i.test(section.label)), false);
});

test("real per-bar energy changes produce evidence-based neutral sections", () => {
  const bpm = 120;
  const totalBars = 40;
  const sampleRate = 100;
  const duration = totalBars * 240 / bpm;
  const samples = new Float32Array(duration * sampleRate);
  const amplitudeForBar = (bar) => bar < 8 ? 0.08 : bar < 20 ? 0.35 : bar < 32 ? 0.8 : 0.12;
  for (let index = 0; index < samples.length; index += 1) {
    const bar = Math.min(totalBars - 1, Math.floor(index / samples.length * totalBars));
    samples[index] = Math.sin(index / sampleRate * Math.PI * 10) * amplitudeForBar(bar);
  }
  const decoded = { duration, numberOfChannels: 1, sampleRate, getChannelData: () => samples };
  const analysis = analyzeDecodedAudio(decoded, 128, bpm);
  assert.equal(analysis.structure.bars.length, totalBars);
  assert.ok(analysis.structure.confidence >= 0.35);

  const sections = detectAudioSections(totalBars, analysis.structure);
  assert.deepEqual(sections.map((section) => section.startBar), [0, 8, 20, 32]);
  assert.equal(sections[0].label, "Opening");
  assert.equal(sections.at(-1).label, "Outro");
  assert.equal(sections.some((section) => /verse|chorus/i.test(section.label)), false);
  assert.equal(sections.at(-1).startBar + sections.at(-1).lengthBars, totalBars);
});

test("stem replacement preserves the arrangement and other tracks", () => {
  const imported = replaceProjectStem(project, "drums", asset);
  assert.equal(imported.tracks.find((track) => track.id === "drums").audioUrl, "blob:audio");
  assert.equal(imported.tracks.find((track) => track.id === "bass").audioUrl, "bass");
  assert.equal(imported.sections[0].id, "verse-1");
  assert.deepEqual(imported.automation, []);
  assert.equal(project.tracks[0].audioUrl, "old");
});

test("Suno-style numbered stem names map to editor tracks", () => {
  const names = [
    "0 Lead Vocals.wav",
    "1 Backing Vocals.wav",
    "2 Drums.wav",
    "3 Bass.wav",
    "4 Guitar.wav",
    "5 Keyboard.wav",
    "6 Percussion.wav",
    "7 Synth.wav",
    "8 Other.wav",
    "My Song.mp3",
  ];
  assert.deepEqual(mapStemFilenames(names).map(({ trackId }) => trackId), [
    "lead_vocals", "backing_vocals", "drums", "bass", "guitar", "keyboards", "percussion", "synth", "other", null,
  ]);
  assert.equal(matchStemTrackId("Song - FX.flac"), "fx");
  assert.equal(matchStemTrackId("和声.wav"), "backing_vocals");
});

test("duplicate filename mappings are surfaced before audio decoding", () => {
  const mapped = mapStemFilenames(["Drums.wav", "Song - Drum Kit.wav", "Bass.wav"]);
  assert.equal(mapped[0].duplicate, true);
  assert.equal(mapped[1].duplicate, true);
  assert.equal(mapped[2].duplicate, false);
});

test("mapped stems create an ordered multitrack project with shared arrangement", () => {
  const stemAsset = (filename, duration = 128) => ({ ...asset, audioUrl: `blob:${filename}`, peaksUrl: `blob:${filename}-peaks`, duration, filename });
  const imported = createStemProject(project, [
    { trackId: "synth", asset: stemAsset("Synth.wav") },
    { trackId: "drums", asset: stemAsset("Drums.wav") },
    { trackId: "bass", asset: stemAsset("Bass.wav") },
  ], 128);

  assert.equal(imported.bpm, 128);
  assert.deepEqual(imported.tracks.map((track) => track.id), ["drums", "bass", "synth"]);
  assert.equal(imported.totalBars, projectBarsForDuration(128, 128));
  assert.equal(imported.sections.at(-1).startBar + imported.sections.at(-1).lengthBars, imported.totalBars);
  assert.deepEqual(imported.automation, []);
});

test("batch validation rejects duplicate or unsynchronized stems", () => {
  const stemAsset = (filename, duration = 120) => ({ ...asset, duration, filename });
  assert.throws(() => validateMappedStemAssets([
    { trackId: "drums", asset: stemAsset("Drums A.wav") },
    { trackId: "drums", asset: stemAsset("Drums B.wav") },
  ]), /More than one file maps to drums/);
  assert.throws(() => validateMappedStemAssets([
    { trackId: "drums", asset: stemAsset("Drums.wav") },
    { trackId: "bass", asset: stemAsset("Bass.wav", 116) },
  ]), /Export synchronized stems/);
});
