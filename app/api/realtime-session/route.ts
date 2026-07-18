const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export function createRealtimeTranscriptionSession(model = "gpt-realtime-whisper") {
  return {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "transcription",
      audio: {
        input: {
          transcription: { model, delay: "low" },
          turn_detection: null,
        },
      },
    },
  };
}

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ code: "ai_unavailable", message: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const upstream = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createRealtimeTranscriptionSession(process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL)),
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok) {
      console.error("Realtime session creation failed", upstream.status);
      return Response.json({ code: "realtime_unavailable" }, { status: 502 });
    }

    const payload = await upstream.json() as { value?: unknown; expires_at?: unknown };
    if (typeof payload.value !== "string") {
      return Response.json({ code: "invalid_realtime_session" }, { status: 502 });
    }

    return Response.json({ value: payload.value, expiresAt: payload.expires_at });
  } catch (error) {
    console.error("Realtime session creation failed", error);
    return Response.json({ code: "realtime_unavailable" }, { status: 502 });
  }
}
