import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEMO_PROJECTS, INITIAL_DEMO, demoProjectById } from "../app/demo-projects.ts";

const publicFile = (url) => fileURLToPath(new URL(`../public${url}`, import.meta.url));

test("demo catalog exposes two independent source-accurate projects", () => {
  assert.equal(DEMO_PROJECTS.length, 2);
  assert.equal(INITIAL_DEMO.id, "neon-pulse-loop");
  assert.equal(demoProjectById("kimi-to-hashiru-made").title, "君と走るまで");

  for (const demo of DEMO_PROJECTS) {
    const sectionEnd = Math.max(...demo.project.sections.map((section) => section.startBar + section.lengthBars));
    assert.equal(sectionEnd, demo.project.totalBars);
    assert.equal(new Set(demo.project.tracks.map((track) => track.id)).size, demo.project.tracks.length);
    assert.ok(existsSync(publicFile(demo.coverUrl)), `${demo.title} cover should exist`);
    assert.equal(demo.suggestions.length, 4);
  }
});

test("instrumental demo uses structural labels instead of vocal song labels", () => {
  const demo = demoProjectById("neon-pulse-loop");
  assert.equal(demo.project.sections.some((section) => /verse|chorus/i.test(section.label)), false);
  assert.deepEqual(demo.project.sections.map((section) => section.label), [
    "Opening", "Groove A", "Dropout", "Hook A", "Break", "Groove A 2", "Build", "Final Hook", "Outro",
  ]);
  assert.match(demo.featuredCommand, /final hook/i);
});

test("175 BPM demo has nine validated 320 kbps stem assets and WAV-derived peaks", () => {
  const demo = demoProjectById("kimi-to-hashiru-made");
  assert.equal(demo.project.bpm, 175);
  assert.equal(demo.project.totalBars, 158);
  assert.equal(demo.project.sections.length, 12);
  assert.equal(demo.project.tracks.length, 9);
  assert.deepEqual(demo.project.tracks.filter((track) => track.nearSilent).map((track) => track.id), ["percussion", "synth"]);

  for (const track of demo.project.tracks) {
    const audioPath = publicFile(track.audioUrl);
    const peaksPath = publicFile(track.peaksUrl);
    assert.ok(existsSync(audioPath), `${track.id} audio should exist`);
    assert.ok(statSync(audioPath).size > 8_000_000, `${track.id} should use the 320 kbps asset`);
    const envelope = JSON.parse(readFileSync(peaksPath, "utf8"));
    assert.equal(envelope.version, 1);
    assert.equal(envelope.sampleRate, 48_000);
    assert.equal(envelope.channels, 2);
    assert.equal(envelope.bins, 5_000);
    assert.ok(Math.abs(envelope.duration - demo.duration) < 0.02);
    assert.equal(envelope.peaks.length, 5_000);
    assert.equal(envelope.nearSilent, Boolean(track.nearSilent));
  }
});
