import assert from "node:assert/strict";
import test from "node:test";
import { applyOperations, createLocalTransaction } from "../app/edit-transactions.ts";

const track = (id, label) => ({ id, label, role: "test", color: "#fff", enabled: true, level: 1, audioUrl: "", peaksUrl: "", meanDb: -20, maxDb: -3 });
const project = {
  version: 7,
  totalBars: 59,
  bpm: 118,
  sections: [
    { id: "chorus-1", kind: "chorus", label: "Chorus", startBar: 16, lengthBars: 12, energy: 0.8 },
    { id: "chorus-2", kind: "chorus", label: "Final Chorus", startBar: 44, lengthBars: 9, energy: 0.9 },
  ],
  tracks: [track("drums", "DRUMS"), track("percussion", "PERCUSSION"), track("bass", "BASS"), track("synth", "SYNTH"), track("fx", "FX")],
};

test("compound requests become inspectable operations without mutating the project", () => {
  const transaction = createLocalTransaction("最后一遍副歌提前 4 小节，鼓更强，但贝斯不要变", project);
  assert.ok(transaction);
  assert.equal(transaction.baseProjectVersion, 7);
  assert.equal(transaction.operations.length, 2);
  assert.equal(transaction.operations[0].action, "move_section");
  assert.equal(transaction.operations[0].afterStartBar, 40);
  assert.equal(transaction.operations[1].action, "set_track_gain");
  assert.deepEqual(transaction.protectedTargets, ["BASS"]);
  assert.equal(project.sections[1].startBar, 44);
});

test("only selected operations are applied atomically", () => {
  const transaction = createLocalTransaction("最后一遍副歌提前 4 小节，鼓更强，但贝斯不要变", project);
  transaction.operations[1].selected = false;
  const next = applyOperations(project, transaction.operations, true);
  assert.equal(next.version, 8);
  assert.equal(next.sections[1].startBar, 40);
  assert.equal(next.tracks[0].level, 1);
  assert.equal(project.version, 7);
});

test("solo commands create deterministic mute operations", () => {
  const transaction = createLocalTransaction("只保留贝斯和鼓", project);
  assert.ok(transaction);
  const next = applyOperations(project, transaction.operations);
  assert.equal(next.tracks.find((item) => item.id === "drums").enabled, true);
  assert.equal(next.tracks.find((item) => item.id === "bass").enabled, true);
  assert.equal(next.tracks.find((item) => item.id === "synth").enabled, false);
});
