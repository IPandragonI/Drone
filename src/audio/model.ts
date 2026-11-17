import type { CollisionSeverity } from "@/sim/types";

/** Audible fundamental of a rotor at normalised speed 0..1 (a stylised mapping, not a measured blade-pass frequency). */
export function rotorHz(speed: number): number {
  const s = Math.min(1, Math.max(0, speed));
  return 90 + 360 * s;
}

/** Overall motor loudness 0..1 from the mean rotor speed. Idle is quiet but audible while armed. */
export function engineLevel(meanSpeed: number): number {
  const s = Math.min(1, Math.max(0, meanSpeed));
  return 0.04 + 0.96 * Math.pow(s, 1.4);
}

/** Impact loudness by severity. */
export function impactLevel(severity: CollisionSeverity): number {
  switch (severity) {
    case "minor":
      return 0.25;
    case "moderate":
      return 0.5;
    case "severe":
      return 0.8;
    case "critical":
      return 1;
    default:
      return 0;
  }
}

/** Slight per-motor detune so four rotors beat against each other instead of sounding like one tone. */
export function motorDetune(index: number): number {
  return 1 + [0, 0.013, -0.009, 0.021][index % 4];
}
