import assert from "node:assert/strict";
import test from "node:test";
import { audioExportFilename, createAudioRenderInstructions, encodeWavPcm16 } from "../app/audio-export.ts";

const project = {
  version: 4,
  totalBars: 8,
  bpm: 120,
  sections: [
    { id: "intro", kind: "intro", label: "Intro", startBar: 0, sourceStartBar: 0, lengthBars: 4, energy: 1 },
    { id: "hook", kind: "chorus", label: "Hook", startBar: 4, sourceStartBar: 2, lengthBars: 4, energy: 0.6 },
  ],
  tracks: [
    { id: "drums", label: "DRUMS", role: "stem", color: "red", enabled: true, level: 1, audioUrl: "drums.wav", peaksUrl: "drums.json", meanDb: -20, maxDb: -2 },
    { id: "bass", label: "BASS", role: "stem", color: "purple", enabled: false, level: 1, audioUrl: "bass.wav", peaksUrl: "bass.json", meanDb: -20, maxDb: -2 },
  ],
  automation: [{ sectionId: "hook", trackId: "drums", level: 0.5 }],
};

test("audio export instructions preserve arrangement sources and audible automation", () => {
  const instructions = createAudioRenderInstructions(project, 16);
  assert.equal(instructions.length, 2);
  assert.deepEqual(instructions.map(({ sectionId, sourceStartSeconds, destinationStartSeconds }) => ({ sectionId, sourceStartSeconds, destinationStartSeconds })), [
    { sectionId: "intro", sourceStartSeconds: 0, destinationStartSeconds: 0 },
    { sectionId: "hook", sourceStartSeconds: 4, destinationStartSeconds: 8 },
  ]);
  assert.equal(instructions[0].gain, 1);
  assert.equal(instructions[1].gain, 0.45);
});

test("PCM WAV encoding writes a valid interleaved stereo file", () => {
  const wav = encodeWavPcm16([Float32Array.from([-1, 0.5]), Float32Array.from([1, -0.5])], 48_000);
  const view = new DataView(wav);
  const text = (offset, length) => String.fromCharCode(...Array.from({ length }, (_, index) => view.getUint8(offset + index)));
  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 48_000);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(wav.byteLength, 52);
  assert.equal(view.getInt16(44, true), -32_768);
  assert.equal(view.getInt16(46, true), 32_767);
});

test("audio export filenames are safe and distinct from project snapshots", () => {
  assert.equal(audioExportFilename("Neon Pulse Loop"), "neon-pulse-loop-remix.wav");
});
