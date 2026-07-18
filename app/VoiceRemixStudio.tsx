"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
import { arrangementSignature, createArrangementSegments, findAuditionStartBar, sourceStartBar } from "./audio-arrangement";
import { EMPTY_MIXER_STATUS, syncProjectMixer, type MixerStatus } from "./audio-mixer";
import { applyOperations, cloneProject, createLocalTransaction, describeOperation, type EditTransaction, type MoveSectionOperation, type Project, type TrackId } from "./edit-transactions";
import { createProjectHistory, recordHistory, redoHistory, undoHistory } from "./project-history";
import { createProjectExport, projectExportFilename } from "./project-export";

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
const TOTAL_BARS = 59;
const AUDIO_DURATION = 119.4;

function sectionAt(project: Project, bar: number) {
  return [...project.sections]
    .reverse()
    .find((section) => bar >= section.startBar && bar < section.startBar + section.lengthBars);
}

type PeakEnvelope = {
  peaks: Array<[number, number]>;
};

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

export function VoiceRemixStudio() {
  const [project, setProject] = useState<Project>(INITIAL_PROJECT);
  const projectRef = useRef(project);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [command, setCommand] = useState("");
  const [proposal, setProposal] = useState<EditTransaction | null>(null);
  const [auditioningProposal, setAuditioningProposal] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [listening, setListening] = useState(false);
  const [selectedSection, setSelectedSection] = useState("chorus-1");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [mixerStatus, setMixerStatus] = useState<MixerStatus>(EMPTY_MIXER_STATUS);
  const [activity, setActivity] = useState([
    { title: "Suno stems imported", detail: "1:59 · 59 bars · 5 real audio tracks", time: "NOW" },
  ]);
  const history = useRef(createProjectHistory<Project>());
  const scheduled = useRef(false);
  const audioSetup = useRef<Promise<void> | null>(null);
  const players = useRef<Partial<Record<TrackId, Tone.Player[]>>>({});
  const buffers = useRef<Partial<Record<TrackId, Tone.ToneAudioBuffer>>>({});
  const scheduledArrangement = useRef("");
  const audibleProject = useMemo(
    () => auditioningProposal && proposal ? applyOperations(project, proposal.operations) : project,
    [auditioningProposal, project, proposal],
  );

  useEffect(() => {
    projectRef.current = project;
    Tone.getTransport().bpm.rampTo(project.bpm, 0.08);
    applyMixerState(audibleProject);
  }, [audibleProject, project]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const transport = Tone.getTransport();
      if (transport.state === "started") {
        setPosition((transport.seconds / AUDIO_DURATION * TOTAL_BARS) % TOTAL_BARS);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    Object.values(players.current).flat().forEach((player) => player.unsync().dispose());
    Object.values(buffers.current).forEach((buffer) => buffer.dispose());
    players.current = {};
    buffers.current = {};
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
    scheduledArrangement.current = "";
    setMixerStatus(EMPTY_MIXER_STATUS);
    Tone.setContext(new Tone.Context({ latencyHint: "playback" }), true);
  }

  function seekToBar(bar: number) {
    const nextPosition = Math.max(0, Math.min(TOTAL_BARS - 0.001, bar));
    Tone.getTransport().seconds = nextPosition / TOTAL_BARS * AUDIO_DURATION;
    setPosition(nextPosition);
  }

  function auditionStartBar(nextProposal: EditTransaction) {
    const fallback = project.sections.find((section) => section.id === selectedSection)?.startBar ?? position;
    return findAuditionStartBar(nextProposal.operations, fallback);
  }

  function scheduleAudioArrangement(nextProject: Project, force = false) {
    const signature = arrangementSignature(nextProject);
    if (!force && signature === scheduledArrangement.current) return;
    if (nextProject.tracks.some((track) => !buffers.current[track.id])) return;

    const transport = Tone.getTransport();
    const wasPlaying = transport.state === "started";
    if (wasPlaying) transport.pause();
    disposeArrangementPlayers();

    const segments = createArrangementSegments(nextProject, AUDIO_DURATION);
    nextProject.tracks.forEach((track) => {
      const buffer = buffers.current[track.id]!;
      players.current[track.id] = segments.map((segment) => {
        const player = new Tone.Player({ url: buffer, fadeIn: 0.015, fadeOut: 0.015 }).toDestination();
        player.volume.value = Tone.gainToDb(Math.max(0.001, track.level));
        player.mute = !track.enabled;
        player.sync().start(segment.destinationStartSeconds, segment.sourceStartSeconds, segment.durationSeconds);
        return player;
      });
    });

    transport.seconds = 0;
    setPosition(0);
    scheduledArrangement.current = signature;
    if (wasPlaying) transport.start("+0.05");
  }

  const setupAudio = async () => {
    if (scheduled.current) return;
    if (!audioSetup.current) {
      resetAudioRuntime();
      const contextStarted = Tone.start();
      audioSetup.current = (async () => {
        await contextStarted;
        const loadedBuffers = await Promise.all(INITIAL_PROJECT.tracks.map(async (track) => [track.id, await Tone.ToneAudioBuffer.fromUrl(track.audioUrl)] as const));
        loadedBuffers.forEach(([trackId, buffer]) => { buffers.current[trackId] = buffer; });
        const transport = Tone.getTransport();
        transport.loop = true;
        transport.loopEnd = AUDIO_DURATION;
        scheduleAudioArrangement(projectRef.current, true);
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

  const togglePlay = async () => {
    await setupAudio();
    await Tone.start();
    const transport = Tone.getTransport();
    if (transport.state === "started") {
      transport.pause();
      setPlaying(false);
    } else {
      transport.start();
      setPlaying(true);
    }
  };

  const commit = (next: Project, title: string, detail: string) => {
    history.current = recordHistory(history.current, projectRef.current, cloneProject);
    if (next.version === projectRef.current.version) next.version += 1;
    projectRef.current = next;
    scheduleAudioArrangement(next);
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
    scheduleAudioArrangement(result.value);
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
    scheduleAudioArrangement(result.value);
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

  const nudgeSection = (delta: number) => {
    const next = cloneProject(project);
    const section = next.sections.find((item) => item.id === selectedSection)!;
    section.startBar = Math.max(0, Math.min(TOTAL_BARS - section.lengthBars, section.startBar + delta));
    commit(next, `Moved ${section.label}`, `${delta > 0 ? "+" : ""}${delta} bar${Math.abs(delta) === 1 ? "" : "s"}`);
  };

  const runCommand = async (event: FormEvent) => {
    event.preventDefault();
    const input = command.trim();
    if (!input || planning) return;
    if (auditioningProposal) {
      scheduleAudioArrangement(project);
      applyMixerState(project);
      setAuditioningProposal(false);
    }
    if (/撤销|undo/i.test(input)) {
      undo();
      setCommand("");
      return;
    }
    if (/重做|redo/i.test(input)) {
      redo();
      setCommand("");
      return;
    }
    setPlanning(true);
    let nextProposal: EditTransaction | null = null;
    try {
      const response = await fetch("/api/plan-edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: input, project }) });
      if (response.ok) nextProposal = ((await response.json()) as { transaction: EditTransaction }).transaction;
    } catch {
      // The local planner keeps the demo usable offline and when the API is unavailable.
    }
    nextProposal ??= createLocalTransaction(input, project);
    if (!nextProposal) {
      setActivity((items) => [{ title: "Needs clarification", detail: `“${input}” did not produce a supported edit`, time: "NOW" }, ...items].slice(0, 5));
    } else {
      setProposal(nextProposal);
      setActivity((items) => [{ title: "Music Diff ready", detail: `${nextProposal.operations.length} operations · ${nextProposal.planner} · project unchanged`, time: "NOW" }, ...items].slice(0, 5));
    }
    setPlanning(false);
    setCommand("");
  };

  const toggleProposalOperation = (operationId: string) => {
    if (!proposal) return;
    const nextProposal = { ...proposal, operations: proposal.operations.map((operation) => operation.id === operationId ? { ...operation, selected: !operation.selected } : operation) };
    setProposal(nextProposal);
    if (auditioningProposal) {
      const auditionProject = applyOperations(project, nextProposal.operations);
      scheduleAudioArrangement(auditionProject);
      applyMixerState(auditionProject);
      seekToBar(auditionStartBar(nextProposal));
      if (!nextProposal.operations.some((operation) => operation.selected)) setAuditioningProposal(false);
    }
  };

  const discardProposal = () => {
    if (!proposal) return;
    if (auditioningProposal) {
      scheduleAudioArrangement(project);
      applyMixerState(project);
    }
    setActivity((items) => [{ title: "Proposal discarded", detail: "No project state was changed", time: "NOW" }, ...items].slice(0, 5));
    setProposal(null);
    setAuditioningProposal(false);
  };

  const setProposalAudition = async (proposed: boolean) => {
    if (!proposal || proposed === auditioningProposal) return;
    await setupAudio();
    await Tone.start();
    const transport = Tone.getTransport();

    if (!proposed) {
      scheduleAudioArrangement(project);
      applyMixerState(project);
      seekToBar(auditionStartBar(proposal));
      setAuditioningProposal(false);
      setActivity((items) => [{ title: "Current mix", detail: "Audition ended · project was never changed", time: "NOW" }, ...items].slice(0, 5));
    } else {
      const auditionProject = applyOperations(project, proposal.operations);
      scheduleAudioArrangement(auditionProject);
      applyMixerState(auditionProject);
      const startBar = auditionStartBar(proposal);
      seekToBar(startBar);
      setAuditioningProposal(true);
      setActivity((items) => [{ title: "Auditioning proposal", detail: `Starting at bar ${Math.floor(startBar) + 1} · project and history unchanged`, time: "NOW" }, ...items].slice(0, 5));
    }

    if (transport.state !== "started") {
      transport.start();
      setPlaying(true);
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
    const next = applyOperations(project, proposal.operations, true);
    commit(next, "Music Diff committed", selectedOperations.map((operation) => `${describeOperation(operation).verb} ${operation.targetLabel}`).join(" · "));
    setProposal(null);
    setAuditioningProposal(false);
  };

  const startListening = () => {
    type Recognition = {
      lang: string;
      interimResults: boolean;
      onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
      onend: () => void;
      start: () => void;
    };
    const SpeechRecognition = (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setActivity((items) => [{ title: "Microphone unavailable", detail: "Use Chrome voice input or type a command below", time: "NOW" }, ...items].slice(0, 5));
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.onresult = (event) => setCommand(event.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const exportProject = () => {
    const data = createProjectExport(project);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = projectExportFilename("Neon Pulse Loop");
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setActivity((items) => [{ title: "Project exported", detail: `${project.sections.length} sections · ${project.tracks.length} stems · version ${project.version}`, time: "NOW" }, ...items].slice(0, 5));
  };

  const selected = project.sections.find((section) => section.id === selectedSection)!;
  const active = sectionAt(project, Math.floor(position));
  const barLabels = useMemo(() => Array.from({ length: TOTAL_BARS }, (_, index) => index + 1), []);
  const selectedProposalOperations = proposal?.operations.filter((operation) => operation.selected) ?? [];
  const proposedMoves = selectedProposalOperations.filter((operation): operation is MoveSectionOperation => operation.action === "move_section");
  const affectedSectionIds = new Set(proposedMoves.map((operation) => operation.targetId));

  return (
    <main className="app-shell" data-audio-ready={mixerStatus.ready} data-audio-player-count={mixerStatus.playerCount} data-audio-muted-player-count={mixerStatus.mutedPlayerCount}>
      <nav className="sidebar" aria-label="Main navigation">
        <div className="logo"><i>V</i><span>Voice Remix</span></div>
        <div className="nav-group">
          <button className="nav-item active"><span>✦</span> Create</button>
          <button className="nav-item"><span>◫</span> Projects</button>
          <button className="nav-item"><span>♫</span> Library</button>
        </div>
        <div className="nav-group secondary">
          <small>WORKSPACE</small>
          <button className="project-link"><i className="project-art" />Neon Pulse Loop</button>
          <button className="project-link faded"><i className="add-project">＋</i>New project</button>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item"><span>?</span> Help & feedback</button>
          <div className="profile"><i>M</i><div><strong>Mark</strong><small>Build Week</small></div><span>•••</span></div>
        </div>
      </nav>

      <section className="app-main">
        <header className="page-header">
          <div><span className="breadcrumb">Projects /</span><strong> Neon Pulse Loop</strong><i className="saved-dot" /> <small>Imported</small></div>
          <div className="page-actions">
            <button onClick={undo} disabled={!canUndo}>↶ Undo</button>
            <button onClick={redo} disabled={!canRedo}>↷ Redo</button>
            <button className="soft-button">Share</button>
            <button className="export-button" onClick={exportProject}>Export <span>↓</span></button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="create-card">
            <div className="create-glow" />
            <span className="ai-label"><i>✦</i> AI ARRANGER</span>
            <h1>What should change?</h1>
            <p>Describe the feeling, structure, or instrument you want to hear.</p>
            <form className="prompt-box" onSubmit={runCommand}>
              <button type="button" className={`voice-button ${listening ? "listening" : ""}`} onClick={startListening} aria-label="Start voice input">●</button>
              <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Try “bring the chorus in earlier and make the drums hit harder”" aria-label="Arrangement command" disabled={planning} />
              <button className={`apply-button ${planning ? "is-planning" : ""}`} type="submit" disabled={planning}><span>{planning ? "Planning…" : "Preview edit"}</span> {planning ? "✦" : "↑"}</button>
            </form>
            <div className="prompt-footer">
              <div className="suggestions">
                {["最后一遍副歌提前 4 小节，鼓更强，但贝斯不要变", "鼓更有力量", "静音合成器", "只保留贝斯和鼓"].map((suggestion) => <button key={suggestion} onClick={() => setCommand(suggestion)}>{suggestion}</button>)}
              </div>
              <small>{listening ? "Listening…" : planning ? "GPT-5.6 is interpreting the arrangement…" : "GPT-5.6 planner · local fallback"}</small>
            </div>
          </section>

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
                <div><button type="button" onClick={discardProposal}>Discard</button><div className="audition-switch" role="group" aria-label="Audition version"><button className={!auditioningProposal ? "active" : ""} type="button" aria-pressed={!auditioningProposal} onClick={() => setProposalAudition(false)}>Current</button><button className={auditioningProposal ? "active" : ""} type="button" aria-pressed={auditioningProposal} onClick={() => setProposalAudition(true)} disabled={!selectedProposalOperations.length}>Proposed</button></div><button className="apply-selected" type="button" onClick={applyProposal} disabled={!selectedProposalOperations.length}>Apply selected</button></div>
              </div>
            </section>
          )}

          <section className="song-card">
            <div className="cover-art"><div className="cover-orbit one" /><div className="cover-orbit two" /><i>VR</i></div>
            <div className="song-info">
              <span className={`overline ${auditioningProposal ? "audition-label" : ""}`}>{auditioningProposal ? "AUDITIONING PROPOSED · NOT APPLIED" : "CURRENT ARRANGEMENT"}</span>
              <h2>Neon Pulse Loop</h2>
              <p>Alt-electronic · Neon pop · Instrumental</p>
              <div className="song-tags"><span>{project.bpm} BPM</span><span>C minor</span><span>{TOTAL_BARS} bars</span><span>5 Suno stems</span></div>
            </div>
            <div className="song-wave" aria-hidden="true">
              {Array.from({ length: 54 }, (_, index) => <i key={index} className={index / 54 * TOTAL_BARS < position ? "passed" : ""} style={{ height: `${18 + ((index * 23) % 62)}%` }} />)}
            </div>
            <button className={`hero-play ${playing ? "playing" : ""}`} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>{playing ? "Ⅱ" : "▶"}</button>
          </section>

          <div className="editor-layout">
            <section className="arrangement-card">
              <div className="card-heading">
                <div><span className="overline">VISUAL EDITOR</span><h2>Arrangement</h2></div>
                <div className="editor-tools"><span className="current-section"><i />{active?.label ?? "Ready"}</span><button>−</button><small>100%</small><button>＋</button></div>
              </div>
              <div className="playlist-scroll">
                <div className="track-label-spacer"><span>STEMS</span></div>
                <div className="bar-ruler" style={{ width: TOTAL_BARS * BAR_PX }}>
                  {barLabels.map((bar) => <span key={bar} style={{ width: BAR_PX }}>{bar}</span>)}
                </div>
                {project.tracks.map((track) => {
                  const audibleTrack = audibleProject.tracks.find((item) => item.id === track.id) ?? track;
                  const auditionChanged = auditioningProposal && (audibleTrack.enabled !== track.enabled || audibleTrack.level !== track.level);
                  return (
                  <div className={`track-row ${audibleTrack.enabled ? "" : "is-muted"} ${auditionChanged ? "is-audition-changed" : ""}`} data-audition-state={auditioningProposal ? (audibleTrack.enabled ? "on" : "muted") : "current"} key={track.id}>
                    <div className="track-header">
                      <span className="track-color" style={{ background: track.color }} />
                      <div title={track.nearSilent ? `Near silent · peak ${track.maxDb} dB` : `${track.role} · ${track.meanDb} dB`}><strong>{track.label}</strong><small className={auditionChanged ? "audition-note" : track.nearSilent ? "near-silent" : ""}>{auditionChanged ? (audibleTrack.enabled ? `Proposed · ${Math.round(audibleTrack.level * 100)}% gain` : "Proposed · muted") : track.nearSilent ? `Near silent · peak ${track.maxDb} dB` : `${track.role} · ${track.meanDb} dB`}</small></div>
                      <button className="mute-button" onClick={() => toggleTrack(track.id)} aria-label={`${track.enabled ? "Mute" : "Unmute"} ${track.label}`} disabled={auditioningProposal}>{audibleTrack.enabled ? "M" : "○"}</button>
                    </div>
                    <div className="track-lane" style={{ width: TOTAL_BARS * BAR_PX }}>
                      {barLabels.map((bar) => <i className={bar % 4 === 1 ? "major-grid" : ""} key={bar} style={{ left: (bar - 1) * BAR_PX }} />)}
                      <TrackWaveform url={track.peaksUrl} color={track.color} width={TOTAL_BARS * BAR_PX} project={project} nearSilent={track.nearSilent} />
                      {project.sections.map((section) => (
                        <button key={`${track.id}-${section.id}`} className={`clip ${selectedSection === section.id ? "selected" : ""} ${affectedSectionIds.has(section.id) ? "is-affected" : ""}`} style={{ left: section.startBar * BAR_PX + 3, width: section.lengthBars * BAR_PX - 6, "--clip": track.color } as React.CSSProperties} onClick={() => setSelectedSection(section.id)} title={`Select ${section.label}`}>
                          <span>{section.label}</span>
                        </button>
                      ))}
                      {proposedMoves.map((move) => <div className="ghost-clip" key={`${track.id}-${move.id}-ghost`} style={{ left: move.afterStartBar * BAR_PX + 3, width: move.lengthBars * BAR_PX - 6 }}><span>PROPOSED · {move.targetLabel}</span></div>)}
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
          <div className="mini-song"><div className="mini-cover" /><div><strong>Neon Pulse Loop</strong><span>{active?.label ?? "Ready"} · Suno stems</span></div><button>♡</button></div>
          <div className="player-center"><div className="player-buttons"><button onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo">↶</button><button className="footer-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>{playing ? "Ⅱ" : "▶"}</button><button onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo">↷</button></div><div className="progress-row"><span>{Math.floor(position * 4 * 60 / project.bpm / 60)}:{String(Math.floor(position * 4 * 60 / project.bpm) % 60).padStart(2, "0")}</span><div className="progress-track"><i style={{ width: `${position / TOTAL_BARS * 100}%` }} /></div><span>1:59</span></div></div>
          <div className="player-right"><label htmlFor="tempo">BPM</label><input id="tempo" type="number" min="60" max="180" value={project.bpm} onChange={(event) => setProject({ ...project, bpm: Number(event.target.value) })} /><span>◖)))</span></div>
        </footer>
      </section>
    </main>
  );
}
