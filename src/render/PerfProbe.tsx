"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { perfStats } from "./perf";

/** Measures frame time and renderer counters (negative priority: never takes over rendering). */
export function PerfProbe() {
  const acc = useRef({ t: 0, n: 0 });
  useFrame((state, dt) => {
    const a = acc.current;
    a.t += dt;
    a.n++;
    if (a.t >= 0.5) {
      const info = state.gl.info;
      perfStats.fps = a.n / a.t;
      perfStats.frameMs = (a.t / a.n) * 1000;
      perfStats.drawCalls = info.render.calls;
      perfStats.triangles = info.render.triangles;
      perfStats.geometries = info.memory.geometries;
      perfStats.textures = info.memory.textures;
      a.t = 0;
      a.n = 0;
    }
  }, -50);
  return null;
}
