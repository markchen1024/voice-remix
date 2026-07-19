import assert from "node:assert/strict";
import test from "node:test";
import { createLiveCommandQueue, crossedQuantizedBar, forwardBarDistance, nextQuantizedBar } from "../app/live-command-queue.ts";

const transaction = {
  id: "tx-1",
  baseProjectVersion: 1,
  planner: "local",
  request: "mute synth",
  summary: "Mute synth",
  assumptions: [],
  protectedTargets: [],
  operations: [],
  status: "proposed",
};

test("live edits quantize to the next bar instead of interrupting the current bar", () => {
  assert.equal(nextQuantizedBar(12.2, 59), 13);
  assert.equal(nextQuantizedBar(12, 59), 13);
  assert.equal(nextQuantizedBar(58.8, 59), 0);
  assert.equal(createLiveCommandQueue(transaction, 12.2, 59).executeAtBar, 13);
});

test("forward distance and boundary crossing support the song loop", () => {
  assert.ok(Math.abs(forwardBarDistance(58.8, 0, 59) - 0.2) < 0.0001);
  assert.equal(crossedQuantizedBar(12.98, 13.02, 13, 59), true);
  assert.equal(crossedQuantizedBar(58.98, 0.02, 0, 59), true);
  assert.equal(crossedQuantizedBar(20, 5, 13, 59), false);
});

test("a boundary does not execute early or twice", () => {
  assert.equal(crossedQuantizedBar(12.1, 12.9, 13, 59), false);
  assert.equal(crossedQuantizedBar(13, 13.1, 13, 59), false);
});
