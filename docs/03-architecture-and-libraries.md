# Voice Remix — Implemented Architecture and Library Decisions

> Updated: 2026-07-18
> Scope: the working Build Week submission, not future roadmap items

## 1. Architecture decision

Voice Remix separates model interpretation, domain validation, canonical project state, visualization, and audio playback. GPT-5.6 proposes a bounded transaction; deterministic application code decides whether that proposal is valid and applies it only after user confirmation.

```text
Browser speech recognition / text
                |
                v
        React command surface
                |
                v
       POST /api/plan-edit
                |
                v
 OpenAI Responses API (GPT-5.6 Sol)
                |
                v
 Zod Structured Output + domain normalization
                |
                v
       Proposed EditTransaction
           /              \
 Music Diff + ghost UI     deterministic local fallback
           |
           v
 Apply selected operations atomically
           |
     Project history
           |
     Tone.js + Canvas UI
```

## 2. Runtime components

### Browser application

`app/VoiceRemixStudio.tsx` owns the interactive studio:

- canonical in-memory `Project` state;
- voice/text command input;
- Music Diff proposal state;
- operation selection, Apply, and Discard;
- timeline, waveform, playhead, inspector, and history UI;
- synchronized Tone.js stem players; and
- mute, gain, tempo, playback, Undo, and Redo controls.

The browser never receives the standard OpenAI API key.

### Planner endpoint

`app/api/plan-edit/route.ts` accepts a request and compact project snapshot. It returns a proposed transaction or a bounded error. The endpoint:

- rejects missing or malformed inputs;
- caps user-request length;
- calls the server-only planner;
- returns no mutation when planning fails; and
- keeps failure details out of the public response.

### GPT-5.6 planner

`app/ai-planner.ts` uses the OpenAI JavaScript SDK, Responses API, Zod, and `zodTextFormat`.

The model receives:

- project version and total bars;
- BPM;
- section IDs, types, labels, bar positions, lengths, and energy;
- track IDs, labels, mute state, and gain; and
- the user's music-edit request.

It does not receive audio, waveform samples, MIDI, credentials, or history snapshots.

The production default is `gpt-5.6-sol` with low reasoning effort. The model name can be overridden server-side through `OPENAI_MODEL`.

### Domain transaction layer

`app/edit-transactions.ts` defines:

- `Project`, `Section`, and `Track`;
- the supported `EditOperation` union;
- `EditTransaction`;
- cloning and atomic application;
- the deterministic local planner; and
- operation descriptions used by the UI.

Supported operations in the submission are:

- `move_section`
- `set_track_enabled`
- `set_track_gain`
- `set_section_energy`

### Project history

`app/project-history.ts` implements a generic past/future history model. A new commit records the previous project and clears the future branch. Undo moves the current project into the future; Redo restores it. The UI derives button availability from both stacks.

## 3. Model-output validation

Structured Outputs guarantee the response shape, but project semantics are validated separately. `normalizeMusicEditPlan`:

1. checks every section ID against the live project;
2. checks every track ID against the supported track enum and project;
3. skips protected tracks;
4. clamps bar positions, gain, and energy;
5. drops no-op operations;
6. reconstructs trusted before values from the project rather than the model; and
7. returns no proposal when every candidate is invalid.

The client also checks `baseProjectVersion` immediately before applying a proposal. A stale Music Diff is discarded instead of being applied to a changed project.

## 4. Proposal and commit flow

```text
request
  -> plan
  -> validate
  -> proposal state
  -> user selects operations
  -> version check
  -> apply selected operations to a clone
  -> record previous project in history
  -> replace canonical project
```

Preview is intentionally non-mutating. Ghost clips are calculated from selected proposal operations and rendered above the canonical clips. A/B Audition builds a temporary project clone, schedules its selected operations for playback, and leaves the canonical project and history untouched. Switching back, changing the selection, or discarding restores canonical scheduling and mixer state.

## 5. Audio and waveform design

- Five shared `ToneAudioBuffer` sources feed section-level `Player` instances on one `Transport`.
- Each section preserves an immutable source-bar position and a mutable destination-bar position.
- Applying a section move reschedules the matching source region for every stem at the new destination, so the edit is audible without rewriting source files.
- Mute and gain are derived from canonical track state.
- The playhead reads transport time against the source duration and shared bar grid.
- Source-derived min/max peak envelopes are stored as JSON; Canvas applies the same source-to-destination section mapping as the audio scheduler.
- Near-silent FX is labelled rather than visually normalized into a misleading full waveform.
- Source audio remains unchanged; project operations are non-destructive schedule edits.

## 6. Implemented libraries

| Concern | Choice | Why |
|---|---|---|
| UI and routing | React 19, TypeScript, vinext | Supplied Build Week/Sites architecture with client and server routes |
| Deployment runtime | Vite, Cloudflare plugin, Sites adapter | Cloudflare Worker-compatible output |
| Audio | Tone.js | Synchronized musical transport and Web Audio playback |
| OpenAI | `openai` JavaScript SDK | Responses API and typed server integration |
| Validation | Zod | Structured Outputs schema and runtime parsing |
| Visualization | Canvas + CSS Grid | Accurate waveform drawing and shared bar-scale timeline |
| Tests | Node test runner | Zero-extra-runtime domain and render checks |

The working submission does not use Zustand, Immer, dnd-kit, Vitest, React Testing Library, or `@tonejs/midi`; those were considered during planning but deliberately not added to the MVP.

## 7. Failure handling

- Missing API key: return `503`; client uses the local planner.
- Model or network failure: project remains unchanged; client uses the local planner when possible.
- Unsupported request: show a clarification activity item.
- Unknown model targets: drop them during normalization.
- Stale project version: discard the proposal and request a new plan.
- Microphone unavailable: keep text input fully usable.
- Near-silent audio: label the stem explicitly.

## 8. Security boundaries

- API keys are server-only environment variables.
- `.env*` files are ignored except the empty `.env.example` template.
- Model outputs are never applied directly.
- The API accepts project metadata, not arbitrary code or audio uploads.
- User input is treated as data by the planner instruction.
- The response endpoint does not echo internal exception details.

## 9. Tests

The current suite verifies:

- AI plan normalization;
- protected-track enforcement;
- unknown-target rejection;
- deterministic compound requests;
- selective atomic application;
- solo/mute operations;
- Undo/Redo and future-branch clearing;
- server-rendered studio content;
- waveform resolution and source duration;
- near-silent waveform handling; and
- source-preserving section-to-playback scheduling.

`npm test` always performs a production build before running the tests.

## 10. Deliberately deferred

The submission does not claim these are implemented:

- OpenAI Realtime transcription;
- rendered mix download and destructive file rewriting;
- automatic section detection;
- user uploads or stem separation;
- MIDI editing or export;
- draggable clips;
- persistent accounts/projects; or
- deployed collaboration and sharing.

They remain product directions after the Build Week version is submitted.
