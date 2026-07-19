# Voice Remix — Demo Video Plan

Target length: **2:40–2:50**. The official limit is under three minutes. Record the working product first; add a short architecture/Codex overlay only after the end-to-end story is clear.

Rewrite the voiceover into your own speaking style. The lines below are prompts, not final submission copy.

## Storyboard

| Time | Screen action | Voiceover prompt |
|---|---|---|
| 0:00–0:15 | Open on the playing multitrack editor; quickly mute/unmute drums | Generative music can make a song, but revising one precisely is still hard. DAWs give control, but expect production expertise. |
| 0:15–0:30 | Show the five-stem project, switch briefly to the nine-stem vocal project, and flash the mapped-stem import panel before returning with **Judge demo** | Voice Remix starts from real audio: a full mix, one replacement stem, or a synchronized stem set. The creator keeps a visual editor and manual control. |
| 0:30–0:47 | Click the microphone and say `Move the final chorus 4 bars earlier and make the drums 20% harder, but keep the bass unchanged`; let the live transcript remain visible briefly | OpenAI Realtime streams the transcript while the music ducks instead of stopping. The editor sends GPT-5.6 the current playhead, selection, and project context. |
| 0:47–1:10 | Hold on the Music Diff; point to `GPT-5.6-SOL`, MOVE, GAIN, and protected BASS | GPT-5.6 receives compact project context and returns Structured Output. The server validates every target and rebuilds trusted before/after values. |
| 1:10–1:28 | Show ghost chorus position; deselect the drum operation | Nothing has changed yet. The creator can inspect the ghost preview and reject one part of a compound request. |
| 1:28–1:45 | Apply only the chorus move; then Undo and Redo | Selected operations commit atomically, and every committed edit remains reversible. |
| 1:45–2:02 | With a DRUMS gain proposal open, say `Push the drums a little harder`, then `Apply it` | The follow-up refines the same Diff instead of stacking duplicates; the final voice command commits one reversible transaction. |
| 2:02–2:22 | Cut to the architecture diagram or a tight code/README overlay | The model never receives audio or edits buffers. Deterministic TypeScript owns the project; Tone.js owns synchronized playback. |
| 2:22–2:38 | Show a compact Git log/commit montage and return to the app | Codex was used throughout research, interface iteration, implementation, tests, and debugging, with incremental Build Week commits. |
| 2:38–2:48 | End on the studio and tagline | “Say the change. See the diff. Keep control.” |

## Recording setup

- Capture at 1920×1080 or higher, 16:9, with browser zoom set so the Music Diff text is legible.
- Use a fresh app load and a signed-out/non-sensitive browser profile.
- Close notifications and hide bookmarks, API consoles, local paths, and account information.
- Preload the track, then begin screen recording after browser audio has been unlocked by a click.
- Use headphones to prevent playback leaking into narration or voice recognition.
- Rehearse microphone permission before recording. If Realtime is unavailable, use the visible bounded-transcription fallback or text and disclose the fallback honestly.
- Keep music under the voiceover; check both on laptop speakers and headphones.
- Use only the demo track after confirming public playback/video rights under the entrant's Suno plan.
- Upload the finished video to YouTube as **Public or Unlisted** and verify it while signed out. Private videos are not eligible.

## Demo rehearsal checkpoints

Before recording, verify:

1. Both the five-stem and nine-stem demo projects load and play.
2. The import panel visibly includes mapped synchronized-stem project creation.
3. The proposal source reads `GPT-5.6-SOL`.
4. The featured request creates exactly a chorus move and drum gain operation.
5. `BASS` is displayed as protected.
6. The ghost clip appears before Apply.
7. Deselecting one operation changes what Apply commits.
8. Undo and Redo both restore the expected timeline state.
9. Partial transcript text appears before the voice turn completes.
10. `Push the drums a little harder` leaves one rebased DRUMS gain operation, and `Apply it` commits it.
11. No fallback/error messages are visible in the final take.

## Resilient recording plan

Record the critical live API sequence as a clean continuous take while it is working. If the API later becomes unavailable, reuse that genuine footage rather than presenting the deterministic `LOCAL` fallback as GPT-5.6. The fallback can be mentioned as reliability engineering, but the video must clearly show at least one real GPT-5.6 interaction.

## Final edit checklist

- [ ] Duration is less than 3:00.
- [ ] The first 15 seconds make the problem understandable without prior context.
- [ ] Real product interaction occupies most of the video.
- [ ] GPT-5.6 and Codex usage are both explicitly explained.
- [ ] Text and cursor remain readable on a laptop screen.
- [ ] Voiceover is clear and the track is not overpowering it.
- [ ] No secrets, private information, or unlicensed visuals appear.
- [ ] YouTube processing has completed at 1080p and the public link works while signed out.
