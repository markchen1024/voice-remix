# Voice Remix — Demo Production Script

Target runtime: **2:35–2:50**. Hard stop: **2:55**, leaving five seconds of safety below the three-minute submission limit.

This is the production-ready English script. Record the product footage in short, clean takes and add narration afterward. The only live spoken line should be the featured editing request, so the video visibly proves the voice workflow.

## Capture manifest

| File | Target length | Capture |
|---|---:|---|
| `01-problem-and-playback.mp4` | 15s | Start on the five-stem editor, play the song, mute and restore one stem. |
| `02-real-audio-import.mp4` | 18s | Open Import audio, show the full-mix, replacement-stem, and synchronized-stem options, then switch to the nine-stem project. |
| `03-live-voice-request.mp4` | 22s | Return to Neon Pulse Loop, start playback, press Talk, and speak the featured request. Keep the partial transcript visible. |
| `04-music-diff.mp4` | 28s | Hold on `GPT-5.6-SOL`, MOVE, GAIN, protected BASS, and the proposed ghost clip. Toggle Current and Proposed once. |
| `05-selective-apply.mp4` | 24s | Deselect the drum gain, apply only the chorus move, then Undo and Redo. |
| `06-follow-up-and-export.mp4` | 22s | Ask to push the drums harder, use `Apply it`, and briefly open Export. |
| `07-architecture.mp4` | 22s | Pan over the README architecture diagram and one short Structured Output/code view. Do not show secrets or terminals containing environment variables. |
| `08-codex-and-close.mp4` | 22s | Show the dated commit history, briefly show the primary Codex build task, then return to the product and tagline. |

Record two clean takes of files 03–06 while the live GPT-5.6 path is working. Keep the best continuous API sequence as evidence even if the service later becomes unavailable.

## Final English narration

### 0:00–0:15 — Problem

> AI can generate a finished song in seconds. But making one precise revision still means regenerating the track or learning a complex DAW. Voice Remix makes music revision conversational, visible, and reversible.

### 0:15–0:33 — Real audio and manual control

> It starts with real audio. I can import a complete mix, replace one stem, or load a synchronized stem set. These two projects use five-stem electronic and nine-stem vocal arrangements, with real waveforms and manual track controls.

### 0:33–0:55 — Voice interaction

Narrator:

> I press Talk. Playback pauses at the current position, so Voice Remix hears my instruction clearly.

Speak this line live into the product:

> Move the final chorus four bars earlier and make the drums twenty percent harder, but keep the bass unchanged.

Narrator:

> Realtime transcription captures the request, then playback resumes from the same position.

### 0:55–1:22 — GPT-5.6 Music Diff

> GPT-5.6 receives compact editor context: the playhead, selected section, stems, and current arrangement. It returns a structured plan, not edited audio. The server validates every target and rebuilds trusted before-and-after values. Here, the final chorus moves, the drums gain energy, and bass is explicitly protected.

### 1:22–1:47 — Preview, select, apply

> Nothing has changed yet. I can hear Current versus Proposed, inspect the ghost position on the timeline, and reject one part of the request. I will remove the drum change and apply only the chorus move. The edit commits atomically, and Undo and Redo remain available.

### 1:47–2:08 — Conversational refinement and export

> Follow-up commands refine the same proposal instead of stacking contradictory edits. I can say, “Push the drums a little harder,” then “Apply it.” Voice Remix keeps the editor, audio engine, history, and export synchronized.

### 2:08–2:31 — Technical boundary

> GPT-5.6 never receives the raw song and never mutates an audio buffer. Deterministic TypeScript owns project state and validation, while Tone.js owns synchronized playback. This boundary gives creators natural-language flexibility without giving up predictable control.

### 2:31–2:50 — Codex and close

> Codex was my build partner throughout the week: researching the available voice surfaces, shaping the product architecture, implementing the multitrack engine and Music Diff, diagnosing interaction bugs from real screenshots, and adding regression tests through frequent commits. Voice Remix: say the change, see the diff, keep control.

Approximate narration length: **330 words**, including the live request. At a clear, slightly brisk product-demo pace, this leaves room for musical pauses and interface actions.

## OpenAI Speech settings

- Voice: `cedar`
- Output: WAV
- Speed: `1.0`
- Disclosure: add `AI-generated narration using OpenAI Speech` to the YouTube description or closing credits.
- Generate each narration section as a separate WAV file so timing changes do not require regenerating the whole voiceover.

Instruction spec:

```text
Voice Affect: Confident and composed, like a music product specialist.
Tone: Clear, helpful, and technically credible.
Pacing: Steady and slightly brisk, with clean pauses between ideas.
Pronunciation: Enunciate G-P-T five point six, Codex, TypeScript, and Tone dot J-S.
Emphasis: Stress conversational, visible, reversible, Current, Proposed, and keep control.
Delivery: Natural product-demo cadence; informative, never theatrical or salesy.
```

## OBS capture settings

- Canvas and output: `1920 × 1080`, 30 FPS.
- Capture the browser window, not the entire desktop.
- Use the deployed Vercel URL in the final footage instead of `localhost`.
- Hide bookmarks, notifications, account menus, API consoles, and local file paths.
- Keep the cursor visible and move it deliberately; do not circle UI elements repeatedly.
- Record browser/system audio on its own track. Aim for peaks around `-12 dB` during product-only moments.
- Record the live microphone command on a separate track. Use headphones to avoid feedback.
- Add narration after capture. Duck product music to approximately `-24 to -20 dB` under narration, then briefly restore it for audible A/B moments.
- Leave one second of stillness at the beginning and end of every clip for editing handles.

## Recording-day checklist

- [ ] Vercel build matches the tested local commit.
- [ ] Browser zoom makes Music Diff labels readable at 1080p.
- [ ] Neon Pulse Loop loads first and both demo projects play.
- [ ] Microphone permission and Realtime transcription are already verified.
- [ ] The proposal source visibly reads `GPT-5.6-SOL`, not `LOCAL`.
- [ ] The featured request produces MOVE, GAIN, and protected BASS.
- [ ] Current/Proposed A/B, selective Apply, Undo, Redo, and Export work in rehearsal.
- [ ] No secrets or personal notifications are visible.
- [ ] The entrant has confirmed public video rights for the included demo music.
- [ ] Final upload is a public YouTube video and plays at 1080p while signed out.
