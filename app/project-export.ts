import type { Project } from "./edit-transactions";

export type VoiceRemixProjectExport = {
  format: "voice-remix-project";
  schemaVersion: 1;
  exportedAt: string;
  project: Project;
};

export function createProjectExport(project: Project, exportedAt = new Date()): VoiceRemixProjectExport {
  return {
    format: "voice-remix-project",
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    project: JSON.parse(JSON.stringify(project)) as Project,
  };
}

export function projectExportFilename(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";
  return `${slug}.voice-remix.json`;
}

