export type RealtimeToolCall = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type RealtimeConversationClient = {
  startTurn: () => void;
  stopTurn: () => void;
  close: () => void;
};

type RealtimeConversationCallbacks = {
  onInputDelta: (transcript: string) => void;
  onInputCompleted: (transcript: string) => void;
  onAssistantDelta: (transcript: string) => void;
  onAssistantCompleted: (transcript: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
  onToolCall: (call: RealtimeToolCall) => Promise<unknown>;
  onError: (error: Error) => void;
};

type RealtimeResponseOutput = {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ transcript?: string; text?: string }>;
};

type RealtimeServerEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  text?: string;
  response?: { output?: RealtimeResponseOutput[] };
  error?: { message?: string };
};

export function parseRealtimeToolCalls(response: RealtimeServerEvent["response"]): RealtimeToolCall[] {
  return (response?.output ?? []).flatMap((item) => {
    if (item.type !== "function_call" || !item.call_id || !item.name) return [];
    try {
      const parsed = JSON.parse(item.arguments || "{}") as unknown;
      return [{
        callId: item.call_id,
        name: item.name,
        arguments: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {},
      }];
    } catch {
      return [{ callId: item.call_id, name: item.name, arguments: {} }];
    }
  });
}

function responseTranscript(response: RealtimeServerEvent["response"]) {
  return (response?.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.transcript ?? content.text ?? "")
    .join("")
    .trim();
}

function sendEvent(channel: RTCDataChannel, event: object) {
  if (channel.readyState !== "open") throw new Error("Realtime data channel is not open");
  channel.send(JSON.stringify(event));
}

function waitForChannelOpen(channel: RTCDataChannel) {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Realtime data channel timed out")), 10_000);
    const finish = (callback: () => void) => {
      window.clearTimeout(timeout);
      channel.removeEventListener("open", onOpen);
      channel.removeEventListener("error", onError);
      callback();
    };
    const onOpen = () => finish(resolve);
    const onError = () => finish(() => reject(new Error("Realtime data channel failed")));
    channel.addEventListener("open", onOpen);
    channel.addEventListener("error", onError);
  });
}

export async function connectRealtimeConversation(callbacks: RealtimeConversationCallbacks): Promise<RealtimeConversationClient> {
  let peer: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  let stream: MediaStream | null = null;
  let remoteAudio: HTMLAudioElement | null = null;

  try {
    const tokenResponse = await fetch("/api/realtime-session", { method: "POST" });
    if (!tokenResponse.ok) throw new Error(`Realtime session failed with ${tokenResponse.status}`);
    const token = await tokenResponse.json() as { value?: unknown };
    if (typeof token.value !== "string") throw new Error("Realtime session did not return a client secret");

    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    const microphone = stream.getAudioTracks()[0];
    if (!microphone) throw new Error("No microphone track was available");
    microphone.enabled = false;

    peer = new RTCPeerConnection();
    peer.addTrack(microphone, stream);
    remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    peer.addEventListener("track", (event) => {
      if (!remoteAudio || !event.streams[0]) return;
      remoteAudio.srcObject = event.streams[0];
      void remoteAudio.play().catch(() => undefined);
    });
    channel = peer.createDataChannel("oai-events");

    let inputTranscript = "";
    let assistantTranscript = "";
    let responseActive = false;
    let closed = false;

    channel.addEventListener("message", (event) => {
      void (async () => {
        try {
          const message = JSON.parse(event.data) as RealtimeServerEvent;
          if (message.type === "conversation.item.input_audio_transcription.delta" && typeof message.delta === "string") {
            inputTranscript += message.delta;
            callbacks.onInputDelta(inputTranscript);
          } else if (message.type === "conversation.item.input_audio_transcription.completed") {
            const transcript = (message.transcript ?? inputTranscript).trim();
            inputTranscript = "";
            if (transcript) callbacks.onInputCompleted(transcript);
          } else if ((message.type === "response.output_audio_transcript.delta" || message.type === "response.output_text.delta") && typeof message.delta === "string") {
            assistantTranscript += message.delta;
            callbacks.onAssistantDelta(assistantTranscript);
          } else if (message.type === "response.output_audio_transcript.done" || message.type === "response.output_text.done") {
            const transcript = (message.transcript ?? message.text ?? assistantTranscript).trim();
            if (transcript) {
              assistantTranscript = transcript;
              callbacks.onAssistantDelta(transcript);
            }
          } else if (message.type === "response.created") {
            responseActive = true;
            callbacks.onSpeakingChange(true);
          } else if (message.type === "response.done") {
            responseActive = false;
            const toolCalls = parseRealtimeToolCalls(message.response);
            if (!toolCalls.length) {
              const transcript = assistantTranscript.trim() || responseTranscript(message.response);
              if (transcript) callbacks.onAssistantCompleted(transcript);
              assistantTranscript = "";
              callbacks.onSpeakingChange(false);
              return;
            }

            callbacks.onSpeakingChange(false);
            for (const call of toolCalls) {
              let output: unknown;
              try {
                output = await callbacks.onToolCall(call);
              } catch (error) {
                output = { ok: false, error: error instanceof Error ? error.message : "Editor tool failed" };
              }
              sendEvent(channel!, {
                type: "conversation.item.create",
                item: { type: "function_call_output", call_id: call.callId, output: JSON.stringify(output ?? { ok: true }) },
              });
            }
            assistantTranscript = "";
            sendEvent(channel!, {
              type: "response.create",
              response: {
                output_modalities: ["audio"],
                instructions: "Briefly confirm the actual tool result in the user's language. Mention the next-bar cue if the edit was queued. Do not add a new action.",
              },
            });
          } else if (message.type === "error") {
            callbacks.onError(new Error(message.error?.message ?? "Realtime conversation failed"));
          }
        } catch (error) {
          callbacks.onError(error instanceof Error ? error : new Error("Invalid Realtime event"));
        }
      })();
    });

    peer.addEventListener("connectionstatechange", () => {
      if (peer?.connectionState === "failed") callbacks.onError(new Error("Realtime connection failed"));
    });

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    if (!offer.sdp) throw new Error("Realtime offer did not contain SDP");

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${token.value}`,
        "Content-Type": "application/sdp",
      },
    });
    if (!sdpResponse.ok) throw new Error(`Realtime connection failed with ${sdpResponse.status}`);
    await peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    await waitForChannelOpen(channel);

    return {
      startTurn() {
        if (closed) throw new Error("Realtime conversation session is closed");
        inputTranscript = "";
        assistantTranscript = "";
        callbacks.onInputDelta("");
        callbacks.onAssistantDelta("");
        if (responseActive) {
          sendEvent(channel!, { type: "response.cancel" });
          sendEvent(channel!, { type: "output_audio_buffer.clear" });
          responseActive = false;
          callbacks.onSpeakingChange(false);
        }
        sendEvent(channel!, { type: "input_audio_buffer.clear" });
        microphone.enabled = true;
      },
      stopTurn() {
        if (closed) return;
        microphone.enabled = false;
        sendEvent(channel!, { type: "input_audio_buffer.commit" });
        sendEvent(channel!, { type: "response.create", response: { output_modalities: ["audio"] } });
      },
      close() {
        if (closed) return;
        closed = true;
        microphone.enabled = false;
        channel?.close();
        peer?.close();
        stream?.getTracks().forEach((track) => track.stop());
        if (remoteAudio) remoteAudio.srcObject = null;
        callbacks.onSpeakingChange(false);
      },
    };
  } catch (error) {
    channel?.close();
    peer?.close();
    stream?.getTracks().forEach((track) => track.stop());
    if (remoteAudio) remoteAudio.srcObject = null;
    throw error;
  }
}
