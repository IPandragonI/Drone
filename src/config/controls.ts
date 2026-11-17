export type KeyAction =
  | "pitchForward"
  | "pitchBack"
  | "rollLeft"
  | "rollRight"
  | "yawLeft"
  | "yawRight"
  | "throttleUp"
  | "throttleDown"
  | "throttleCut"
  | "pause"
  | "reset"
  | "toggleCamera"
  | "toggleHud"
  | "modeAngle"
  | "modeHorizon"
  | "modeAcro"
  | "modeCycle"
  | "replay";

/** Bindings use KeyboardEvent.key, lower-cased. Default layout follows the AZERTY labels from the spec. */
export type KeyBindings = Record<KeyAction, string[]>;

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  pitchForward: ["z"],
  pitchBack: ["s"],
  rollLeft: ["q"],
  rollRight: ["d"],
  yawLeft: ["a"],
  yawRight: ["e"],
  throttleUp: ["arrowup"],
  throttleDown: ["arrowdown"],
  throttleCut: ["x"],
  pause: [" ", "escape"],
  reset: ["r"],
  toggleCamera: ["c"],
  toggleHud: ["h"],
  modeAngle: ["1"],
  modeHorizon: ["2"],
  modeAcro: ["3"],
  modeCycle: ["m"],
  replay: ["v"],
};

export const KEYBOARD_TUNING = {
  /** Stick slew when a key is held (units/s). */
  stickRise: 5,
  /** Stick slew when released (units/s). */
  stickFall: 9,
  /** Throttle change rate while up/down held (units/s). */
  throttleRate: 0.7,
};

/** QWERTY layout: the same physical positions as the AZERTY defaults (WASD / QE). */
export const QWERTY_KEY_BINDINGS: KeyBindings = {
  ...DEFAULT_KEY_BINDINGS,
  pitchForward: ["w"],
  pitchBack: ["s"],
  rollLeft: ["a"],
  rollRight: ["d"],
  yawLeft: ["q"],
  yawRight: ["e"],
};

export type KeyboardLayout = "azerty" | "qwerty";
export const KEY_ACTIONS = Object.keys(DEFAULT_KEY_BINDINGS) as KeyAction[];

export const KEY_ACTION_LABELS: Record<KeyAction, string> = {
  pitchForward: "Pitch forward",
  pitchBack: "Pitch back",
  rollLeft: "Roll left",
  rollRight: "Roll right",
  yawLeft: "Yaw left",
  yawRight: "Yaw right",
  throttleUp: "Throttle up",
  throttleDown: "Throttle down",
  throttleCut: "Cut throttle",
  pause: "Pause",
  reset: "Reset",
  toggleCamera: "Camera",
  toggleHud: "HUD",
  modeAngle: "Mode: Angle",
  modeHorizon: "Mode: Horizon",
  modeAcro: "Mode: Acro",
  modeCycle: "Cycle mode",
  replay: "Replay",
};

/** Keys reserved for the interface (help, performance panel); never assignable to flight actions. */
export const RESERVED_KEYS = ["f1", "f3", "?"];

/** Layout defaults with the pilot's overrides applied. Validates: only known actions, 1-3 short non-reserved keys each. */
export function bindingsFor(layout: KeyboardLayout, overrides: unknown): KeyBindings {
  const base = structuredClone(layout === "qwerty" ? QWERTY_KEY_BINDINGS : DEFAULT_KEY_BINDINGS);
  if (typeof overrides !== "object" || overrides === null) return base;
  for (const action of KEY_ACTIONS) {
    const v = (overrides as Record<string, unknown>)[action];
    if (Array.isArray(v)) {
      const keys = v.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 12 && !RESERVED_KEYS.includes(k.toLowerCase())).slice(0, 3);
      if (keys.length) base[action] = keys.map((k) => k.toLowerCase());
    }
  }
  return base;
}

/** Actions that share a key (a rebinding conflict the UI warns about). */
export function bindingConflicts(b: KeyBindings): Array<[string, KeyAction, KeyAction]> {
  const seen = new Map<string, KeyAction>();
  const out: Array<[string, KeyAction, KeyAction]> = [];
  for (const a of KEY_ACTIONS) {
    for (const k of b[a]) {
      const prev = seen.get(k);
      if (prev && prev !== a) out.push([k, prev, a]);
      else seen.set(k, a);
    }
  }
  return out;
}
