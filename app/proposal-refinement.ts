import type { EditOperation, EditTransaction, Project } from "./edit-transactions";

function operationKey(operation: EditOperation) {
  return `${operation.action}:${operation.targetId}`;
}

function rebaseOperation(project: Project, operation: EditOperation): EditOperation | null {
  if (operation.action === "move_section") {
    const section = project.sections.find((item) => item.id === operation.targetId);
    if (!section || section.startBar === operation.afterStartBar) return null;
    return { ...operation, beforeStartBar: section.startBar, lengthBars: section.lengthBars };
  }
  if (operation.action === "set_section_energy") {
    const section = project.sections.find((item) => item.id === operation.targetId);
    if (!section || section.energy === operation.afterEnergy) return null;
    return { ...operation, beforeEnergy: section.energy };
  }

  const track = project.tracks.find((item) => item.id === operation.targetId);
  if (!track) return null;
  if (operation.action === "set_track_enabled") {
    if (track.enabled === operation.afterEnabled) return null;
    return { ...operation, beforeEnabled: track.enabled };
  }
  if (track.level === operation.afterLevel) return null;
  return { ...operation, beforeLevel: track.level };
}

export function mergeProposalRefinement(project: Project, previous: EditTransaction, refinement: EditTransaction): EditTransaction | null {
  if (previous.baseProjectVersion !== project.version) return null;
  const operations = new Map(previous.operations.map((operation) => [operationKey(operation), operation]));
  refinement.operations.forEach((operation) => operations.set(operationKey(operation), operation));

  const protectedTargets = [...new Set([...previous.protectedTargets, ...refinement.protectedTargets])];
  const protectedLabels = new Set(protectedTargets.map((target) => target.toUpperCase()));
  const rebased = [...operations.values()]
    .filter((operation) => !protectedLabels.has(operation.targetLabel.toUpperCase()))
    .map((operation) => rebaseOperation(project, operation))
    .filter((operation): operation is EditOperation => operation !== null)
    .map((operation, index) => ({ ...operation, id: `op-${index + 1}` }));

  if (!rebased.length) return null;
  return {
    ...refinement,
    id: `tx-${Date.now()}`,
    baseProjectVersion: project.version,
    assumptions: [...new Set([...previous.assumptions, ...refinement.assumptions])],
    protectedTargets,
    operations: rebased,
    status: "proposed",
  };
}
