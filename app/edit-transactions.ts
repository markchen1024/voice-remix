export type SectionKind = "intro" | "verse" | "break" | "chorus" | "outro";
export type TrackId = "lead_vocals" | "backing_vocals" | "drums" | "percussion" | "bass" | "guitar" | "keyboards" | "synth" | "fx" | "other" | "mix";

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

export type SectionTrackAutomation = {
  sectionId: string;
  trackId: TrackId;
  enabled?: boolean;
  level?: number;
};

export type Project = {
  version: number;
  totalBars: number;
  bpm: number;
  sections: Section[];
  tracks: Track[];
  automation?: SectionTrackAutomation[];
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

export type SetSectionTrackEnabledOperation = OperationBase & {
  action: "set_section_track_enabled";
  targetId: TrackId;
  targetLabel: string;
  sectionId: string;
  sectionLabel: string;
  beforeEnabled: boolean;
  afterEnabled: boolean;
};

export type SetSectionTrackGainOperation = OperationBase & {
  action: "set_section_track_gain";
  targetId: TrackId;
  targetLabel: string;
  sectionId: string;
  sectionLabel: string;
  beforeLevel: number;
  afterLevel: number;
};

export type EditOperation = MoveSectionOperation | SetTrackEnabledOperation | SetTrackGainOperation | SetSectionEnergyOperation | SetSectionTrackEnabledOperation | SetSectionTrackGainOperation;

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
  [/主唱|人声|lead vocals?|lead singer/i, "lead_vocals"],
  [/和声|伴唱|backing vocals?|background vocals?/i, "backing_vocals"],
  [/鼓|drums?/i, "drums"],
  [/打击乐|percussion/i, "percussion"],
  [/贝斯|bass/i, "bass"],
  [/吉他|guitars?/i, "guitar"],
  [/键盘|钢琴|keyboards?|piano/i, "keyboards"],
  [/合成器|和弦|主旋律|synth|chords?/i, "synth"],
  [/效果|氛围|fx|effects?/i, "fx"],
  [/其他|其它|other/i, "other"],
  [/整首|母带|混音|master(?: mix)?|full mix/i, "mix"],
];

export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

export function sectionTrackState(project: Project, sectionId: string, trackId: TrackId) {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const automation = project.automation?.find((item) => item.sectionId === sectionId && item.trackId === trackId);
  return {
    enabled: automation?.enabled ?? track.enabled,
    level: automation?.level ?? track.level,
  };
}

function setSectionTrackAutomation(project: Project, sectionId: string, trackId: TrackId, value: { enabled?: boolean; level?: number }) {
  if (!project.sections.some((section) => section.id === sectionId)) throw new Error(`Unknown section: ${sectionId}`);
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);

  const automation = project.automation ?? [];
  const index = automation.findIndex((item) => item.sectionId === sectionId && item.trackId === trackId);
  const next = index >= 0 ? { ...automation[index] } : { sectionId, trackId };
  if (value.enabled !== undefined) {
    if (value.enabled === track.enabled) delete next.enabled;
    else next.enabled = value.enabled;
  }
  if (value.level !== undefined) {
    const level = Math.max(0, Math.min(1.5, value.level));
    if (level === track.level) delete next.level;
    else next.level = level;
  }

  if (next.enabled === undefined && next.level === undefined) {
    if (index >= 0) automation.splice(index, 1);
  } else if (index >= 0) {
    automation[index] = next;
  } else {
    automation.push(next);
  }
  project.automation = automation;
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
    } else if (operation.action === "set_section_track_enabled") {
      setSectionTrackAutomation(next, operation.sectionId, operation.targetId, { enabled: operation.afterEnabled });
    } else if (operation.action === "set_section_track_gain") {
      setSectionTrackAutomation(next, operation.sectionId, operation.targetId, { level: operation.afterLevel });
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
  const targetVerse = project.sections.find((section) => section.kind === "verse");
  const mentionsChorus = /副歌|chorus|hook/i.test(input);
  const explicitlySingleChorus = /第一|第二|最后|这一|这个|当前|这里|first|second|last|final|this|current|here/i.test(input);
  const chorusStemScope = /只在|仅在|in (?:the |this )?|(?:副歌|chorus|hook).*(?:只保留|only keep)|(?:只保留|only keep).*(?:副歌|chorus|hook)/i.test(input);
  const scopedSections = mentionsChorus && chorusStemScope
    ? explicitlySingleChorus ? (targetChorus ? [targetChorus] : []) : choruses
    : /主歌|verse/i.test(input) && /只在|仅在|关闭|关掉|静音|mute|in (?:the |this )?/i.test(input) && targetVerse ? [targetVerse] : [];

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
    const englishProtection = clause.match(/\b(?:keep|protect)\b/i);
    const protectedFragment = englishProtection ? clause.slice(englishProtection.index) : clause;
    for (const [pattern, id] of trackMatchers) {
      if (pattern.test(protectedFragment)) protectedTargets.push(project.tracks.find((track) => track.id === id)?.label ?? id.toUpperCase());
    }
  }

  if (/只保留|only keep/i.test(input)) {
    const wanted = trackMatchers.filter(([pattern]) => pattern.test(input)).map(([, id]) => id);
    for (const track of project.tracks) {
      const afterEnabled = wanted.includes(track.id);
      if (scopedSections.length) {
        for (const scopedSection of scopedSections) {
          const beforeEnabled = sectionTrackState(project, scopedSection.id, track.id).enabled;
          if (beforeEnabled !== afterEnabled) operations.push({ id: operationId(), action: "set_section_track_enabled", targetId: track.id, targetLabel: `${track.label} · ${scopedSection.label}`, sectionId: scopedSection.id, sectionLabel: scopedSection.label, beforeEnabled, afterEnabled, explanation: `${afterEnabled ? "Keep" : "Mute"} ${track.label} in ${scopedSection.label}.`, selected: true });
        }
      } else if (track.enabled !== afterEnabled) {
        operations.push({ id: operationId(), action: "set_track_enabled", targetId: track.id, targetLabel: track.label, beforeEnabled: track.enabled, afterEnabled, explanation: `${afterEnabled ? "Keep" : "Mute"} ${track.label}.`, selected: true });
      }
    }
  } else {
    for (const [pattern, id] of trackMatchers) {
      if (!pattern.test(input)) continue;
      const track = project.tracks.find((item) => item.id === id);
      if (!track || protectedTargets.includes(track.label)) continue;
      if (scopedSections.length) {
        for (const scopedSection of scopedSections) {
          const beforeEnabled = sectionTrackState(project, scopedSection.id, id).enabled;
          if (/静音|移除|关掉|关闭|mute|remove/i.test(input) && beforeEnabled) {
            operations.push({ id: operationId(), action: "set_section_track_enabled", targetId: id, targetLabel: `${track.label} · ${scopedSection.label}`, sectionId: scopedSection.id, sectionLabel: scopedSection.label, beforeEnabled, afterEnabled: false, explanation: `Mute ${track.label} only in ${scopedSection.label}.`, selected: true });
          } else if (/打开|恢复|加入|unmute|enable|add/i.test(input) && !beforeEnabled) {
            operations.push({ id: operationId(), action: "set_section_track_enabled", targetId: id, targetLabel: `${track.label} · ${scopedSection.label}`, sectionId: scopedSection.id, sectionLabel: scopedSection.label, beforeEnabled, afterEnabled: true, explanation: `Restore ${track.label} only in ${scopedSection.label}.`, selected: true });
          }
        }
      } else if (/静音|移除|关掉|关闭|mute|remove/i.test(input) && track.enabled) {
        operations.push({ id: operationId(), action: "set_track_enabled", targetId: id, targetLabel: track.label, beforeEnabled: true, afterEnabled: false, explanation: `Mute ${track.label} without changing its source audio.`, selected: true });
      } else if (/打开|恢复|加入|unmute|enable|add/i.test(input) && !track.enabled) {
        operations.push({ id: operationId(), action: "set_track_enabled", targetId: id, targetLabel: track.label, beforeEnabled: false, afterEnabled: true, explanation: `Restore ${track.label}.`, selected: true });
      }
    }
  }

  if (/鼓.*(?:更强|再强|有力量|加强|增强|提高)|(?:加强|增强|提高).*(?:鼓|drums?)|harder drums?|stronger drums?/i.test(input)) {
    const drums = project.tracks.find((track) => track.id === "drums");
    if (drums && !protectedTargets.includes(drums.label)) {
      const gainDelta = Math.min(0.5, Number(input.match(/(\d+)\s*%/)?.[1] ?? 25) / 100);
      if (scopedSections.length) {
        for (const scopedSection of scopedSections) {
          const beforeLevel = sectionTrackState(project, scopedSection.id, "drums").level;
          operations.push({ id: operationId(), action: "set_section_track_gain", targetId: "drums", targetLabel: `${drums.label} · ${scopedSection.label}`, sectionId: scopedSection.id, sectionLabel: scopedSection.label, beforeLevel, afterLevel: Math.min(1.5, beforeLevel + gainDelta), explanation: `Raise drums only in ${scopedSection.label}.`, selected: true });
        }
      } else {
        operations.push({ id: operationId(), action: "set_track_gain", targetId: "drums", targetLabel: drums.label, beforeLevel: drums.level, afterLevel: Math.min(1.5, drums.level + gainDelta), explanation: "Raise the drum stem across the song.", selected: true });
      }
    }
  } else if (/更有力量|能量|更强|harder|energy/i.test(input) && targetChorus) {
    operations.push({ id: operationId(), action: "set_section_energy", targetId: targetChorus.id, targetLabel: targetChorus.label, beforeEnergy: targetChorus.energy, afterEnergy: 1, explanation: `Increase ${targetChorus.label} energy metadata to 100%.`, selected: true });
  }

  if (scopedSections.length > 1 && operations.some((operation) => "sectionId" in operation && scopedSections.some((section) => section.id === operation.sectionId))) {
    assumptions.push(`Generic chorus/hook scope applies to every occurrence: ${scopedSections.map((section) => section.label).join(" and ")}.`);
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
  if (operation.action === "set_section_track_enabled") return { verb: operation.afterEnabled ? "UNMUTE" : "MUTE", target: operation.targetLabel, before: operation.beforeEnabled ? "On" : "Muted", after: operation.afterEnabled ? "On" : "Muted" };
  if (operation.action === "set_section_track_gain") return { verb: "GAIN", target: operation.targetLabel, before: `${Math.round(operation.beforeLevel * 100)}%`, after: `${Math.round(operation.afterLevel * 100)}%` };
  return { verb: "ENERGY", target: operation.targetLabel, before: `${Math.round(operation.beforeEnergy * 100)}%`, after: `${Math.round(operation.afterEnergy * 100)}%` };
}
