import { kvGet, kvSet } from "./kv";

const KEY = "selectedDrone.v1";

/** The drone chosen in the showcase, used as the default for the next flight. Validated by the caller against known ids. */
export async function loadSelectedDrone(): Promise<string | null> {
  try {
    const v = await kvGet<unknown>(KEY);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function saveSelectedDrone(id: string): Promise<void> {
  await kvSet(KEY, id);
}
