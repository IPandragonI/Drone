import { DEFAULT_GAME_SETTINGS, mergeGameSettings, type GameSettings } from "@/config/gameSettings";
import { kvGet, kvSet } from "./kv";

const KEY = "gameSettings.v1";

export async function loadGameSettings(): Promise<GameSettings> {
  try {
    return mergeGameSettings(await kvGet<unknown>(KEY));
  } catch {
    return structuredClone(DEFAULT_GAME_SETTINGS);
  }
}

export async function saveGameSettings(s: GameSettings): Promise<void> {
  await kvSet(KEY, s);
}
