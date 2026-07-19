import type { PeakEnvelope } from "./master-waveform.ts";
import { cloneProject, type Project, type Section, type TrackId } from "./edit-transactions.ts";

export const REPLACEABLE_STEM_IDS = ["drums", "percussion", "bass", "synth", "fx"] as const satisfies readonly TrackId[];

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
    ["intro-1", "intro", "Intro", 0, 0.08, 0.3],
    ["verse-1", "verse", "Verse", 0.08, 0.26, 0.52],
    ["chorus-1", "chorus", "Chorus", 0.26, 0.46, 0.82],
    ["break-1", "break", "Break", 0.46, 0.54, 0.34],
    ["verse-2", "verse", "Verse 2", 0.54, 0.72, 0.58],
    ["chorus-2", "chorus", "Final Chorus", 0.72, 0.92, 0.94],
    ["outro-1", "outro", "Outro", 0.92, 1, 0.38],
  ] as const;

  return definitions.map(([id, kind, label, startRatio, endRatio, energy], index) => {
    const startBar = index === 0 ? 0 : Math.round(totalBars * startRatio);
    const endBar = index === definitions.length - 1 ? totalBars : Math.max(startBar + 1, Math.round(totalBars * endRatio));
    return { id, kind, label, sourceStartBar: startBar, startBar, lengthBars: Math.max(1, endBar - startBar), energy };
  });
}

export function filenameTitle(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim() || "Imported audio";
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
