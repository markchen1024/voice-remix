# Voice Remix

Voice Remix is a voice-first visual music arranger for OpenAI Build Week. It combines a Fruity Loops-inspired multitrack Playlist with natural-language edits that remain visible, reversible, and manually adjustable.

## Current milestone

The first local studio includes:

- an original four-section, four-track arrangement
- Tone.js synthesis and synchronized transport
- colored clip timeline and moving playhead
- play, pause, restart, BPM and track mute controls
- section selection, energy control and bar nudging
- Chinese/English local command parsing
- browser speech-input prototype
- transaction history and Undo

GPT-5.6 planning and OpenAI Realtime transcription are the next milestone. The local parser keeps the UI and audio engine testable before API integration.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Production validation:

```bash
npm test
```

## Demo commands

- `副歌提前 4 小节`
- `鼓更有力量`
- `静音主旋律`
- `速度调到 126 BPM`
- `undo`

## Product and architecture

- [Product requirements](docs/02-prd.md)
- [Architecture and library decisions](docs/03-architecture-and-libraries.md)
- [Initial technical research](docs/01-technical-research.md)

## Build Week direction

Voice Remix targets **Apps for your life**. GPT-5.6 will turn contextual, compound music requests into validated edit transactions; Codex is used to build and document the complete application.

