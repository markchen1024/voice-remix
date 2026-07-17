# Voice Remix — Product Requirements Document

## 1. Product summary

Voice Remix is a browser-based, AI-assisted music arranger. A user can describe an edit in natural language, see the proposed changes as an editable plan, and immediately hear and inspect the result on a visual multitrack timeline.

The product is not an AI song generator or a full DAW. Its first job is to make common arrangement edits approachable for people who can describe what they want but do not know a professional music-production interface.

## 2. Build Week positioning

- Track: **Apps for your life**
- Audience: creators, musicians, video makers, podcasters, and music learners
- GPT-5.6 role: interpret contextual and compound editing requests into validated arrangement operations
- Codex role: build, test, and document the product; retain the primary `/feedback` session ID for submission
- Product promise: **Say the change. See the arrangement. Shape it by hand.**

## 3. Problem

Music arrangement tools expose powerful controls but assume knowledge of tracks, clips, bars, sections, automation, and mixing. Current generative music tools often replace the user's material instead of helping the user make intentional, reversible edits.

Users need a middle ground:

1. Express intent conversationally.
2. Understand exactly what the AI plans to change.
3. Hear the result immediately.
4. Continue adjusting it manually.
5. Undo any operation safely.

## 4. Target user

### Primary persona

A creator with musical taste but limited production experience. They understand phrases such as “bring the chorus in earlier” or “make the ending calmer,” but may not know how to perform those edits in a DAW.

### Secondary persona

A musician or producer who wants a fast arrangement sketchpad before moving work into a full DAW.

## 5. Product principles

1. **Visible, not magical** — every AI action appears on the timeline and in an operation list.
2. **AI proposes; the engine executes** — the model never manipulates audio directly.
3. **Voice and mouse are equal inputs** — anything changed by voice can be refined manually.
4. **Reversible by default** — compound edits are applied as one undoable transaction.
5. **Musical constraints beat unlimited generation** — the MVP uses known sections, tracks, presets, and bar-aligned clips.

## 6. MVP scope

### Included

- One original built-in song with Intro, Verse, Chorus, and Outro
- Four editable tracks: Drums, Bass, Chords, and Lead
- FL Studio/Fruity Loops-inspired Playlist view
- Bar ruler, playhead, colored clips, track headers, mute controls
- Play, pause, restart, BPM control, current bar display
- Natural-language command input
- Browser speech-input prototype, with an upgrade path to OpenAI Realtime transcription
- Structured edit-plan preview
- Operations:
  - move a section
  - change tempo
  - mute or unmute a track
  - add a preset layer
  - change section energy
  - undo and redo
- Manual clip movement snapped to whole bars
- Before/after operation history
- Responsive desktop-first layout

### Explicitly excluded

- Editing arbitrary commercial MP3 files
- Stem separation
- Vocal removal
- Waveform-level destructive editing
- AI-generated full songs
- Free-form MIDI note generation
- Piano roll and mixer automation in the first milestone
- User accounts, collaboration, and cloud project persistence

## 7. Core user flow

1. User opens the studio and presses Play.
2. The demo arrangement plays while the playhead moves across the timeline.
3. User says or types: “Move the chorus four bars earlier and make the drums stronger.”
4. The transcript appears immediately.
5. GPT-5.6 returns a short explanation and a validated list of operations.
6. The timeline previews affected clips.
7. The operations are applied as one transaction.
8. Playback continues from the updated arrangement.
9. User drags the chorus or changes a track manually.
10. User can undo either the AI transaction or manual adjustment.

## 8. Interface requirements

### Studio header

- Product identity and status
- Play/pause and return-to-start controls
- BPM control
- Current bar and total bars
- Undo/redo

### Playlist

- Bars run horizontally; tracks run vertically
- Section background bands show Intro, Verse, Chorus, and Outro
- Each clip shows name, pattern density, and active/muted state
- Grid lines distinguish bars and four-bar groups
- Playhead remains visible during playback
- Clips can be selected and dragged with bar snapping
- Track headers contain instrument identity, mute, and level

### Command dock

- Text field and microphone button
- Suggested commands for first-time users
- Transcript and “AI plan” separated visually
- Applied operations show human-readable descriptions
- Invalid or ambiguous requests ask for clarification instead of guessing

## 9. Functional acceptance criteria

- Playback begins only after a user gesture and remains synchronized with the visual playhead.
- Changing BPM affects subsequent scheduling without reloading the page.
- Muting a track affects both audio and its timeline presentation.
- Moving a section changes the visual arrangement and the section active at the new bars.
- A compound command produces one history entry and one-step undo.
- Invalid model output cannot mutate project state.
- Manual and AI edits use the same command/event pipeline.
- The demo remains usable without microphone permission through text commands.

## 10. Success metrics

### Demo metrics

- First audible playback within 10 seconds of opening
- Voice/text command to visible plan in under 3 seconds under normal network conditions
- Edit to audible result in under 500 ms after plan acceptance
- Three featured commands complete successfully in the recorded demo
- No hidden state changes: every operation is visible in the timeline or history

### Product signal

- A first-time user can complete “move chorus earlier” without instruction
- A user can explain what changed by looking at the UI
- The same result can be refined manually after the AI operation

## 11. Three-minute submission story

1. Show the original arrangement playing.
2. Say: “Bring the second chorus in four bars earlier, add a synth, and make the drums hit harder.”
3. Show transcription, GPT-5.6 plan, timeline animation, and audible result.
4. Drag the chorus manually by one bar to demonstrate user control.
5. Say: “Keep the synth, but undo the drum change.”
6. A/B the original and remixed arrangement.
7. Close on the product promise and architecture.

## 12. Future direction

- Piano roll and note-level edits
- Automation lanes
- Stem-based user uploads
- MIDI import/export
- Project save/share
- Realtime collaborative sessions
- DAW export and plugin integration

