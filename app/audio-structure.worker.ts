/// <reference lib="webworker" />

import { analyzeMeydaFrameSet, type MeydaFrameSet } from "./meyda-structure-analysis.ts";

type WorkerRequest = { id: string; input: MeydaFrameSet };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    self.postMessage({ id: event.data.id, result: analyzeMeydaFrameSet(event.data.input) });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : "Audio structure analysis failed." });
  }
};
