import { buildHarbor } from "./harbor";
import { buildIndustrialComplex } from "./industrial";
import { buildPineValley } from "./forest";
import { buildWindFarm } from "./windfarm";
import type { EnvironmentDef } from "./types";
import { buildQuarryYard } from "./yard";

export interface EnvironmentEntry {
  id: string;
  name: string;
  description: string;
  outdoor: boolean;
  /** Sky preset used when none is requested (see render/skyPresets). */
  defaultSky: string;
  build: () => EnvironmentDef;
}

/** Selectable environments. Procedural blockouts: the data model (Solid list) is what a GLB loader would also fill. */
export const ENVIRONMENTS: EnvironmentEntry[] = [
  {
    id: "industrial-complex",
    name: "Industrial Complex",
    description: "Indoor hall, workshop, mezzanine, catwalks. Tight spaces. Always calm air.",
    outdoor: false,
    defaultSky: "cloudy",
    build: buildIndustrialComplex,
  },
  {
    id: "quarry-yard",
    name: "Quarry Yard",
    description: "Open yard with containers, tanks, a gantry and a tower. Weather applies.",
    outdoor: true,
    defaultSky: "clear",
    build: buildQuarryYard,
  },
  {
    id: "pine-valley",
    name: "Pine Valley",
    description: "Dense pine forest in a cliff-bound valley with a river and a timber bridge. Fly the trail or skim the canopy.",
    outdoor: true,
    defaultSky: "cloudy",
    build: buildPineValley,
  },
  {
    id: "desert-wind-farm",
    name: "Desert Wind Farm",
    description: "Open desert with dunes, a solar field, a substation and 46 m wind turbines to inspect. Big sky, steady wind.",
    outdoor: true,
    defaultSky: "clear",
    build: buildWindFarm,
  },
  {
    id: "harbor-district",
    name: "Harbor District",
    description: "Container port: stacks and aisles, brick warehouse, quay cranes, a moored ship and open water. Try it at golden hour (?sky=dusk).",
    outdoor: true,
    defaultSky: "cloudy",
    build: buildHarbor,
  },
];

export const ENV_BY_ID: Record<string, EnvironmentEntry> = Object.fromEntries(ENVIRONMENTS.map((e) => [e.id, e]));

export function buildEnvironment(id: string | undefined): EnvironmentDef {
  return (ENV_BY_ID[id ?? ""] ?? ENVIRONMENTS[0]).build();
}
