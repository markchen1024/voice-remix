# AI × Editor interaction contract

## Product promise

Voice Remix turns a typed or spoken intent into an inspectable `Music Diff`. AI never mutates the project directly. A user can hear Current and Proposed from the same comparison point, choose operations, then commit or discard the complete transaction.

The demo edits imported stems and arrangement metadata; it does not claim to synthesize replacement audio. Every operation shown in the Diff must have an audible result.

## User flow

1. Type a command, or click the microphone to start an OpenAI Realtime push-to-talk turn.
2. Partial transcript text appears while the user speaks; clicking again commits the audio buffer.
3. Transport and proposal-control commands execute deterministically. Edit requests receive Editor Context and continue through GPT-5.6.
4. GPT returns constrained operations against real track and section IDs. Follow-ups refine the active proposal instead of stacking duplicate operations.
5. The app normalizes and validates the transaction without changing project history.
6. Current remains audible until the user chooses Proposed.
7. Proposed switches the one shared playback session at a deterministic comparison bar.
8. Apply selected—or the voice command “就这样”—commits one atomic history entry. Discard restores Current without a history entry.

## State machine

| State | Audio | Project/history | Allowed next actions |
| --- | --- | --- | --- |
| Idle | Current | unchanged | type, record, play, manual edit |
| Connecting | Current | unchanged | connect Realtime or use fallback |
| Recording | Current ducked by 12 dB | unchanged | stop and commit audio buffer |
| Transcribing | Current | unchanged | receive final transcript or surface error |
| Planning | Current | unchanged | wait or surface error |
| Review Current | Current | unchanged | Proposed, select operations, discard, apply |
| Review Proposed | Proposed | unchanged | Current, select operations, discard, apply |
| Committed | committed version | one history entry | undo, redo, new command |

## Engineering invariants

- Exactly one Tone context, one Transport, and one scheduled player bank may be active.
- Only `activateAudioProject` may switch an audible project; scheduling never starts playback by itself.
- A transition pauses once, updates arrangement and mixer state, seeks once, and starts at most once.
- Newer transitions invalidate older asynchronous transitions.
- Arrangement sections may not overlap. Earlier moves use ripple editing: trim the predecessor at the new boundary and shift later sections by the same delta. The scheduler also clips overlaps defensively.
- Track mute is applied after gain because Tone implements mute as `volume = -Infinity`.
- Section energy changes per-section playback gain and is part of the audio scheduling signature.
- The standard API key stays server-side. The browser receives only a short-lived Realtime client secret; request-based recordings are uploaded to `/api/transcribe` only when WebRTC is unavailable.
- Immediate transport commands never call GPT or mutate project history.
- Follow-up edits plan against the temporary Proposed project, then rebase one merged Diff against canonical state.
- AI failures, transcription failures, and playback failures are visible states. Local planning fallback must not hide which planner produced the Diff.

## Acceptance criteria

- Moving Final Chorus four bars earlier never produces overlapping playback.
- `Only keep bass and drums` leaves drums and bass players audible and mutes every other scheduled player.
- Repeated Current/Proposed clicks cannot create a second Transport start or stale player bank.
- Proposed never mutates project version or undo history.
- Applying a proposal creates exactly one undo step; discarding creates none.
- Voice capture visibly enters Recording and Transcribing states, produces a transcript, and automatically creates a Music Diff.
- Partial Realtime transcript text is visible before the turn completes.
- “播放最后一遍副歌”, “循环这一段”, and “暂停” control the Transport without creating a Music Diff.
- “鼓再强一点” refines the existing DRUMS gain operation; “就这样” commits it as one undo step.
- Every Diff operation is audible: move, mute/unmute, gain, and section energy.
