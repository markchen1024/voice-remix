import assert from "node:assert/strict";
import test from "node:test";
import { createProjectExport, projectExportFilename } from "../app/project-export.ts";

test("project exports are versioned, reproducible snapshots", () => {
  const project = {
    version: 4,
    totalBars: 59,
    bpm: 118,
    sections: [{ id: "chorus-2", sourceStartBar: 44, startBar: 40, lengthBars: 9 }],
    tracks: [{ id: "drums", enabled: true, level: 1.25 }],
  };
  const exported = createProjectExport(project, new Date("2026-07-18T00:00:00.000Z"));
  assert.equal(exported.format, "voice-remix-project");
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.exportedAt, "2026-07-18T00:00:00.000Z");
  assert.equal(exported.project.sections[0].sourceStartBar, 44);
  assert.equal(exported.project.sections[0].startBar, 40);
  exported.project.sections[0].startBar = 10;
  assert.equal(project.sections[0].startBar, 40);
});

test("project export filenames are safe and recognizable", () => {
  assert.equal(projectExportFilename("Neon Pulse Loop"), "neon-pulse-loop.voice-remix.json");
});

