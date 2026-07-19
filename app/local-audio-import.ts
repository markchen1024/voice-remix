import type { PeakEnvelope } from "./master-waveform.ts";
import { cloneProject, type Project, type Section, type Track, type TrackId } from "./edit-transactions.ts";

export const REPLACEABLE_STEM_IDS = ["lead_vocals", "backing_vocals", "drums", "percussion", "bass", "guitar", "keyboards", "synth", "fx", "other"] as const satisfies readonly TrackId[];
export type ReplaceableStemId = typeof REPLACEABLE_STEM_IDS[number];

type StemDefinition = Pick<Track, "id" | "label" | "color"> & { patterns: RegExp[] };

const STEM_DEFINITIONS = [
  { id: "lead_vocals", label: "LEAD VOCALS", color: "#ee4c9b", patterns: [/\blead[\s._-]*vocals?\b/i, /\bmain[\s._-]*vocals?\b/i, /主唱/u] },
  { id: "backing_vocals", label: "BACKING VOCALS", color: "#ee7a21", patterns: [/\bback(?:ing)?[\s._-]*vocals?\b/i, /\bbackground[\s._-]*vocals?\b/i, /\bb[\s._-]*vox\b/i, /和声/u, /伴唱/u] },
  { id: "drums", label: "DRUMS", color: "#ff7659", patterns: [/\bdrums?\b/i, /\bdrum[\s._-]*kit\b/i, /鼓组/u] },
  { id: "percussion", label: "PERCUSSION", color: "#e6b933", patterns: [/\bpercussion\b/i, /\bperc\b/i, /打击乐/u] },
  { id: "bass", label: "BASS", color: "#9278ef", patterns: [/\bbass\b/i, /贝斯/u] },
  { id: "guitar", label: "GUITAR", color: "#4e9ae8", patterns: [/\bguitars?\b/i, /\bgtr\b/i, /吉他/u] },
  { id: "keyboards", label: "KEYBOARDS", color: "#7955e7", patterns: [/\bkeyboards?\b/i, /\bkeys\b/i, /\bpiano\b/i, /钢琴/u, /键盘/u] },
  { id: "synth", label: "SYNTH", color: "#45cfa6", patterns: [/\bsynth(?:esizer)?s?\b/i, /合成器/u] },
  { id: "fx", label: "FX", color: "#e85bac", patterns: [/\b(?:sfx|fx|effects?)\b/i, /效果(?:音)?/u] },
  { id: "other", label: "OTHER", color: "#8a8795", patterns: [/\bother\b/i, /\bmisc(?:ellaneous)?\b/i, /其他/u] },
] as const satisfies readonly StemDefinition[];

export type StemFilenameMapping = {
  duplicate: boolean;
  filename: string;
  index: number;
  trackId: ReplaceableStemId | null;
};

export type MappedStemAsset = {
  asset: LocalAudioAsset;
  trackId: ReplaceableStemId;
};

export type DecodedAudioLike = {
  duration: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
};

export type LocalAudioAsset = {
  audioUrl: string;
  duration: number;
  filename: string;
  maxDb: number;
  meanDb: number;
  nearSilent: boolean;
  peaksUrl: string;
};

export type AudioAnalysis = Pick<LocalAudioAsset, "duration" | "maxDb" | "meanDb" | "nearSilent"> & {
  envelope: PeakEnvelope;
};

function amplitudeToDb(amplitude: number) {
  return 20 * Math.log10(Math.max(1e-8, amplitude));
}

export function analyzeDecodedAudio(audio: DecodedAudioLike, binCount = 2048): AudioAnalysis {
  const bins = Math.max(1, Math.floor(binCount));
  const channels = Array.from({ length: Math.max(1, audio.numberOfChannels) }, (_, channel) => audio.getChannelData(channel));
  const sampleCount = Math.max(1, channels[0]?.length ?? 0);
  let sumSquares = 0;
  let absolutePeak = 0;
  let measuredSamples = 0;

  const peaks = Array.from({ length: bins }, (_, bin): [number, number] => {
    const start = Math.floor(bin / bins * sampleCount);
    const end = Math.max(start + 1, Math.floor((bin + 1) / bins * sampleCount));
    let minimum = 0;
    let maximum = 0;

    for (const channel of channels) {
      for (let index = start; index < end && index < channel.length; index += 1) {
        const sample = channel[index];
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
        sumSquares += sample * sample;
        absolutePeak = Math.max(absolutePeak, Math.abs(sample));
        measuredSamples += 1;
      }
    }

    return [minimum, maximum];
  });

  const rms = Math.sqrt(sumSquares / Math.max(1, measuredSamples));
  const maxDb = amplitudeToDb(absolutePeak);
  return {
    duration: audio.duration,
    envelope: { peaks },
    maxDb,
    meanDb: amplitudeToDb(rms),
    nearSilent: maxDb < -48,
  };
}

export function projectBarsForDuration(duration: number, bpm: number) {
  return Math.max(8, Math.round(Math.max(0, duration) * Math.max(1, bpm) / 240));
}

function estimatedSections(totalBars: number): Section[] {
  const definitions = [
    ["intro-1", "intro", "Intro", 0.08, 0.3],
    ["verse-1", "verse", "Verse", 0.18, 0.52],
    ["chorus-1", "chorus", "Chorus", 0.2, 0.82],
    ["break-1", "break", "Break", 0.08, 0.34],
    ["verse-2", "verse", "Verse 2", 0.18, 0.58],
    ["chorus-2", "chorus", "Final Chorus", 0.2, 0.94],
    ["outro-1", "outro", "Outro", 0.08, 0.38],
  ] as const;
  const distributableBars = totalBars - definitions.length;
  const exactExtras = definitions.map((definition) => definition[3] * distributableBars);
  const extraBars = exactExtras.map(Math.floor);
  let unassignedBars = distributableBars - extraBars.reduce((sum, value) => sum + value, 0);
  const byRemainder = exactExtras.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < byRemainder.length && unassignedBars > 0; index += 1, unassignedBars -= 1) extraBars[byRemainder[index].index] += 1;
  let startBar = 0;

  return definitions.map(([id, kind, label, , energy], index) => {
    const lengthBars = 1 + extraBars[index];
    const section = { id, kind, label, sourceStartBar: startBar, startBar, lengthBars, energy };
    startBar += lengthBars;
    return section;
  });
}

export function filenameTitle(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim() || "Imported audio";
}

export function matchStemTrackId(filename: string): ReplaceableStemId | null {
  const basename = filenameTitle(filename).replace(/^\s*\d+[\s._-]*/, "").trim();
  return STEM_DEFINITIONS.find((definition) => definition.patterns.some((pattern) => pattern.test(basename)))?.id ?? null;
}

export function mapStemFilenames(filenames: readonly string[]): StemFilenameMapping[] {
  const mapped = filenames.map((filename, index) => ({ filename, index, trackId: matchStemTrackId(filename) }));
  const counts = mapped.reduce<Partial<Record<ReplaceableStemId, number>>>((result, item) => {
    if (item.trackId) result[item.trackId] = (result[item.trackId] ?? 0) + 1;
    return result;
  }, {});
  return mapped.map((item) => ({ ...item, duplicate: item.trackId !== null && (counts[item.trackId] ?? 0) > 1 }));
}

export function validateMappedStemAssets(stems: readonly MappedStemAsset[]) {
  if (stems.length < 2) throw new Error("Choose at least two recognized stem files to create a multitrack project.");
  const duplicate = stems.find((stem, index) => stems.findIndex((candidate) => candidate.trackId === stem.trackId) !== index);
  if (duplicate) throw new Error(`More than one file maps to ${duplicate.trackId.replaceAll("_", " ")}. Keep one file for each stem.`);

  const referenceDuration = stems[0].asset.duration;
  const tolerance = Math.max(0.75, referenceDuration * 0.01);
  const mismatched = stems.find((stem) => Math.abs(stem.asset.duration - referenceDuration) > tolerance);
  if (mismatched) {
    throw new Error(`${mismatched.asset.filename} is ${mismatched.asset.duration.toFixed(1)}s; expected about ${referenceDuration.toFixed(1)}s. Export synchronized stems with matching start and duration.`);
  }
  return { duration: referenceDuration, tolerance };
}

export function createStemProject(current: Project, stems: readonly MappedStemAsset[], bpm = current.bpm): Project {
  const { duration } = validateMappedStemAssets(stems);
  const byTrack = new Map(stems.map((stem) => [stem.trackId, stem.asset]));
  const totalBars = projectBarsForDuration(duration, bpm);
  return {
    version: current.version + 1,
    bpm,
    totalBars,
    sections: estimatedSections(totalBars),
    tracks: STEM_DEFINITIONS.flatMap((definition): Track[] => {
      const asset = byTrack.get(definition.id);
      if (!asset) return [];
      return [{
        id: definition.id,
        label: definition.label,
        role: `Local stem · ${asset.filename.split(".").pop()?.toUpperCase() || "AUDIO"}`,
        color: definition.color,
        enabled: true,
        level: 1,
        audioUrl: asset.audioUrl,
        peaksUrl: asset.peaksUrl,
        meanDb: asset.meanDb,
        maxDb: asset.maxDb,
        nearSilent: asset.nearSilent,
      }];
    }),
    automation: [],
  };
}

export function createFullMixProject(current: Project, asset: LocalAudioAsset, bpm = current.bpm): Project {
  const totalBars = projectBarsForDuration(asset.duration, bpm);
  return {
    version: current.version + 1,
    bpm,
    totalBars,
    sections: estimatedSections(totalBars),
    tracks: [{
      id: "mix",
      label: "MASTER MIX",
      role: `Local import · ${asset.filename.split(".").pop()?.toUpperCase() || "AUDIO"}`,
      color: "#c868d8",
      enabled: true,
      level: 1,
      audioUrl: asset.audioUrl,
      peaksUrl: asset.peaksUrl,
      meanDb: asset.meanDb,
      maxDb: asset.maxDb,
      nearSilent: asset.nearSilent,
    }],
    automation: [],
  };
}

export function replaceProjectStem(current: Project, trackId: TrackId, asset: LocalAudioAsset): Project {
  const next = cloneProject(current);
  const track = next.tracks.find((item) => item.id === trackId);
  if (!track || track.id === "mix") throw new Error(`Unknown replaceable stem: ${trackId}`);
  track.audioUrl = asset.audioUrl;
  track.peaksUrl = asset.peaksUrl;
  track.role = `Local import · ${asset.filename.split(".").pop()?.toUpperCase() || "AUDIO"}`;
  track.meanDb = asset.meanDb;
  track.maxDb = asset.maxDb;
  track.nearSilent = asset.nearSilent;
  track.enabled = true;
  track.level = 1;
  next.version += 1;
  next.automation = next.automation?.filter((item) => item.trackId !== trackId);
  return next;
}
