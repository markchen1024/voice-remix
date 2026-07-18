import assert from "node:assert/strict";
import test from "node:test";
import { createProjectHistory, recordHistory, redoHistory, undoHistory } from "../app/project-history.ts";

const clone = (value) => structuredClone(value);

test("undo and redo preserve both sides of project history", () => {
  let history = createProjectHistory();
  const original = { version: 1, value: "original" };
  const edited = { version: 2, value: "edited" };
  history = recordHistory(history, original, clone);

  const undone = undoHistory(history, edited, clone);
  assert.deepEqual(undone.value, original);
  assert.equal(undone.history.past.length, 0);
  assert.deepEqual(undone.history.future, [edited]);

  const redone = redoHistory(undone.history, undone.value, clone);
  assert.deepEqual(redone.value, edited);
  assert.deepEqual(redone.history.past, [original]);
  assert.equal(redone.history.future.length, 0);
});

test("a new edit after undo clears the redo branch", () => {
  let history = recordHistory(createProjectHistory(), { value: 1 }, clone);
  const undone = undoHistory(history, { value: 2 }, clone);
  history = recordHistory(undone.history, undone.value, clone);
  assert.equal(history.future.length, 0);
  assert.equal(redoHistory(history, { value: 3 }, clone), null);
});
