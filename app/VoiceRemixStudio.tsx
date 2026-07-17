"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";

type SectionKind = "intro" | "verse" | "chorus" | "outro";
type TrackId = "drums" | "bass" | "chords" | "lead";

type Section = {
  id: string;
  kind: SectionKind;
  label: string;
  startBar: number;
  lengthBars: number;
  energy: number;
};

type Track = {
  id: TrackId;
  label: string;
  role: string;
  color: string;
  enabled: boolean;
  level: number;
};

type Project = {
  bpm: number;
  sections: Section[];
  tracks: Track[];
};

const INITIAL_PROJECT: Project = {
  bpm: 118,
  sections: [
    { id: "intro-1", kind: "intro", label: "Intro", startBar: 0, lengthBars: 4, energy: 0.28 },
    { id: "verse-1", kind: "verse", label: "Verse", startBar: 4, lengthBars: 8, energy: 0.5 },
    { id: "chorus-1", kind: "chorus", label: "Chorus", startBar: 12, lengthBars: 8, energy: 0.82 },
    { id: "outro-1", kind: "outro", label: "Outro", startBar: 20, lengthBars: 4, energy: 0.38 },
  ],
  tracks: [
    { id: "drums", label: "DRUMS", role: "Rhythm rack", color: "#ff7a5c", enabled: true, level: 0.78 },
    { id: "bass", label: "BASS", role: "Mono pulse", color: "#9d83ff", enabled: true, level: 0.64 },
    { id: "chords", label: "CHORDS", role: "Glass keys", color: "#4ed6a7", enabled: true, level: 0.58 },
    { id: "lead", label: "LEAD", role: "Neon pluck", color: "#f5c84c", enabled: true, level: 0.52 },
  ],
};

const BAR_PX = 58;
const TOTAL_BARS = 24;

function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

function sectionAt(project: Project, bar: number) {
  return [...project.sections]
    .reverse()
    .find((section) => bar >= section.startBar && bar < section.startBar + section.lengthBars);
}

export function VoiceRemixStudio() {
  const [project, setProject] = useState<Project>(INITIAL_PROJECT);
  const projectRef = useRef(project);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [command, setCommand] = useState("");
  const [listening, setListening] = useState(false);
  const [selectedSection, setSelectedSection] = useState("chorus-1");
  const [canUndo, setCanUndo] = useState(false);
  const [activity, setActivity] = useState([
    { title: "Project ready", detail: "24 bars · 4 tracks · local arrangement engine", time: "NOW" },
  ]);
  const history = useRef<Project[]>([]);
  const scheduled = useRef(false);
  const synths = useRef<{
    kick?: Tone.MembraneSynth;
    hat?: Tone.NoiseSynth;
    bass?: Tone.MonoSynth;
    chords?: Tone.PolySynth;
    lead?: Tone.Synth;
  }>({});

  useEffect(() => {
    projectRef.current = project;
    Tone.getTransport().bpm.rampTo(project.bpm, 0.08);
  }, [project]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const transport = Tone.getTransport();
      const barSeconds = (60 / projectRef.current.bpm) * 4;
      if (transport.state === "started") {
        setPosition((transport.seconds / barSeconds) % TOTAL_BARS);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  const setupAudio = () => {
    if (scheduled.current) return;
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.08 },
    }).toDestination();
    const hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.035, sustain: 0 },
    }).toDestination();
    const bass = new Tone.MonoSynth({
      oscillator: { type: "square" },
      filter: { Q: 2, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.01, decay: 0.12, sustain: 0.35, release: 0.18 },
      filterEnvelope: { attack: 0.01, decay: 0.16, sustain: 0.2, release: 0.2, baseFrequency: 90, octaves: 2.8 },
    }).toDestination();
    const chords = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.03, decay: 0.22, sustain: 0.2, release: 0.5 },
    }).toDestination();
    const lead = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.004, decay: 0.08, sustain: 0.08, release: 0.16 },
    }).toDestination();
    kick.volume.value = -7;
    hat.volume.value = -18;
    bass.volume.value = -14;
    chords.volume.value = -17;
    lead.volume.value = -15;
    synths.current = { kick, hat, bass, chords, lead };

    let step = 0;
    const bassNotes = ["C2", "C2", "Ab1", "Bb1"];
    const chordNotes = [
      ["C3", "Eb3", "G3"],
      ["Ab2", "C3", "Eb3"],
      ["Eb3", "G3", "Bb3"],
      ["Bb2", "D3", "F3"],
    ];
    const leadNotes = ["G4", "Bb4", "C5", "Eb5", "C5", "Bb4", "G4", "F4"];

    Tone.getTransport().scheduleRepeat((time) => {
      const current = projectRef.current;
      const bar = Math.floor(step / 16) % TOTAL_BARS;
      const beatStep = step % 16;
      const activeSection = sectionAt(current, bar);
      const energy = activeSection?.energy ?? 0.4;
      const isOn = (id: TrackId) => current.tracks.find((track) => track.id === id)?.enabled;

      if (isOn("drums")) {
        if (beatStep === 0 || beatStep === 8 || (energy > 0.72 && beatStep === 10)) {
          kick.triggerAttackRelease("C1", "16n", time, 0.65 + energy * 0.25);
        }
        if (beatStep % (energy > 0.7 ? 2 : 4) === 0) {
          hat.triggerAttackRelease("32n", time, 0.22 + energy * 0.18);
        }
      }
      if (isOn("bass") && beatStep % 4 === 0) {
        bass.triggerAttackRelease(bassNotes[bar % bassNotes.length], "8n", time, 0.55);
      }
      if (isOn("chords") && beatStep === 0) {
        chords.triggerAttackRelease(chordNotes[bar % chordNotes.length], "2n", time, 0.34);
      }
      if (isOn("lead") && activeSection?.kind === "chorus" && beatStep % 2 === 0) {
        lead.triggerAttackRelease(leadNotes[(bar * 2 + beatStep / 2) % leadNotes.length], "16n", time, 0.38);
      }
      step = (step + 1) % (TOTAL_BARS * 16);
    }, "16n");
    Tone.getTransport().loop = true;
    Tone.getTransport().loopEnd = `${TOTAL_BARS}m`;
    scheduled.current = true;
  };

  const togglePlay = async () => {
    await Tone.start();
    setupAudio();
    const transport = Tone.getTransport();
    if (transport.state === "started") {
      transport.pause();
      setPlaying(false);
    } else {
      transport.start();
      setPlaying(true);
    }
  };

  const stop = () => {
    Tone.getTransport().stop();
    Tone.getTransport().seconds = 0;
    setPosition(0);
    setPlaying(false);
  };

  const commit = (next: Project, title: string, detail: string) => {
    history.current.push(cloneProject(projectRef.current));
    setCanUndo(true);
    setProject(next);
    setActivity((items) => [{ title, detail, time: "NOW" }, ...items].slice(0, 5));
  };

  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    setCanUndo(history.current.length > 0);
    setProject(previous);
    setActivity((items) => [{ title: "Undo", detail: "Restored the previous arrangement", time: "NOW" }, ...items].slice(0, 5));
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

  const runCommand = (event: FormEvent) => {
    event.preventDefault();
    const input = command.trim();
    if (!input) return;
    if (/撤销|undo/i.test(input)) {
      undo();
      setCommand("");
      return;
    }
    const next = cloneProject(project);
    const operations: string[] = [];
    const bpmMatch = input.match(/(?:bpm|速度|tempo)[^0-9]*(\d{2,3})/i) ?? input.match(/(\d{2,3})\s*(?:bpm)/i);
    if (bpmMatch) {
      next.bpm = Math.max(60, Math.min(180, Number(bpmMatch[1])));
      operations.push(`Tempo → ${next.bpm} BPM`);
    }
    if (/副歌|chorus/i.test(input) && /提前|earlier|前移/i.test(input)) {
      const bars = Number(input.match(/(\d+)\s*(?:小节|bars?)/i)?.[1] ?? 4);
      const chorus = next.sections.find((section) => section.kind === "chorus")!;
      chorus.startBar = Math.max(0, chorus.startBar - bars);
      operations.push(`Chorus −${bars} bars`);
    }
    const trackMap: Array<[RegExp, TrackId]> = [
      [/鼓|drums?/i, "drums"],
      [/贝斯|bass/i, "bass"],
      [/和弦|chords?/i, "chords"],
      [/主旋律|lead/i, "lead"],
    ];
    trackMap.forEach(([pattern, id]) => {
      if (!pattern.test(input)) return;
      const track = next.tracks.find((item) => item.id === id)!;
      if (/静音|移除|关掉|mute|remove/i.test(input)) {
        track.enabled = false;
        operations.push(`${track.label} muted`);
      } else if (/打开|恢复|加入|unmute|enable|add/i.test(input)) {
        track.enabled = true;
        operations.push(`${track.label} enabled`);
      }
    });
    if (/更有力量|能量|更强|harder|energy/i.test(input)) {
      const chorus = next.sections.find((section) => section.kind === "chorus")!;
      chorus.energy = 1;
      operations.push("Chorus energy → 100%");
    }
    if (!operations.length) {
      setActivity((items) => [{ title: "Needs clarification", detail: `“${input}” is outside the local command set`, time: "NOW" }, ...items].slice(0, 5));
    } else {
      commit(next, "Local edit plan applied", operations.join(" · "));
    }
    setCommand("");
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

  const selected = project.sections.find((section) => section.id === selectedSection)!;
  const active = sectionAt(project, Math.floor(position));
  const barLabels = useMemo(() => Array.from({ length: TOTAL_BARS }, (_, index) => index + 1), []);

  return (
    <main className="app-shell">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="logo"><i>V</i><span>Voice Remix</span></div>
        <div className="nav-group">
          <button className="nav-item active"><span>✦</span> Create</button>
          <button className="nav-item"><span>◫</span> Projects</button>
          <button className="nav-item"><span>♫</span> Library</button>
        </div>
        <div className="nav-group secondary">
          <small>WORKSPACE</small>
          <button className="project-link"><i className="project-art" />Midnight Circuit</button>
          <button className="project-link faded"><i className="add-project">＋</i>New project</button>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item"><span>?</span> Help & feedback</button>
          <div className="profile"><i>M</i><div><strong>Mark</strong><small>Build Week</small></div><span>•••</span></div>
        </div>
      </nav>

      <section className="app-main">
        <header className="page-header">
          <div><span className="breadcrumb">Projects /</span><strong> Midnight Circuit</strong><i className="saved-dot" /> <small>Saved</small></div>
          <div className="page-actions">
            <button onClick={undo} disabled={!canUndo}>↶ Undo</button>
            <button className="soft-button">Share</button>
            <button className="export-button">Export <span>↓</span></button>
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
              <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Try “bring the chorus in earlier and make the drums hit harder”" aria-label="Arrangement command" />
              <button className="apply-button" type="submit"><span>Apply edit</span> ↑</button>
            </form>
            <div className="prompt-footer">
              <div className="suggestions">
                {["副歌提前 4 小节", "鼓更有力量", "静音主旋律", "速度调到 126 BPM"].map((suggestion) => <button key={suggestion} onClick={() => setCommand(suggestion)}>{suggestion}</button>)}
              </div>
              <small>{listening ? "Listening…" : "Local demo · GPT-5.6 next"}</small>
            </div>
          </section>

          <section className="song-card">
            <div className="cover-art"><div className="cover-orbit one" /><div className="cover-orbit two" /><i>VR</i></div>
            <div className="song-info">
              <span className="overline">CURRENT ARRANGEMENT</span>
              <h2>Midnight Circuit</h2>
              <p>Alt-electronic · Neon pop · Instrumental</p>
              <div className="song-tags"><span>{project.bpm} BPM</span><span>C minor</span><span>{TOTAL_BARS} bars</span><span>4 stems</span></div>
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
                {project.tracks.map((track, trackIndex) => (
                  <div className={`track-row ${track.enabled ? "" : "is-muted"}`} key={track.id}>
                    <div className="track-header">
                      <span className="track-color" style={{ background: track.color }} />
                      <div><strong>{track.label}</strong><small>{track.role}</small></div>
                      <button className="mute-button" onClick={() => toggleTrack(track.id)} aria-label={`${track.enabled ? "Mute" : "Unmute"} ${track.label}`}>{track.enabled ? "M" : "○"}</button>
                    </div>
                    <div className="track-lane" style={{ width: TOTAL_BARS * BAR_PX }}>
                      {barLabels.map((bar) => <i className={bar % 4 === 1 ? "major-grid" : ""} key={bar} style={{ left: (bar - 1) * BAR_PX }} />)}
                      {project.sections.map((section, sectionIndex) => (
                        <button key={`${track.id}-${section.id}`} className={`clip ${selectedSection === section.id ? "selected" : ""}`} style={{ left: section.startBar * BAR_PX + 3, width: section.lengthBars * BAR_PX - 6, "--clip": track.color } as React.CSSProperties} onClick={() => setSelectedSection(section.id)} title={`Select ${section.label}`}>
                          <span>{track.label === "DRUMS" ? section.label : `${section.label} ${sectionIndex + 1}`}</span>
                          <em>{Array.from({ length: Math.min(section.lengthBars * 2, 12) }, (_, index) => <b key={index} style={{ height: `${22 + ((index * 17 + trackIndex * 13) % 58)}%` }} />)}</em>
                        </button>
                      ))}
                      <div className="playhead" style={{ left: position * BAR_PX }}><span /></div>
                    </div>
                  </div>
                ))}
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
          <div className="mini-song"><div className="mini-cover" /><div><strong>Midnight Circuit</strong><span>{active?.label ?? "Ready"} · Voice Remix</span></div><button>♡</button></div>
          <div className="player-center"><div className="player-buttons"><button onClick={stop}>↶</button><button className="footer-play" onClick={togglePlay}>{playing ? "Ⅱ" : "▶"}</button><button>↷</button></div><div className="progress-row"><span>{Math.floor(position / project.bpm * 240 / 60)}:{String(Math.floor(position * 2) % 60).padStart(2, "0")}</span><div className="progress-track"><i style={{ width: `${position / TOTAL_BARS * 100}%` }} /></div><span>0:49</span></div></div>
          <div className="player-right"><label htmlFor="tempo">BPM</label><input id="tempo" type="number" min="60" max="180" value={project.bpm} onChange={(event) => setProject({ ...project, bpm: Number(event.target.value) })} /><span>◖)))</span></div>
        </footer>
      </section>
    </main>
  );
}
