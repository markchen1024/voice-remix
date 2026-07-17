# Voice Remix — Architecture and Library Decisions

## 1. Architecture decision

Voice Remix separates interpretation, project state, visualization, and sound generation. The language model produces domain commands; it never owns the canonical song state and never edits audio buffers directly.

```text
Microphone / text
        |
Realtime transcription (voice only)
        |
GPT-5.6 arrangement planner
        |
Validated EditTransaction JSON
        |
Command bus + history
       / \
Project store   Tone.js audio engine
      |                 |
Playlist UI       Web Audio output
```

## 2. Runtime components

### Browser application

- Renders the Playlist and editing controls
- Owns the canonical `SongProject`
- Runs audio scheduling and synthesis
- Applies AI and manual edits through the same command bus
- Stores temporary project state locally

### Server endpoints

- Create Realtime transcription sessions without exposing a standard API key
- Send transcript, compact song context, and tool schema to GPT-5.6
- Validate and return an `EditTransaction`
- Do not proxy audio playback or hold canonical arrangement state in the MVP

### OpenAI services

- Realtime transcription: live speech-to-text in the browser
- GPT-5.6: contextual arrangement planning and clarification
- Structured tool arguments: constrained, inspectable edit operations

## 3. Domain model

```ts
type SongProject = {
  version: number;
  title: string;
  bpm: number;
  timeSignature: [4, 4];
  totalBars: number;
  sections: Section[];
  tracks: Track[];
};

type Section = {
  id: string;
  kind: "intro" | "verse" | "chorus" | "outro";
  startBar: number;
  lengthBars: number;
  energy: number;
};

type Clip = {
  id: string;
  trackId: string;
  sectionId: string;
  startBar: number;
  lengthBars: number;
  patternId: string;
};

type EditTransaction = {
  id: string;
  summary: string;
  baseProjectVersion: number;
  operations: EditOperation[];
};
```

Every operation includes stable IDs and absolute or delta bar values. The client rejects a transaction if its `baseProjectVersion` no longer matches the current project.

## 4. Command execution

Both voice and manual edits become domain operations:

```ts
type EditOperation =
  | { action: "move_section"; sectionId: string; deltaBars: number }
  | { action: "set_tempo"; bpm: number }
  | { action: "set_track_enabled"; trackId: string; enabled: boolean }
  | { action: "add_instrument"; preset: InstrumentPreset; sectionId?: string }
  | { action: "set_energy"; sectionId: string; level: number };
```

Execution steps:

1. Parse and validate the complete transaction.
2. Run domain constraints: bar bounds, known IDs, BPM range, collisions.
3. Create a history snapshot.
4. Apply all operations atomically.
5. Reschedule affected future audio events.
6. Animate changed clips and announce the result.

## 5. Library choices

### Foundation

| Concern | Choice | Reason |
|---|---|---|
| UI/runtime | React + TypeScript on the supplied vinext/Sites starter | Fast component iteration and a direct Build Week deployment path |
| Styling | CSS variables and CSS Grid | Playlist layout needs exact grid control without a component-system dependency |
| Audio | Tone.js | Musical transport, bar/beat scheduling, synths, effects, and Web Audio timing |
| MIDI | `@tonejs/midi` | Parse and encode MIDI using a Tone-friendly data model; add after core playback works |
| State | Zustand with Immer middleware | Small typed store, targeted subscriptions, and reversible immutable updates |
| Validation | Zod | Runtime validation for model tool arguments and persisted projects |
| Dragging | `@dnd-kit/core` | Pointer/touch/keyboard sensors and transform-based drag for timeline clips |
| IDs | `crypto.randomUUID()` | Built into modern browsers; no package required |
| Tests | Vitest + React Testing Library | Domain reducer, schema, and command tests; browser audio mocked |

Tone.Transport is the important audio abstraction: it schedules against the Web Audio clock and lets the app reason in bars and beats rather than wall-clock milliseconds. The UI must derive its playhead from transport position instead of maintaining a competing timer.

`@dnd-kit/core` is used only for pointer interaction. Clip positions remain numeric `startBar` values, and rendering uses CSS transforms during drag to avoid layout repainting. The committed result is snapped to the nearest allowed bar.

### Deliberately deferred libraries

- WaveSurfer.js: useful when real waveform/stem editing enters scope, unnecessary for MIDI-pattern MVP
- Web MIDI libraries: hardware input is outside the submission story
- Canvas timeline frameworks: DOM/CSS Grid is easier to make accessible and sufficient for the initial number of tracks
- Full DAW engines: too heavy and would obscure the GPT-5.6 interaction

## 6. Audio engine design

- One Tone.js `Transport` is the master clock.
- Each track owns an instrument/effect chain and a set of scheduled pattern events.
- Song position is expressed as ticks and converted to bars/beats for display.
- Arrangement edits clear and rebuild only future scheduled events.
- Muting uses track gain/mute, not deletion.
- Energy is a deterministic macro controlling known parameters such as velocity, pattern density, filter cutoff, and layer activation.
- All synth/sample assets must be original or clearly licensed for the public demo video.

## 7. Visual editor design

The Playlist uses a shared bar scale:

- `pixelsPerBar` controls zoom.
- Track rows and bar ruler share the same scroll container.
- Clip `left = startBar * pixelsPerBar`.
- Clip `width = lengthBars * pixelsPerBar`.
- Playhead `left = transportBars * pixelsPerBar`.
- Section bands sit behind clips and provide arrangement context.
- Manual drag calculates `deltaBars = round(deltaPixels / pixelsPerBar)` and dispatches the same `move_clip`/`move_section` domain command used by AI.

The visual language may evoke FL Studio's efficient Playlist workflow, but branding, icons, colors, and layout will be original.

## 8. GPT-5.6 request shape

Only compact musical state is sent:

```json
{
  "request": "副歌提前四小节，鼓更有力量",
  "project": {
    "version": 7,
    "bpm": 118,
    "sections": [
      { "id": "chorus-1", "kind": "chorus", "startBar": 12, "lengthBars": 8 }
    ],
    "tracks": [
      { "id": "drums", "enabled": true }
    ]
  }
}
```

The model receives definitions and examples for allowed tools. It must clarify requests that reference an unknown section, unsupported instrument, or contradictory operation. It does not receive raw audio.

## 9. Security and failure handling

- Standard OpenAI keys stay server-side.
- Model output is untrusted and always schema/domain validated.
- Commands have numerical bounds, including BPM and timeline length.
- A failed AI request leaves playback and project state untouched.
- The text interface remains available when microphone permission is denied.
- Realtime and GPT requests can be replaced with deterministic local fixtures for judging and offline development.

## 10. Delivery milestones

### Milestone 1 — local studio

- Playlist, transport, built-in song, mute, BPM, playhead, local command parser, undo

### Milestone 2 — manual arranging

- Clip selection, bar-snapped dragging, section movement, history, visual change highlights

### Milestone 3 — OpenAI path

- Realtime transcription, GPT-5.6 planner, Zod transaction validation, clarification UI

### Milestone 4 — submission

- Original demo composition, A/B flow, README, tests, deployment, three-minute video script

