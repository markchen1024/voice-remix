export type RealtimeTranscriptionClient = {
  startTurn: () => void;
  stopTurn: () => void;
  close: () => void;
};

type RealtimeTranscriptionCallbacks = {
  onDelta: (transcript: string) => void;
  onCompleted: (transcript: string) => void;
  onError: (error: Error) => void;
};

type RealtimeServerEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
};

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

export async function connectRealtimeTranscription(callbacks: RealtimeTranscriptionCallbacks): Promise<RealtimeTranscriptionClient> {
  let peer: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  let stream: MediaStream | null = null;

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
    channel = peer.createDataChannel("oai-events");

    let turnTranscript = "";
    channel.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data) as RealtimeServerEvent;
        if (message.type === "conversation.item.input_audio_transcription.delta" && typeof message.delta === "string") {
          turnTranscript += message.delta;
          callbacks.onDelta(turnTranscript);
        } else if (message.type === "conversation.item.input_audio_transcription.completed") {
          const transcript = (message.transcript ?? turnTranscript).trim();
          turnTranscript = "";
          if (transcript) callbacks.onCompleted(transcript);
          else callbacks.onError(new Error("Realtime transcription was empty"));
        } else if (message.type === "error") {
          callbacks.onError(new Error(message.error?.message ?? "Realtime transcription failed"));
        }
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error("Invalid Realtime event"));
      }
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

    let closed = false;
    return {
      startTurn() {
        if (closed) throw new Error("Realtime transcription session is closed");
        turnTranscript = "";
        callbacks.onDelta("");
        sendEvent(channel!, { type: "input_audio_buffer.clear" });
        microphone.enabled = true;
      },
      stopTurn() {
        if (closed) return;
        microphone.enabled = false;
        sendEvent(channel!, { type: "input_audio_buffer.commit" });
      },
      close() {
        if (closed) return;
        closed = true;
        microphone.enabled = false;
        channel?.close();
        peer?.close();
        stream?.getTracks().forEach((track) => track.stop());
      },
    };
  } catch (error) {
    channel?.close();
    peer?.close();
    stream?.getTracks().forEach((track) => track.stop());
    throw error;
  }
}
