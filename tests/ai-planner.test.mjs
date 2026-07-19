import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMusicEditPlan } from "../app/ai-planner.ts";

const track = (id, label) => ({ id, label, role: "test", color: "#fff", enabled: true, level: 1, audioUrl: "", peaksUrl: "", meanDb: -20, maxDb: -3 });
const project = {
  version: 4,
  totalBars: 59,
  bpm: 118,
  sections: [{ id: "chorus-2", kind: "chorus", label: "Final Chorus", startBar: 44, lengthBars: 9, energy: 0.9 }],
  tracks: [track("drums", "DRUMS"), track("percussion", "PERCUSSION"), track("bass", "BASS"), track("synth", "SYNTH"), track("fx", "FX")],
};

test("AI plans are normalized against the real project and protected tracks", () => {
  const transaction = normalizeMusicEditPlan("move it earlier", project, {
    summary: "Move the ending and strengthen the drums",
    assumptions: ["The move does not reorder or trim other sections."],
    protectedTargets: ["bass"],
    operations: [
      { action: "move_section", targetId: "chorus-2", barsEarlier: 4, explanation: "Earlier payoff" },
      { action: "set_track_gain", targetId: "drums", gainDelta: 0.2, explanation: "More impact" },
      { action: "set_track_gain", targetId: "bass", gainDelta: 0.2, explanation: "Must be ignored" },
      { action: "set_section_energy", targetId: "invented", energy: 1, explanation: "Must be ignored" },
    ],
  });

  assert.ok(transaction);
  assert.equal(transaction.planner, "gpt-5.6-sol");
  assert.equal(transaction.operations.length, 2);
  assert.equal(transaction.operations[0].afterStartBar, 40);
  assert.equal(transaction.operations[1].afterLevel, 1.2);
  assert.deepEqual(transaction.protectedTargets, ["BASS"]);
  assert.deepEqual(transaction.assumptions, ["Ripple edit: shorten the preceding section at the new boundary and shift later sections by the same bar delta."]);
  assert.equal(project.sections[0].startBar, 44);
});

test("AI plans with no valid project targets are rejected", () => {
  const transaction = normalizeMusicEditPlan("move it", project, {
    summary: "Invalid",
    assumptions: [],
    protectedTargets: [],
    operations: [{ action: "move_section", targetId: "missing", barsEarlier: 2, explanation: "Unknown section" }],
  });
  assert.equal(transaction, null);
});

test("AI plans can automate a protected stem in one section without touching other sections", () => {
  const transaction = normalizeMusicEditPlan("只在最后副歌把鼓提高20%，贝斯不要变", project, {
    summary: "Stronger final chorus drums",
    assumptions: [],
    protectedTargets: ["bass"],
    operations: [
      { action: "set_section_track_gain", sectionId: "chorus-2", trackId: "drums", gainDelta: 0.2, explanation: "Raise final chorus drums" },
      { action: "set_section_track_gain", sectionId: "chorus-2", trackId: "bass", gainDelta: 0.2, explanation: "Must be ignored" },
    ],
  });

  assert.ok(transaction);
  assert.equal(transaction.operations.length, 1);
  assert.deepEqual(transaction.operations[0], {
    id: "op-1",
    action: "set_section_track_gain",
    targetId: "drums",
    targetLabel: "DRUMS · Final Chorus",
    sectionId: "chorus-2",
    sectionLabel: "Final Chorus",
    beforeLevel: 1,
    afterLevel: 1.2,
    explanation: "Raise final chorus drums",
    selected: true,
  });
});

test("generic hook edits expand to every chorus occurrence", () => {
  const repeatedProject = {
    ...project,
    sections: [
      { id: "chorus-1", kind: "chorus", label: "Chorus", startBar: 16, lengthBars: 12, energy: 0.8 },
      project.sections[0],
    ],
  };
  const transaction = normalizeMusicEditPlan("only keep drums in the hook", repeatedProject, {
    summary: "Only drums in the hook",
    assumptions: [],
    protectedTargets: [],
    operations: [
      { action: "set_section_track_enabled", sectionId: "chorus-1", trackId: "synth", enabled: false, explanation: "Mute synth in the hook" },
    ],
  });

  assert.ok(transaction);
  assert.deepEqual(transaction.operations.map((operation) => operation.sectionId), ["chorus-1", "chorus-2"]);
  assert.match(transaction.assumptions[0], /every occurrence/);
});

test("explicit final hook edits remain scoped to one occurrence", () => {
  const repeatedProject = {
    ...project,
    sections: [
      { id: "chorus-1", kind: "chorus", label: "Chorus", startBar: 16, lengthBars: 12, energy: 0.8 },
      project.sections[0],
    ],
  };
  const transaction = normalizeMusicEditPlan("only keep drums in the final hook", repeatedProject, {
    summary: "Only drums in the final hook",
    assumptions: [],
    protectedTargets: [],
    operations: [
      { action: "set_section_track_enabled", sectionId: "chorus-2", trackId: "synth", enabled: false, explanation: "Mute synth in the final hook" },
    ],
  });

  assert.ok(transaction);
  assert.deepEqual(transaction.operations.map((operation) => operation.sectionId), ["chorus-2"]);
});
