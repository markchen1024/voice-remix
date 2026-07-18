import type { EditTransaction, Project } from "./edit-transactions";

export type EditorContext = {
  playheadBar: number;
  playback: "playing" | "paused";
  audition: "current" | "proposed";
  activeSection: { id: string; label: string; startBar: number; lengthBars: number } | null;
  selectedSection: { id: string; label: string; startBar: number; lengthBars: number } | null;
  activeProposal: {
    id: string;
    request: string;
    summary: string;
    operations: Array<{ id: string; action: string; targetId: string; sectionId?: string; selected: boolean }>;
  } | null;
  history: { canUndo: boolean; canRedo: boolean };
};

type EditorContextInput = {
  playheadBar: number;
  playing: boolean;
  auditioningProposal: boolean;
  selectedSectionId?: string | null;
  proposal?: EditTransaction | null;
  canUndo: boolean;
  canRedo: boolean;
};

function sectionSummary(project: Project, sectionId?: string | null) {
  const section = sectionId ? project.sections.find((item) => item.id === sectionId) : undefined;
  return section ? { id: section.id, label: section.label, startBar: section.startBar, lengthBars: section.lengthBars } : null;
}

export function createEditorContext(project: Project, input: EditorContextInput): EditorContext {
  const playheadBar = Math.max(0, Math.min(project.totalBars - 0.001, input.playheadBar));
  const active = project.sections.find((section) => playheadBar >= section.startBar && playheadBar < section.startBar + section.lengthBars);
  const proposal = input.proposal && input.proposal.baseProjectVersion === project.version ? input.proposal : null;

  return {
    playheadBar,
    playback: input.playing ? "playing" : "paused",
    audition: input.auditioningProposal && proposal ? "proposed" : "current",
    activeSection: sectionSummary(project, active?.id),
    selectedSection: sectionSummary(project, input.selectedSectionId),
    activeProposal: proposal ? {
      id: proposal.id,
      request: proposal.request,
      summary: proposal.summary,
      operations: proposal.operations.slice(0, 10).map((operation) => ({ id: operation.id, action: operation.action, targetId: operation.targetId, ...( "sectionId" in operation ? { sectionId: operation.sectionId } : {}), selected: operation.selected })),
    } : null,
    history: { canUndo: input.canUndo, canRedo: input.canRedo },
  };
}

export function sanitizeEditorContext(project: Project, value: unknown): EditorContext {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const history = candidate.history && typeof candidate.history === "object" ? candidate.history as Record<string, unknown> : {};
  const proposal = candidate.activeProposal && typeof candidate.activeProposal === "object" ? candidate.activeProposal as Record<string, unknown> : null;
  const proposalId = typeof proposal?.id === "string" ? proposal.id.slice(0, 100) : "";
  const context = createEditorContext(project, {
    playheadBar: typeof candidate.playheadBar === "number" && Number.isFinite(candidate.playheadBar) ? candidate.playheadBar : 0,
    playing: candidate.playback === "playing",
    auditioningProposal: false,
    selectedSectionId: candidate.selectedSection && typeof candidate.selectedSection === "object" && typeof (candidate.selectedSection as Record<string, unknown>).id === "string" ? String((candidate.selectedSection as Record<string, unknown>).id) : null,
    canUndo: history.canUndo === true,
    canRedo: history.canRedo === true,
  });
  const operations = Array.isArray(proposal?.operations) ? proposal.operations.slice(0, 10).flatMap((operation) => {
    if (!operation || typeof operation !== "object") return [];
    const item = operation as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.action !== "string" || typeof item.targetId !== "string") return [];
    return [{ id: item.id.slice(0, 100), action: item.action.slice(0, 100), targetId: item.targetId.slice(0, 100), ...(typeof item.sectionId === "string" ? { sectionId: item.sectionId.slice(0, 100) } : {}), selected: item.selected === true }];
  }) : [];
  const activeProposal = proposalId ? {
    id: proposalId,
    request: typeof proposal?.request === "string" ? proposal.request.slice(0, 500) : "",
    summary: typeof proposal?.summary === "string" ? proposal.summary.slice(0, 500) : "",
    operations,
  } : null;

  return {
    ...context,
    audition: candidate.audition === "proposed" && activeProposal ? "proposed" : "current",
    activeProposal,
  };
}
