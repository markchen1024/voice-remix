"use client";

import { FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
import { arrangementSignature, createArrangementSegments, findAuditionStartBar, isMixerOnlyTransition, sourceStartBar } from "./audio-arrangement";
import { EMPTY_MIXER_STATUS, sectionEnergyGain, syncProjectMixer, type MixerStatus } from "./audio-mixer";
import { routeImmediateEditorCommand, type ImmediateEditorCommand } from "./editor-command-router";
import { createEditorContext } from "./editor-context";
import { applyOperations, cloneProject, createLocalTransaction, describeOperation, sectionTrackState, type EditTransaction, type Project, type TrackId } from "./edit-transactions";
import { createProjectHistory, recordHistory, redoHistory, undoHistory } from "./project-history";
import { createProjectExport, projectExportFilename } from "./project-export";
import { mergeProposalRefinement } from "./proposal-refinement";
import { connectRealtimeConversation, type RealtimeConversationClient, type RealtimeToolCall } from "./realtime-transcription";
import { buildMasterWaveform, type PeakBank, type PeakEnvelope } from "./master-waveform";
import { createLiveCommandQueue, crossedQuantizedBar, forwardBarDistance, type LiveCommandQueue } from "./live-command-queue";
import { analyzeDecodedAudio, createFullMixProject, filenameTitle, replaceProjectStem, REPLACEABLE_STEM_IDS, type LocalAudioAsset } from "./local-audio-import";

const INITIAL_PROJECT: Project = {
  version: 1,
  totalBars: 59,
  bpm: 118,
  sections: [
    { id: "intro-1", kind: "intro", label: "Intro", sourceStartBar: 0, startBar: 0, lengthBars: 4, energy: 0.28 },
    { id: "verse-1", kind: "verse", label: "Verse", sourceStartBar: 4, startBar: 4, lengthBars: 8, energy: 0.5 },
    { id: "break-1", kind: "break", label: "Break", sourceStartBar: 12, startBar: 12, lengthBars: 4, energy: 0.3 },
    { id: "chorus-1", kind: "chorus", label: "Chorus", sourceStartBar: 16, startBar: 16, lengthBars: 12, energy: 0.82 },
    { id: "break-2", kind: "break", label: "Break 2", sourceStartBar: 28, startBar: 28, lengthBars: 2, energy: 0.26 },
    { id: "verse-2", kind: "verse", label: "Verse 2", sourceStartBar: 30, startBar: 30, lengthBars: 7, energy: 0.56 },
    { id: "build-1", kind: "verse", label: "Build", sourceStartBar: 37, startBar: 37, lengthBars: 7, energy: 0.72 },
    { id: "chorus-2", kind: "chorus", label: "Final Chorus", sourceStartBar: 44, startBar: 44, lengthBars: 9, energy: 0.94 },
    { id: "outro-1", kind: "outro", label: "Outro", sourceStartBar: 53, startBar: 53, lengthBars: 6, energy: 0.38 },
  ],
  tracks: [
    { id: "drums", label: "DRUMS", role: "Suno stem · WAV", color: "#ff7a5c", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/drums.mp3", peaksUrl: "/audio/neon-pulse-loop/drums-peaks.json", meanDb: -21.6, maxDb: -4.1 },
    { id: "percussion", label: "PERCUSSION", role: "Suno stem · WAV", color: "#f5c84c", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/percussion.mp3", peaksUrl: "/audio/neon-pulse-loop/percussion-peaks.json", meanDb: -37.3, maxDb: -2.8 },
    { id: "bass", label: "BASS", role: "Suno stem · WAV + MIDI", color: "#9d83ff", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/bass.mp3", peaksUrl: "/audio/neon-pulse-loop/bass-peaks.json", meanDb: -20.5, maxDb: -7 },
    { id: "synth", label: "SYNTH", role: "Suno stem · WAV + MIDI", color: "#4ed6a7", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/synth.mp3", peaksUrl: "/audio/neon-pulse-loop/synth-peaks.json", meanDb: -25.6, maxDb: -4.9 },
    { id: "fx", label: "FX", role: "Suno stem · WAV", color: "#f06eb6", enabled: true, level: 1, audioUrl: "/audio/neon-pulse-loop/fx.mp3", peaksUrl: "/audio/neon-pulse-loop/fx-peaks.json", meanDb: -106.2, maxDb: -54.9, nearSilent: true },
  ],
};

const BAR_PX = 58;

function realtimeEditorCommand(action: unknown): ImmediateEditorCommand | null {
  if (action === "play" || action === "pause" || action === "undo" || action === "redo") return { action };
  if (action === "apply") return { action: "apply_proposal" };
  if (action === "discard") return { action: "discard_proposal" };
  if (action === "audition_current") return { action: "audition_current" };
  if (action === "audition_proposed") return { action: "audition_proposed" };
  return null;
}
const DEMO_AUDIO_DURATION = 119.4;
type ScheduledPlayer = Tone.Player & { mixGain: number; sectionId: string };

function CoverArt({ mini = false }: { mini?: boolean }) {
  return <div className={`cover-art${mini ? " mini-cover" : ""}`} aria-hidden="true" />;
}

function sectionAt(project: Project, bar: number) {
  return [...project.sections]
    .reverse()
    .find((section) => bar >= section.startBar && bar < section.startBar + section.lengthBars);
}

function TrackWaveform({ url, color, width, project, nearSilent = false }: { url: string; color: string; width: number; project: Project; nearSilent?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    fetch(url)
      .then((response) => response.json() as Promise<PeakEnvelope>)
      .then((data) => {
        if (cancelled) return;
        const height = 54;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.strokeStyle = color;
        context.lineWidth = 1;
        context.globalAlpha = nearSilent ? 0.32 : 0.86;
        const center = height / 2;
        const visualScale = (value: number) => Math.sign(value) * Math.log1p(Math.abs(value) * 20) / Math.log(21);

        for (const section of project.sections) {
          const destinationStart = Math.round(section.startBar / project.totalBars * width);
          const destinationEnd = Math.round((section.startBar + section.lengthBars) / project.totalBars * width);
          const sourceStart = sourceStartBar(section);
          context.beginPath();
          for (let x = Math.max(0, destinationStart); x < Math.min(width, destinationEnd); x += 1) {
            const sectionProgress = (x - destinationStart) / Math.max(1, destinationEnd - destinationStart);
            const sourceBar = sourceStart + sectionProgress * section.lengthBars;
            const peak = data.peaks[Math.min(data.peaks.length - 1, Math.max(0, Math.floor(sourceBar / project.totalBars * data.peaks.length)))];
            const top = center - visualScale(peak[1]) * center * 0.88;
            const bottom = center - visualScale(peak[0]) * center * 0.88;
            context.moveTo(x + 0.5, top);
            context.lineTo(x + 0.5, Math.max(top + 1, bottom));
          }
          context.stroke();
        }
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [color, nearSilent, project, url, width]);

  return <canvas ref={canvasRef} className="track-waveform" aria-hidden="true" />;
}

const peakEnvelopeCache = new Map<string, Promise<PeakEnvelope>>();

function loadPeakEnvelope(url: string) {
  const cached = peakEnvelopeCache.get(url);
  if (cached) return cached;
  const request = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Could not load waveform peaks: ${url}`);
    return response.json() as Promise<PeakEnvelope>;
  });
  peakEnvelopeCache.set(url, request);
  return request;
}

function formatOverviewTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function MasterWaveform({ project, position, audioDuration, auditioning, cueBar, onScrub }: { project: Project; position: number; audioDuration: number; auditioning: boolean; cueBar?: number; onScrub: (bar: number) => void }) {
  const baseCanvas = useRef<HTMLCanvasElement>(null);
  const playedCanvas = useRef<HTMLCanvasElement>(null);
  const [envelopes, setEnvelopes] = useState<PeakBank>({});
  const progress = Math.max(0, Math.min(100, position / project.totalBars * 100));
  const waveform = useMemo(() => buildMasterWaveform(project, envelopes, 720), [envelopes, project]);
  const activeSection = sectionAt(project, position);

  useEffect(() => {
    let cancelled = false;
    Promise.all(project.tracks.map(async (track) => [track.id, await loadPeakEnvelope(track.peaksUrl)] as const))
      .then((entries) => {
        if (!cancelled) setEnvelopes(Object.fromEntries(entries) as PeakBank);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [project.tracks]);

  useEffect(() => {
    const draw = (canvas: HTMLCanvasElement | null, active: boolean) => {
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const width = canvas.width;
      const height = canvas.height;
      const center = height / 2;
      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(255,255,255,.055)";
      context.beginPath();
      context.moveTo(0, center + 0.5);
      context.lineTo(width, center + 0.5);
      context.stroke();

      const gradient = context.createLinearGradient(0, 0, width, 0);
      if (active) {
        gradient.addColorStop(0, "#8469ff");
        gradient.addColorStop(0.55, "#b15ed4");
        gradient.addColorStop(1, "#f16eae");
      } else {
        gradient.addColorStop(0, "#555361");
        gradient.addColorStop(1, "#3c3b47");
      }
      context.strokeStyle = gradient;
      context.lineWidth = 1;
      context.globalAlpha = active ? 0.96 : 0.78;
      context.beginPath();
      const visualScale = (value: number) => Math.sign(value) * Math.log1p(Math.abs(value) * 22) / Math.log(23);
      waveform.forEach((peak, index) => {
        const x = index / waveform.length * width;
        const top = center - visualScale(peak[1]) * center * 0.9;
        const bottom = center - visualScale(peak[0]) * center * 0.9;
        context.moveTo(x + 0.5, top);
        context.lineTo(x + 0.5, Math.max(top + 1, bottom));
      });
      context.stroke();
    };
    draw(baseCanvas.current, false);
    draw(playedCanvas.current, true);
  }, [waveform]);

  const scrubFromClientX = (clientX: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    onScrub(ratio * (project.totalBars - 0.001));
  };

  return (
    <div
      className="master-overview"
      data-waveform-source="stem-peaks"
      data-project-version={project.version}
      data-audition-mode={auditioning ? "proposed" : "current"}
      role="slider"
      tabIndex={0}
      aria-label="Master waveform overview"
      aria-valuemin={0}
      aria-valuemax={project.totalBars}
      aria-valuenow={Number(position.toFixed(2))}
      aria-valuetext={`${activeSection?.label ?? "Arrangement"}, bar ${Math.floor(position) + 1}, ${formatOverviewTime(position / project.totalBars * audioDuration)}`}
      title="Real peak-derived master overview · click or drag to seek"
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); scrubFromClientX(event.clientX, event.currentTarget); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubFromClientX(event.clientX, event.currentTarget); }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onScrub(position + (event.key === "ArrowLeft" ? -1 : 1));
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          onScrub(event.key === "Home" ? 0 : project.totalBars - 0.001);
        }
      }}
    >
      <canvas ref={baseCanvas} className="master-waveform-canvas" width="720" height="58" aria-hidden="true" />
      <canvas ref={playedCanvas} className="master-waveform-canvas played" width="720" height="58" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }} />
      <div className="master-section-markers" aria-hidden="true">
        {project.sections.map((section) => <span key={section.id} className="master-section-marker" style={{ left: `${section.startBar / project.totalBars * 100}%` }}><i />{section.label}</span>)}
      </div>
      {cueBar !== undefined && <span className="master-live-cue" aria-hidden="true" style={{ left: `${cueBar / project.totalBars * 100}%` }}><i>NEXT</i></span>}
      <span className="master-playhead" aria-hidden="true" style={{ left: `${progress}%` }} />
      <span className="master-time" aria-hidden="true">{formatOverviewTime(position / project.totalBars * audioDuration)} / {formatOverviewTime(audioDuration)}</span>
    </div>
  );
}

export function VoiceRemixStudio() {
  const [project, setProject] = useState<Project>(INITIAL_PROJECT);
  const projectRef = useRef(project);
  const [projectTitle, setProjectTitle] = useState("Neon Pulse Loop");
  const [audioDuration, setAudioDuration] = useState(DEMO_AUDIO_DURATION);
  const audioDurationRef = useRef(DEMO_AUDIO_DURATION);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const positionRef = useRef(0);
  const [command, setCommand] = useState("");
  const [proposal, setProposal] = useState<EditTransaction | null>(null);
  const [auditioningProposal, setAuditioningProposal] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "connecting" | "recording" | "transcribing" | "responding">("idle");
  const [assistantReply, setAssistantReply] = useState("");
  const [audioSwitching, setAudioSwitching] = useState(false);
  const [liveQueue, setLiveQueue] = useState<LiveCommandQueue | null>(null);
  const [selectedSection, setSelectedSection] = useState("chorus-1");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [mixerStatus, setMixerStatus] = useState<MixerStatus>(EMPTY_MIXER_STATUS);
  const [importOpen, setImportOpen] = useState(false);
  const [importingAudio, setImportingAudio] = useState(false);
  const [importError, setImportError] = useState("");
  const [importTarget, setImportTarget] = useState<TrackId>("drums");
  const [activity, setActivity] = useState([
    { title: "Suno stems imported", detail: "1:59 · 59 bars · 5 real audio tracks", time: "NOW" },
  ]);
  const history = useRef(createProjectHistory<Project>());
  const importedObjectUrls = useRef<Partial<Record<TrackId, [string, string]>>>({});
  const playingRef = useRef(false);
  const audioTransition = useRef(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const realtimeConversation = useRef<RealtimeConversationClient | null>(null);
  const realtimeToolHandler = useRef<(call: RealtimeToolCall) => Promise<unknown>>(async () => ({ ok: false, error: "Editor is not ready" }));
  const voiceDuckingLevel = useRef<number | null>(null);
  const liveQueueRef = useRef<LiveCommandQueue | null>(null);
  const previousLivePosition = useRef(0);
  const liveQueueExecutionHandler = useRef<(queue: LiveCommandQueue) => void>(() => undefined);
  const timelineScroll = useRef<HTMLDivElement | null>(null);
  const followedSection = useRef("");
  const scheduled = useRef(false);
  const audioSetup = useRef<Promise<void> | null>(null);
  const players = useRef<Partial<Record<TrackId, ScheduledPlayer[]>>>({});
  const buffers = useRef<Partial<Record<TrackId, Tone.ToneAudioBuffer>>>({});
  const scheduledArrangement = useRef("");
  const proposedProject = useMemo(() => proposal ? applyOperations(project, proposal.operations) : null, [project, proposal]);
  const audibleProject = auditioningProposal && proposedProject ? proposedProject : project;

  useEffect(() => {
    projectRef.current = project;
    Tone.getTransport().bpm.rampTo(project.bpm, 0.08);
  }, [project]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const transport = Tone.getTransport();
      if (transport.state === "started") {
        const totalBars = projectRef.current.totalBars;
        const duration = audioDurationRef.current;
        const nextPosition = (transport.seconds / duration * totalBars) % totalBars;
        positionRef.current = nextPosition;
        setPosition(nextPosition);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const activeSection = sectionAt(audibleProject, Math.floor(position));
    const scroll = timelineScroll.current;
    if (!activeSection || !scroll || followedSection.current === activeSection.id) return;
    followedSection.current = activeSection.id;
    const sectionCenter = (activeSection.startBar + activeSection.lengthBars / 2) * BAR_PX;
    const viewportCenter = Math.max(0, (scroll.clientWidth - 180) / 2);
    scroll.scrollTo({ left: Math.max(0, sectionCenter - viewportCenter), behavior: playing ? "smooth" : "auto" });
  }, [audibleProject, playing, position]);

  useEffect(() => () => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    Object.values(players.current).flat().forEach((player) => player.unsync().dispose());
    Object.values(buffers.current).forEach((buffer) => buffer.dispose());
    Object.values(importedObjectUrls.current).flatMap((urls) => urls ?? []).forEach((url) => URL.revokeObjectURL(url));
    players.current = {};
    buffers.current = {};
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    realtimeConversation.current?.close();
  }, []);

  function disposeArrangementPlayers() {
    Object.values(players.current).flat().forEach((player) => player.unsync().dispose());
    players.current = {};
  }

  function applyMixerState(nextProject: Project) {
    setMixerStatus(syncProjectMixer(nextProject, players.current, Tone.gainToDb));
  }

  function resetAudioRuntime() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    disposeArrangementPlayers();
    Object.values(buffers.current).forEach((buffer) => buffer.dispose());
    buffers.current = {};
    scheduled.current = false;
    scheduledArrangement.current = "";
    audioSetup.current = null;
    setMixerStatus(EMPTY_MIXER_STATUS);
    Tone.setContext(new Tone.Context({ latencyHint: "playback" }), true);
  }

  function seekToBar(bar: number) {
    const totalBars = projectRef.current.totalBars;
    const nextPosition = Math.max(0, Math.min(totalBars - 0.001, bar));
    Tone.getTransport().seconds = nextPosition / totalBars * audioDurationRef.current;
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }

  function scrubToBar(bar: number) {
    const totalBars = projectRef.current.totalBars;
    const nextPosition = Math.max(0, Math.min(totalBars - 0.001, bar));
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    if (scheduled.current) Tone.getTransport().seconds = nextPosition / totalBars * audioDurationRef.current;
  }

  function scrubFromPointer(event: ReactPointerEvent<HTMLInputElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    scrubToBar(ratio * (projectRef.current.totalBars - 0.001));
  }

  function auditionStartBar(nextProposal: EditTransaction) {
    const fallback = project.sections.find((section) => section.id === selectedSection)?.startBar ?? position;
    return findAuditionStartBar(nextProposal.operations, fallback);
  }

  function scheduleAudioArrangement(nextProject: Project, force = false) {
    const signature = arrangementSignature(nextProject);
    if (!force && signature === scheduledArrangement.current) return;
    if (nextProject.tracks.some((track) => !buffers.current[track.id])) return;

    disposeArrangementPlayers();

    const segments = createArrangementSegments(nextProject, audioDurationRef.current);
    nextProject.tracks.forEach((track) => {
      const buffer = buffers.current[track.id]!;
      players.current[track.id] = segments.map((segment) => {
        const player = new Tone.Player({ url: buffer, fadeIn: 0.015, fadeOut: 0.015 }).toDestination() as ScheduledPlayer;
        const section = nextProject.sections.find((item) => item.id === segment.sectionId);
        player.sectionId = segment.sectionId;
        player.mixGain = sectionEnergyGain(section?.energy ?? 1);
        player.volume.value = Tone.gainToDb(Math.max(0.001, track.level * player.mixGain));
        player.mute = !track.enabled;
        player.sync().start(segment.destinationStartSeconds, segment.sourceStartSeconds, segment.durationSeconds);
        return player;
      });
    });

    scheduledArrangement.current = signature;
  }

  function setPlaybackState(nextPlaying: boolean) {
    playingRef.current = nextPlaying;
    setPlaying(nextPlaying);
  }

  function setVoiceDucking(active: boolean) {
    const destination = Tone.getDestination();
    if (active) {
      if (voiceDuckingLevel.current === null) voiceDuckingLevel.current = destination.volume.value;
      destination.volume.rampTo(voiceDuckingLevel.current - 12, 0.08);
    } else if (voiceDuckingLevel.current !== null) {
      destination.volume.rampTo(voiceDuckingLevel.current, 0.12);
      voiceDuckingLevel.current = null;
    }
  }

  const setupAudio = async () => {
    if (scheduled.current) return;
    if (!audioSetup.current) {
      resetAudioRuntime();
      const contextStarted = Tone.start();
      audioSetup.current = (async () => {
        await contextStarted;
        const audioProject = projectRef.current;
        const loadedBuffers = await Promise.all(audioProject.tracks.map(async (track) => [track.id, await Tone.ToneAudioBuffer.fromUrl(track.audioUrl)] as const));
        loadedBuffers.forEach(([trackId, buffer]) => { buffers.current[trackId] = buffer; });
        const transport = Tone.getTransport();
        transport.loop = true;
        transport.loopEnd = audioDurationRef.current;
        scheduleAudioArrangement(audioProject, true);
        applyMixerState(audioProject);
        transport.seconds = positionRef.current / audioProject.totalBars * audioDurationRef.current;
        scheduled.current = true;
      })();
    }
    try {
      await audioSetup.current;
    } catch (error) {
      audioSetup.current = null;
      throw error;
    }
  };

  const activateAudioProject = async (
    nextProject: Project,
    options: { autoplay?: boolean; seekBar?: number } = {},
  ) => {
    const mixerOnly = isMixerOnlyTransition(scheduled.current, scheduledArrangement.current, nextProject, options.seekBar);
    if (mixerOnly) {
      applyMixerState(nextProject);
      return true;
    }

    const transitionId = ++audioTransition.current;
    const shouldPlay = options.autoplay ?? playingRef.current;
    setAudioSwitching(true);
    try {
      await setupAudio();
      if (transitionId !== audioTransition.current) return false;
      await Tone.start();
      if (transitionId !== audioTransition.current) return false;

      const transport = Tone.getTransport();
      if (transport.state === "started") transport.pause();
      scheduleAudioArrangement(nextProject);
      applyMixerState(nextProject);
      if (options.seekBar !== undefined) seekToBar(options.seekBar);

      if (shouldPlay) transport.start("+0.03");
      setPlaybackState(shouldPlay);
      return true;
    } catch (error) {
      console.error("Audio transition failed", error);
      setPlaybackState(false);
      setActivity((items) => [{ title: "Audio unavailable", detail: "Could not load the stem playback session", time: "NOW" }, ...items].slice(0, 5));
      return false;
    } finally {
      if (transitionId === audioTransition.current) setAudioSwitching(false);
    }
  };

  const togglePlay = async () => {
    if (audioSwitching) return;
    const transitionId = ++audioTransition.current;
    setAudioSwitching(true);
    try {
      await setupAudio();
      if (transitionId !== audioTransition.current) return;
      await Tone.start();
      const transport = Tone.getTransport();
      if (transport.state === "started") {
        transport.pause();
        setPlaybackState(false);
      } else {
        transport.start();
        setPlaybackState(true);
      }
    } catch (error) {
      console.error("Playback toggle failed", error);
      setPlaybackState(false);
      setActivity((items) => [{ title: "Playback unavailable", detail: "Could not start the stem playback session", time: "NOW" }, ...items].slice(0, 5));
    } finally {
      if (transitionId === audioTransition.current) setAudioSwitching(false);
    }
  };

  const commit = (next: Project, title: string, detail: string) => {
    history.current = recordHistory(history.current, projectRef.current, cloneProject);
    if (next.version === projectRef.current.version) next.version += 1;
    projectRef.current = next;
    if (scheduled.current) void activateAudioProject(next);
    setCanUndo(true);
    setCanRedo(false);
    setProject(next);
    setProposal(null);
    setAuditioningProposal(false);
    setActivity((items) => [{ title, detail, time: "NOW" }, ...items].slice(0, 5));
  };

  const undo = () => {
    const result = undoHistory(history.current, projectRef.current, cloneProject);
    if (!result) return;
    history.current = result.history;
    projectRef.current = result.value;
    if (scheduled.current) void activateAudioProject(result.value);
    setCanUndo(history.current.past.length > 0);
    setCanRedo(history.current.future.length > 0);
    setProject(result.value);
    setProposal(null);
    setAuditioningProposal(false);
    setActivity((items) => [{ title: "Undo", detail: "Restored the previous arrangement", time: "NOW" }, ...items].slice(0, 5));
  };

  const redo = () => {
    const result = redoHistory(history.current, projectRef.current, cloneProject);
    if (!result) return;
    history.current = result.history;
    projectRef.current = result.value;
    if (scheduled.current) void activateAudioProject(result.value);
    setCanUndo(history.current.past.length > 0);
    setCanRedo(history.current.future.length > 0);
    setProject(result.value);
    setProposal(null);
    setAuditioningProposal(false);
    setActivity((items) => [{ title: "Redo", detail: "Reapplied the next arrangement", time: "NOW" }, ...items].slice(0, 5));
  };

  const toggleTrack = (trackId: TrackId) => {
    const next = cloneProject(project);
    const track = next.tracks.find((item) => item.id === trackId)!;
    track.enabled = !track.enabled;
    commit(next, track.enabled ? `Unmuted ${track.label}` : `Muted ${track.label}`, "Manual track edit");
  };

  const clearLiveQueue = () => {
    liveQueueRef.current = null;
    setLiveQueue(null);
  };

  const queueProposalForNextBar = (transaction: EditTransaction) => {
    const queue = createLiveCommandQueue(transaction, positionRef.current, projectRef.current.totalBars);
    liveQueueRef.current = queue;
    setLiveQueue(queue);
    setActivity((items) => [{ title: "Live edit queued", detail: `${transaction.summary} · executes at bar ${queue.executeAtBar + 1}`, time: "NEXT BAR" }, ...items].slice(0, 5));
  };

  const nudgeSection = (delta: number) => {
    const section = project.sections.find((item) => item.id === selectedSection)!;
    const next = applyOperations(project, [{
      id: `manual-move-${section.id}`,
      action: "move_section",
      targetId: section.id,
      targetLabel: section.label,
      beforeStartBar: section.startBar,
      afterStartBar: section.startBar + delta,
      lengthBars: section.lengthBars,
      explanation: "Manual ripple move.",
      selected: true,
    }]);
    commit(next, `Moved ${section.label}`, `${delta > 0 ? "+" : ""}${delta} bar${Math.abs(delta) === 1 ? "" : "s"}`);
  };

  const executeImmediateEditorCommand = async (editorCommand: ImmediateEditorCommand) => {
    if (editorCommand.action === "play") {
      if (!playingRef.current) await togglePlay();
      setActivity((items) => [{ title: "Voice control · Play", detail: "Transport resumed", time: "NOW" }, ...items].slice(0, 5));
    } else if (editorCommand.action === "pause") {
      if (playingRef.current) await togglePlay();
      setActivity((items) => [{ title: "Voice control · Pause", detail: "Transport paused", time: "NOW" }, ...items].slice(0, 5));
    } else if (editorCommand.action === "undo") {
      if (liveQueueRef.current) {
        clearLiveQueue();
        setProposal(null);
        setActivity((items) => [{ title: "Queued edit cancelled", detail: "The live arrangement was not changed", time: "NOW" }, ...items].slice(0, 5));
      } else if (auditioningProposal && proposal) {
        await discardProposal();
      } else {
        undo();
      }
    } else if (editorCommand.action === "redo") {
      redo();
    } else if (editorCommand.action === "apply_proposal") {
      applyProposal();
    } else if (editorCommand.action === "discard_proposal") {
      await discardProposal();
    } else if (editorCommand.action === "audition_current") {
      await setProposalAudition(false);
    } else if (editorCommand.action === "audition_proposed") {
      await setProposalAudition(true);
    } else if (editorCommand.action === "clear_loop") {
      await setupAudio();
      const transport = Tone.getTransport();
      transport.loop = true;
      transport.loopStart = 0;
      transport.loopEnd = audioDurationRef.current;
      setActivity((items) => [{ title: "Voice control · Full song", detail: "Section loop cleared", time: "NOW" }, ...items].slice(0, 5));
    } else if (editorCommand.action === "seek_section") {
      const nextAudibleProject = auditioningProposal && proposedProject ? proposedProject : project;
      const switched = await activateAudioProject(nextAudibleProject, { autoplay: true, seekBar: editorCommand.startBar });
      if (!switched) return;
      setSelectedSection(editorCommand.sectionId);
      setActivity((items) => [{ title: `Voice control · ${editorCommand.label}`, detail: `Playing from bar ${editorCommand.startBar + 1}`, time: "NOW" }, ...items].slice(0, 5));
    } else if (editorCommand.action === "loop_section") {
      await setupAudio();
      const transport = Tone.getTransport();
      transport.loop = true;
      transport.loopStart = editorCommand.startBar / projectRef.current.totalBars * audioDurationRef.current;
      transport.loopEnd = (editorCommand.startBar + editorCommand.lengthBars) / projectRef.current.totalBars * audioDurationRef.current;
      seekToBar(editorCommand.startBar);
      if (transport.state !== "started") transport.start();
      setPlaybackState(true);
      setSelectedSection(editorCommand.sectionId);
      setActivity((items) => [{ title: `Voice control · Loop ${editorCommand.label}`, detail: `Bars ${editorCommand.startBar + 1}–${editorCommand.startBar + editorCommand.lengthBars}`, time: "NOW" }, ...items].slice(0, 5));
    }
  };

  const createProposal = async (rawInput: string): Promise<EditTransaction | null> => {
    const input = rawInput.trim();
    if (!input || planning) return null;
    const previousProposal = proposal;
    const planningProject = previousProposal ? applyOperations(project, previousProposal.operations) : project;
    const context = createEditorContext(planningProject, {
      playheadBar: positionRef.current,
      playing: playingRef.current,
      auditioningProposal,
      selectedSectionId: selectedSection,
      proposal: previousProposal,
      canUndo,
      canRedo,
    });
    const commandProject = auditioningProposal ? planningProject : project;
    const immediateCommand = routeImmediateEditorCommand(input, commandProject, context);
    if (immediateCommand) {
      await executeImmediateEditorCommand(immediateCommand);
      setCommand("");
      return null;
    }
    if (auditioningProposal) {
      await activateAudioProject(project);
      setAuditioningProposal(false);
    }
    setPlanning(true);
    let nextProposal: EditTransaction | null = null;
    try {
      const response = await fetch("/api/plan-edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: input, project: planningProject, context }) });
      if (response.ok) nextProposal = ((await response.json()) as { transaction: EditTransaction }).transaction;
    } catch {
      // The local planner keeps the demo usable offline and when the API is unavailable.
    }
    nextProposal ??= createLocalTransaction(input, planningProject);
    if (nextProposal && previousProposal) nextProposal = mergeProposalRefinement(project, previousProposal, nextProposal);
    if (!nextProposal) {
      setActivity((items) => [{ title: previousProposal ? "Refinement needs clarification" : "Needs clarification", detail: `“${input}” did not produce a supported edit`, time: "NOW" }, ...items].slice(0, 5));
    } else {
      setProposal(nextProposal);
      if (playingRef.current) queueProposalForNextBar(nextProposal);
      setActivity((items) => [{ title: previousProposal ? "Music Diff refined" : "Music Diff ready", detail: `${nextProposal.operations.length} operations · ${nextProposal.planner} · project unchanged`, time: "NOW" }, ...items].slice(0, 5));
    }
    setPlanning(false);
    setCommand("");
    return nextProposal;
  };

  const runCommand = async (event: FormEvent) => {
    event.preventDefault();
    await createProposal(command);
  };

  const toggleProposalOperation = async (operationId: string) => {
    if (!proposal) return;
    const nextProposal = { ...proposal, operations: proposal.operations.map((operation) => operation.id === operationId ? { ...operation, selected: !operation.selected } : operation) };
    setProposal(nextProposal);
    if (liveQueueRef.current?.transaction.id === proposal.id) {
      const nextQueue = { ...liveQueueRef.current, transaction: nextProposal };
      liveQueueRef.current = nextQueue;
      setLiveQueue(nextQueue);
    }
    if (auditioningProposal) {
      const auditionProject = applyOperations(project, nextProposal.operations);
      await activateAudioProject(auditionProject, { seekBar: auditionStartBar(nextProposal) });
      if (!nextProposal.operations.some((operation) => operation.selected)) setAuditioningProposal(false);
    }
  };

  const discardProposal = async () => {
    if (!proposal) return;
    clearLiveQueue();
    if (auditioningProposal) {
      await activateAudioProject(project, { seekBar: auditionStartBar(proposal) });
    }
    setActivity((items) => [{ title: "Proposal discarded", detail: "No project state was changed", time: "NOW" }, ...items].slice(0, 5));
    setProposal(null);
    setAuditioningProposal(false);
  };

  const setProposalAudition = async (proposed: boolean) => {
    if (!proposal || proposed === auditioningProposal) return;

    if (!proposed) {
      const switched = await activateAudioProject(project, { autoplay: true, seekBar: auditionStartBar(proposal) });
      if (!switched) return;
      setAuditioningProposal(false);
      setActivity((items) => [{ title: "Current mix", detail: "Audition ended · project was never changed", time: "NOW" }, ...items].slice(0, 5));
    } else {
      clearLiveQueue();
      const auditionProject = applyOperations(project, proposal.operations);
      const startBar = auditionStartBar(proposal);
      const switched = await activateAudioProject(auditionProject, { autoplay: true, seekBar: startBar });
      if (!switched) return;
      setAuditioningProposal(true);
      setActivity((items) => [{ title: "Auditioning proposal", detail: `Starting at bar ${Math.floor(startBar) + 1} · project and history unchanged`, time: "NOW" }, ...items].slice(0, 5));
    }
  };

  const applyProposal = () => {
    if (!proposal || proposal.baseProjectVersion !== project.version) {
      setActivity((items) => [{ title: "Stale proposal", detail: "The project changed; create a fresh Music Diff", time: "NOW" }, ...items].slice(0, 5));
      setProposal(null);
      return;
    }
    const selectedOperations = proposal.operations.filter((operation) => operation.selected);
    if (!selectedOperations.length) return;
    clearLiveQueue();
    const next = applyOperations(project, proposal.operations, true);
    commit(next, "Music Diff committed", selectedOperations.map((operation) => `${describeOperation(operation).verb} ${operation.targetLabel}`).join(" · "));
    setProposal(null);
    setAuditioningProposal(false);
  };

  useEffect(() => {
    liveQueueExecutionHandler.current = (queue: LiveCommandQueue) => {
      if (queue.transaction.baseProjectVersion !== projectRef.current.version) {
        clearLiveQueue();
        setProposal(null);
        setActivity((items) => [{ title: "Live edit expired", detail: "The project changed before the cue", time: "NOW" }, ...items].slice(0, 5));
        return;
      }
      const auditionProject = applyOperations(projectRef.current, queue.transaction.operations);
      clearLiveQueue();
      void activateAudioProject(auditionProject, { autoplay: true }).then((switched) => {
        if (!switched) return;
        setAuditioningProposal(true);
        setActivity((items) => [{ title: "Live edit is playing", detail: `${queue.transaction.summary} · audition only, say “就这样” to commit`, time: "ON BEAT" }, ...items].slice(0, 5));
      });
    };
  });

  useEffect(() => {
    const previous = previousLivePosition.current;
    previousLivePosition.current = position;
    const queue = liveQueueRef.current;
    if (!queue || !playingRef.current) return;
    if (crossedQuantizedBar(previous, position, queue.executeAtBar, projectRef.current.totalBars)) liveQueueExecutionHandler.current(queue);
  }, [position]);

  useEffect(() => {
    realtimeToolHandler.current = async (call: RealtimeToolCall) => {
      if (call.name === "queue_music_edit") {
        const request = typeof call.arguments.request === "string" ? call.arguments.request.trim() : "";
        if (!request) return { ok: false, error: "The music edit request was empty" };
        setCommand(request);
        const transaction = await createProposal(request);
        if (!transaction) return { ok: false, error: "The editor could not create a supported edit" };
        const queue = liveQueueRef.current;
        return {
          ok: true,
          status: queue?.transaction.id === transaction.id ? "queued_for_next_bar" : "ready_to_audition",
          executeAtBar: queue?.transaction.id === transaction.id ? queue.executeAtBar + 1 : undefined,
          summary: transaction.summary,
          operationCount: transaction.operations.filter((operation) => operation.selected).length,
        };
      }
      if (call.name === "control_editor") {
        const editorCommand = realtimeEditorCommand(call.arguments.action);
        if (!editorCommand) return { ok: false, error: "Unsupported editor action" };
        await executeImmediateEditorCommand(editorCommand);
        return { ok: true, status: editorCommand.action };
      }
      return { ok: false, error: `Unknown editor tool: ${call.name}` };
    };
  });

  const transcribeVoiceCommand = async (blob: Blob) => {
    setVoiceState("transcribing");
    try {
      const contentType = blob.type.split(";")[0] || "audio/webm";
      const extension = contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") ? "m4a" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `voice-command.${extension}`);
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!response.ok) throw new Error(`Transcription failed with ${response.status}`);
      const text = ((await response.json()) as { text?: string }).text?.trim();
      if (!text) throw new Error("Transcription was empty");
      setCommand(text);
      setActivity((items) => [{ title: "Voice command fallback", detail: `“${text}”`, time: "NOW" }, ...items].slice(0, 5));
      setVoiceState("idle");
      await createProposal(text);
    } catch (error) {
      console.error("Voice command failed", error);
      setVoiceState("idle");
      setActivity((items) => [{ title: "Voice command failed", detail: "Check microphone permission and OpenAI API access", time: "NOW" }, ...items].slice(0, 5));
    }
  };

  const startFallbackVoiceCapture = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setActivity((items) => [{ title: "Microphone unavailable", detail: "This browser cannot record a voice command", time: "NOW" }, ...items].slice(0, 5));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      setVoiceDucking(true);
      microphoneStream.current = stream;
      voiceChunks.current = [];
      const supportedType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunks.current.push(event.data);
      };
      recorder.onerror = () => {
        microphoneStream.current?.getTracks().forEach((track) => track.stop());
        microphoneStream.current = null;
        mediaRecorder.current = null;
        setVoiceDucking(false);
        setVoiceState("idle");
        setActivity((items) => [{ title: "Recording failed", detail: "The microphone stream stopped unexpectedly", time: "NOW" }, ...items].slice(0, 5));
      };
      recorder.onstop = () => {
        const blob = new Blob(voiceChunks.current, { type: recorder.mimeType || "audio/webm" });
        microphoneStream.current?.getTracks().forEach((track) => track.stop());
        microphoneStream.current = null;
        mediaRecorder.current = null;
        voiceChunks.current = [];
        setVoiceDucking(false);
        if (blob.size === 0) {
          setVoiceState("idle");
          setActivity((items) => [{ title: "No voice detected", detail: "Try recording the command again", time: "NOW" }, ...items].slice(0, 5));
          return;
        }
        void transcribeVoiceCommand(blob);
      };
      recorder.start();
      setVoiceState("recording");
      setActivity((items) => [{ title: "Fallback listening", detail: "Realtime unavailable · recording one command", time: "NOW" }, ...items].slice(0, 5));
    } catch (error) {
      console.error("Microphone access failed", error);
      microphoneStream.current?.getTracks().forEach((track) => track.stop());
      microphoneStream.current = null;
      setVoiceDucking(false);
      setVoiceState("idle");
      setActivity((items) => [{ title: "Microphone permission needed", detail: "Allow microphone access and try again", time: "NOW" }, ...items].slice(0, 5));
    }
  };

  const startRealtimeVoiceCapture = async () => {
    setVoiceState("connecting");
    let client = realtimeConversation.current;
    if (!client) {
      client = await connectRealtimeConversation({
        onInputDelta: (transcript) => setCommand(transcript),
        onInputCompleted: (transcript) => {
          setCommand(transcript);
          setActivity((items) => [{ title: "You said", detail: `“${transcript}”`, time: "NOW" }, ...items].slice(0, 5));
        },
        onAssistantDelta: (transcript) => setAssistantReply(transcript),
        onAssistantCompleted: (transcript) => {
          setAssistantReply(transcript);
          setActivity((items) => [{ title: "Voice Remix replied", detail: transcript, time: "NOW" }, ...items].slice(0, 5));
        },
        onSpeakingChange: (speaking) => {
          setVoiceDucking(speaking);
          setVoiceState(speaking ? "responding" : "idle");
        },
        onToolCall: (call) => realtimeToolHandler.current(call),
        onError: (error) => {
          console.error("Realtime voice conversation failed", error);
          realtimeConversation.current?.close();
          realtimeConversation.current = null;
          setVoiceDucking(false);
          setVoiceState("idle");
          setActivity((items) => [{ title: "Realtime voice failed", detail: "Use the microphone again or type the command", time: "NOW" }, ...items].slice(0, 5));
        },
      });
      realtimeConversation.current = client;
    }

    setCommand("");
    setAssistantReply("");
    setVoiceDucking(true);
    client.startTurn();
    setVoiceState("recording");
    setActivity((items) => [{ title: "Live Copilot listening", detail: "Speak naturally · click again when done", time: "NOW" }, ...items].slice(0, 5));
  };

  const toggleVoiceCapture = async () => {
    if (voiceState === "recording") {
      if (realtimeConversation.current) {
        setVoiceDucking(false);
        setVoiceState("transcribing");
        try {
          realtimeConversation.current.stopTurn();
        } catch (error) {
          console.error("Realtime voice stop failed", error);
          realtimeConversation.current.close();
          realtimeConversation.current = null;
          setVoiceState("idle");
        }
      } else if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.stop();
      }
      return;
    }
    if ((voiceState !== "idle" && voiceState !== "responding") || planning || audioSwitching) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      await startFallbackVoiceCapture();
      return;
    }

    try {
      await startRealtimeVoiceCapture();
    } catch (error) {
      console.warn("Realtime voice unavailable; using upload fallback", error);
      realtimeConversation.current?.close();
      realtimeConversation.current = null;
      setVoiceDucking(false);
      setVoiceState("idle");
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
        setActivity((items) => [{ title: "Microphone permission needed", detail: "Allow microphone access and try again", time: "NOW" }, ...items].slice(0, 5));
        return;
      }
      await startFallbackVoiceCapture();
    }
  };

  const releaseImportedTrack = (trackId: TrackId) => {
    importedObjectUrls.current[trackId]?.forEach((url) => URL.revokeObjectURL(url));
    delete importedObjectUrls.current[trackId];
  };

  const releaseAllImportedAudio = () => {
    (Object.keys(importedObjectUrls.current) as TrackId[]).forEach(releaseImportedTrack);
  };

  const decodeLocalAudio = async (file: File): Promise<LocalAudioAsset> => {
    const supportedExtension = /\.(aac|flac|m4a|mp3|ogg|wav|webm)$/i.test(file.name);
    if ((!file.type.startsWith("audio/") && !supportedExtension) || file.size === 0) throw new Error("Choose a valid MP3, WAV, M4A, AAC, OGG, FLAC, or WebM audio file.");
    if (file.size > 250 * 1024 * 1024) throw new Error("Audio files must be smaller than 250 MB.");

    const decodingContext = new AudioContext();
    try {
      const decoded = await decodingContext.decodeAudioData(await file.arrayBuffer());
      if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error("The audio file has no playable duration.");
      const analysis = analyzeDecodedAudio(decoded);
      const audioUrl = URL.createObjectURL(file);
      const peaksUrl = URL.createObjectURL(new Blob([JSON.stringify(analysis.envelope)], { type: "application/json" }));
      return { audioUrl, peaksUrl, duration: analysis.duration, filename: file.name, meanDb: analysis.meanDb, maxDb: analysis.maxDb, nearSilent: analysis.nearSilent };
    } finally {
      await decodingContext.close();
    }
  };

  const prepareImportedProject = (nextProject: Project, nextDuration: number, nextTitle: string, detail: string) => {
    resetAudioRuntime();
    setPlaybackState(false);
    projectRef.current = nextProject;
    audioDurationRef.current = nextDuration;
    positionRef.current = 0;
    previousLivePosition.current = 0;
    followedSection.current = "";
    history.current = createProjectHistory<Project>();
    clearLiveQueue();
    setCanUndo(false);
    setCanRedo(false);
    setProposal(null);
    setAuditioningProposal(false);
    setProject(nextProject);
    setProjectTitle(nextTitle);
    setAudioDuration(nextDuration);
    setPosition(0);
    setSelectedSection(nextProject.sections[0].id);
    setActivity((items) => [{ title: "Local audio imported", detail, time: "NOW" }, ...items].slice(0, 5));
    setImportOpen(false);
  };

  const importFullSong = async (file?: File) => {
    if (!file || importingAudio) return;
    setImportingAudio(true);
    setImportError("");
    let asset: LocalAudioAsset | null = null;
    try {
      asset = await decodeLocalAudio(file);
      const nextProject = createFullMixProject(projectRef.current, asset);
      releaseAllImportedAudio();
      importedObjectUrls.current.mix = [asset.audioUrl, asset.peaksUrl];
      prepareImportedProject(nextProject, asset.duration, filenameTitle(file.name), `${formatOverviewTime(asset.duration)} · ${nextProject.totalBars} estimated bars · master mix`);
    } catch (error) {
      if (asset) [asset.audioUrl, asset.peaksUrl].forEach((url) => URL.revokeObjectURL(url));
      setImportError(error instanceof Error ? error.message : "The song could not be imported.");
    } finally {
      setImportingAudio(false);
    }
  };

  const importStem = async (file?: File) => {
    if (!file || importingAudio) return;
    setImportingAudio(true);
    setImportError("");
    let asset: LocalAudioAsset | null = null;
    try {
      const target = projectRef.current.tracks.find((track) => track.id === importTarget);
      if (!target || target.id === "mix") throw new Error("Open the original stem project before replacing an individual track.");
      asset = await decodeLocalAudio(file);
      const durationDifference = Math.abs(asset.duration - audioDurationRef.current);
      if (durationDifference > Math.max(0.75, audioDurationRef.current * 0.01)) {
        throw new Error(`This stem is ${formatOverviewTime(asset.duration)}; the project is ${formatOverviewTime(audioDurationRef.current)}. Import synchronized stems with matching duration.`);
      }
      const nextProject = replaceProjectStem(projectRef.current, importTarget, asset);
      releaseImportedTrack(importTarget);
      importedObjectUrls.current[importTarget] = [asset.audioUrl, asset.peaksUrl];
      prepareImportedProject(nextProject, audioDurationRef.current, projectTitle, `${target.label} replaced with ${file.name}`);
    } catch (error) {
      if (asset) [asset.audioUrl, asset.peaksUrl].forEach((url) => URL.revokeObjectURL(url));
      setImportError(error instanceof Error ? error.message : "The stem could not be imported.");
    } finally {
      setImportingAudio(false);
    }
  };

  const exportProject = () => {
    const data = createProjectExport(project);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = projectExportFilename(projectTitle);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setActivity((items) => [{ title: "Project exported", detail: `${project.sections.length} sections · ${project.tracks.length} stems · version ${project.version}`, time: "NOW" }, ...items].slice(0, 5));
  };

  const selected = project.sections.find((section) => section.id === selectedSection)!;
  const active = sectionAt(project, Math.floor(position));
  const barLabels = useMemo(() => Array.from({ length: project.totalBars }, (_, index) => index + 1), [project.totalBars]);
  const selectedProposalOperations = proposal?.operations.filter((operation) => operation.selected) ?? [];
  const liveBarsRemaining = liveQueue ? forwardBarDistance(position, liveQueue.executeAtBar, project.totalBars) : 0;
  const liveBeatsRemaining = Math.max(0, liveBarsRemaining * 4);
  const proposedSectionChanges = proposedProject ? proposedProject.sections.filter((section) => {
    const current = project.sections.find((item) => item.id === section.id);
    return current && (current.startBar !== section.startBar || current.lengthBars !== section.lengthBars);
  }) : [];
  const affectedSectionIds = new Set(proposedSectionChanges.map((section) => section.id));
  const renderedSections = auditioningProposal ? audibleProject.sections : project.sections;
  const voiceButtonLabel = voiceState === "recording" ? "Send voice turn" : voiceState === "responding" ? "Interrupt Voice Remix" : voiceState === "connecting" ? "Connecting realtime voice" : voiceState === "transcribing" ? "Voice Remix is thinking" : "Talk to Voice Remix";
  const availableStemTargets = project.tracks.filter((track) => REPLACEABLE_STEM_IDS.some((trackId) => trackId === track.id));

  return (
    <main className="app-shell" data-audio-ready={mixerStatus.ready} data-audio-player-count={mixerStatus.playerCount} data-audio-muted-player-count={mixerStatus.mutedPlayerCount} data-audio-switching={audioSwitching} data-audition-version={auditioningProposal ? "proposed" : "current"} data-voice-state={voiceState} data-playback-position={position.toFixed(2)}>
      {importOpen && (
        <div className="import-backdrop" role="presentation">
          <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <div className="import-heading">
              <div><span className="overline">LOCAL AUDIO</span><h2 id="import-title">Import into the arrangement</h2><p>Audio is decoded in this browser and never uploaded.</p></div>
              <button type="button" onClick={() => setImportOpen(false)} aria-label="Close audio import">×</button>
            </div>
            <div className="import-options">
              <label className={`import-option ${importingAudio ? "disabled" : ""}`}>
                <input type="file" accept="audio/*,.aac,.flac,.m4a,.mp3,.ogg,.wav,.webm" disabled={importingAudio} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importFullSong(file); }} />
                <span className="import-icon">♪</span>
                <span><strong>Import a full song</strong><small>Creates one MASTER MIX lane with estimated sections and a real waveform.</small></span>
                <i>{importingAudio ? "DECODING…" : "CHOOSE FILE"}</i>
              </label>
              <div className={`import-option stem-option ${!availableStemTargets.length || importingAudio ? "disabled" : ""}`}>
                <span className="import-icon">≋</span>
                <span><strong>Replace an individual stem</strong><small>Use a synchronized file with the same duration as this project.</small></span>
                <select value={importTarget} disabled={!availableStemTargets.length || importingAudio} onChange={(event) => setImportTarget(event.target.value as TrackId)} aria-label="Stem to replace">
                  {availableStemTargets.map((track) => <option value={track.id} key={track.id}>{track.label}</option>)}
                </select>
                <label className="stem-file-button">
                  <input type="file" accept="audio/*,.aac,.flac,.m4a,.mp3,.ogg,.wav,.webm" disabled={!availableStemTargets.length || importingAudio} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importStem(file); }} />
                  {importingAudio ? "DECODING…" : "CHOOSE STEM"}
                </label>
              </div>
            </div>
            {importError && <p className="import-error" role="alert">{importError}</p>}
            <div className="import-note"><span>Supported</span> MP3, WAV, M4A, AAC, OGG, FLAC, WebM · maximum 250 MB</div>
          </section>
        </div>
      )}
      <nav className="sidebar" aria-label="Main navigation">
        <div className="logo"><i>V</i><span>Voice Remix</span></div>
        <div className="nav-group">
          <button className="nav-item active"><span>✦</span> Create</button>
          <button className="nav-item"><span>◫</span> Projects</button>
          <button className="nav-item"><span>♫</span> Library</button>
        </div>
        <div className="nav-group secondary">
          <small>WORKSPACE</small>
          <button className="project-link"><i className="project-art" />{projectTitle}</button>
          <button className="project-link faded" onClick={() => { setImportError(""); setImportOpen(true); }}><i className="add-project">＋</i>Import audio</button>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item"><span>?</span> Help & feedback</button>
          <div className="profile"><i>M</i><div><strong>Mark</strong><small>Build Week</small></div><span>•••</span></div>
        </div>
      </nav>

      <section className="app-main">
        <header className="page-header">
          <div><span className="breadcrumb">Projects /</span><strong> {projectTitle}</strong><i className="saved-dot" /> <small>Imported</small></div>
          <div className="page-actions">
            <button onClick={undo} disabled={!canUndo}>↶ Undo</button>
            <button onClick={redo} disabled={!canRedo}>↷ Redo</button>
            <button className="soft-button" onClick={() => { setImportError(""); setImportOpen(true); }}>Import audio</button>
            <button className="soft-button">Share</button>
            <button className="export-button" onClick={exportProject}>Export <span>↓</span></button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="create-card">
            <div className="create-glow" />
              <span className="ai-label"><i>●</i> LIVE SESSION · {playing ? "MUSIC RUNNING" : "READY"}</span>
              <h1>Talk to the arrangement.</h1>
              <p>Speak naturally while the music keeps playing. Edits land cleanly on the next bar.</p>
            <form className="prompt-box" onSubmit={runCommand}>
              <button type="button" className={`voice-button ${voiceState}`} onClick={toggleVoiceCapture} aria-label={voiceButtonLabel} title={voiceButtonLabel} disabled={voiceState === "connecting" || voiceState === "transcribing" || planning || audioSwitching}>{voiceState === "recording" ? "↑" : voiceState === "responding" ? "◼" : voiceState !== "idle" ? "✦" : "🎙"}</button>
              <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Type or speak an edit, e.g. “only keep bass and drums”" aria-label="Arrangement command" disabled={planning || voiceState !== "idle"} />
              <button className={`apply-button ${planning ? "is-planning" : ""}`} type="submit" disabled={planning || voiceState !== "idle"}><span>{planning ? "Listening…" : playing ? "Queue live edit" : "Preview edit"}</span> {planning ? "✦" : "↑"}</button>
            </form>
            {assistantReply && (
              <div className={`live-assistant-reply ${voiceState === "responding" ? "speaking" : ""}`} aria-live="polite">
                <span><i /> VOICE REMIX</span>
                <p>{assistantReply}</p>
                {voiceState === "responding" && <div className="assistant-levels" aria-hidden="true"><i /><i /><i /><i /></div>}
              </div>
            )}
            <div className="prompt-footer">
              <div className="suggestions">
                {["Move the final chorus 4 bars earlier", "Make the drums hit harder", "Mute the synth in both hooks", "Keep only bass and drums"].map((suggestion) => <button key={suggestion} onClick={() => setCommand(suggestion)}>{suggestion}</button>)}
              </div>
              <small>{voiceState === "connecting" ? "Connecting OpenAI Realtime…" : voiceState === "recording" ? "Listening live · press ↑ when done" : voiceState === "transcribing" ? "Voice Remix is deciding which editor tool to use…" : voiceState === "responding" ? "Voice Remix is speaking · tap ◼ to interrupt" : planning ? "Planning a reversible Music Diff…" : "Realtime conversation · editor tools · next-bar execution"}</small>
            </div>
          </section>

          {liveQueue && (
            <section className="live-queue" aria-label="Queued live edit" data-execute-bar={liveQueue.executeAtBar}>
              <div className="live-countdown"><span>NEXT BAR</span><strong>{liveBeatsRemaining.toFixed(1)}</strong><small>BEATS</small></div>
              <div className="live-queue-copy"><span className="overline">GHOST EDIT · AUDITION ON CUE</span><h2>{liveQueue.transaction.summary}</h2><p>The current mix keeps playing. This change will be heard at bar {liveQueue.executeAtBar + 1} and remains reversible.</p></div>
              <div className="live-queue-ops">{liveQueue.transaction.operations.filter((operation) => operation.selected).slice(0, 3).map((operation) => { const description = describeOperation(operation); return <span key={operation.id}>{description.verb} {description.target}</span>; })}</div>
              <button type="button" onClick={() => { clearLiveQueue(); setProposal(null); }} aria-label="Cancel queued live edit">×</button>
            </section>
          )}

          {proposal && (
            <section className="music-diff" aria-label="Proposed music edit">
              <div className="diff-heading">
                <div><span className="overline">MUSIC DIFF · {proposal.planner.toUpperCase()} · {auditioningProposal ? "PROPOSED IS PLAYING" : "CURRENT IS PLAYING"}</span><h2>{proposal.summary}</h2><p>{auditioningProposal ? "Temporary audition is active. Teal track labels show what you are hearing; project and history remain unchanged." : "Review every operation, then switch to Proposed to hear the selected changes."}</p></div>
                <div className="diff-count"><strong>{selectedProposalOperations.length}</strong><span>of {proposal.operations.length} selected</span></div>
              </div>
              {proposal.protectedTargets.length > 0 && <div className="protected-row"><span>◇ PROTECTED</span>{proposal.protectedTargets.map((target) => <strong key={target}>{target}</strong>)}<small>will remain unchanged</small></div>}
              <div className="diff-operations">
                {proposal.operations.map((operation) => {
                  const description = describeOperation(operation);
                  return (
                    <label className={`diff-operation ${operation.selected ? "selected" : ""}`} key={operation.id}>
                      <input type="checkbox" checked={operation.selected} onChange={() => toggleProposalOperation(operation.id)} />
                      <span className="diff-check">{operation.selected ? "✓" : ""}</span>
                      <span className="diff-verb">{description.verb}</span>
                      <span className="diff-target"><strong>{description.target}</strong><small>{operation.explanation}</small></span>
                      <span className="diff-values"><del>{description.before}</del><i>→</i><strong>{description.after}</strong></span>
                    </label>
                  );
                })}
              </div>
              <div className="diff-footer">
                <div>{proposal.assumptions.map((assumption) => <span key={assumption}>Assumption · {assumption}</span>)}</div>
                <div><button type="button" onClick={discardProposal} disabled={audioSwitching}>Discard</button><div className="audition-switch" role="group" aria-label="Audition version"><button className={!auditioningProposal ? "active" : ""} type="button" aria-pressed={!auditioningProposal} onClick={() => setProposalAudition(false)} disabled={audioSwitching}>Current</button><button className={auditioningProposal ? "active" : ""} type="button" aria-pressed={auditioningProposal} onClick={() => setProposalAudition(true)} disabled={audioSwitching || !selectedProposalOperations.length}>{audioSwitching ? "Switching…" : "Proposed"}</button></div><button className="apply-selected" type="button" onClick={applyProposal} disabled={audioSwitching || !selectedProposalOperations.length}>Apply selected</button></div>
              </div>
            </section>
          )}

          <section className="song-card">
            <CoverArt />
            <div className="song-info">
              <span className={`overline ${auditioningProposal ? "audition-label" : ""}`}>{auditioningProposal ? "AUDITIONING PROPOSED · NOT APPLIED" : "CURRENT ARRANGEMENT"}</span>
              <h2>{projectTitle}</h2>
              <p>{project.tracks.length === 1 && project.tracks[0].id === "mix" ? "Local audio · Estimated arrangement" : "Alt-electronic · Neon pop · Instrumental"}</p>
              <div className="song-tags"><span>{project.bpm} BPM</span><span>{formatOverviewTime(audioDuration)}</span><span>{project.totalBars} bars</span><span>{project.tracks.length === 1 ? "1 master track" : `${project.tracks.length} stems`}</span></div>
            </div>
            <MasterWaveform project={audibleProject} position={position} audioDuration={audioDuration} auditioning={auditioningProposal} cueBar={liveQueue?.executeAtBar} onScrub={scrubToBar} />
            <button className={`hero-play ${playing ? "playing" : ""}`} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} disabled={audioSwitching}>{playing ? "Ⅱ" : "▶"}</button>
          </section>

          <div className="editor-layout">
            <section className="arrangement-card">
              <div className="card-heading">
                <div><span className="overline">VISUAL EDITOR</span><h2>Arrangement</h2></div>
                <div className="editor-tools"><span className="current-section"><i />{active?.label ?? "Ready"}</span><button>−</button><small>100%</small><button>＋</button></div>
              </div>
              <div className="playlist-scroll" ref={timelineScroll} data-active-section={active?.id ?? ""}>
                <div className="track-label-spacer"><span>STEMS</span></div>
                <div className="bar-ruler" style={{ width: project.totalBars * BAR_PX }}>
                  {barLabels.map((bar) => <span key={bar} style={{ width: BAR_PX }}>{bar}</span>)}
                </div>
                {project.tracks.map((track) => {
                  const audibleTrack = audibleProject.tracks.find((item) => item.id === track.id) ?? track;
                  const scopedAuditionChanged = auditioningProposal && renderedSections.some((section) => {
                    const currentState = sectionTrackState(project, section.id, track.id);
                    const proposedState = sectionTrackState(audibleProject, section.id, track.id);
                    return currentState.enabled !== proposedState.enabled || currentState.level !== proposedState.level;
                  });
                  const auditionChanged = auditioningProposal && (audibleTrack.enabled !== track.enabled || audibleTrack.level !== track.level || scopedAuditionChanged);
                  return (
                  <div className={`track-row ${audibleTrack.enabled ? "" : "is-muted"} ${auditionChanged ? "is-audition-changed" : ""}`} data-audition-state={auditioningProposal ? (audibleTrack.enabled ? "on" : "muted") : "current"} key={track.id}>
                    <div className="track-header">
                      <span className="track-color" style={{ background: track.color }} />
                      <div title={track.nearSilent ? `Near silent · peak ${track.maxDb} dB` : `${track.role} · ${track.meanDb} dB`}><strong>{track.label}</strong><small className={auditionChanged ? "audition-note" : track.nearSilent ? "near-silent" : ""}>{auditionChanged ? (audibleTrack.enabled ? `Proposed · ${Math.round(audibleTrack.level * 100)}% gain` : "Proposed · muted") : track.nearSilent ? `Near silent · peak ${track.maxDb} dB` : `${track.role} · ${track.meanDb} dB`}</small></div>
                      <button className="mute-button" onClick={() => toggleTrack(track.id)} aria-label={`${track.enabled ? "Mute" : "Unmute"} ${track.label}`} disabled={auditioningProposal}>{audibleTrack.enabled ? "M" : "○"}</button>
                    </div>
                    <div className="track-lane" style={{ width: project.totalBars * BAR_PX }}>
                      {barLabels.map((bar) => <i className={bar % 4 === 1 ? "major-grid" : ""} key={bar} style={{ left: (bar - 1) * BAR_PX }} />)}
                      <TrackWaveform url={track.peaksUrl} color={track.color} width={project.totalBars * BAR_PX} project={audibleProject} nearSilent={track.nearSilent} />
                      {renderedSections.map((section) => {
                        const state = sectionTrackState(audibleProject, section.id, track.id);
                        const automation = audibleProject.automation?.find((item) => item.sectionId === section.id && item.trackId === track.id);
                        const currentState = sectionTrackState(project, section.id, track.id);
                        const proposedAutomation = auditioningProposal && (currentState.enabled !== state.enabled || currentState.level !== state.level);
                        const automationLabel = !state.enabled ? "MUTED" : !audibleTrack.enabled && state.enabled ? "ON" : state.level !== audibleTrack.level ? `${Math.round(state.level * 100)}%` : "AUTO";
                        return (
                          <button key={`${track.id}-${section.id}`} className={`clip ${selectedSection === section.id ? "selected" : ""} ${affectedSectionIds.has(section.id) ? "is-affected" : ""} ${automation ? "has-automation" : ""} ${!state.enabled ? "automation-muted" : ""} ${proposedAutomation ? "automation-proposed" : ""}`} style={{ left: section.startBar * BAR_PX + 3, width: section.lengthBars * BAR_PX - 6, "--clip": track.color } as React.CSSProperties} onClick={() => setSelectedSection(section.id)} title={`${section.label} · ${track.label}${automation ? ` · ${automationLabel}` : ""}`}>
                            <span>{section.label}</span>
                            {automation && <span className="automation-badge">{automationLabel}</span>}
                          </button>
                        );
                      })}
                      {!auditioningProposal && proposedSectionChanges.map((section) => <div className="ghost-clip" key={`${track.id}-${section.id}-ghost`} style={{ left: section.startBar * BAR_PX + 3, width: Math.max(BAR_PX / 2, section.lengthBars * BAR_PX - 6) }}><span>PROPOSED · {section.label}</span></div>)}
                      {liveQueue && <div className="live-cue-line" style={{ left: liveQueue.executeAtBar * BAR_PX }}>{track.id === project.tracks[0].id && <span>NEXT BAR</span>}</div>}
                      <div className="playhead" style={{ left: position * BAR_PX }}><span /></div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>

            <aside className="inspector-card">
              <div className="inspector-heading"><div><span className="overline">SELECTED</span><h2>{selected.label}</h2></div><button>•••</button></div>
              <div className="section-preview"><div className={`section-icon ${selected.kind}`}>♪</div><div><strong>{selected.label}</strong><span>Bars {selected.startBar + 1}–{selected.startBar + selected.lengthBars}</span></div></div>
              <div className="section-mix" aria-label={`${selected.label} stem state`}>
                <div className="section-mix-title"><span>SECTION MIX</span><small>{auditioningProposal ? "PROPOSED" : "CURRENT"}</small></div>
                {project.tracks.map((track) => {
                  const state = sectionTrackState(audibleProject, selected.id, track.id);
                  const automated = audibleProject.automation?.some((item) => item.sectionId === selected.id && item.trackId === track.id);
                  return <div className={`${state.enabled ? "" : "muted"} ${automated ? "automated" : ""}`} key={`${selected.id}-${track.id}-state`}><i style={{ background: track.color }} /><strong>{track.label}</strong><span>{state.enabled ? `${Math.round(state.level * 100)}%` : "MUTED"}</span></div>;
                })}
              </div>
              <div className="control-block"><label>Position <strong>Bar {selected.startBar + 1}</strong></label><div className="nudge-controls"><button onClick={() => nudgeSection(-1)}>← Earlier</button><button onClick={() => nudgeSection(1)}>Later →</button></div></div>
              <div className="control-block"><label>Energy <strong>{Math.round(selected.energy * 100)}%</strong></label><input type="range" min="0.1" max="1" step="0.05" value={selected.energy} onChange={(event) => {
                const next = cloneProject(project);
                next.sections.find((section) => section.id === selected.id)!.energy = Number(event.target.value);
                setProject(next);
              }} /><div className="range-labels"><span>Calm</span><span>Intense</span></div></div>
              <div className="history-block"><div className="history-title"><span>Recent edits</span><small>{activity.length}</small></div>{activity.slice(0, 3).map((item, index) => <div className="activity-item" key={`${item.title}-${index}`}><i /><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</div>
            </aside>
          </div>
        </div>

        <footer className="player-bar">
          <div className="mini-song"><CoverArt mini /><div><strong>{projectTitle}</strong><span>{active?.label ?? "Ready"} · {project.tracks.length === 1 ? "Master mix" : "Imported stems"}</span></div><button>♡</button></div>
          <div className="player-center"><div className="player-buttons"><button onClick={undo} disabled={!canUndo || audioSwitching} aria-label="Undo" title="Undo">↶</button><button className="footer-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} disabled={audioSwitching}>{playing ? "Ⅱ" : "▶"}</button><button onClick={redo} disabled={!canRedo || audioSwitching} aria-label="Redo" title="Redo">↷</button></div><div className="progress-row"><span>{formatOverviewTime(position / project.totalBars * audioDuration)}</span><input className="progress-track" style={{ "--progress": `${position / project.totalBars * 100}%` } as React.CSSProperties} type="range" min="0" max={project.totalBars - 0.001} step="0.01" value={position} onInput={(event) => scrubToBar(Number(event.currentTarget.value))} onChange={(event) => scrubToBar(Number(event.currentTarget.value))} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); scrubFromPointer(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubFromPointer(event); }} aria-label="Playback position" aria-valuetext={`Bar ${Math.floor(position) + 1}`} /><span>{formatOverviewTime(audioDuration)}</span></div></div>
          <div className="player-right"><label htmlFor="tempo">BPM</label><input id="tempo" type="number" min="60" max="180" value={project.bpm} onChange={(event) => setProject({ ...project, bpm: Number(event.target.value) })} /><span>◖)))</span></div>
        </footer>
      </section>
    </main>
  );
}
