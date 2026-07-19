# Voice Remix demo narration

AI-generated English narration for the Build Week demo video.

## Generation settings

- Model: `gpt-4o-mini-tts-2025-12-15`
- Voice: `cedar`
- Format: WAV, 24 kHz, 16-bit mono PCM
- Speed: `1.0`
- Total generated narration: **131.4 seconds**
- QA: mean levels range from `-24.7 dB` to `-21.8 dB`; the highest measured peak is `-1.2 dB`, with no clipping
- Canonical text and shot timing: [`docs/07-demo-production-script.md`](../../docs/07-demo-production-script.md)

Voice direction:

```text
Voice Affect: Confident and composed, like a music product specialist.
Tone: Clear, helpful, and technically credible.
Pacing: Steady and slightly brisk, with clean pauses between ideas.
Pronunciation: Enunciate G-P-T five point six, Codex, TypeScript, and Tone dot J-S.
Emphasis: Stress conversational, visible, reversible, Current, Proposed, and keep control.
Delivery: Natural product-demo cadence; informative, never theatrical or salesy.
```

## Files

| File | Duration | Use |
|---|---:|---|
| `01-problem.wav` | 14.70s | Problem statement |
| `02-real-audio.wav` | 13.95s | Import and real-audio projects |
| `03-voice-intro.wav` | 5.80s | Lead-in before the live Talk request |
| `04-after-live-request.wav` | 5.65s | Realtime transcription explanation after the live request |
| `05-music-diff.wav` | 22.35s | GPT-5.6 Music Diff and validation |
| `06-preview-apply.wav` | 17.40s | Current/Proposed, selective Apply, Undo, and Redo |
| `07-follow-up-export.wav` | 14.15s | Conversational refinement and export |
| `08-technical-boundary.wav` | 17.50s | Runtime architecture and trust boundary |
| `09-codex-close.wav` | 19.85s | Codex build story and closing tagline |

The third video scene intentionally uses two narration files. Insert the entrant's live spoken editing request between files 03 and 04.

## Disclosure

Add this line to the YouTube description or closing credits:

> AI-generated narration using OpenAI Speech.
