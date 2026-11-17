import { DEFAULT_CONTROL_SETTINGS, mergeControlSettings, type ControlSettings } from "@/config/controlSettings";
import { kvGet, kvSet } from "./kv";

const KEY = "controlSettings.v1";

export async function loadControlSettings(): Promise<ControlSettings> {
  try {
    return mergeControlSettings(await kvGet<unknown>(KEY));
  } catch {
    return structuredClone(DEFAULT_CONTROL_SETTINGS);
  }
}

export async function saveControlSettings(s: ControlSettings): Promise<void> {
  await kvSet(KEY, s);
}
