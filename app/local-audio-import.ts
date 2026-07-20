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
  structure?: AudioStructureEvidence;
};

export type AudioAnalysis = Pick<LocalAudioAsset, "duration" | "maxDb" | "meanDb" | "nearSilent"> & {
  envelope: PeakEnvelope;
  structure?: AudioStructureEvidence;
};

export type AudioBarFeature = {
  brightness: number;
  density: number;
  energy: number;
};

export type AudioStructureEvidence = {
  bars: AudioBarFeature[];
  confidence: number;
  method: "browser-bar-features";
};

function amplitudeToDb(amplitude: number) {
  return 20 * Math.log10(Math.max(1e-8, amplitude));
}

function normalized(values: number[]) {
  if (!values.length) return [];
  const ordered = [...values].sort((left, right) => left - right);
  const low = ordered[Math.floor((ordered.length - 1) * 0.1)];
  const high = ordered[Math.floor((ordered.length - 1) * 0.9)];
  const range = Math.max(1e-8, high - low);
  return values.map((value) => Math.max(0, Math.min(1, (value - low) / range)));
}

export function analyzeAudioStructure(audio: DecodedAudioLike, bpm: number): AudioStructureEvidence {
  const totalBars = projectBarsForDuration(audio.duration, bpm);
  const channels = Array.from({ length: Math.max(1, audio.numberOfChannels) }, (_, channel) => audio.getChannelData(channel));
  const sampleCount = Math.max(1, channels[0]?.length ?? 0);
  const rawEnergy: number[] = [];
  const rawDensity: number[] = [];
  const rawBrightness: number[] = [];

  for (let bar = 0; bar < totalBars; bar += 1) {
    const start = Math.floor(bar / totalBars * sampleCount);
    const end = Math.max(start + 1, Math.floor((bar + 1) / totalBars * sampleCount));
    const step = Math.max(1, Math.floor((end - start) / 4096));
    let sumSquares = 0;
    let sumDifference = 0;
    let zeroCrossings = 0;
    let measured = 0;

    for (const channel of channels) {
      let previous = channel[start] ?? 0;
      for (let index = start; index < end && index < channel.length; index += step) {
        const sample = channel[index];
        sumSquares += sample * sample;
        sumDifference += Math.abs(sample - previous);
        if ((sample >= 0) !== (previous >= 0)) zeroCrossings += 1;
        previous = sample;
        measured += 1;
      }
    }

    rawEnergy.push(amplitudeToDb(Math.sqrt(sumSquares / Math.max(1, measured))));
    rawDensity.push(sumDifference / Math.max(1, measured));
    rawBrightness.push(zeroCrossings / Math.max(1, measured));
  }

  const energy = normalized(rawEnergy);
  const density = normalized(rawDensity);
  const brightness = normalized(rawBrightness);
  const spread = (values: number[]) => values.length ? Math.max(...values) - Math.min(...values) : 0;
  const confidence = Math.max(0.35, Math.min(0.92, 0.42 + spread(energy) * 0.28 + spread(density) * 0.14 + spread(brightness) * 0.08));

  return {
    bars: energy.map((value, index) => ({ energy: value, density: density[index] ?? 0, brightness: brightness[index] ?? 0 })),
    confidence,
    method: "browser-bar-features",
  };
}

export function analyzeDecodedAudio(audio: DecodedAudioLike, binCount = 2048, bpm?: number): AudioAnalysis {
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
    structure: bpm ? analyzeAudioStructure(audio, bpm) : undefined,
  };
}

export function projectBarsForDuration(duration: number, bpm: number) {
  return Math.max(8, Math.round(Math.max(0, duration) * Math.max(1, bpm) / 240));
}

function meanFeature(bars: AudioBarFeature[], start: number, end: number): AudioBarFeature {
  const selected = bars.slice(Math.max(0, start), Math.max(start + 1, end));
  const divisor = Math.max(1, selected.length);
  return selected.reduce((result, bar) => ({
    energy: result.energy + bar.energy / divisor,
    density: result.density + bar.density / divisor,
    brightness: result.brightness + bar.brightness / divisor,
  }), { energy: 0, density: 0, brightness: 0 });
}

function featureDistance(left: AudioBarFeature, right: AudioBarFeature) {
  return Math.abs(left.energy - right.energy) * 0.55
    + Math.abs(left.density - right.density) * 0.3
    + Math.abs(left.brightness - right.brightness) * 0.15;
}

function segmentSignature(bars: AudioBarFeature[], start: number, end: number) {
  const parts = Math.min(4, Math.max(1, end - start));
  return Array.from({ length: parts }, (_, index) => {
    const partStart = Math.floor(start + (end - start) * index / parts);
    const partEnd = Math.max(partStart + 1, Math.floor(start + (end - start) * (index + 1) / parts));
    const feature = meanFeature(bars, partStart, partEnd);
    return [feature.energy, feature.density, feature.brightness];
  }).flat();
}

function signatureDistance(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 1;
  let distance = 0;
  for (let index = 0; index < length; index += 1) distance += Math.abs(left[index] - right[index]);
  return distance / length + Math.abs(left.length - right.length) * 0.1;
}

function neutralFallbackSections(totalBars: number): Section[] {
  const labels = ["Opening", "Theme A", "Theme B", "Break", "Theme A 2", "Climax", "Outro"];
  const weights = [0.08, 0.2, 0.18, 0.1, 0.18, 0.18, 0.08];
  const distributableBars = totalBars - labels.length;
  const exactExtras = weights.map((weight) => weight * distributableBars);
  const extraBars = exactExtras.map(Math.floor);
  let unassigned = distributableBars - extraBars.reduce((sum, value) => sum + value, 0);
  const remainders = exactExtras.map((value, index) => ({ index, value: value - Math.floor(value) })).sort((left, right) => right.value - left.value);
  for (let index = 0; index < remainders.length && unassigned > 0; index += 1, unassigned -= 1) extraBars[remainders[index].index] += 1;
  let startBar = 0;
  return labels.map((label, index) => {
    const lengthBars = 1 + extraBars[index];
    const kind: Section["kind"] = index === 0 ? "intro" : index === labels.length - 1 ? "outro" : label === "Break" ? "break" : label === "Climax" ? "chorus" : "verse";
    const section = { id: `auto-${index + 1}`, kind, label, sourceStartBar: startBar, startBar, lengthBars, energy: index === labels.length - 2 ? 0.9 : index === 3 ? 0.35 : 0.58 };
    startBar += lengthBars;
    return section;
  });
}

export function detectAudioSections(totalBars: number, evidence?: AudioStructureEvidence): Section[] {
  if (!evidence || evidence.bars.length !== totalBars || totalBars < 12) return neutralFallbackSections(totalBars);
  const bars = evidence.bars;
  const phrase = totalBars >= 32 ? 4 : 2;
  const minimumLength = Math.min(4, phrase);
  const targetSections = Math.max(4, Math.min(9, Math.round(totalBars / 11)));
  const candidates: { bar: number; score: number }[] = [];

  for (let bar = phrase; bar <= totalBars - phrase; bar += phrase) {
    const before = meanFeature(bars, bar - phrase, bar);
    const after = meanFeature(bars, bar, bar + phrase);
    const immediate = featureDistance(bars[bar - 1], bars[bar]);
    candidates.push({ bar, score: featureDistance(before, after) * 0.75 + immediate * 0.25 });
  }

  const boundaries = [0, totalBars];
  for (const candidate of [...candidates].sort((left, right) => right.score - left.score)) {
    if (boundaries.length >= targetSections + 1) break;
    if (boundaries.every((boundary) => Math.abs(boundary - candidate.bar) >= minimumLength)) boundaries.push(candidate.bar);
  }

  const maxLength = totalBars >= 96 ? 24 : 16;
  boundaries.sort((left, right) => left - right);
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end - start <= maxLength) continue;
    const options = candidates.filter((candidate) => candidate.bar - start >= minimumLength && end - candidate.bar >= minimumLength);
    const midpoint = Math.round(((start + end) / 2) / phrase) * phrase;
    const split = options.sort((left, right) => Math.abs(left.bar - midpoint) - Math.abs(right.bar - midpoint) || right.score - left.score)[0]?.bar ?? midpoint;
    boundaries.push(split);
    boundaries.sort((left, right) => left - right);
    index = -1;
  }

  const segments = boundaries.slice(0, -1).map((startBar, index) => {
    const endBar = boundaries[index + 1];
    const feature = meanFeature(bars, startBar, endBar);
    const early = meanFeature(bars, startBar, Math.min(endBar, startBar + Math.max(1, Math.floor((endBar - startBar) / 3))));
    const late = meanFeature(bars, Math.max(startBar, endBar - Math.max(1, Math.floor((endBar - startBar) / 3))), endBar);
    return { startBar, endBar, feature, signature: segmentSignature(bars, startBar, endBar), trend: late.energy - early.energy };
  });
  const sortedEnergy = segments.map((segment) => segment.feature.energy).sort((left, right) => left - right);
  const medianEnergy = sortedEnergy[Math.floor(sortedEnergy.length / 2)] ?? 0.5;
  const themeSignatures: number[][] = [];
  const themeOccurrences: number[] = [];

  return segments.map((segment, index): Section => {
    let label: string;
    let kind: Section["kind"];
    if (index === 0) {
      label = "Opening";
      kind = "intro";
    } else if (index === segments.length - 1) {
      label = "Outro";
      kind = "outro";
    } else if (segment.feature.energy < Math.max(0.22, medianEnergy - 0.28)) {
      label = "Break";
      kind = "break";
    } else if (segment.trend > 0.2) {
      label = "Build";
      kind = "verse";
    } else if (segment.feature.energy > Math.max(0.78, medianEnergy + 0.24) && index >= Math.floor(segments.length / 2)) {
      label = "Climax";
      kind = "chorus";
    } else {
      let themeIndex = themeSignatures.findIndex((signature) => signatureDistance(signature, segment.signature) < 0.18);
      if (themeIndex < 0) {
        themeIndex = themeSignatures.length;
        themeSignatures.push(segment.signature);
        themeOccurrences.push(0);
      }
      themeOccurrences[themeIndex] += 1;
      label = `Theme ${String.fromCharCode(65 + themeIndex)}${themeOccurrences[themeIndex] > 1 ? ` ${themeOccurrences[themeIndex]}` : ""}`;
      kind = segment.feature.energy >= medianEnergy ? "chorus" : "verse";
    }
    return {
      id: `auto-${index + 1}`,
      kind,
      label,
      sourceStartBar: segment.startBar,
      startBar: segment.startBar,
      lengthBars: segment.endBar - segment.startBar,
      energy: Math.max(0.2, Math.min(1, 0.25 + segment.feature.energy * 0.75)),
    };
  });
}

function combinedStructure(stems: readonly MappedStemAsset[], totalBars: number): AudioStructureEvidence | undefined {
  const evidence = stems.map((stem) => stem.asset.structure).filter((item): item is AudioStructureEvidence => Boolean(item && item.bars.length === totalBars));
  if (!evidence.length) return undefined;
  return {
    bars: Array.from({ length: totalBars }, (_, bar) => {
      const features = evidence.map((item) => item.bars[bar]);
      const divisor = features.length;
      return features.reduce((result, feature) => ({
        energy: result.energy + feature.energy / divisor,
        density: result.density + feature.density / divisor,
        brightness: result.brightness + feature.brightness / divisor,
      }), { energy: 0, density: 0, brightness: 0 });
    }),
    confidence: evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length,
    method: "browser-bar-features",
  };
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
    sections: detectAudioSections(totalBars, combinedStructure(stems, totalBars)),
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
    sections: detectAudioSections(totalBars, asset.structure),
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
