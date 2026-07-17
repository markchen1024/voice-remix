# Voice Remix

Voice Remix is a voice-first visual music arranger for OpenAI Build Week. It combines a Fruity Loops-inspired multitrack Playlist with natural-language edits that remain visible, reversible, and manually adjustable.

## Current milestone

The current studio includes:

- five imported Suno stems with source-accurate waveform envelopes
- Tone.js synchronized multitrack playback
- colored clip timeline and moving playhead
- play, pause, restart, BPM and track mute controls
- section selection, energy control and bar nudging
- GPT-5.6 Sol planning through the Responses API and Structured Outputs
- inspectable Music Diff transactions with protected tracks and Ghost Preview
- Chinese/English local planner fallback when the API is unavailable
- browser speech-input prototype
- transaction history and Undo

OpenAI Realtime transcription and actual audio-region rendering are the next milestones.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm ci
```

Copy `.env.example` to `.env.local` and add an OpenAI API key to enable GPT-5.6 planning. Without a key, the deterministic local planner remains available.

```bash
npm run dev
```

Production validation:

```bash
npm test
```

## Demo commands

- `最后一遍副歌提前 4 小节，鼓更强，但贝斯不要变`
- `静音主旋律`
- `只保留贝斯和鼓`
- `undo`

## Product and architecture

- [Product requirements](docs/02-prd.md)
- [Architecture and library decisions](docs/03-architecture-and-libraries.md)
- [Initial technical research](docs/01-technical-research.md)

## Build Week direction

Voice Remix targets **Apps for your life**. GPT-5.6 turns contextual, compound music requests into validated edit transactions; Codex is used throughout product research, architecture, implementation, testing, and documentation.
