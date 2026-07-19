import assert from "node:assert/strict";
import test from "node:test";
import { applyOperations, createLocalTransaction, sectionTrackState } from "../app/edit-transactions.ts";

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

test("audition projects apply selected operations without changing version or source state", () => {
  const transaction = createLocalTransaction("最后一遍副歌提前 4 小节，鼓更强，但贝斯不要变", project);
  const audition = applyOperations(project, transaction.operations);
  assert.equal(audition.version, project.version);
  assert.equal(audition.sections[1].startBar, 40);
  assert.equal(audition.tracks[0].level, 1.25);
  assert.equal(project.sections[1].startBar, 44);
  assert.equal(project.tracks[0].level, 1);
});

test("solo commands create deterministic mute operations", () => {
  const transaction = createLocalTransaction("只保留贝斯和鼓", project);
  assert.ok(transaction);
  const next = applyOperations(project, transaction.operations);
  assert.equal(next.tracks.find((item) => item.id === "drums").enabled, true);
  assert.equal(next.tracks.find((item) => item.id === "bass").enabled, true);
  assert.equal(next.tracks.find((item) => item.id === "synth").enabled, false);
});

test("generic hook solo persists across every chorus occurrence", () => {
  const transaction = createLocalTransaction("only keep drums in the hook", project);
  assert.ok(transaction);
  assert.equal(transaction.operations.length, 8);
  assert.deepEqual([...new Set(transaction.operations.map((operation) => operation.sectionId))], ["chorus-1", "chorus-2"]);

  const next = applyOperations(project, transaction.operations);
  for (const sectionId of ["chorus-1", "chorus-2"]) {
    assert.equal(sectionTrackState(next, sectionId, "drums").enabled, true);
    assert.equal(sectionTrackState(next, sectionId, "percussion").enabled, false);
    assert.equal(sectionTrackState(next, sectionId, "bass").enabled, false);
    assert.equal(sectionTrackState(next, sectionId, "synth").enabled, false);
    assert.equal(sectionTrackState(next, sectionId, "fx").enabled, false);
  }
});

test("moving a section earlier ripples later sections and trims the predecessor", () => {
  const arrangedProject = {
    ...project,
    sections: [
      { id: "build-1", kind: "verse", label: "Build", sourceStartBar: 37, startBar: 37, lengthBars: 7, energy: 0.7 },
      { id: "chorus-2", kind: "chorus", label: "Final Chorus", sourceStartBar: 44, startBar: 44, lengthBars: 9, energy: 0.9 },
      { id: "outro-1", kind: "outro", label: "Outro", sourceStartBar: 53, startBar: 53, lengthBars: 6, energy: 0.3 },
    ],
  };
  const next = applyOperations(arrangedProject, [{
    id: "move-final",
    action: "move_section",
    targetId: "chorus-2",
    targetLabel: "Final Chorus",
    beforeStartBar: 44,
    afterStartBar: 40,
    lengthBars: 9,
    explanation: "Bring the final chorus earlier.",
    selected: true,
  }]);
  assert.equal(next.sections.find((section) => section.id === "build-1").lengthBars, 3);
  assert.equal(next.sections.find((section) => section.id === "chorus-2").startBar, 40);
  assert.equal(next.sections.find((section) => section.id === "outro-1").startBar, 49);
});

test("section track automation changes one stem in one section without changing global track state", () => {
  const next = applyOperations(project, [{
    id: "final-drums",
    action: "set_section_track_gain",
    targetId: "drums",
    targetLabel: "DRUMS · Final Chorus",
    sectionId: "chorus-2",
    sectionLabel: "Final Chorus",
    beforeLevel: 1,
    afterLevel: 1.2,
    explanation: "Raise drums only in the final chorus.",
    selected: true,
  }, {
    id: "first-synth",
    action: "set_section_track_enabled",
    targetId: "synth",
    targetLabel: "SYNTH · Chorus",
    sectionId: "chorus-1",
    sectionLabel: "Chorus",
    beforeEnabled: true,
    afterEnabled: false,
    explanation: "Mute synth only in the first chorus.",
    selected: true,
  }]);

  assert.equal(next.tracks.find((item) => item.id === "drums").level, 1);
  assert.deepEqual(sectionTrackState(next, "chorus-2", "drums"), { enabled: true, level: 1.2 });
  assert.deepEqual(sectionTrackState(next, "chorus-1", "drums"), { enabled: true, level: 1 });
  assert.deepEqual(sectionTrackState(next, "chorus-1", "synth"), { enabled: false, level: 1 });
});

test("local fallback scopes named-section stem commands", () => {
  const drums = createLocalTransaction("只在最后副歌把鼓提高20%，贝斯不要变", project);
  assert.ok(drums);
  assert.equal(drums.operations.length, 1);
  assert.equal(drums.operations[0].action, "set_section_track_gain");
  assert.equal(drums.operations[0].sectionId, "chorus-2");
  assert.equal(drums.operations[0].afterLevel, 1.2);

  const withVerse = { ...project, sections: [{ id: "verse-1", kind: "verse", label: "Verse", startBar: 4, lengthBars: 8, energy: 0.5 }, ...project.sections] };
  const synth = createLocalTransaction("主歌关闭合成器", withVerse);
  assert.ok(synth);
  assert.equal(synth.operations[0].action, "set_section_track_enabled");
  assert.equal(synth.operations[0].sectionId, "verse-1");
});
