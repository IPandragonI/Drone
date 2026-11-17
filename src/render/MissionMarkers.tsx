"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, MeshBasicMaterial } from "three";
import type { FlightSession } from "@/sim/session";

interface Marker {
  group: Group | null;
  ring: MeshBasicMaterial | null;
  fill: MeshBasicMaterial | null;
}

const ACTIVE = "#ffb41f";
const FUTURE = "#9fb4c4";
const DONE = "#46e08a";

/**
 * Billboard rings + translucent spheres for mission waypoints: amber = capturable now, grey = later (ordered
 * missions), green = captured. Updated per frame by mutating materials (no React state).
 */
export function MissionMarkers({ session }: { session: FlightSession }) {
  const def = session.mission?.def ?? null;
  const markers = useRef<Marker[]>([]);
  const waypoints = useMemo(() => def?.waypoints ?? [], [def]);

  useFrame((state) => {
    const m = session.mission;
    if (!m) return;
    const active = new Set(m.activeTargets().map((w) => w.id));
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.04;
    waypoints.forEach((w, i) => {
      const mk = markers.current[i];
      if (!mk?.group || !mk.ring || !mk.fill) return;
      const done = m.isReached(w.id);
      const isActive = active.has(w.id);
      mk.group.visible = !(done && m.def.ordered);
      mk.group.quaternion.copy(state.camera.quaternion);
      mk.group.scale.setScalar(isActive ? pulse : 1);
      mk.ring.color.set(done ? DONE : isActive ? ACTIVE : FUTURE);
      mk.ring.opacity = isActive ? 1 : 0.45;
      mk.fill.color.set(done ? DONE : isActive ? ACTIVE : FUTURE);
      mk.fill.opacity = isActive ? 0.1 + 0.3 * m.dwellProgress : 0.04;
    });
  });

  return (
    <>
      {waypoints.map((w, i) => (
        <group
          key={w.id}
          position={w.position}
          ref={(g) => {
            (markers.current[i] ??= { group: null, ring: null, fill: null }).group = g;
          }}
        >
          <mesh>
            <torusGeometry args={[w.radius, 0.06, 8, 48]} />
            <meshBasicMaterial
              transparent
              depthWrite={false}
              ref={(mat) => {
                (markers.current[i] ??= { group: null, ring: null, fill: null }).ring = mat;
              }}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[w.radius, 20, 14]} />
            <meshBasicMaterial
              transparent
              depthWrite={false}
              ref={(mat) => {
                (markers.current[i] ??= { group: null, ring: null, fill: null }).fill = mat;
              }}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
