import type { EditOperation, Project, Section } from "./edit-transactions";

export type ArrangementSegment = {
  sectionId: string;
  sourceStartBar: number;
  destinationStartBar: number;
  lengthBars: number;
  sourceStartSeconds: number;
  destinationStartSeconds: number;
  durationSeconds: number;
};

export function sourceStartBar(section: Section) {
  return section.sourceStartBar ?? section.startBar;
}

export function arrangementSignature(project: Project) {
  return project.sections
    .map((section) => `${section.id}:${sourceStartBar(section)}>${section.startBar}:${section.lengthBars}:${section.energy}`)
    .join("|");
}

export function isContinuousArrangement(project: Project) {
  if (project.totalBars <= 0 || project.sections.length === 0) return false;
  const ordered = [...project.sections].sort((left, right) => left.startBar - right.startBar);
  let cursor = 0;

  for (const section of ordered) {
    if (section.startBar !== cursor || sourceStartBar(section) !== section.startBar || section.lengthBars <= 0) return false;
    cursor += section.lengthBars;
  }

  return cursor === project.totalBars;
}

export function barFromTimelinePointer(clientX: number, timelineLeft: number, timelineWidth: number, totalBars: number) {
  if (timelineWidth <= 0 || totalBars <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, (clientX - timelineLeft) / timelineWidth));
  return ratio * Math.max(0, totalBars - 0.001);
}

export function isMixerOnlyTransition(
  audioReady: boolean,
  scheduledSignature: string,
  nextProject: Project,
  seekBar?: number,
) {
  return audioReady && seekBar === undefined && arrangementSignature(nextProject) === scheduledSignature;
}

export function createArrangementSegments(project: Project, audioDuration: number): ArrangementSegment[] {
  if (project.totalBars <= 0 || audioDuration <= 0) return [];
  const secondsPerBar = audioDuration / project.totalBars;
  const orderedSections = [...project.sections].sort((left, right) => left.startBar - right.startBar);

  return orderedSections.flatMap((section, index) => {
    const sourceBar = Math.max(0, Math.min(project.totalBars, sourceStartBar(section)));
    const destinationBar = Math.max(0, Math.min(project.totalBars, section.startBar));
    const nextSectionStart = orderedSections[index + 1]?.startBar ?? project.totalBars;
    const lengthBars = Math.max(0, Math.min(
      section.lengthBars,
      nextSectionStart - destinationBar,
      project.totalBars - sourceBar,
      project.totalBars - destinationBar,
    ));
    if (lengthBars === 0) return [];

    return [{
      sectionId: section.id,
      sourceStartBar: sourceBar,
      destinationStartBar: destinationBar,
      lengthBars,
      sourceStartSeconds: sourceBar * secondsPerBar,
      destinationStartSeconds: destinationBar * secondsPerBar,
      durationSeconds: lengthBars * secondsPerBar,
    }];
  });
}

export function findAuditionStartBar(operations: EditOperation[], fallbackBar: number, leadBars = 1) {
  const movedStarts = operations.flatMap((operation) =>
    operation.selected && operation.action === "move_section" ? [operation.afterStartBar] : [],
  );
  const targetBar = movedStarts.length > 0 ? Math.min(...movedStarts) : fallbackBar;
  return Math.max(0, targetBar - Math.max(0, leadBars));
}
