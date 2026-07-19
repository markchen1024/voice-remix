# Voice Remix — Build Week Submission Workbook

> Updated: 2026-07-19
> Deadline: Tuesday, July 21, 2026 at 5:00 PM PDT (Wednesday, July 22 at 10:00 AM AEST)

This is an internal completion worksheet, not finished Devpost copy. Rewrite the narrative fields in your own voice before submitting. OpenAI's participant guidance explicitly warns against submitting an AI-written project description unchanged.

## 1. Submission status

| Requirement | Status | Next action |
|---|---|---|
| Working, non-trivial implementation | Verified locally | Production build, lint, and 56/56 tests passed on July 19 |
| Uses GPT-5.6 | Verified locally | Live smoke test returned two operations and protected `BASS` |
| Codex used throughout the build | Done | Retrieve the primary task `/feedback` Session ID |
| Track selected | Done | Submit under **Apps for Your Life** |
| Repository with setup and sample data | Published | Public at `github.com/markchen1024/voice-remix` |
| Relevant repository license | Done | Source and docs use MIT; demo media is explicitly excluded |
| Private repository judge access | Not required | Repository is public |
| Public demo URL | Workspace blocked | Sites reports that hosting is not enabled for this workspace; use an enabled workspace or another host |
| Public YouTube demo under 3 minutes | Pending recording | Follow `docs/05-demo-video.md` |
| Devpost text description | Entrant action | Use the factual worksheet below, rewritten personally |
| Team invitations accepted | Entrant action | Confirm every member has accepted before the deadline |
| Media and source rights | Entrant action | Confirm Suno terms for the account/track used |
| Submission images | Pending capture | Capture the studio, Music Diff, and protected-track state |

If the repository remains private, share it with:

- `testing@devpost.com`
- `build-week-event@openai.com`

## Current verification snapshot

Recorded on July 19, 2026:

- `npm run lint`: passed.
- `npm test`: production build passed; 56 tests passed and 0 failed.
- Browser smoke test: the committed five-stem arrangement completed offline rendering and reached the `WAV downloaded` state.
- Live `/api/plan-edit` smoke test: `gpt-5.6-sol`, 2 operations, protected `BASS`.
- Sites deployment: blocked before site creation because Sites is not enabled for the current workspace.
- Configured Git remote: `https://github.com/markchen1024/voice-remix.git`.
- GitHub CLI: authenticated as `markchen1024` with admin access to the public repository.

The repository is public, includes an MIT License for source and documentation, and carries a separate demo-media notice.

## 2. One-minute judge path

1. Open the deployed app and choose **Judge demo**.
2. Use **Start music** to verify that the demo uses five synchronized audio stems.
3. Use **Preview with GPT-5.6** for the prefilled featured request.
4. Verify the `GPT-5.6-SOL` source, two proposed operations, and protected `BASS` track.
5. Use **Hear proposed**, deselect the drum-gain operation if desired, then apply the selected edit.
6. Press Undo and Redo, then export the committed WAV.

Expected result: the editor exposes a validated, selective, reversible change rather than treating the model response as an opaque one-shot action.

## 3. Devpost factual worksheet

Use these facts to write the final description yourself.

### Inspiration and problem

- Generative music tools are excellent at first drafts but weak at intentional, inspectable revision.
- DAWs provide control but require users to learn timeline, routing, automation, and production vocabulary.
- Voice Remix explores a third interaction model: describe creative intent in ordinary language, inspect the exact proposed edit, then retain manual control.

### What it does

- Plays five synchronized stems from a real demo arrangement.
- Imports a local full song or replaces an individual synchronized stem without uploading the audio.
- Accepts spoken or typed music-edit requests and replies in concise studio English.
- Uses GPT-5.6 Sol to translate contextual requests into constrained music operations.
- Shows a Music Diff, protected stems, before/after values, assumptions, and ghost timeline preview.
- Lets the user accept only selected operations, discard the proposal, Undo, or Redo.
- Includes a resumable one-minute Judge Mode that restores the known-good five-stem project and guides the real product workflow.
- Downloads the committed audible arrangement as a stereo WAV, with project JSON available as a secondary snapshot.
- Falls back to a smaller deterministic local planner when the API is unavailable.

### How it was built

- React 19, TypeScript, vinext, and Vite for the application.
- Tone.js for synchronized multitrack playback.
- Canvas peak envelopes for source-derived waveform visualization.
- OpenAI Responses API with `gpt-5.6-sol` and Zod Structured Outputs.
- A deterministic transaction layer validates IDs and bounds, protects named tracks, records before/after values, and applies selected operations atomically.
- Codex supported research, architecture, visual iteration, implementation, debugging, tests, and documentation across frequent milestone commits.

### Hard parts

- Keeping the AI flexible while ensuring it cannot invent or directly mutate project state.
- Making compound requests such as “change the drums but do not touch the bass” inspectable and enforceable.
- Synchronizing real stems and displaying honest waveform differences, including a nearly silent FX track.
- Implementing proposal, partial acceptance, stale-version protection, Undo, and Redo as one coherent state model.

### Accomplishments

- A real GPT-5.6 request produces a validated transaction against live project context.
- The canonical project remains unchanged until explicit Apply.
- Individual AI operations can be removed before commit.
- The demo remains usable if the microphone or API path fails.
- The Git history documents an incremental Build Week implementation rather than a single generated dump.

### What was learned

- Structured output solves syntax, not domain trust; project-aware normalization is still required.
- For creative tools, showing why and what will change is as important as generating a valid command.
- Non-destructive proposals and reversible history make AI feel more like a collaborator than an autopilot.

### Next steps

- Public judge deployment and a compact first-run demo path.
- Batch stem mapping and automatic section analysis.
- Persistent projects, collaboration, and shareable edit histories.

## 4. Evidence to capture

Capture at least these three clean 16:9 images:

1. Full editor with the five real stem waveforms and playhead.
2. GPT-5.6 Music Diff showing the move, gain operation, and protected bass.
3. Ghost preview or the applied timeline plus visible Undo/Redo controls.

Do not show API keys, browser bookmarks, private account data, local file paths, Suno UI, or copyrighted third-party branding.

## 5. Final verification checklist

- [x] `npm run lint` and `npm test` pass locally; run `npm ci` once more from the final public checkout.
- [ ] Live deployment loads in a signed-out/incognito window.
- [ ] Server deployment has `OPENAI_API_KEY` and `OPENAI_MODEL`; neither appears in browser source.
- [ ] Featured command returns `GPT-5.6-SOL`, not `LOCAL`.
- [ ] Playback works only after a user gesture and all five stems remain synchronized.
- [ ] Apply, Discard, Undo, Redo, mute, and gain work.
- [x] The committed five-stem arrangement renders offline and reaches the WAV download completion state.
- [ ] YouTube video is public, audible, legible, and shorter than three minutes.
- [ ] Devpost description and category are complete.
- [ ] `/feedback` Session ID is saved in the submission.
- [x] Repository is public with an entrant-approved license, or both judge accounts have private access.
- [ ] Every team invitation is accepted.
- [ ] Music and image rights have been confirmed.
- [ ] Submission is saved before the deadline; do not rely on last-minute uploads.

## 6. Official references

- [OpenAI Build Week overview](https://openai.com/build-week/)
- [Build Week rules](https://openai.devpost.com/rules)
- [Build Week FAQ](https://openai.devpost.com/details/faqs)
- [Build Week Devpost page](https://openai.devpost.com/)
