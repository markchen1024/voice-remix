import { sourceStartBar } from "./audio-arrangement.ts";
import { sectionEnergyGain } from "./audio-mixer.ts";
import { sectionTrackState, type Project, type TrackId } from "./edit-transactions.ts";

export type PeakEnvelope = {
  peaks: Array<[number, number]>;
};

export type PeakBank = Partial<Record<TrackId, PeakEnvelope>>;

function clampSample(value: number) {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Builds a display waveform from the imported stem peak envelopes and the
 * arrangement currently being heard. It follows section source mapping,
 * section energy, global mixer state, and section-scoped automation.
 */
export function buildMasterWaveform(project: Project, envelopes: PeakBank, binCount = 720): Array<[number, number]> {
  const bins = Math.max(1, Math.floor(binCount));
  const sections = [...project.sections].sort((left, right) => left.startBar - right.startBar);
  const normalizer = Math.max(1, Math.sqrt(project.tracks.length));

  return Array.from({ length: bins }, (_, index) => {
    const destinationBar = (index + 0.5) / bins * project.totalBars;
    const section = sections.find((item) => destinationBar >= item.startBar && destinationBar < item.startBar + item.lengthBars);
    if (!section) return [0, 0];

    const sourceBar = sourceStartBar(section) + destinationBar - section.startBar;
    const energyGain = sectionEnergyGain(section.energy);
    let minimum = 0;
    let maximum = 0;

    for (const track of project.tracks) {
      const envelope = envelopes[track.id];
      const state = sectionTrackState(project, section.id, track.id);
      if (!envelope?.peaks.length || !state.enabled) continue;

      const peakIndex = Math.min(
        envelope.peaks.length - 1,
        Math.max(0, Math.floor(sourceBar / project.totalBars * envelope.peaks.length)),
      );
      const peak = envelope.peaks[peakIndex];
      const gain = state.level * energyGain;
      minimum += peak[0] * gain;
      maximum += peak[1] * gain;
    }

    return [clampSample(minimum / normalizer), clampSample(maximum / normalizer)];
  });
}
