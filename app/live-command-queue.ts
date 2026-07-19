import type { EditTransaction } from "./edit-transactions.ts";

export type LiveCommandQueue = {
  id: string;
  transaction: EditTransaction;
  queuedAtBar: number;
  executeAtBar: number;
  gridBars: number;
};

function normalizeBar(bar: number, totalBars: number) {
  if (totalBars <= 0) return 0;
  return ((bar % totalBars) + totalBars) % totalBars;
}

export function nextQuantizedBar(position: number, totalBars: number, gridBars = 1) {
  if (totalBars <= 0) return 0;
  const grid = Math.max(0.25, gridBars);
  const next = Math.ceil((normalizeBar(position, totalBars) + 0.001) / grid) * grid;
  return normalizeBar(next, totalBars);
}

export function forwardBarDistance(position: number, target: number, totalBars: number) {
  if (totalBars <= 0) return 0;
  const start = normalizeBar(position, totalBars);
  const end = normalizeBar(target, totalBars);
  return end >= start ? end - start : totalBars - start + end;
}

export function crossedQuantizedBar(previous: number, current: number, target: number, totalBars: number) {
  if (totalBars <= 0 || previous === current) return false;
  const travelled = forwardBarDistance(previous, current, totalBars);
  const targetDistance = forwardBarDistance(previous, target, totalBars);
  // Ignore large backwards seeks. Normal transport frames travel only a tiny
  // fraction of a bar, while the loop wrap is still a short forward distance.
  if (travelled > totalBars / 2) return false;
  return targetDistance > 0 && targetDistance <= travelled + 0.0001;
}

export function createLiveCommandQueue(transaction: EditTransaction, position: number, totalBars: number, gridBars = 1): LiveCommandQueue {
  return {
    id: `live-${transaction.id}`,
    transaction,
    queuedAtBar: normalizeBar(position, totalBars),
    executeAtBar: nextQuantizedBar(position, totalBars, gridBars),
    gridBars: Math.max(0.25, gridBars),
  };
}
