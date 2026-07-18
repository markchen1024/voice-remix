# Voice Remix

**Say the change. See the diff. Keep control.**

Voice Remix is a voice-first visual music arranger built for OpenAI Build Week 2026. It turns a natural-language request into a validated, inspectable music edit before changing the project. The browser then shows exactly which sections and stems will move, mute, or change gain, so the creator can accept only the parts they want.

Track: **Apps for Your Life**

## Why this exists

AI music generators make it easy to create a finished track, but intentionally revising that track is still difficult. Traditional DAWs offer exact control, but their timelines, routing, automation, and editing vocabulary are a steep learning curve for many creators.

Voice Remix sits between those two experiences. GPT-5.6 interprets creative intent, while deterministic application code owns the project state and audio controls. The model proposes; the user reviews; the editor executes.

## Featured demo

Enter or speak:

```text
最后一遍副歌提前 4 小节，鼓更强，但贝斯不要变
```

The request means: “Move the final chorus four bars earlier and make the drums stronger, but keep the bass unchanged.”

Voice Remix then:

1. Sends compact section and stem metadata to GPT-5.6 Sol through the Responses API.
2. Receives a Structured Output constrained to the supported music-edit schema.
3. Revalidates every target and numerical value against the current project.
4. Displays a Music Diff with independent `MOVE` and `GAIN` operations.
5. Marks `BASS` as protected and renders a proposed ghost clip on the timeline.
6. Lets the user deselect an operation, apply the remaining changes atomically, or discard everything.
7. Supports reliable Undo and Redo after the transaction is committed.

The canonical arrangement is never mutated while the Music Diff is only a proposal.

## What is working

- Five synchronized real audio stems in the browser
- Source-derived waveform peak envelopes rendered with Canvas
- Tone.js transport, playback, track mute, gain, BPM, and moving playhead
- Non-destructive section rescheduling that produces an audible multitrack rearrangement
- OpenAI Realtime transcription over browser WebRTC with live transcript deltas
- Push-to-talk capture with automatic music ducking and request-based transcription fallback
- GPT-5.6 Sol arrangement planning through the Responses API
- Editor Context grounding for playhead, selection, Current/Proposed, history, and active proposals
- Immediate voice transport commands for play, pause, seek, looping, A/B, Apply, Discard, Undo, and Redo
- Conversational refinement that merges follow-up requests into one clean Music Diff
- Zod-backed Structured Outputs and server-side domain validation
- Versioned `EditTransaction` proposals with stale-project protection
- Music Diff with per-operation selection, assumptions, and protected tracks
- Timeline ghost preview for proposed section moves
- A/B audio audition of selected proposal operations without changing project state
- Automatic audition seek to one bar before the earliest affected section
- Atomic Apply and Discard
- Undo/Redo history with branch invalidation after a new edit
- Versioned `.voice-remix.json` project export with source/destination section mapping
- Deterministic local planner when the API is unavailable

## Trust boundary

GPT-5.6 never receives raw audio and never edits an audio buffer. It receives only compact project metadata such as section IDs, bar positions, track IDs, mute state, and gain. Its response is treated as untrusted input.

Before a proposal reaches the UI, the server:

- parses it against a strict schema;
- rejects invented section and track IDs;
- clamps supported numerical values;
- removes changes to protected tracks;
- records exact before/after values; and
- returns `null` when no valid operation remains.

This separation is the core product idea: natural-language flexibility without surrendering deterministic control.

## Architecture

```text
Realtime voice or text request
        |
        v
WebRTC transcript / immediate command router
        |                         \
        |                          +--> Tone.js transport
        v
Editor Context + POST /api/plan-edit
        |
        v
GPT-5.6 Sol + Structured Outputs
        |
        v
Server normalization and project validation
        |
        v
Proposed EditTransaction (project unchanged)
        |
        +----> Music Diff + ghost timeline
        |
        v
Apply selected operations atomically
        |
        +----> Project history (Undo / Redo)
        |
        v
Tone.js playback + React visual editor
```

See [Architecture and library decisions](docs/03-architecture-and-libraries.md) for the detailed runtime boundaries.

## Run locally

Requirements:

- Node.js 22.13 or newer
- An OpenAI Platform API key for the live GPT-5.6 path

```bash
npm ci
```

Copy `.env.example` to `.env.local` and add the key:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-sol
```

Then run:

```bash
npm run dev
```

The API key remains server-side. Do not expose it through a `NEXT_PUBLIC_` variable or commit an `.env` file.

## Judge test path

The fastest test takes about one minute:

1. Start playback and mute/unmute a stem to confirm real multitrack audio.
2. Enter the featured compound request above.
3. Confirm that the Music Diff header says `GPT-5.6-SOL`.
4. Confirm there are two operations and `BASS` is protected.
5. Deselect the drum-gain operation.
6. Apply only the chorus move and inspect the timeline.
7. Use Undo, then Redo.
8. Repeat with `只保留贝斯和鼓` (“only keep bass and drums”).

If the API is unavailable, the header says `LOCAL` and the deterministic fallback still demonstrates the transaction and safety model.

## Validation

```bash
npm run lint
npm test
```

`npm test` builds the production application and runs domain tests for:

- AI plan normalization and protected targets
- unknown-target rejection
- deterministic compound and solo commands
- selective atomic application
- Undo/Redo history branching
- server rendering
- waveform duration and near-silent stem handling

## How Codex and GPT-5.6 were used

This repository was built collaboratively with Codex throughout Build Week, not generated in one pass.

Codex helped:

- research the available OpenAI voice and planning surfaces;
- turn the original concept into a scoped PRD and architecture;
- compare the product against generative music tools and DAWs;
- design and iterate the Suno-inspired visual editor;
- import and analyze real stems and generate accurate waveform envelopes;
- implement the transaction domain, Music Diff, ghost preview, API route, validation, and history;
- diagnose UI and interaction bugs from screenshots;
- add tests, documentation, and frequent milestone commits.

Key human product decisions included:

- positioning Voice Remix as an editor rather than another song generator;
- making every AI edit visible before execution;
- preserving named stems in compound requests;
- keeping a deterministic offline fallback for demo resilience;
- using real imported stems instead of synthetic placeholder audio; and
- prioritizing selective control and reversibility over a larger DAW feature set.

GPT-5.6 is used in two distinct ways:

1. **At runtime**, `gpt-5.6-sol` converts contextual music requests into strict structured plans.
2. **During development**, GPT-5.6 in Codex supported implementation, review, debugging, and documentation across the primary build thread.

The dated commit history beginning July 17 documents the Build Week implementation sequence.

## Build Week implementation evidence

| Milestone | Commit |
|---|---|
| First working studio prototype | `43ec38a` |
| Imported real stems | `1643ddc` |
| Source-accurate waveforms | `5afb78b` |
| Differentiated PRD | `47dfc78` |
| Inspectable Music Diff workflow | `2f149d9` |
| GPT-5.6 planner integration | `730590b` |
| Reliable Undo/Redo | `482b02a` |

## Sample media and third-party disclosure

The repository includes the demo arrangement **Neon Pulse Loop**, exported as stems from the entrant's Suno account. Browser playback uses compressed MP3 derivatives; waveform envelopes were calculated from the original WAV exports. Details are recorded in [the asset note](public/audio/neon-pulse-loop/README.md).

The entrant must confirm that their Suno plan and the generated track permit repository distribution, public demo playback, and use in the submission video before final submission. No Suno logos or copied interface assets are included.

Open-source dependencies and their licenses are recorded in `package-lock.json`. The repository license must be chosen by the entrant before making the repository public.

## Current limitations

- Section boundaries are initialized demo metadata, not automatic audio analysis.
- Section moves are audible during browser playback and redraw source-mapped waveforms, but do not render a new downloadable mix yet.
- Realtime voice requires WebRTC, microphone permission, and OpenAI API access; request-based transcription and text remain fallbacks.
- The local fallback supports a smaller command set than GPT-5.6.
- User upload, automatic stem separation, rendered mix download, and DAW export remain post-submission work.

## Project documents

- [Product requirements](docs/02-prd.md)
- [Architecture and libraries](docs/03-architecture-and-libraries.md)
- [Initial technical research](docs/01-technical-research.md)
- [Build Week submission checklist](docs/04-build-week-submission.md)
- [Three-minute demo plan](docs/05-demo-video.md)
