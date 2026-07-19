import assert from "node:assert/strict";
import test from "node:test";
import { createRealtimeConversationSession, POST } from "../app/api/realtime-session/route.ts";

test("Realtime conversation sessions expose short-lived push-to-talk editor tools", () => {
  assert.deepEqual(createRealtimeConversationSession(), {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      instructions: "You are Voice Remix, a live music copilot inside a multitrack editor. Reply in the user's language. Always use an editor tool for any requested action, wait for the tool result, then confirm what actually happened in one short sentence. Never claim an edit was applied when it was only queued or auditioned. Ask one concise question only when the intent is genuinely ambiguous.",
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: null,
        },
        output: { voice: "marin" },
      },
      tools: [
        {
          type: "function",
          name: "queue_music_edit",
          description: "Plan an arrangement or mix change such as muting stems, moving a section, changing section energy, or keeping only named instruments. The editor decides whether to preview immediately or queue it on the next bar.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: { request: { type: "string", description: "The complete music-edit request in the user's words." } },
            required: ["request"],
          },
        },
        {
          type: "function",
          name: "control_editor",
          description: "Control transport, edit history, or the reversible Current/Proposed audition state.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: {
                type: "string",
                enum: ["play", "pause", "undo", "redo", "apply", "discard", "audition_current", "audition_proposed"],
              },
            },
            required: ["action"],
          },
        },
      ],
      tool_choice: "auto",
    },
  });
});

test("Realtime session creation requires a server-side API key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const response = await POST();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "ai_unavailable", message: "OPENAI_API_KEY is not configured" });
  } finally {
    if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
  }
});

test("Realtime session creation returns only the ephemeral credential", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "server-key";
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ value: "ek_test", expires_at: 12345, session: { id: "must-not-leak" } });
  };

  try {
    const response = await POST();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { value: "ek_test", expiresAt: 12345 });
    assert.equal(captured.url, "https://api.openai.com/v1/realtime/client_secrets");
    assert.equal(captured.init.headers.Authorization, "Bearer server-key");
    assert.equal(JSON.parse(captured.init.body).session.type, "realtime");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
