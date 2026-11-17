import RAPIER from "@dimforge/rapier3d-compat";
import { Euler, Quaternion } from "three";
import type { EnvironmentDef } from "@/env/types";
import { GRAVITY, PHYSICS_DT } from "@/config/sim";

let initPromise: Promise<void> | null = null;

/** Initialise the Rapier WASM module once. */
export function initRapier(): Promise<void> {
  initPromise ??= RAPIER.init();
  return initPromise;
}

export { RAPIER };

/** Create a Rapier world and populate it with the environment's static colliders. */
export function createWorld(env: EnvironmentDef): { world: RAPIER.World; colliderCount: number } {
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = PHYSICS_DT;
  const q = new Quaternion();
  const e = new Euler();
  let count = 0;
  for (const s of env.solids) {
    if (s.collide === false) continue;
    let desc: RAPIER.ColliderDesc;
    if (s.shape === "box") {
      desc = RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2);
    } else {
      desc = RAPIER.ColliderDesc.cylinder(s.size[1] / 2, s.size[0]);
    }
    desc.setTranslation(s.position[0], s.position[1], s.position[2]);
    if (s.rotation) {
      e.set(s.rotation[0], s.rotation[1], s.rotation[2], "XYZ");
      q.setFromEuler(e);
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    desc.setFriction(0.8).setRestitution(0.1);
    world.createCollider(desc);
    count++;
  }
  return { world, colliderCount: count };
}
