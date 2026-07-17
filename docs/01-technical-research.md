# Voice Remix – Technical Research

## Objective

Before writing any application code, validate the capabilities and limitations of OpenAI's realtime voice APIs.

The goal is to understand what should be handled by AI versus what should be implemented locally.

---

# Research Questions

## 1. OpenAI Realtime API

Investigate:

- Does it support continuous microphone input?
- How does session management work?
- WebRTC vs WebSocket
- Expected latency
- Supported models
- Browser support

Deliverables:

- Summary
- Architecture diagram
- Official documentation links

---

## 2. GPT-Live vs Realtime API

Understand:

- What GPT-Live provides inside ChatGPT
- Which capabilities are currently available via API
- Missing features
- Upcoming roadmap (if publicly documented)

Deliverables:

- Feature comparison table

---

## 3. Function Calling

Investigate:

- Realtime function calling
- Streaming tool calls
- Multiple tool calls per session
- Best practices

Design an API like:

```json
{
  "action": "move_chorus",
  "bars": -4
}
```

instead of asking AI to generate MIDI directly.

---

## 4. Music Editing Architecture

Target architecture:

Voice

↓

Realtime API

↓

Function Calling

↓

Music Editing Engine

↓

Tone.js / MIDI

AI should generate editing commands, not audio.

---

## 5. MVP Scope

Keep MVP intentionally small.

Supported editing actions:

- Move chorus
- Change tempo
- Add instrument
- Remove instrument
- Increase energy
- Export MIDI

Everything else is out of scope.

---

## 6. Risks

Research:

- Latency
- Audio interruptions
- Session limits
- Browser compatibility
- Cost
- Rate limits

---

## 7. Success Criteria

The research is complete when we can answer:

- Which API should be used?
- Can realtime voice editing be implemented?
- Can AI continuously call editing functions?
- What should run locally?
- What should run in OpenAI?

Only after these questions are answered should implementation begin.

---

## References

- OpenAI Realtime API
- OpenAI Audio & Voice Guides
- OpenAI Function Calling Documentation
- WebRTC Documentation