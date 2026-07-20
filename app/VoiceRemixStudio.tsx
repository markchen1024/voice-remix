"use client";

import { FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as Tone from "tone";
import { arrangementSignature, createArrangementSegments, findAuditionStartBar, isMixerOnlyTransition, sourceStartBar } from "./audio-arrangement";
import { EMPTY_MIXER_STATUS, sectionEnergyGain, syncProjectMixer, type MixerStatus } from "./audio-mixer";
import { routeImmediateEditorCommand, type ImmediateEditorCommand } from "./editor-command-router";
import { createEditorContext } from "./editor-context";
import { applyOperations, cloneProject, createLocalTransaction, describeOperation, sectionTrackState, type EditTransaction, type Project, type TrackId } from "./edit-transactions";
import { createProjectHistory, recordHistory, redoHistory, undoHistory } from "./project-history";
import { createProjectExport, projectExportFilename } from "./project-export";
import { audioExportFilename, renderProjectToWav } from "./audio-export";
import { mergeProposalRefinement } from "./proposal-refinement";
import { connectRealtimeConversation, type RealtimeConversationClient, type RealtimeToolCall } from "./realtime-transcription";
import { buildMasterWaveform, type PeakBank, type PeakEnvelope } from "./master-waveform";
import { createLiveCommandQueue, crossedQuantizedBar, forwardBarDistance, type LiveCommandQueue } from "./live-command-queue";
import { analyzeDecodedAudioAsync, createFullMixProject, createStemProject, filenameTitle, mapStemFilenames, replaceProjectStem, REPLACEABLE_STEM_IDS, type LocalAudioAsset, type MappedStemAsset } from "./local-audio-import";
import { DEMO_PROJECTS, INITIAL_DEMO, type DemoProject, type DemoProjectId } from "./demo-projects";
import { trackWaveformRenderWidth } from "./waveform-rendering";

const INITIAL_PROJECT = INITIAL_DEMO.project;

const BAR_PX = 58;

function realtimeEditorCommand(action: unknown): ImmediateEditorCommand | null {
  if (action === "play" || action === "pause" || action === "undo" || action === "redo") return { action };
  if (action === "apply") return { action: "apply_proposal" };
  if (action === "discard") return { action: "discard_proposal" };
  if (action === "audition_current") return { action: "audition_current" };
  if (action === "audition_proposed") return { action: "audition_proposed" };
  return null;
}
const DEMO_AUDIO_DURATION = INITIAL_DEMO.duration;
const FEATURED_DEMO_COMMAND = INITIAL_DEMO.featuredCommand;
type ScheduledPlayer = Tone.Player & { mixGain: number; sectionId: string };

function CoverArt({ coverUrl, mini = false }: { coverUrl: string; mini?: boolean }) {
  return <div className={`cover-art${mini ? " mini-cover" : ""}`} style={{ "--cover-art": `url("${coverUrl}")` } as React.CSSProperties} aria-hidden="true" />;
}

function TrackIcon({ trackId }: { trackId: TrackId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (trackId === "lead_vocals") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" /></svg>;
  if (trackId === "backing_vocals") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="8" cy="8" r="3" /><circle cx="16.5" cy="9" r="2.5" /><path d="M2.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6M13 15c3.9-.9 7.2.9 8.5 4.5" /></svg>;
  if (trackId === "drums") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v8c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 11c0 1.7 3.1 3 7 3s7-1.3 7-3M8 4.8 5.5 2.5M16 4.8l2.5-2.3" /></svg>;
  if (trackId === "percussion") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m7.2 4.1 3.4 3.4-3.2 3.2L4 7.3a2.3 2.3 0 0 1 3.2-3.2ZM9 9l8.6 8.6M14.8 15l2.9-2.9M17.6 17.6l1.7 1.7M14.2 5.2h4.6M16.5 2.9v4.6" /></svg>;
  if (trackId === "bass") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M15.8 3.2 21 2l-1.2 5.2-8.3 8.3M16.8 6.2l1 1M8.7 12.4c-2.2-.5-4.5.4-5.7 2.3-1.2 2-.9 4.5.8 6.2 1.7 1.7 4.2 2 6.2.8 1.9-1.2 2.8-3.5 2.3-5.7M7.5 16.5a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z" /></svg>;
  if (trackId === "guitar") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m16 3 5-1-1 5-8.8 8.8M17 6l1 1M9 12.5c-2.3-.6-4.7.3-6 2.3a5.6 5.6 0 0 0 .8 6.4c1.8 1.7 4.4 1.9 6.4.6 1.9-1.3 2.8-3.7 2.2-5.9M7 16.5l2 2" /></svg>;
  if (trackId === "keyboards") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M6 9h12M7 9v6M10 9v4M13 9v6M16 9v4M19 9v6" /></svg>;
  if (trackId === "synth") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M6 8h5M15 8h3M6 12c1.5-3 3 3 4.5 0s3 3 4.5 0 2 1 3 0M7 17h10" /></svg>;
  if (trackId === "fx") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m12 2 1.4 4.1L17.5 7.5l-4.1 1.4L12 13l-1.4-4.1-4.1-1.4 4.1-1.4L12 2ZM18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM6 14l1 2.9 2.9 1L7 19l-1 2.9L5 19l-2.9-1L5 16.9 6 14Z" /></svg>;
  if (trackId === "other") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m12 3 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 17l8 4 8-4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M3 13v-2M7 16V8M11 19V5M15 16V8M19 13v-2M3 5h18v14H3z" /></svg>;
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

    loadPeakEnvelope(url)
      .then((data) => {
        if (cancelled) return;
        const height = 54;
        const renderWidth = trackWaveformRenderWidth(width);
        const context = canvas.getContext("2d");
        if (!context || !data.peaks.length) return;
        canvas.width = renderWidth;
        canvas.height = height;
        context.clearRect(0, 0, renderWidth, height);
        context.strokeStyle = color;
        context.lineWidth = 1;
        context.globalAlpha = nearSilent ? 0.32 : 0.86;
        const center = height / 2;
        const visualScale = (value: number) => Math.sign(value) * Math.log1p(Math.abs(value) * 20) / Math.log(21);

        for (const section of project.sections) {
          const destinationStart = Math.round(section.startBar / project.totalBars * renderWidth);
          const destinationEnd = Math.round((section.startBar + section.lengthBars) / project.totalBars * renderWidth);
          const sourceStart = sourceStartBar(section);
          context.beginPath();
          for (let x = Math.max(0, destinationStart); x < Math.min(renderWidth, destinationEnd); x += 1) {
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
  const [activeDemoId, setActiveDemoId] = useState<DemoProjectId | null>(INITIAL_DEMO.id);
  const [projectTitle, setProjectTitle] = useState(INITIAL_DEMO.title);
  const [projectGenre, setProjectGenre] = useState(INITIAL_DEMO.genre);
  const [projectCoverUrl, setProjectCoverUrl] = useState(INITIAL_DEMO.coverUrl);
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
  const [importBpm, setImportBpm] = useState(INITIAL_PROJECT.bpm);
  const [batchStemFiles, setBatchStemFiles] = useState<File[]>([]);
  const [batchProjectTitle, setBatchProjectTitle] = useState("Imported Stem Project");
  const [energyDrafts, setEnergyDrafts] = useState<Record<string, number>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "rendering" | "ready" | "error">("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState("");
  const [judgeStep, setJudgeStep] = useState<0 | 1 | 2 | 3 | 4>(0);
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
  const resumePlaybackAfterVoice = useRef(false);
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
  const batchStemMappings = useMemo(() => mapStemFilenames(batchStemFiles.map((file) => file.name)), [batchStemFiles]);
  const promptSuggestions = DEMO_PROJECTS.find((demo) => demo.id === activeDemoId)?.suggestions ?? [
    "Mute the drums in this section",
    "Make this section more energetic",
    "Keep only the named instruments",
  ];

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

  function pausePlaybackForVoiceCapture() {
    resumePlaybackAfterVoice.current = playingRef.current;
    if (!playingRef.current) return;
    Tone.getTransport().pause();
    setPlaybackState(false);
  }

  function restorePlaybackAfterVoiceCapture() {
    const shouldResume = resumePlaybackAfterVoice.current;
    resumePlaybackAfterVoice.current = false;
    if (!shouldResume || playingRef.current) return;
    Tone.getTransport().start("+0.03");
    setPlaybackState(true);
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

  const commitSectionEnergy = (value: number) => {
    const section = projectRef.current.sections.find((item) => item.id === selectedSection);
    if (!section) return;
    const energy = Math.max(0.1, Math.min(1, value));
    setEnergyDrafts((current) => {
      const next = { ...current };
      delete next[selectedSection];
      return next;
    });
    if (section.energy === energy) return;
    const next = cloneProject(projectRef.current);
    next.sections.find((item) => item.id === selectedSection)!.energy = energy;
    commit(next, `Adjusted ${section.label} energy`, `${Math.round(section.energy * 100)}% → ${Math.round(energy * 100)}%`);
  };

  const openImport = () => {
    setImportError("");
    setImportBpm(projectRef.current.bpm);
    setImportOpen(true);
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
      if (judgeStep === 2) setJudgeStep(3);
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
    if (judgeStep === 3) setJudgeStep(4);
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
        restorePlaybackAfterVoiceCapture();
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
        restorePlaybackAfterVoiceCapture();
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
      restorePlaybackAfterVoiceCapture();
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
          restorePlaybackAfterVoiceCapture();
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
    setActivity((items) => [{ title: "Live Copilot listening", detail: "Playback paused · click again when done", time: "NOW" }, ...items].slice(0, 5));
  };

  const toggleVoiceCapture = async () => {
    if (voiceState === "recording") {
      if (realtimeConversation.current) {
        setVoiceState("transcribing");
        try {
          realtimeConversation.current.stopTurn();
          setVoiceDucking(false);
          restorePlaybackAfterVoiceCapture();
        } catch (error) {
          console.error("Realtime voice stop failed", error);
          realtimeConversation.current.close();
          realtimeConversation.current = null;
          setVoiceDucking(false);
          restorePlaybackAfterVoiceCapture();
          setVoiceState("idle");
        }
      } else if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.stop();
      }
      return;
    }
    if ((voiceState !== "idle" && voiceState !== "responding") || planning || audioSwitching) return;
    pausePlaybackForVoiceCapture();
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
        restorePlaybackAfterVoiceCapture();
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

  const decodeLocalAudio = async (file: File, bpm = importBpm): Promise<LocalAudioAsset> => {
    const supportedExtension = /\.(aac|flac|m4a|mp3|ogg|wav|webm)$/i.test(file.name);
    if ((!file.type.startsWith("audio/") && !supportedExtension) || file.size === 0) throw new Error("Choose a valid MP3, WAV, M4A, AAC, OGG, FLAC, or WebM audio file.");
    if (file.size > 250 * 1024 * 1024) throw new Error("Audio files must be smaller than 250 MB.");

    const decodingContext = new AudioContext();
    try {
      const decoded = await decodingContext.decodeAudioData(await file.arrayBuffer());
      if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error("The audio file has no playable duration.");
      const analysis = await analyzeDecodedAudioAsync(decoded, 2048, bpm);
      const audioUrl = URL.createObjectURL(file);
      const peaksUrl = URL.createObjectURL(new Blob([JSON.stringify(analysis.envelope)], { type: "application/json" }));
      return { audioUrl, peaksUrl, duration: analysis.duration, filename: file.name, meanDb: analysis.meanDb, maxDb: analysis.maxDb, nearSilent: analysis.nearSilent, structure: analysis.structure };
    } finally {
      await decodingContext.close();
    }
  };

  const prepareImportedProject = (nextProject: Project, nextDuration: number, nextTitle: string, detail: string, activityTitle = "Local audio imported") => {
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
    setActivity((items) => [{ title: activityTitle, detail, time: "NOW" }, ...items].slice(0, 5));
    setImportOpen(false);
  };

  const loadDemoProject = (demo: DemoProject) => {
    releaseAllImportedAudio();
    const nextProject = cloneProject(demo.project);
    prepareImportedProject(
      nextProject,
      demo.duration,
      demo.title,
      `${formatOverviewTime(demo.duration)} · ${nextProject.totalBars} bars · ${nextProject.tracks.length} real stems`,
      "Demo project loaded",
    );
    setActiveDemoId(demo.id);
    setProjectGenre(demo.genre);
    setProjectCoverUrl(demo.coverUrl);
    setImportBpm(nextProject.bpm);
    setCommand(demo.featuredCommand);
    setAssistantReply("");
    setExportOpen(false);
    setExportStatus("idle");
    setJudgeStep(0);
  };

  const importFullSong = async (file?: File) => {
    if (!file || importingAudio) return;
    setImportingAudio(true);
    setImportError("");
    let asset: LocalAudioAsset | null = null;
    try {
      asset = await decodeLocalAudio(file);
      const nextProject = createFullMixProject(projectRef.current, asset, importBpm);
      const usesMeyda = asset.structure?.method === "meyda-bar-features";
      const structureConfidence = Math.round((asset.structure?.confidence ?? 0) * 100);
      releaseAllImportedAudio();
      importedObjectUrls.current.mix = [asset.audioUrl, asset.peaksUrl];
      prepareImportedProject(nextProject, asset.duration, filenameTitle(file.name), `${formatOverviewTime(asset.duration)} · ${nextProject.totalBars} analyzed bars · ${nextProject.sections.length} detected sections · ${structureConfidence}% confidence · master mix`);
      setActiveDemoId(null);
      setProjectGenre(`Local audio · ${usesMeyda ? "Meyda spectral structure" : "Lightweight browser structure"}`);
      setProjectCoverUrl("/brand/voice-remix-icon.png");
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
      setActiveDemoId(null);
    } catch (error) {
      if (asset) [asset.audioUrl, asset.peaksUrl].forEach((url) => URL.revokeObjectURL(url));
      setImportError(error instanceof Error ? error.message : "The stem could not be imported.");
    } finally {
      setImportingAudio(false);
    }
  };

  const importStemSet = async () => {
    if (importingAudio) return;
    const recognized = batchStemMappings.filter((mapping) => mapping.trackId && !mapping.duplicate);
    if (recognized.length < 2 || batchStemMappings.some((mapping) => mapping.duplicate)) return;
    setImportingAudio(true);
    setImportError("");
    const decodedStems: MappedStemAsset[] = [];
    try {
      for (const mapping of recognized) {
        if (!mapping.trackId) continue;
        decodedStems.push({ trackId: mapping.trackId, asset: await decodeLocalAudio(batchStemFiles[mapping.index]) });
      }
      const nextProject = createStemProject(projectRef.current, decodedStems, importBpm);
      const duration = decodedStems[0].asset.duration;
      const structures = decodedStems.map(({ asset }) => asset.structure).filter((structure) => structure);
      const structureConfidence = structures.length ? Math.round(structures.reduce((sum, structure) => sum + structure!.confidence, 0) / structures.length * 100) : 0;
      const usesMeyda = structures.length > 0 && structures.every((structure) => structure?.method === "meyda-bar-features");
      releaseAllImportedAudio();
      decodedStems.forEach(({ trackId, asset }) => {
        importedObjectUrls.current[trackId] = [asset.audioUrl, asset.peaksUrl];
      });
      prepareImportedProject(
        nextProject,
        duration,
        batchProjectTitle.trim() || "Imported Stem Project",
        `${formatOverviewTime(duration)} · ${nextProject.totalBars} analyzed bars · ${nextProject.sections.length} detected sections · ${structureConfidence}% confidence · ${nextProject.tracks.length} synchronized stems`,
        "Stem project imported",
      );
      setActiveDemoId(null);
      setProjectGenre(`Local multitrack · ${usesMeyda ? "Meyda spectral structure" : "Lightweight browser structure"}`);
      setProjectCoverUrl("/brand/voice-remix-icon.png");
      setImportTarget(nextProject.tracks[0].id);
      setBatchStemFiles([]);
    } catch (error) {
      decodedStems.flatMap(({ asset }) => [asset.audioUrl, asset.peaksUrl]).forEach((url) => URL.revokeObjectURL(url));
      setImportError(error instanceof Error ? error.message : "The stem set could not be imported.");
    } finally {
      setImportingAudio(false);
    }
  };

  const startJudgeDemo = () => {
    loadDemoProject(INITIAL_DEMO);
    setSelectedSection("chorus-2");
    setCommand(FEATURED_DEMO_COMMAND);
    setAssistantReply("");
    setExportOpen(false);
    setExportStatus("idle");
    setJudgeStep(1);
  };

  const advanceJudgePlayback = async () => {
    if (!playingRef.current) await togglePlay();
    setJudgeStep(2);
  };

  const advanceJudgeProposal = async () => {
    const nextProposal = await createProposal(FEATURED_DEMO_COMMAND);
    if (nextProposal) setJudgeStep(3);
  };

  const commitJudgeProposal = () => {
    applyProposal();
    setJudgeStep(4);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const exportProjectSnapshot = () => {
    const data = createProjectExport(project);
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), projectExportFilename(projectTitle));
    setActivity((items) => [{ title: "Project snapshot exported", detail: `${project.sections.length} sections · ${project.tracks.length} tracks · version ${project.version}`, time: "NOW" }, ...items].slice(0, 5));
    setExportOpen(false);
  };

  const exportAudio = async () => {
    if (exportStatus === "rendering") return;
    const exportProject = cloneProject(projectRef.current);
    const exportDuration = audioDurationRef.current;
    setExportStatus("rendering");
    setExportProgress(0);
    setExportError("");
    try {
      const wav = await renderProjectToWav(exportProject, exportDuration, { onProgress: setExportProgress });
      downloadBlob(new Blob([wav], { type: "audio/wav" }), audioExportFilename(projectTitle));
      setExportStatus("ready");
      setActivity((items) => [{ title: "Audio mix exported", detail: `${formatOverviewTime(exportDuration)} WAV · ${exportProject.tracks.length} track${exportProject.tracks.length === 1 ? "" : "s"} · version ${exportProject.version}`, time: "NOW" }, ...items].slice(0, 5));
    } catch (error) {
      console.error("Audio export failed", error);
      setExportStatus("error");
      setExportError(error instanceof Error ? error.message : "The audible arrangement could not be rendered.");
    }
  };

  const selected = project.sections.find((section) => section.id === selectedSection)!;
  const selectedEnergyDraft = energyDrafts[selected.id] ?? selected.energy;
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
  const recognizedBatchStemCount = batchStemMappings.filter((mapping) => mapping.trackId && !mapping.duplicate).length;
  const duplicateBatchStemCount = batchStemMappings.filter((mapping) => mapping.duplicate).length;
  const unmatchedBatchStemCount = batchStemMappings.filter((mapping) => !mapping.trackId).length;
  const batchStemImportReady = recognizedBatchStemCount >= 2 && duplicateBatchStemCount === 0 && !importingAudio;

  return (
    <main className="app-shell" data-audio-ready={mixerStatus.ready} data-audio-player-count={mixerStatus.playerCount} data-audio-muted-player-count={mixerStatus.mutedPlayerCount} data-audio-switching={audioSwitching} data-audition-version={auditioningProposal ? "proposed" : "current"} data-voice-state={voiceState} data-playback-position={position.toFixed(2)}>
      {importOpen && (
        <div className="import-backdrop" role="presentation">
          <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <div className="import-heading">
              <div><span className="overline">LOCAL AUDIO</span><h2 id="import-title">Import into the arrangement</h2><p>Audio is decoded in this browser and never uploaded.</p></div>
              <button type="button" onClick={() => setImportOpen(false)} disabled={importingAudio} aria-label="Close audio import">×</button>
            </div>
            <label className="import-bpm">
              <span><strong>Song tempo</strong><small>Used to align the ruler and analyze per-bar harmony, timbre, and transitions in the browser.</small></span>
              <span><input type="number" min="40" max="240" value={importBpm} disabled={importingAudio} onChange={(event) => setImportBpm(Math.max(40, Math.min(240, Number(event.target.value) || project.bpm)))} aria-label="Imported song tempo" /> BPM</span>
            </label>
            <div className="import-options">
              <label className={`import-option ${importingAudio ? "disabled" : ""}`}>
                <input type="file" accept="audio/*,.aac,.flac,.m4a,.mp3,.ogg,.wav,.webm" disabled={importingAudio} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importFullSong(file); }} />
                <span className="import-icon">♪</span>
                <span><strong>Import a full song</strong><small>Detects structural changes from real per-bar audio features and creates one MASTER MIX lane.</small></span>
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
              <div className={`import-option batch-stem-option ${importingAudio ? "disabled" : ""}`}>
                <div className="batch-stem-header">
                  <span className="import-icon">≋</span>
                  <span><strong>Build a project from synchronized stems</strong><small>Select the whole export folder. Track names are mapped before any audio is decoded.</small></span>
                </div>
                <div className="batch-stem-controls">
                  <label>
                    <span>PROJECT NAME</span>
                    <input type="text" value={batchProjectTitle} maxLength={80} disabled={importingAudio} onChange={(event) => setBatchProjectTitle(event.target.value)} aria-label="Imported stem project name" />
                  </label>
                  <label className="stem-file-button batch-file-button">
                    <input type="file" multiple accept="audio/*,.aac,.flac,.m4a,.mp3,.ogg,.wav,.webm" disabled={importingAudio} onChange={(event) => { setImportError(""); setBatchStemFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
                    {batchStemFiles.length ? "CHOOSE AGAIN" : "CHOOSE STEMS"}
                  </label>
                </div>
                {batchStemMappings.length > 0 && (
                  <div className="stem-mapping-summary" aria-live="polite">
                    <div className="stem-mapping-counts">
                      <strong>{recognizedBatchStemCount} mapped</strong>
                      {unmatchedBatchStemCount > 0 && <span>{unmatchedBatchStemCount} skipped</span>}
                      {duplicateBatchStemCount > 0 && <b>{duplicateBatchStemCount} duplicates</b>}
                    </div>
                    <ul>
                      {batchStemMappings.map((mapping) => (
                        <li className={mapping.duplicate ? "mapping-error" : mapping.trackId ? "mapping-ready" : "mapping-skipped"} key={`${mapping.index}-${mapping.filename}`}>
                          <span title={mapping.filename}>{mapping.filename}</span>
                          <b>{mapping.duplicate ? "DUPLICATE" : mapping.trackId?.replaceAll("_", " ").toUpperCase() ?? "SKIP"}</b>
                        </li>
                      ))}
                    </ul>
                    <p>{duplicateBatchStemCount ? "Keep one file for each track." : recognizedBatchStemCount < 2 ? "Choose at least two recognized stems." : "Durations will be verified before the project is created."}</p>
                  </div>
                )}
                <button className="batch-import-button" type="button" disabled={!batchStemImportReady} onClick={() => void importStemSet()}>
                  {importingAudio ? "DECODING STEMS…" : `IMPORT ${recognizedBatchStemCount || ""} STEMS`}
                </button>
              </div>
            </div>
            {importError && <p className="import-error" role="alert">{importError}</p>}
            <div className="import-note"><span>Supported</span> MP3, WAV, M4A, AAC, OGG, FLAC, WebM · maximum 250 MB per file</div>
          </section>
        </div>
      )}
      <nav className="sidebar" aria-label="Main navigation">
        <div className="logo">
          <Image src="/brand/voice-remix-icon.png" alt="" width={30} height={30} priority unoptimized />
          <span>Voice Remix</span>
        </div>
        <div className="nav-group">
          <div className="nav-item active" aria-current="page"><span>✦</span> Create</div>
          <button className="nav-item judge-nav" onClick={startJudgeDemo}><span>▶</span> 1-min demo</button>
        </div>
        <div className="nav-group secondary">
          <small>WORKSPACE</small>
          {DEMO_PROJECTS.map((demo) => (
            <button className={`project-link ${activeDemoId === demo.id ? "active-project" : ""}`} type="button" onClick={() => loadDemoProject(demo)} key={demo.id} aria-pressed={activeDemoId === demo.id}>
              <i className="project-art" style={{ "--project-art": `url("${demo.coverUrl}")` } as React.CSSProperties} />
              <span>{demo.title}</span>
            </button>
          ))}
          <button className="project-link faded" onClick={openImport}><i className="add-project">＋</i>Import audio</button>
        </div>
        <div className="sidebar-bottom">
          <div className="profile"><i>M</i><div><strong>Mark</strong><small>Build Week</small></div><span>•••</span></div>
        </div>
      </nav>

      <section className="app-main">
        <header className="page-header">
          <div><span className="breadcrumb">Projects /</span><strong> {projectTitle}</strong><i className="saved-dot" /> <small>Imported</small></div>
          <div className="page-actions">
            <button onClick={undo} disabled={!canUndo}>↶ Undo</button>
            <button onClick={redo} disabled={!canRedo}>↷ Redo</button>
            <button className="soft-button" onClick={openImport}>Import audio</button>
            <div className="export-wrap">
              <button className="export-button" onClick={() => setExportOpen((open) => !open)} aria-expanded={exportOpen} aria-haspopup="menu">{exportStatus === "rendering" ? `Rendering ${Math.round(exportProgress * 100)}%` : "Export"} <span>↓</span></button>
              {exportOpen && (
                <div className="export-menu" role="menu" aria-label="Export arrangement">
                  <span className="overline">COMMITTED ARRANGEMENT</span>
                  <button type="button" role="menuitem" onClick={() => void exportAudio()} disabled={exportStatus === "rendering"}>
                    <i>WAV</i><span><strong>{exportStatus === "rendering" ? "Rendering audible mix…" : exportStatus === "ready" ? "WAV downloaded" : "Download audio mix"}</strong><small>Section moves, mutes, gain and energy exactly as committed.</small></span><b>{exportStatus === "rendering" ? `${Math.round(exportProgress * 100)}%` : "↓"}</b>
                  </button>
                  <button type="button" role="menuitem" onClick={exportProjectSnapshot} disabled={exportStatus === "rendering"}>
                    <i>JSON</i><span><strong>Download project snapshot</strong><small>Versioned editor state for inspection and future restore.</small></span><b>↓</b>
                  </button>
                  {exportStatus === "rendering" && <div className="export-progress" aria-label={`Audio export ${Math.round(exportProgress * 100)} percent`}><i style={{ width: `${exportProgress * 100}%` }} /></div>}
                  {exportError && <p role="alert">{exportError}</p>}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content-wrap">
          {judgeStep > 0 && (
            <aside className={`judge-guide step-${judgeStep}`} aria-label="One-minute guided demo">
              <div className="judge-progress" aria-hidden="true"><i className={judgeStep >= 1 ? "done" : ""} /><i className={judgeStep >= 2 ? "done" : ""} /><i className={judgeStep >= 3 ? "done" : ""} /></div>
              <div className="judge-copy">
                <span className="overline">{judgeStep === 4 ? "GUIDED DEMO · COMPLETE" : `GUIDED DEMO · STEP ${judgeStep} OF 3`}</span>
                <strong>{judgeStep === 1 ? "Hear the real multitrack arrangement" : judgeStep === 2 ? "Turn intent into an inspectable Music Diff" : judgeStep === 3 ? "A/B the proposal, then commit selectively" : "The edit is committed, reversible, and exportable"}</strong>
                <p>{judgeStep === 1 ? "Start the five synchronized stems. The waveform and editor playhead use the same transport." : judgeStep === 2 ? FEATURED_DEMO_COMMAND : judgeStep === 3 ? "Current and Proposed share one playhead. The canonical project stays untouched until Apply selected." : "Try Undo/Redo, or open Export to render the committed arrangement as a stereo WAV."}</p>
              </div>
              <div className="judge-actions">
                {judgeStep === 1 && <button type="button" className="judge-primary" onClick={() => void advanceJudgePlayback()} disabled={audioSwitching}>{audioSwitching ? "Loading stems…" : "Start music →"}</button>}
                {judgeStep === 2 && <button type="button" className="judge-primary" onClick={() => void advanceJudgeProposal()} disabled={planning}>{planning ? "Planning…" : "Preview with GPT-5.6 →"}</button>}
                {judgeStep === 3 && <><button type="button" onClick={() => void setProposalAudition(true)} disabled={audioSwitching || auditioningProposal}>Hear proposed</button><button type="button" className="judge-primary" onClick={commitJudgeProposal} disabled={audioSwitching || !selectedProposalOperations.length}>Apply selected →</button></>}
                {judgeStep === 4 && <><button type="button" onClick={undo} disabled={!canUndo}>Undo</button><button type="button" className="judge-primary" onClick={() => { setExportOpen(true); setJudgeStep(0); }}>Export WAV →</button></>}
                <button type="button" className="judge-close" onClick={() => setJudgeStep(0)} aria-label="Close guided demo">×</button>
              </div>
            </aside>
          )}
          <section className="create-card">
            <div className="create-glow" />
              <span className="ai-label"><i>●</i> LIVE SESSION · {playing ? "MUSIC RUNNING" : "READY"}</span>
              <h1>Talk to the arrangement.</h1>
              <p>Playback pauses while you speak, then resumes from the same spot for the edit.</p>
            <form className="prompt-box" onSubmit={runCommand}>
              <button type="button" className={`voice-button ${voiceState}`} onClick={toggleVoiceCapture} aria-label={voiceButtonLabel} title={voiceButtonLabel} disabled={voiceState === "connecting" || voiceState === "transcribing" || planning || audioSwitching}>
                <span className="voice-button-icon" aria-hidden="true">
                  {voiceState === "idle" ? <svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" /></svg> : voiceState === "recording" ? "↑" : voiceState === "responding" ? "◼" : "✦"}
                </span>
                <small aria-hidden="true">{voiceState === "recording" ? "SEND" : voiceState === "responding" ? "STOP" : voiceState === "connecting" ? "LINK" : voiceState === "transcribing" ? "THINK" : "TALK"}</small>
              </button>
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
                {promptSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setCommand(suggestion)}>{suggestion}</button>)}
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
            <CoverArt coverUrl={projectCoverUrl} />
            <div className="song-info">
              <span className={`overline ${auditioningProposal ? "audition-label" : ""}`}>{auditioningProposal ? "AUDITIONING PROPOSED · NOT APPLIED" : "CURRENT ARRANGEMENT"}</span>
              <h2>{projectTitle}</h2>
              <p>{projectGenre}</p>
              <div className="song-tags"><span>{project.bpm} BPM</span><span>{formatOverviewTime(audioDuration)}</span><span>{project.totalBars} bars</span><span>{project.tracks.length === 1 ? "1 master track" : `${project.tracks.length} stems`}</span></div>
            </div>
            <MasterWaveform project={audibleProject} position={position} audioDuration={audioDuration} auditioning={auditioningProposal} cueBar={liveQueue?.executeAtBar} onScrub={scrubToBar} />
            <button className={`hero-play ${playing ? "playing" : ""}`} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} disabled={audioSwitching}>{playing ? "Ⅱ" : "▶"}</button>
          </section>

          <div className="editor-layout">
            <section className="arrangement-card">
              <div className="card-heading">
                <div><span className="overline">VISUAL EDITOR</span><h2>Arrangement</h2></div>
                <div className="editor-tools"><span className="current-section"><i />{active?.label ?? "Ready"}</span></div>
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
                      <span className="track-icon-wrap" data-track-icon={track.id} style={{ "--track-color": track.color } as React.CSSProperties}><TrackIcon trackId={track.id} /></span>
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
              <div className="inspector-heading"><div><span className="overline">SELECTED</span><h2>{selected.label}</h2></div></div>
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
              <div className="control-block"><label>Energy <strong>{Math.round(selectedEnergyDraft * 100)}%</strong></label><input type="range" min="0.1" max="1" step="0.05" value={selectedEnergyDraft} onChange={(event) => setEnergyDrafts((current) => ({ ...current, [selected.id]: Number(event.target.value) }))} onPointerUp={() => commitSectionEnergy(selectedEnergyDraft)} onBlur={() => commitSectionEnergy(selectedEnergyDraft)} /><div className="range-labels"><span>Calm</span><span>Intense</span></div></div>
              <div className="history-block"><div className="history-title"><span>Recent edits</span><small>{activity.length}</small></div>{activity.slice(0, 3).map((item, index) => <div className="activity-item" key={`${item.title}-${index}`}><i /><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</div>
            </aside>
          </div>
        </div>

        <footer className="player-bar">
          <div className="mini-song"><CoverArt coverUrl={projectCoverUrl} mini /><div><strong>{projectTitle}</strong><span>{active?.label ?? "Ready"} · {project.tracks.length === 1 ? "Master mix" : "Imported stems"}</span></div></div>
          <div className="player-center"><div className="player-buttons"><button onClick={undo} disabled={!canUndo || audioSwitching} aria-label="Undo" title="Undo">↶</button><button className="footer-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} disabled={audioSwitching}>{playing ? "Ⅱ" : "▶"}</button><button onClick={redo} disabled={!canRedo || audioSwitching} aria-label="Redo" title="Redo">↷</button></div><div className="progress-row"><span>{formatOverviewTime(position / project.totalBars * audioDuration)}</span><input className="progress-track" style={{ "--progress": `${position / project.totalBars * 100}%` } as React.CSSProperties} type="range" min="0" max={project.totalBars - 0.001} step="0.01" value={position} onInput={(event) => scrubToBar(Number(event.currentTarget.value))} onChange={(event) => scrubToBar(Number(event.currentTarget.value))} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); scrubFromPointer(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubFromPointer(event); }} aria-label="Playback position" aria-valuetext={`Bar ${Math.floor(position) + 1}`} /><span>{formatOverviewTime(audioDuration)}</span></div></div>
          <div className="player-right"><label>BPM</label><strong>{project.bpm}</strong><span>◖)))</span></div>
        </footer>
      </section>
    </main>
  );
}
