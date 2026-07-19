import assert from "node:assert/strict";
import test from "node:test";
import { parseRealtimeToolCalls } from "../app/realtime-transcription.ts";

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
