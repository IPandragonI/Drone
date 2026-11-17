import { applyFlight, applyResult, emptyProgress, mergeProgress, type Progress } from "@/missions/progress";
import type { MissionResult } from "@/missions/types";
import { kvGet, kvSet } from "./kv";

const KEY = "progress.v1";

export async function loadProgress(): Promise<Progress> {
  try {
    return mergeProgress(await kvGet<unknown>(KEY));
  } catch {
    return emptyProgress();
  }
}

// Serialise read-modify-write so two quick saves (mission end + leaving the page) cannot overwrite each other.
let chain: Promise<unknown> = Promise.resolve();
function update(fn: (p: Progress) => Progress): Promise<Progress> {
  const next = chain.then(async () => {
    const updated = fn(await loadProgress());
    await kvSet(KEY, updated);
    return updated;
  });
  chain = next.catch(() => undefined);
  return next;
}

export const saveMissionResult = (r: MissionResult) => update((p) => applyResult(p, r));
export const saveFlight = (f: { time: number; crashes: number; collisions: number; flights?: number }) => update((p) => applyFlight(p, f));
export const clearProgress = () => update(() => emptyProgress());
