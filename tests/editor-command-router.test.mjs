import assert from "node:assert/strict";
import test from "node:test";
import { routeImmediateEditorCommand } from "../app/editor-command-router.ts";
import { createEditorContext } from "../app/editor-context.ts";

const project = {
  version: 2,
  totalBars: 24,
  bpm: 118,
  sections: [
    { id: "intro", kind: "intro", label: "Intro", startBar: 0, lengthBars: 4, energy: 0.3 },
    { id: "chorus-1", kind: "chorus", label: "Chorus", startBar: 4, lengthBars: 8, energy: 0.8 },
    { id: "chorus-2", kind: "chorus", label: "Final Chorus", startBar: 16, lengthBars: 8, energy: 0.9 },
  ],
  tracks: [],
};

const context = createEditorContext(project, {
  playheadBar: 6,
  playing: false,
  auditioningProposal: false,
  selectedSectionId: "chorus-2",
  proposal: {
    id: "proposal",
    baseProjectVersion: 2,
    planner: "local",
    request: "test",
    summary: "test",
    assumptions: [],
    protectedTargets: [],
    operations: [],
    status: "proposed",
  },
  canUndo: true,
  canRedo: false,
});

test("transport commands resolve named and deictic sections", () => {
  assert.deepEqual(routeImmediateEditorCommand("播放最后一遍副歌", project, context), { action: "seek_section", sectionId: "chorus-2", label: "Final Chorus", startBar: 16 });
  assert.deepEqual(routeImmediateEditorCommand("循环这一段", project, context), { action: "loop_section", sectionId: "chorus-2", label: "Final Chorus", startBar: 16, lengthBars: 8 });
  assert.deepEqual(routeImmediateEditorCommand("循环这里", project, context), { action: "loop_section", sectionId: "chorus-1", label: "Chorus", startBar: 4, lengthBars: 8 });
});

test("proposal and history commands are routed without invoking the planner", () => {
  assert.deepEqual(routeImmediateEditorCommand("就这样", project, context), { action: "apply_proposal" });
  assert.deepEqual(routeImmediateEditorCommand("听原版", project, context), { action: "audition_current" });
  assert.deepEqual(routeImmediateEditorCommand("撤销", project, context), { action: "undo" });
  assert.equal(routeImmediateEditorCommand("鼓更强", project, context), null);
});
