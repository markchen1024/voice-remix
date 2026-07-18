# AI × Editor interaction contract

## Product promise

Voice Remix turns a typed or spoken intent into an inspectable `Music Diff`. AI never mutates the project directly. A user can hear Current and Proposed from the same comparison point, choose operations, then commit or discard the complete transaction.

The demo edits imported stems and arrangement metadata; it does not claim to synthesize replacement audio. Every operation shown in the Diff must have an audible result.

## User flow

1. Type a command, or click the microphone, speak, and click again.
2. Voice audio is transcribed by OpenAI and passed through the same planner as typed text.
3. GPT returns constrained operations against real track and section IDs.
4. The app normalizes and validates the transaction without changing project history.
5. Current remains audible until the user chooses Proposed.
6. Proposed switches the one shared playback session at a deterministic comparison bar.
7. Apply selected commits one atomic history entry. Discard restores Current without a history entry.

## State machine

| State | Audio | Project/history | Allowed next actions |
| --- | --- | --- | --- |
| Idle | Current | unchanged | type, record, play, manual edit |
| Recording | paused | unchanged | stop recording |
| Transcribing | paused | unchanged | wait or surface error |
| Planning | Current or paused | unchanged | wait or surface error |
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
- Voice recordings and the standard API key stay server-side; the browser uploads only the captured command audio to `/api/transcribe`.
- AI failures, transcription failures, and playback failures are visible states. Local planning fallback must not hide which planner produced the Diff.

## Acceptance criteria

- Moving Final Chorus four bars earlier never produces overlapping playback.
- `Only keep bass and drums` leaves drums and bass players audible and mutes every other scheduled player.
- Repeated Current/Proposed clicks cannot create a second Transport start or stale player bank.
- Proposed never mutates project version or undo history.
- Applying a proposal creates exactly one undo step; discarding creates none.
- Voice capture visibly enters Recording and Transcribing states, produces a transcript, and automatically creates a Music Diff.
- Every Diff operation is audible: move, mute/unmute, gain, and section energy.
