/** Editorial copy for the drone catalog. Numbers (mass, thrust, size...) are derived from the real configs, never typed here. */
export interface DroneShowcase {
  category: string;
  tagline: string;
  /** What the drone is built to do. */
  role: string;
  /** Specific characteristics shown as bullets. */
  traits: string[];
  /** Real-world drone class this simulated drone is modelled on (a class, not a product). */
  classNote: string;
}

export const DRONE_SHOWCASE: Record<string, DroneShowcase> = {
  "fpv-freestyle": {
    category: "FPV Freestyle",
    tagline: "Raw power. Acro precision.",
    role: "Fast, agile racing and freestyle flying through gaps, around structures and across the whole hall.",
    traits: [
      "Thrust-to-weight around 8:1 for explosive climbs and punch-outs",
      "Acro by default: no self-levelling, full manual rate control",
      "Tri-blade 5-inch props, tilted 30° FPV camera with a wide field of view",
      "Light carbon-style frame: agile, but unforgiving of impacts",
    ],
    classNote: "Modelled on a 5-inch freestyle quadcopter.",
  },
  inspection: {
    category: "Industrial Inspection",
    tagline: "Steady hands for tight work.",
    role: "Close, careful inspection of structures, pipework and machinery, where smooth and predictable beats fast.",
    traits: [
      "Heavy, stable airframe with strong self-levelling in Angle and Horizon",
      "Under-slung stabilised gimbal camera and nose-mounted FPV camera",
      "Large 2-blade props and a high-capacity battery",
      "Slow and deliberate: ideal for hold-position inspection missions",
    ],
    classNote: "Modelled on a professional multirotor inspection platform.",
  },
  cinewhoop: {
    category: "Cinewhoop",
    tagline: "Safe in tight spaces.",
    role: "Smooth cinematic flight indoors and near people or structures, with protected propellers that forgive contact.",
    traits: [
      "Full prop ducts: contacts with walls are survivable",
      "Compact 3-inch airframe, small enough for narrow corridors",
      "Action camera on top plus a forward FPV camera",
      "All three flight modes, with a calm, controllable character",
    ],
    classNote: "Modelled on a 3-inch ducted cinewhoop.",
  },
};
