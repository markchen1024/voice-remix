# Voice Remix — Judge Readiness Audit

> Updated: 2026-07-19
>
> Purpose: internal product and submission gate. Scores are a team estimate, not an official judge score.

## Official evaluation frame

OpenAI Build Week evaluates eligible projects on four equally weighted criteria:

1. Technological Implementation
2. Design
3. Potential Impact
4. Quality of the Idea

Source: [Official rules](https://openai.devpost.com/rules) and [challenge page](https://openai.devpost.com/).

## What a complete judge experience must feel like

A judge should be able to understand and verify the whole product loop without reading the repository:

```text
Open a public URL
  → hear a real editable arrangement immediately
  → speak one natural request while playback continues
  → see the exact validated Music Diff
  → hear Current versus Proposed at the same playhead
  → accept only the wanted operations
  → manually refine or undo the result
  → download a playable result
```

The differentiator is not merely connecting an LLM to editor controls. It is the visible trust layer between creative language and deterministic audio execution.

## Current score estimate

| Criterion | Current | Evidence | Main deduction |
|---|---:|---|---|
| Technological Implementation | 8.5/10 | Realtime voice, GPT-5.6 Structured Outputs, deterministic validation, real multitrack scheduler, offline WAV renderer, 56 tests | Some PRD operations remain unimplemented |
| Design | 8.5/10 | Public no-login build, polished editor, Music Diff, A/B, ghost timeline, one-minute judge path, finished WAV delivery | Accessibility and mobile passes remain narrower than desktop QA |
| Potential Impact | 7.5/10 | Clear problem for taste-rich creators who do not use DAWs; import-to-edit-to-download loop now closes | Batch stem intake and persistence are still incomplete |
| Quality of the Idea | 8.5/10 | “Git diff for music” plus voice and beat-synchronous execution is distinct | The submission must foreground this trust model rather than look like a thin AI editor wrapper |

Estimated total: **33/40**. The complete public product loop is competitive; submission storytelling and final media are now the largest remaining risks.

## P0 — required before recording the final demo

### 1. Public, no-login judge build

- [x] Deploy a stable URL with server-side `OPENAI_API_KEY` and `OPENAI_MODEL`: `https://voice-remix.vercel.app/`.
- [x] Verify public playback, GPT-5.6 planning, Apply/Undo, and Realtime session creation without an application login.
- [ ] Keep the deployment available free of charge through the judging period and repeat the smoke test before submission.

### 2. Downloadable audible result

- [x] Export the committed arrangement as WAV in the browser.
- [x] Keep project JSON as a secondary “project snapshot” export.
- [x] Render section placement, mute, gain, and section energy exactly as heard.
- [x] Show deterministic progress and a useful error if rendering fails.

### 3. One-minute judge mode

- [x] A compact three-step coach mark: Play → use the featured request → inspect and apply the Diff.
- [x] A `Judge demo` action that restores the known-good arrangement and featured prompt.
- [x] Keep the normal editor available; do not turn the product into a slideshow.

### 4. Product truth and state integrity

- Remove or disable every control that has no action.
- Route manual changes through the same versioned history boundary as AI edits.
- Make Current, Proposed, queued, and committed states unambiguous.
- Keep submission claims aligned with what the build actually demonstrates.

### 5. Import completion

- Let full-song import specify BPM and clearly identify estimated sections.
- Add batch synchronized-stem import with explicit lane mapping and a validation summary.
- Explain that full mixes support arrangement-level editing but not independent instrument control.
- Preserve imported work for the session; persistence can follow only if the higher P0 items are complete.

## P1 — valuable after the P0 gate

- `Now`, `Next bar`, and `Next section` execution choice.
- Semantic selective revert from a committed compound edit.
- Drag-to-move sections through the same transaction model.
- Import a saved `.voice-remix.json` project.
- Project persistence and a real shareable review link.
- Accessibility pass: keyboard coverage, reduced motion, focus trapping, and screen-reader state announcements.

## Explicitly defer

These are attractive but too risky before submission:

- building a stem-separation model;
- note-level MIDI editing;
- plugin hosting or a DAW project format;
- automatic mastering;
- collaboration accounts and permissions;
- generative audio replacement.

## Submission gate

The final submission is not ready until all of the following are true:

- public app works in a signed-out browser;
- featured voice request visibly uses GPT-5.6 rather than the local fallback;
- the judge can hear Current and Proposed, then download the committed result;
- no visible control is inert;
- demo video is under three minutes, public on YouTube, and mostly shows the real product;
- repository, `/feedback` Session ID, screenshots, licensing confirmation, and Devpost fields are complete.
