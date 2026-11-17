"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { EnvironmentDef, MaterialId, Solid } from "@/env/types";
import { getMaterial } from "./materials";

const boxGeo = new BoxGeometry(1, 1, 1);
const cylGeo = new CylinderGeometry(1, 1, 1, 18, 1);

/**
 * Renders every visible solid as one InstancedMesh per (shape, material) pair,
 * i.e. at most ~2 x materials draw calls regardless of solid count.
 */
export function EnvironmentRenderer({ env, shadows, textured = true }: { env: EnvironmentDef; shadows: boolean; textured?: boolean }) {
  const meshes = useMemo(() => {
    const groups = new Map<string, Solid[]>();
    for (const s of env.solids) {
      if (s.visible === false) continue;
      const key = `${s.shape}|${s.material}`;
      const g = groups.get(key);
      if (g) g.push(s);
      else groups.set(key, [s]);
    }
    const m4 = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const p = new Vector3();
    const sc = new Vector3();
    const out: InstancedMesh[] = [];
    for (const [key, list] of groups) {
      const [shape, material] = key.split("|") as ["box" | "cylinder", MaterialId];
      const mesh = new InstancedMesh(shape === "box" ? boxGeo : cylGeo, getMaterial(material, textured), list.length);
      list.forEach((s, i) => {
        p.set(...s.position);
        e.set(...(s.rotation ?? [0, 0, 0]), "XYZ");
        q.setFromEuler(e);
        if (s.shape === "box") sc.set(...s.size);
        else sc.set(s.size[0], s.size[1], s.size[0]);
        m4.compose(p, q, sc);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.castShadow = shadows && material !== "glass" && material !== "ground";
      mesh.receiveShadow = material !== "glass";
      mesh.name = key;
      out.push(mesh);
    }
    return out;
  }, [env, shadows, textured]);

  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);

  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </>
  );
}
