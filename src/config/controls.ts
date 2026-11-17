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
  pause: [" "],
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
