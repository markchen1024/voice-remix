import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/transcribe/route.ts";

test("voice transcription rejects requests without audio before calling OpenAI", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const response = await POST(new Request("http://localhost/api/transcribe", {
      method: "POST",
      body: new FormData(),
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "missing_audio" });
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("voice transcription rejects unsupported media types before calling OpenAI", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const formData = new FormData();
    formData.append("audio", new File(["not audio"], "voice.txt", { type: "text/plain" }));
    const response = await POST(new Request("http://localhost/api/transcribe", { method: "POST", body: formData }));
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { code: "unsupported_audio" });
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
