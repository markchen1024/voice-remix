const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export function createRealtimeConversationSession(model = "gpt-realtime-2.1", transcriptionModel = "gpt-4o-mini-transcribe") {
  return {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model,
      output_modalities: ["audio"],
      instructions: "You are Voice Remix, a live music copilot inside a multitrack editor. Reply in the user's language. Always use an editor tool for any requested action, wait for the tool result, then confirm what actually happened in one short sentence. Never claim an edit was applied when it was only queued or auditioned. Ask one concise question only when the intent is genuinely ambiguous.",
      audio: {
        input: {
          transcription: { model: transcriptionModel },
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
      body: JSON.stringify(createRealtimeConversationSession(process.env.OPENAI_REALTIME_MODEL, process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL)),
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
