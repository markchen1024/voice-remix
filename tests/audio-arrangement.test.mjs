import assert from "node:assert/strict";
import test from "node:test";
import { arrangementSignature, createArrangementSegments, findAuditionStartBar, isContinuousArrangement, isMixerOnlyTransition } from "../app/audio-arrangement.ts";

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

test("arrangement signature changes for audible placement or energy changes", () => {
  const before = arrangementSignature(project);
  const gainOnly = { ...project, tracks: [{ id: "drums", level: 1.25 }] };
  const moved = { ...project, sections: project.sections.map((section) => section.id === "chorus-2" ? { ...section, startBar: 39 } : section) };
  const energized = { ...project, sections: project.sections.map((section) => section.id === "chorus-2" ? { ...section, energy: 1 } : section) };
  assert.equal(arrangementSignature(gainOnly), before);
  assert.notEqual(arrangementSignature(moved), before);
  assert.notEqual(arrangementSignature(energized), before);
});

test("track mixer changes do not reschedule or restart the arrangement", () => {
  const signature = arrangementSignature(project);
  const muted = { ...project, tracks: [{ id: "drums", enabled: false, level: 1 }] };
  assert.equal(isMixerOnlyTransition(true, signature, muted), true);
  assert.equal(isMixerOnlyTransition(true, signature, muted, 12), false);
  assert.equal(isMixerOnlyTransition(false, signature, muted), false);
});

test("audition starts one bar before the earliest selected section move", () => {
  const operations = [
    { action: "move_section", selected: true, afterStartBar: 40 },
    { action: "move_section", selected: false, afterStartBar: 12 },
    { action: "set_track_gain", selected: true },
  ];
  assert.equal(findAuditionStartBar(operations, 16), 39);
  assert.equal(findAuditionStartBar([{ action: "set_track_gain", selected: true }], 16), 15);
});

test("overlapping sections are clipped so the scheduler never double-plays a stem", () => {
  const overlapping = {
    ...project,
    sections: [
      { id: "build", kind: "verse", label: "Build", sourceStartBar: 37, startBar: 37, lengthBars: 7, energy: 0.7 },
      { id: "chorus-2", kind: "chorus", label: "Final Chorus", sourceStartBar: 44, startBar: 40, lengthBars: 9, energy: 0.9 },
    ],
  };
  const segments = createArrangementSegments(overlapping, 118);
  assert.equal(segments[0].lengthBars, 3);
  assert.equal(segments[0].destinationStartBar + segments[0].lengthBars, segments[1].destinationStartBar);
});

test("untouched contiguous arrangements use one continuous player per stem", () => {
  const continuous = {
    ...project,
    totalBars: 12,
    sections: [
      { id: "intro", kind: "intro", label: "Intro", sourceStartBar: 0, startBar: 0, lengthBars: 4, energy: 0.3 },
      { id: "verse", kind: "verse", label: "Verse", sourceStartBar: 4, startBar: 4, lengthBars: 8, energy: 0.6 },
    ],
  };
  assert.equal(isContinuousArrangement(continuous), true);
  assert.equal(isContinuousArrangement({ ...continuous, sections: continuous.sections.map((section) => section.id === "verse" ? { ...section, sourceStartBar: 8 } : section) }), false);
  assert.equal(isContinuousArrangement({ ...continuous, sections: continuous.sections.map((section) => section.id === "verse" ? { ...section, startBar: 5 } : section) }), false);
});
