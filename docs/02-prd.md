# Voice Remix — Product Requirements Document

> Version: 2.0
>
> Date: 2026-07-18
>
> Status: Build Week MVP
>
> Product promise: **Say the change. See the diff. Hear it before you commit.**

## 1. Product summary

Voice Remix is a source-preserving music arrangement copilot. A user speaks or types a musical intention, GPT-5.6 turns it into a structured and inspectable edit transaction, and the browser previews the exact changes on a multitrack timeline before anything is committed.

Voice Remix is not a song generator and does not attempt to replace a professional DAW. It sits between generative music products and traditional audio editors: users can bring stems from Suno or another source, make intentional arrangement edits without production expertise, compare the result with the original, and selectively accept or undo individual operations.

## 2. Build Week positioning

- Challenge: OpenAI Build Week 2026
- Track: **Apps for your life**
- Primary audience: creators with musical taste but limited DAW experience
- Secondary audience: musicians, video creators, podcasters, and producers sketching arrangements
- GPT-5.6 role: convert contextual and compound requests into validated `EditTransaction` objects
- Realtime role: continuous voice input and conversational follow-ups
- Codex role: build, test, document, and prepare the submission
- Core metaphor: **Codex + Git for music arrangements**

## 3. Problem

Generative music products make it easy to create a finished song, but correcting or intentionally restructuring that song remains difficult. Traditional DAWs provide exact control but expose tracks, clips, automation, routing, effects, and time grids that are intimidating to non-producers.

Conversational music tools reduce the input complexity, but often introduce a new trust problem:

1. The user cannot see exactly what the AI is about to change.
2. A compound prompt may alter more of the song than intended.
3. Regeneration can change material the user wanted to preserve.
4. Undo is normally linear and removes the whole action rather than one unwanted part.
5. Voice commands applied during playback may happen at musically incorrect times.

Users need a workflow where AI understands creative intent while deterministic software preserves control.

## 4. Product thesis

The winning interaction is not “prompt and hope.” It is:

```text
Speak intent
  → inspect Music Diff
  → preview visually and audibly
  → accept all or selected operations
  → commit as a semantic edit
  → refine by voice or mouse
```

The model proposes; the audio engine executes. Every mutation is visible, bounded, explainable, and reversible.

## 5. Differentiation

### 5.1 Music Diff before execution

Every AI request produces a proposed transaction before changing canonical project state. The proposal shows:

- affected section and tracks
- original and proposed bar positions
- gain, mute, energy, or structure changes
- unchanged or explicitly protected material
- duration impact
- warnings, conflicts, and assumptions

The timeline renders the original state and proposed state simultaneously using a ghost preview.

### 5.2 Selective apply and semantic undo

A compound request is decomposed into independently selectable operations. The user can apply only part of the plan or later say:

> Keep the chorus move, but undo the drum boost.

This differs from a normal linear undo stack: history stores meaningful operations with stable IDs and dependencies.

### 5.3 Source-preserving editing

Voice Remix does not regenerate untouched audio. A move, mute, gain, or repeat operation references existing source regions. The UI clearly distinguishes deterministic edits from any future generative operation.

### 5.4 Beat-synchronous live commands

Commands issued during playback can be queued for the next bar or section boundary. The user sees where the operation will execute:

```text
Queued for Bar 45 · Final Chorus
SOLO Drums + Bass
```

### 5.5 Voice and manual editing share one transaction model

Dragging a section, clicking Mute, accepting a GPT plan, and issuing a voice command all dispatch the same domain operations. AI edits remain manually adjustable and manual edits remain explainable in history.

## 6. Target users

### Primary persona — taste-rich, tool-light creator

- Can describe the desired result: “bring the hook in sooner”
- Does not know how to split clips, align stems, or automate gain
- Wants control without learning a full DAW
- Values preservation of the original song

### Secondary persona — producer sketching alternatives

- Understands arrangement and stems
- Wants to test structural ideas quickly
- Expects bar-accurate operations, A/B comparison, and exportable results

### Accessibility persona — hands-busy or mobility-limited musician

- Needs voice-first transport and editing
- Benefits from confirmations and spoken/visual descriptions of changes
- Must be able to use all core features without precise pointer interaction

## 7. Current product baseline

The repository already includes:

- a polished browser-based multitrack editor
- a real Suno-generated song: **Neon Pulse Loop**
- 118 BPM, C minor, 119.4 seconds, approximately 59 bars
- five synchronized stems: Drums, Percussion, Bass, Synth, FX
- four MIDI exports: Drums, Percussion, Bass, Synth
- per-pixel waveform peak envelopes rendered on Canvas
- real stem playback and track mute controls
- browser-local full-song import and synchronized individual-stem replacement
- section selection, energy control, local command parsing, and undo
- OpenAI Realtime voice conversation with request-based transcription fallback

The FX stem is effectively silent and must be labelled as such rather than visually normalized.

## 8. MVP scope

### P0 — submission-critical

#### A. Structured edit transactions

Supported operations:

- move a section by bars
- mute, unmute, or solo one or more tracks
- set track gain for a section or whole track
- set section energy metadata
- duplicate or remove a section
- preserve a named track or section from a compound edit

Every operation includes stable IDs, before/after values, and a human-readable explanation.

#### B. Music Diff panel

- transcript/request displayed separately from the plan
- operation list with individual checkboxes
- affected regions highlighted on the timeline
- assumptions and validation errors shown before Apply
- `Apply selected` and `Discard` actions

#### C. Ghost timeline preview

- original clips remain visible
- moved/duplicated clips appear at proposed positions
- removed regions use a distinct deletion treatment
- changed tracks and sections are visually connected to plan operations
- preview never mutates canonical project state

#### D. Original / Proposed A/B

- user can switch between Original and Proposed before committing
- switching preserves current playback position when possible
- proposed playback uses a temporary derived project
- discarding the proposal returns to the unchanged project

#### E. Semantic history

- each accepted transaction becomes one history item
- history displays its component operations
- user can undo the whole transaction
- user can selectively revert one compatible operation

#### F. GPT-5.6 planner

- compact project context sent to the server
- response constrained to the allowed operation schema
- unknown targets and contradictory requests trigger clarification
- model output is validated before preview
- deterministic fixtures remain available for demo resilience

### Implemented P0 — realtime conversational control

#### G. Realtime voice session

- low-latency transcript updates over WebRTC
- follow-up commands understand playhead, selection, active proposal, and history availability
- transport and proposal-control commands bypass the planner
- follow-up edits merge into one canonical Music Diff
- microphone or Realtime failure falls back to bounded transcription and text

### P1 — high-impact if time permits

#### H. Quantized execution

- user can choose `Now`, `Next bar`, or `Next section`
- queued operation is visible on the timeline
- playback applies the committed operation at the selected musical boundary
- user can cancel a queued operation before execution

### P2 — post-submission

- persistent producer preference memory
- arrangement branches and cross-branch merge
- persistent imported projects and automated stem/section analysis
- automatic section detection and confidence display
- video/voice-over-aware arrangements
- DAW project export and plugin integration
- collaborative review links

## 9. Explicit non-goals for the submission

- competing with Suno or Udio on full-song generation
- building our own stem-separation model
- destructive waveform editing
- note-level piano-roll editing
- complete mixer, plugin host, or mastering suite
- automatic publishing or commercial licensing decisions
- claiming section labels are model-detected when they are manually initialized
- hiding generative changes behind deterministic operation labels

## 10. Core user journeys

### Journey A — inspect and partially apply a compound edit

1. User plays Neon Pulse Loop.
2. User says: “Move the final chorus four bars earlier and make the drums stronger, but keep the bass unchanged.”
3. Transcript appears.
4. GPT-5.6 returns a validated transaction.
5. Music Diff lists three operations and one preservation constraint.
6. Timeline shows the chorus at its old and proposed positions.
7. User A/B previews Original and Proposed.
8. User disables the drum operation.
9. User applies only the chorus move.
10. History records a semantic commit containing one accepted operation.

### Journey B — conversational selective undo

1. User applies a compound edit.
2. User says: “Keep the structure, but undo the drum change.”
3. The planner resolves “the drum change” against recent semantic history.
4. A revert proposal is shown.
5. User confirms and only that operation is reversed.

### Journey C — live quantized edit

1. Music is playing during the second verse.
2. User says: “At the next chorus, only keep drums and bass.”
3. The plan is validated and queued for the detected Final Chorus boundary.
4. Timeline displays the queued operation marker.
5. The engine applies the committed mute states on the first beat of the section.

## 11. Interface requirements

### Command surface

- microphone, transcript, text fallback, and listening state
- clear separation between the user's words and GPT's interpretation
- suggested commands that demonstrate differentiation rather than basic transport

### Music Diff drawer

- concise summary at the top
- one card per operation
- checkbox, target, before/after, explanation, and status
- warnings and protected elements
- Apply selected, Discard, and A/B controls

### Timeline

- accurate stem waveform envelopes
- bar ruler and section labels
- selected, affected, protected, proposed, and queued visual states
- ghost clips never intercept manual editing
- playhead remains visible while previewing either version

### History

- transaction title and timestamp
- expandable component operations
- full undo and compatible selective revert
- distinguish AI, voice, and manual origin without changing semantics

### Accessibility

- all operations keyboard reachable
- controls expose accessible names and states
- color is never the only indicator of change
- reduced-motion mode avoids large timeline animations
- text input remains available when speech recognition is unavailable

## 12. Domain requirements

```ts
type EditTransaction = {
  id: string;
  baseProjectVersion: number;
  summary: string;
  assumptions: string[];
  operations: EditOperation[];
  status: "proposed" | "committed" | "discarded" | "reverted";
};

type EditOperation = {
  id: string;
  action:
    | "move_section"
    | "set_track_enabled"
    | "set_track_gain"
    | "set_section_energy"
    | "duplicate_section"
    | "remove_section";
  targetId: string;
  before: unknown;
  after: unknown;
  explanation: string;
  selected: boolean;
  dependsOn?: string[];
};
```

Domain rules:

1. A proposal is derived from but cannot mutate the canonical project.
2. `baseProjectVersion` must match before commit.
3. All target IDs must exist.
4. Bar positions must remain within project bounds.
5. Selected operations are validated together for collisions and dependencies.
6. A compound commit is atomic.
7. Selective revert is rejected when later operations depend on the target operation.
8. Audio not referenced by an accepted operation remains unchanged.

## 13. Functional acceptance criteria

- A featured compound request creates a visible plan without changing playback state.
- Ghost clips accurately reflect every proposed structural operation.
- Discarding a proposal leaves project state and history unchanged.
- Applying a subset commits only checked operations.
- Original/Proposed switching produces an audible or structurally verifiable difference.
- One-step undo restores the complete pre-transaction state.
- Selective revert removes only the chosen compatible operation.
- Invalid GPT output cannot mutate the project.
- A stale proposal is rejected after project version changes.
- Track mute affects both real audio and timeline presentation.
- The application remains usable with deterministic fixtures when the API is unavailable.
- The complete demo works with text input if microphone permission is denied.

## 14. Success metrics

### Demo metrics

- first real stem playback within 10 seconds
- voice/text request to visible Music Diff within 3 seconds under normal conditions
- A/B switch response within 300 ms after audio is loaded
- committed deterministic edit audible within 500 ms or at the selected quantized boundary
- three featured requests complete without hidden state changes
- a first-time viewer can explain what changed by looking at the diff

### Product signal

- user trusts the tool enough to commit after inspecting the preview
- user can reject one part of a compound edit without rewriting the prompt
- user can recover an unwanted change without losing accepted work
- user understands the difference between deterministic editing and generation

## 15. Three-minute submission story

1. **Problem:** AI music is easy to generate but difficult to intentionally revise.
2. **Import:** show five real Neon Pulse Loop stems and accurate waveforms.
3. **Request:** say “Move the final chorus four bars earlier and make the drums stronger, but keep the bass unchanged.”
4. **Understand:** show live transcript and GPT-5.6 structured transaction.
5. **Inspect:** show Music Diff and ghost timeline.
6. **Compare:** A/B Original and Proposed.
7. **Control:** deselect the drum boost and apply only the structure change.
8. **Follow up:** say “At the next chorus, only keep drums and bass.”
9. **Execute:** show the queued marker and beat-synchronous change.
10. **Trust:** selectively undo one operation from semantic history.
11. **Close:** “Say the change. See the diff. Hear it before you commit.”

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Stem separation artifacts | Audio may sound imperfect | Treat imported stems as user material; do not claim separation quality |
| Incorrect section boundaries | Structural edits target the wrong region | Use explicit current labels and expose manual correction; add confidence later |
| GPT returns unsupported operations | Unsafe or confusing edit | Strict schema validation and clarification flow |
| Preview audio is expensive to rebuild | A/B latency harms demo | Derive temporary state and reuse loaded buffers |
| Moving sections creates gaps or overlaps | Invalid arrangement | Collision validation and visible warnings |
| Realtime network failure | Voice demo fails | Text fallback and deterministic fixture mode |
| Feature scope grows into a DAW | Submission becomes unfinished | Prioritize Diff, selective apply, A/B, and semantic history only |

## 17. Delivery milestones

### Milestone 1 — transaction foundation

- versioned project model
- typed operations and validation
- proposal state separate from canonical state
- deterministic featured-command fixtures

### Milestone 2 — visible trust layer

- Music Diff drawer
- ghost timeline
- individual operation selection
- Apply and Discard

### Milestone 3 — audible comparison and history

- Original/Proposed A/B
- atomic commit
- semantic history
- full and selective revert

### Milestone 4 — OpenAI integration

- GPT-5.6 planner endpoint
- clarification handling
- Realtime voice session
- quantized execution if stable

### Milestone 5 — submission

- resilient demo fixtures
- final UX and accessibility pass
- architecture documentation
- test coverage
- three-minute video and submission copy
