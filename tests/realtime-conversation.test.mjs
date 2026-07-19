import assert from "node:assert/strict";
import test from "node:test";
import { parseRealtimeToolCalls } from "../app/realtime-transcription.ts";
import { VOICE_REMIX_SESSION_INSTRUCTIONS, VOICE_REMIX_TOOL_RESPONSE_INSTRUCTIONS } from "../app/voice-remix-persona.ts";

test("Realtime tool calls are extracted with structured arguments", () => {
  assert.deepEqual(parseRealtimeToolCalls({
    output: [
      { type: "message", content: [{ text: "ignored" }] },
      { type: "function_call", call_id: "call_edit", name: "queue_music_edit", arguments: JSON.stringify({ request: "只保留贝斯和鼓" }) },
      { type: "function_call", call_id: "call_transport", name: "control_editor", arguments: JSON.stringify({ action: "play" }) },
    ],
  }), [
    { callId: "call_edit", name: "queue_music_edit", arguments: { request: "只保留贝斯和鼓" } },
    { callId: "call_transport", name: "control_editor", arguments: { action: "play" } },
  ]);
});

test("Malformed Realtime tool arguments fail closed", () => {
  assert.deepEqual(parseRealtimeToolCalls({
    output: [{ type: "function_call", call_id: "call_bad", name: "control_editor", arguments: "{" }],
  }), [{ callId: "call_bad", name: "control_editor", arguments: {} }]);
});

test("Realtime persona sounds like a producer and preserves editor state language", () => {
  assert.match(VOICE_REMIX_SESSION_INSTRUCTIONS, /in-the-room music producer/);
  assert.match(VOICE_REMIX_SESSION_INSTRUCTIONS, /Always reply in natural, conversational English/);
  assert.match(VOICE_REMIX_SESSION_INSTRUCTIONS, /queued means it will land on a future bar/);
  assert.match(VOICE_REMIX_SESSION_INSTRUCTIONS, /Never sound like customer support/);
  assert.match(VOICE_REMIX_TOOL_RESPONSE_INSTRUCTIONS, /A\/B preview and not committed/);
  assert.match(VOICE_REMIX_TOOL_RESPONSE_INSTRUCTIONS, /Never begin with “Done/);
});
