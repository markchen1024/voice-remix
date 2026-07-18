import assert from "node:assert/strict";
import test from "node:test";
import { createRealtimeTranscriptionSession, POST } from "../app/api/realtime-session/route.ts";

test("Realtime transcription sessions use a short-lived push-to-talk configuration", () => {
  assert.deepEqual(createRealtimeTranscriptionSession(), {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "transcription",
      audio: {
        input: {
          transcription: { model: "gpt-realtime-whisper", delay: "low" },
          turn_detection: null,
        },
      },
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
    assert.equal(JSON.parse(captured.init.body).session.type, "transcription");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
