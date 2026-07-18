import assert from "node:assert/strict";
import test from "node:test";
import { createEditorContext, sanitizeEditorContext } from "../app/editor-context.ts";

const project = {
  version: 3,
  totalBars: 16,
  bpm: 118,
  sections: [
    { id: "intro", kind: "intro", label: "Intro", startBar: 0, lengthBars: 4, energy: 0.3 },
    { id: "chorus", kind: "chorus", label: "Chorus", startBar: 4, lengthBars: 8, energy: 0.8 },
  ],
  tracks: [],
};

test("editor context grounds deictic references in playhead and selection", () => {
  const context = createEditorContext(project, {
    playheadBar: 6.25,
    playing: true,
    auditioningProposal: false,
    selectedSectionId: "intro",
    canUndo: true,
    canRedo: false,
  });
  assert.equal(context.activeSection.id, "chorus");
  assert.equal(context.selectedSection.id, "intro");
  assert.equal(context.playback, "playing");
  assert.deepEqual(context.history, { canUndo: true, canRedo: false });
});

test("untrusted editor context is clamped and unknown sections are removed", () => {
  const context = sanitizeEditorContext(project, {
    playheadBar: 999,
    playback: "playing",
    audition: "proposed",
    selectedSection: { id: "invented" },
    history: { canUndo: true },
  });
  assert.equal(context.playheadBar, 15.999);
  assert.equal(context.selectedSection, null);
  assert.equal(context.audition, "current");
});
