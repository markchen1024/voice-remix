import type { Project } from "./edit-transactions.ts";

export type DemoProjectId = "neon-pulse-loop" | "kimi-to-hashiru-made";

export type DemoProject = {
  id: DemoProjectId;
  title: string;
  genre: string;
  duration: number;
  coverUrl: string;
  featuredCommand: string;
  suggestions: readonly string[];
  project: Project;
};

const neonPulseLoop: DemoProject = {
  id: "neon-pulse-loop",
  title: "Neon Pulse Loop",
  genre: "Alt-electronic · Neon pop · Instrumental",
  duration: 119.4,
  coverUrl: "/audio/neon-pulse-loop/cover.jpg",
  featuredCommand: "Move the final hook 4 bars earlier and make the drums 20% harder, but keep the bass unchanged.",
  suggestions: [
    "Move the final hook 4 bars earlier",
    "Make the drums hit harder",
    "Mute the synth in both hooks",
    "Keep only bass and drums",
  ],
  project: {
    version: 1,
    totalBars: 59,
    bpm: 118,
    sections: [
      { id: "intro-1", kind: "intro", label: "Opening", sourceStartBar: 0, startBar: 0, lengthBars: 4, energy: 0.28 },
      { id: "verse-1", kind: "verse", label: "Groove A", sourceStartBar: 4, startBar: 4, lengthBars: 8, energy: 0.5 },
      { id: "break-1", kind: "break", label: "Dropout", sourceStartBar: 12, startBar: 12, lengthBars: 4, energy: 0.3 },
      { id: "chorus-1", kind: "chorus", label: "Hook A", sourceStartBar: 16, startBar: 16, lengthBars: 12, energy: 0.82 },
      { id: "break-2", kind: "break", label: "Break", sourceStartBar: 28, startBar: 28, lengthBars: 2, energy: 0.26 },
      { id: "verse-2", kind: "verse", label: "Groove A 2", sourceStartBar: 30, startBar: 30, lengthBars: 7, energy: 0.56 },
      { id: "build-1", kind: "verse", label: "Build", sourceStartBar: 37, startBar: 37, lengthBars: 7, energy: 0.72 },
      { id: "chorus-2", kind: "chorus", label: "Final Hook", sourceStartBar: 44, startBar: 44, lengthBars: 9, energy: 0.94 },
      { id: "outro-1", kind: "outro", label: "Outro", sourceStartBar: 53, startBar: 53, lengthBars: 6, energy: 0.38 },
    ],
    tracks: [
      { id: "drums", label: "DRUMS", role: "Suno stem · WAV", color: "#ff7a5c", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/drums.mp3", peaksUrl: "/audio/neon-pulse-loop/drums-peaks.json", meanDb: -21.6, maxDb: -4.1 },
      { id: "percussion", label: "PERCUSSION", role: "Suno stem · WAV", color: "#f5c84c", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/percussion.mp3", peaksUrl: "/audio/neon-pulse-loop/percussion-peaks.json", meanDb: -37.3, maxDb: -2.8 },
      { id: "bass", label: "BASS", role: "Suno stem · WAV + MIDI", color: "#9d83ff", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/bass.mp3", peaksUrl: "/audio/neon-pulse-loop/bass-peaks.json", meanDb: -20.5, maxDb: -7 },
      { id: "synth", label: "SYNTH", role: "Suno stem · WAV + MIDI", color: "#4ed6a7", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/synth.mp3", peaksUrl: "/audio/neon-pulse-loop/synth-peaks.json", meanDb: -25.6, maxDb: -4.9 },
      { id: "fx", label: "FX", role: "Suno stem · WAV", color: "#f06eb6", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/fx.mp3", peaksUrl: "/audio/neon-pulse-loop/fx-peaks.json", meanDb: -106.2, maxDb: -54.9, nearSilent: true },
    ],
  },
};

const kimiToHashiruMade: DemoProject = {
  id: "kimi-to-hashiru-made",
  title: "君と走るまで",
  genre: "Epic J-rock · Anime rock · Japanese vocals",
  duration: 215.99,
  coverUrl: "/audio/kimi-to-hashiru-made/cover.jpg",
  featuredCommand: "In the final chorus, mute the backing vocals and make the guitar 15% louder, but keep the lead vocal unchanged.",
  suggestions: [
    "Mute the backing vocals in the final chorus",
    "Make the guitar 15% louder in both choruses",
    "Keep only lead vocals, drums, bass, and guitar in the bridge",
    "Lower the keyboards in the verses",
  ],
  project: {
    version: 1,
    totalBars: 158,
    bpm: 175,
    sections: [
      { id: "intro-1", kind: "intro", label: "Intro", sourceStartBar: 0, startBar: 0, lengthBars: 8, energy: 0.28 },
      { id: "verse-1", kind: "verse", label: "Verse 1", sourceStartBar: 8, startBar: 8, lengthBars: 16, energy: 0.58 },
      { id: "pre-chorus-1", kind: "verse", label: "Pre-Chorus 1", sourceStartBar: 24, startBar: 24, lengthBars: 16, energy: 0.76 },
      { id: "chorus-1", kind: "chorus", label: "Chorus 1", sourceStartBar: 40, startBar: 40, lengthBars: 16, energy: 0.94 },
      { id: "turnaround-1", kind: "break", label: "Turnaround", sourceStartBar: 56, startBar: 56, lengthBars: 4, energy: 0.42 },
      { id: "verse-2", kind: "verse", label: "Verse 2", sourceStartBar: 60, startBar: 60, lengthBars: 16, energy: 0.62 },
      { id: "pre-chorus-2", kind: "verse", label: "Pre-Chorus 2", sourceStartBar: 76, startBar: 76, lengthBars: 12, energy: 0.78 },
      { id: "chorus-2", kind: "chorus", label: "Chorus 2", sourceStartBar: 88, startBar: 88, lengthBars: 16, energy: 0.96 },
      { id: "instrumental-1", kind: "break", label: "Instrumental", sourceStartBar: 104, startBar: 104, lengthBars: 7, energy: 0.5 },
      { id: "bridge-1", kind: "break", label: "Bridge", sourceStartBar: 111, startBar: 111, lengthBars: 16, energy: 0.72 },
      { id: "chorus-3", kind: "chorus", label: "Final Chorus", sourceStartBar: 127, startBar: 127, lengthBars: 24, energy: 1 },
      { id: "outro-1", kind: "outro", label: "Outro", sourceStartBar: 151, startBar: 151, lengthBars: 7, energy: 0.35 },
    ],
    tracks: [
      { id: "lead_vocals", label: "LEAD VOCALS", role: "Suno stem · WAV", color: "#f45f9d", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/lead-vocals.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/lead-vocals-peaks.json", meanDb: -23, maxDb: -6.1 },
      { id: "backing_vocals", label: "BACKING VOCALS", role: "Suno stem · WAV", color: "#ff985c", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/backing-vocals.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/backing-vocals-peaks.json", meanDb: -33.2, maxDb: -9.3 },
      { id: "drums", label: "DRUMS", role: "Suno stem · WAV", color: "#e8c843", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/drums.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/drums-peaks.json", meanDb: -27.3, maxDb: -4.6 },
      { id: "bass", label: "BASS", role: "Suno stem · WAV", color: "#9d83ff", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/bass.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/bass-peaks.json", meanDb: -30.2, maxDb: -16.5 },
      { id: "guitar", label: "GUITAR", role: "Suno stem · WAV", color: "#4f9dff", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/guitar.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/guitar-peaks.json", meanDb: -26.2, maxDb: -7.7 },
      { id: "keyboards", label: "KEYBOARDS", role: "Suno stem · WAV", color: "#785de8", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/keyboards.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/keyboards-peaks.json", meanDb: -52.3, maxDb: -20.3 },
      { id: "percussion", label: "PERCUSSION", role: "Suno stem · WAV", color: "#d3b82f", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/percussion.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/percussion-peaks.json", meanDb: -109.7, maxDb: -55.3, nearSilent: true },
      { id: "synth", label: "SYNTH", role: "Suno stem · WAV", color: "#4ed6a7", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/synth.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/synth-peaks.json", meanDb: -109.9, maxDb: -55.8, nearSilent: true },
      { id: "other", label: "OTHER", role: "Suno stem · WAV", color: "#d16fcb", enabled: true, level: 1, audioUrl: "/audio/kimi-to-hashiru-made/other.mp3", peaksUrl: "/audio/kimi-to-hashiru-made/other-peaks.json", meanDb: -36.6, maxDb: -5.1 },
    ],
  },
};

export const DEMO_PROJECTS = [neonPulseLoop, kimiToHashiruMade] as const;
export const INITIAL_DEMO = neonPulseLoop;

export function demoProjectById(id: DemoProjectId) {
  return DEMO_PROJECTS.find((demo) => demo.id === id) ?? INITIAL_DEMO;
}
