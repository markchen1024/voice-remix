export type ProjectHistory<T> = {
  past: T[];
  future: T[];
};

export function createProjectHistory<T>(): ProjectHistory<T> {
  return { past: [], future: [] };
}

export function recordHistory<T>(history: ProjectHistory<T>, current: T, clone: (value: T) => T): ProjectHistory<T> {
  return { past: [...history.past, clone(current)], future: [] };
}

export function undoHistory<T>(history: ProjectHistory<T>, current: T, clone: (value: T) => T) {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return {
    value: clone(previous),
    history: { past: history.past.slice(0, -1), future: [clone(current), ...history.future] },
  };
}

export function redoHistory<T>(history: ProjectHistory<T>, current: T, clone: (value: T) => T) {
  const [next, ...remaining] = history.future;
  if (!next) return null;
  return {
    value: clone(next),
    history: { past: [...history.past, clone(current)], future: remaining },
  };
}
