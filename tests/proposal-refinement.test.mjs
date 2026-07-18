import assert from "node:assert/strict";
import test from "node:test";
import { applyOperations } from "../app/edit-transactions.ts";
import { mergeProposalRefinement } from "../app/proposal-refinement.ts";

const track = (id, label) => ({ id, label, role: "test", color: "#fff", enabled: true, level: 1, audioUrl: "", peaksUrl: "", meanDb: -20, maxDb: -3 });
const project = {
  version: 5,
  totalBars: 16,
  bpm: 118,
  sections: [{ id: "chorus", kind: "chorus", label: "Chorus", startBar: 4, lengthBars: 8, energy: 0.8 }],
  tracks: [track("drums", "DRUMS"), track("bass", "BASS"), track("synth", "SYNTH")],
};

const transaction = (operations, protectedTargets = []) => ({
  id: "tx",
  baseProjectVersion: 5,
  planner: "gpt-5.6-sol",
  request: "test",
  summary: "test",
  assumptions: [],
  protectedTargets,
  operations,
  status: "proposed",
});

test("follow-up edits replace matching operations and rebase onto the canonical project", () => {
  const previous = transaction([
    { id: "old-1", action: "set_track_gain", targetId: "drums", targetLabel: "DRUMS", beforeLevel: 1, afterLevel: 1.2, explanation: "stronger", selected: true },
    { id: "old-2", action: "set_track_gain", targetId: "bass", targetLabel: "BASS", beforeLevel: 1, afterLevel: 1.1, explanation: "stronger", selected: true },
  ]);
  const refinement = transaction([
    { id: "new-1", action: "set_track_gain", targetId: "drums", targetLabel: "DRUMS", beforeLevel: 1.2, afterLevel: 1.4, explanation: "stronger again", selected: true },
    { id: "new-2", action: "set_track_enabled", targetId: "synth", targetLabel: "SYNTH", beforeEnabled: true, afterEnabled: false, explanation: "mute", selected: true },
  ], ["BASS"]);

  const merged = mergeProposalRefinement(project, previous, refinement);
  assert.ok(merged);
  assert.equal(merged.operations.length, 2);
  assert.deepEqual(merged.operations[0], { id: "op-1", action: "set_track_gain", targetId: "drums", targetLabel: "DRUMS", beforeLevel: 1, afterLevel: 1.4, explanation: "stronger again", selected: true });
  assert.equal(merged.operations[1].action, "set_track_enabled");
  assert.equal(applyOperations(project, merged.operations).tracks.find((item) => item.id === "drums").level, 1.4);
  assert.deepEqual(merged.protectedTargets, ["BASS"]);
});

test("section refinements merge independently and rebase scoped values", () => {
  const first = transaction([{ id: "old", action: "set_section_track_gain", targetId: "drums", targetLabel: "DRUMS · Chorus", sectionId: "chorus", sectionLabel: "Chorus", beforeLevel: 1, afterLevel: 1.2, explanation: "stronger", selected: true }]);
  const refinement = transaction([{ id: "new", action: "set_section_track_gain", targetId: "drums", targetLabel: "DRUMS · Chorus", sectionId: "chorus", sectionLabel: "Chorus", beforeLevel: 1.2, afterLevel: 1.3, explanation: "stronger again", selected: true }]);
  const merged = mergeProposalRefinement(project, first, refinement);

  assert.ok(merged);
  assert.equal(merged.operations.length, 1);
  assert.equal(merged.operations[0].beforeLevel, 1);
  assert.equal(merged.operations[0].afterLevel, 1.3);
});
