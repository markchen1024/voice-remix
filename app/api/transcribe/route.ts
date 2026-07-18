import OpenAI from "openai";

const MAX_VOICE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ code: "ai_unavailable", message: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json({ code: "missing_audio" }, { status: 400 });
    }
    if (audio.size > MAX_VOICE_BYTES) {
      return Response.json({ code: "audio_too_large" }, { status: 413 });
    }
    if (audio.type && !SUPPORTED_AUDIO_TYPES.has(audio.type.split(";")[0])) {
      return Response.json({ code: "unsupported_audio" }, { status: 415 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 });
    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
      prompt: "中英文音乐编辑命令。常用词：鼓、打击乐、贝斯、合成器、效果、主歌、副歌、最后一遍副歌、小节、提前、静音、增强。",
    });
    const text = transcription.text.trim();
    if (!text) return Response.json({ code: "empty_transcript" }, { status: 422 });
    return Response.json({ text });
  } catch (error) {
    console.error("Voice transcription failed", error);
    return Response.json({ code: "transcription_failed" }, { status: 502 });
  }
}
