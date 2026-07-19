import { createArrangementSegments } from "./audio-arrangement.ts";
import { sectionEnergyGain } from "./audio-mixer.ts";
import { sectionTrackState, type Project, type TrackId } from "./edit-transactions.ts";

export type AudioRenderInstruction = {
  audioUrl: string;
  destinationStartSeconds: number;
  durationSeconds: number;
  gain: number;
  sectionId: string;
  sourceStartSeconds: number;
  trackId: TrackId;
};

export type RenderProjectOptions = {
  onProgress?: (progress: number) => void;
  sampleRate?: number;
};

export function createAudioRenderInstructions(project: Project, audioDuration: number): AudioRenderInstruction[] {
  const segments = createArrangementSegments(project, audioDuration);
  return project.tracks.flatMap((track) => segments.flatMap((segment) => {
    const state = sectionTrackState(project, segment.sectionId, track.id);
    if (!state.enabled || state.level <= 0) return [];
    const section = project.sections.find((item) => item.id === segment.sectionId);
    return [{
      audioUrl: track.audioUrl,
      destinationStartSeconds: segment.destinationStartSeconds,
      durationSeconds: segment.durationSeconds,
      gain: state.level * sectionEnergyGain(section?.energy ?? 1),
      sectionId: segment.sectionId,
      sourceStartSeconds: segment.sourceStartSeconds,
      trackId: track.id,
    }];
  }));
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function encodeWavPcm16(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  if (!channels.length) throw new Error("Cannot encode WAV without audio channels.");
  const frameCount = channels[0].length;
  if (!channels.every((channel) => channel.length === frameCount)) throw new Error("WAV channels must have the same length.");
  const channelCount = channels.length;
  const bytesPerSample = 2;
  const dataBytes = frameCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(offset, sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff), true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}

export function audioExportFilename(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "voice-remix";
  return `${slug}-remix.wav`;
}

export async function renderProjectToWav(project: Project, audioDuration: number, options: RenderProjectOptions = {}) {
  if (typeof OfflineAudioContext === "undefined") throw new Error("This browser does not support offline audio rendering.");
  const sampleRate = options.sampleRate ?? 44_100;
  const frameCount = Math.max(1, Math.ceil(audioDuration * sampleRate));
  const context = new OfflineAudioContext(2, frameCount, sampleRate);
  const instructions = createAudioRenderInstructions(project, audioDuration);
  const trackUrls = [...new Set(project.tracks.map((track) => track.audioUrl))];
  const decoded = new Map<string, AudioBuffer>();

  options.onProgress?.(0.04);
  for (let index = 0; index < trackUrls.length; index += 1) {
    const url = trackUrls[index];
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load an audio track for export (${response.status}).`);
    decoded.set(url, await context.decodeAudioData(await response.arrayBuffer()));
    options.onProgress?.(0.08 + (index + 1) / trackUrls.length * 0.34);
  }

  for (const instruction of instructions) {
    const buffer = decoded.get(instruction.audioUrl);
    if (!buffer) continue;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const start = instruction.destinationStartSeconds;
    const duration = Math.min(instruction.durationSeconds, Math.max(0, buffer.duration - instruction.sourceStartSeconds));
    if (duration <= 0) continue;
    const fade = Math.min(0.015, duration / 2);
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(instruction.gain, start + fade);
    gain.gain.setValueAtTime(instruction.gain, Math.max(start + fade, start + duration - fade));
    gain.gain.linearRampToValueAtTime(0, start + duration);
    source.start(start, instruction.sourceStartSeconds, duration);
  }

  options.onProgress?.(0.5);
  const rendered = await context.startRendering();
  options.onProgress?.(0.92);
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, channel) => rendered.getChannelData(channel));
  const wav = encodeWavPcm16(channels, rendered.sampleRate);
  options.onProgress?.(1);
  return wav;
}
