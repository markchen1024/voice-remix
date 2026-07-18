import assert from "node:assert/strict";
import test from "node:test";
import { arrangementSignature, createArrangementSegments } from "../app/audio-arrangement.ts";

const project = {
  version: 2,
  totalBars: 59,
  bpm: 118,
  sections: [
    { id: "intro-1", kind: "intro", label: "Intro", sourceStartBar: 0, startBar: 0, lengthBars: 4, energy: 0.3 },
    { id: "chorus-2", kind: "chorus", label: "Final Chorus", sourceStartBar: 44, startBar: 40, lengthBars: 9, energy: 0.9 },
  ],
  tracks: [],
};

test("moved sections keep their source audio while changing playback destination", () => {
  const segments = createArrangementSegments(project, 118);
  const chorus = segments.find((segment) => segment.sectionId === "chorus-2");
  assert.ok(chorus);
  assert.equal(chorus.sourceStartBar, 44);
  assert.equal(chorus.destinationStartBar, 40);
  assert.equal(chorus.sourceStartSeconds, 88);
  assert.equal(chorus.destinationStartSeconds, 80);
  assert.equal(chorus.durationSeconds, 18);
});

test("arrangement signature changes only when audio placement changes", () => {
  const before = arrangementSignature(project);
  const gainOnly = { ...project, tracks: [{ id: "drums", level: 1.25 }] };
  const moved = { ...project, sections: project.sections.map((section) => section.id === "chorus-2" ? { ...section, startBar: 39 } : section) };
  assert.equal(arrangementSignature(gainOnly), before);
  assert.notEqual(arrangementSignature(moved), before);
});

