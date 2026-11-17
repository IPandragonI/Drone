import type { KeyboardLayout } from "@/config/controls";

/**
 * Detect the physical keyboard layout. The Keyboard Map API (Chromium) tells us what the physical Q key types;
 * elsewhere we fall back to the browser language (French and Belgian locales are AZERTY).
 */
export async function detectLayout(): Promise<KeyboardLayout> {
  try {
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    if (kb?.getLayoutMap) {
      const map = await kb.getLayoutMap();
      const q = map.get("KeyQ");
      const w = map.get("KeyW");
      if (q === "a" || w === "z") return "azerty";
      if (q === "q" && w === "w") return "qwerty";
    }
  } catch {
    /* permissions policy or unsupported: fall through */
  }
  const lang = (navigator.language || "").toLowerCase();
  return /^fr(-|$)/.test(lang) || lang.startsWith("be") ? "azerty" : "qwerty";
}
