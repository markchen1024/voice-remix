export type SectionKind = "intro" | "verse" | "break" | "chorus" | "outro";
export type TrackId = "drums" | "percussion" | "bass" | "synth" | "fx";

export type Section = {
  id: string;
  kind: SectionKind;
  label: string;
  sourceStartBar?: number;
  startBar: number;
  lengthBars: number;
  energy: number;
};

export type Track = {
  id: TrackId;
  label: string;
  role: string;
  color: string;
  enabled: boolean;
  level: number;
  audioUrl: string;
  peaksUrl: string;
  meanDb: number;
  maxDb: number;
  nearSilent?: boolean;
};

export type Project = {
  version: number;
  totalBars: number;
  bpm: number;
  sections: Section[];
  tracks: Track[];
};

type OperationBase = {
  id: string;
  selected: boolean;
  explanation: string;
};

export type MoveSectionOperation = OperationBase & {
  action: "move_section";
  targetId: string;
  targetLabel: string;
  beforeStartBar: number;
  afterStartBar: number;
  lengthBars: number;
};

export type SetTrackEnabledOperation = OperationBase & {
  action: "set_track_enabled";
  targetId: TrackId;
  targetLabel: string;
  beforeEnabled: boolean;
  afterEnabled: boolean;
};

export type SetTrackGainOperation = OperationBase & {
  action: "set_track_gain";
  targetId: TrackId;
  targetLabel: string;
  beforeLevel: number;
  afterLevel: number;
};

export type SetSectionEnergyOperation = OperationBase & {
  action: "set_section_energy";
  targetId: string;
  targetLabel: string;
  beforeEnergy: number;
  afterEnergy: number;
};

export type EditOperation = MoveSectionOperation | SetTrackEnabledOperation | SetTrackGainOperation | SetSectionEnergyOperation;

export type EditTransaction = {
  id: string;
  baseProjectVersion: number;
  planner: "gpt-5.6-sol" | "local";
  request: string;
  summary: string;
  assumptions: string[];
  protectedTargets: string[];
  operations: EditOperation[];
  status: "proposed" | "committed" | "discarded";
};

const trackMatchers: Array<[RegExp, TrackId]> = [
  [/鼓|drums?/i, "drums"],
  [/打击乐|percussion/i, "percussion"],
  [/贝斯|bass/i, "bass"],
  [/合成器|和弦|主旋律|synth|chords?|lead/i, "synth"],
  [/效果|氛围|fx|effects?/i, "fx"],
];

export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

function rippleSectionEarlier(project: Project, targetId: string, requestedStartBar: number) {
  const target = project.sections.find((section) => section.id === targetId);
  if (!target) throw new Error(`Unknown section: ${targetId}`);

  const beforeStartBar = target.startBar;
  const afterStartBar = Math.max(0, Math.min(project.totalBars - target.lengthBars, requestedStartBar));
  const delta = afterStartBar - beforeStartBar;
  target.startBar = afterStartBar;

  if (delta === 0) return;

  for (const section of project.sections) {
    if (section.id !== target.id && section.startBar > beforeStartBar) {
      section.startBar = Math.max(0, Math.min(project.totalBars - section.lengthBars, section.startBar + delta));
    }
  }

  if (delta > 0) return;

  const predecessor = project.sections
    .filter((section) => section.id !== target.id && section.startBar < target.startBar)
    .sort((left, right) => right.startBar - left.startBar)[0];
  if (predecessor && predecessor.startBar + predecessor.lengthBars > target.startBar) {
    predecessor.lengthBars = Math.max(0, target.startBar - predecessor.startBar);
  }
}

export function applyOperations(project: Project, operations: EditOperation[], incrementVersion = false): Project {
  const next = cloneProject(project);
  for (const operation of operations.filter((item) => item.selected)) {
    if (operation.action === "move_section") {
      rippleSectionEarlier(next, operation.targetId, operation.afterStartBar);
    } else if (operation.action === "set_section_energy") {
      const section = next.sections.find((item) => item.id === operation.targetId);
      if (!section) throw new Error(`Unknown section: ${operation.targetId}`);
      section.energy = Math.max(0.1, Math.min(1, operation.afterEnergy));
    } else {
      const track = next.tracks.find((item) => item.id === operation.targetId);
      if (!track) throw new Error(`Unknown track: ${operation.targetId}`);
      if (operation.action === "set_track_enabled") track.enabled = operation.afterEnabled;
      if (operation.action === "set_track_gain") track.level = Math.max(0, Math.min(1.5, operation.afterLevel));
    }
  }
  if (incrementVersion) next.version += 1;
  return next;
}

export function createLocalTransaction(input: string, project: Project): EditTransaction | null {
  const operations: EditOperation[] = [];
  const assumptions: string[] = [];
  const protectedTargets: string[] = [];
  const operationId = () => `op-${operations.length + 1}`;
  const mentionsFinalChorus = /最后|第二遍|final|last/i.test(input);
  const choruses = project.sections.filter((section) => section.kind === "chorus");
  const targetChorus = mentionsFinalChorus ? choruses.at(-1) : choruses[0];

  if (/副歌|chorus/i.test(input) && /提前|earlier|前移/i.test(input) && targetChorus) {
    const bars = Number(input.match(/(\d+)\s*(?:小节|bars?)/i)?.[1] ?? 4);
    const afterStartBar = Math.max(0, targetChorus.startBar - bars);
    operations.push({
      id: operationId(),
      action: "move_section",
      targetId: targetChorus.id,
      targetLabel: targetChorus.label,
      beforeStartBar: targetChorus.startBar,
      afterStartBar,
      lengthBars: targetChorus.lengthBars,
      explanation: `Bring ${targetChorus.label} in ${targetChorus.startBar - afterStartBar} bars earlier.`,
      selected: true,
    });
    assumptions.push(`${targetChorus.label} is the intended chorus reference.`);
    assumptions.push("Ripple edit shortens the preceding section at the new boundary and shifts later sections by the same bar delta.");
  }

  const protectionClauses = input
    .split(/[，。,.；;]/)
    .filter((clause) => /保持|不要变|别动|protect|unchanged/i.test(clause));
  for (const clause of protectionClauses) {
    for (const [pattern, id] of trackMatchers) {
      if (pattern.test(clause)) protectedTargets.push(project.tracks.find((track) => track.id === id)?.label ?? id.toUpperCase());
    }
  }

  if (/只保留|only keep/i.test(input)) {
    const wanted = trackMatchers.filter(([pattern]) => pattern.test(input)).map(([, id]) => id);
    for (const track of project.tracks) {
      const afterEnabled = wanted.includes(track.id);
      if (track.enabled !== afterEnabled) {
        operations.push({ id: operationId(), action: "set_track_enabled", targetId: track.id, targetLabel: track.label, beforeEnabled: track.enabled, afterEnabled, explanation: `${afterEnabled ? "Keep" : "Mute"} ${track.label}.`, selected: true });
      }
    }
  } else {
    for (const [pattern, id] of trackMatchers) {
      if (!pattern.test(input)) continue;
      const track = project.tracks.find((item) => item.id === id);
      if (!track || protectedTargets.includes(track.label)) continue;
      if (/静音|移除|关掉|mute|remove/i.test(input) && track.enabled) {
        operations.push({ id: operationId(), action: "set_track_enabled", targetId: id, targetLabel: track.label, beforeEnabled: true, afterEnabled: false, explanation: `Mute ${track.label} without changing its source audio.`, selected: true });
      } else if (/打开|恢复|加入|unmute|enable|add/i.test(input) && !track.enabled) {
        operations.push({ id: operationId(), action: "set_track_enabled", targetId: id, targetLabel: track.label, beforeEnabled: false, afterEnabled: true, explanation: `Restore ${track.label}.`, selected: true });
      }
    }
  }

  if (/鼓.*(?:更强|再强|有力量)|harder drums?|stronger drums?/i.test(input)) {
    const drums = project.tracks.find((track) => track.id === "drums");
    if (drums && !protectedTargets.includes(drums.label)) {
      operations.push({ id: operationId(), action: "set_track_gain", targetId: "drums", targetLabel: drums.label, beforeLevel: drums.level, afterLevel: Math.min(1.5, drums.level + 0.25), explanation: "Raise the drum stem by approximately 1.9 dB.", selected: true });
    }
  } else if (/更有力量|能量|更强|harder|energy/i.test(input) && targetChorus) {
    operations.push({ id: operationId(), action: "set_section_energy", targetId: targetChorus.id, targetLabel: targetChorus.label, beforeEnergy: targetChorus.energy, afterEnergy: 1, explanation: `Increase ${targetChorus.label} energy metadata to 100%.`, selected: true });
  }

  if (!operations.length) return null;
  const actionLabels = operations.map((operation) => operation.action === "move_section" ? `move ${operation.targetLabel}` : operation.targetLabel.toLowerCase());
  return {
    id: `tx-${Date.now()}`,
    baseProjectVersion: project.version,
    planner: "local",
    request: input,
    summary: `Proposed ${operations.length} edit${operations.length === 1 ? "" : "s"}: ${actionLabels.join(", ")}`,
    assumptions,
    protectedTargets: [...new Set(protectedTargets)],
    operations,
    status: "proposed",
  };
}

export function describeOperation(operation: EditOperation) {
  if (operation.action === "move_section") return { verb: "MOVE", target: operation.targetLabel, before: `Bar ${operation.beforeStartBar + 1}`, after: `Bar ${operation.afterStartBar + 1}` };
  if (operation.action === "set_track_enabled") return { verb: operation.afterEnabled ? "UNMUTE" : "MUTE", target: operation.targetLabel, before: operation.beforeEnabled ? "On" : "Muted", after: operation.afterEnabled ? "On" : "Muted" };
  if (operation.action === "set_track_gain") return { verb: "GAIN", target: operation.targetLabel, before: `${Math.round(operation.beforeLevel * 100)}%`, after: `${Math.round(operation.afterLevel * 100)}%` };
  return { verb: "ENERGY", target: operation.targetLabel, before: `${Math.round(operation.beforeEnergy * 100)}%`, after: `${Math.round(operation.afterEnergy * 100)}%` };
}
