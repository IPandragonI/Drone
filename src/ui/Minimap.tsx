"use client";

import { useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import { computeMapRect, isMapSolid, worldToMap } from "@/env/mapBounds";
import type { FlightSession } from "@/sim/session";

export interface MapMarker {
  x: number;
  z: number;
  /** World radius in metres. */
  r: number;
  /** Highlighted (active objective) or dim. */
  active: boolean;
}

const W = 200;

/**
 * Top-down map. The static layer (structure footprints) is drawn once; the drone arrow and objective markers are redrawn
 * at 10 Hz straight to the canvas, with no React state per frame. Forward (-Z) is up; the arrow shows the drone heading.
 */
export function Minimap({ session, getMarkers }: { session: FlightSession; getMarkers?: () => MapMarker[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const env = session.sim.env;
  const rect = useMemo(() => computeMapRect(env), [env]);
  const H = Math.round(Math.min(200, Math.max(100, (W * (rect.maxZ - rect.minZ)) / (rect.maxX - rect.minX))));
  const layer = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const g = off.getContext("2d");
    if (!g) return;
    g.fillStyle = "rgba(8,10,12,0.72)";
    g.fillRect(0, 0, W, H);
    const scale = Math.min(W / (rect.maxX - rect.minX), H / (rect.maxZ - rect.minZ));
    // lower structures dim, taller ones brighter
    const solids = env.solids.filter(isMapSolid).sort((a, b) => a.position[1] - b.position[1]);
    for (const s of solids) {
      const top = s.position[1] + s.size[1] / 2;
      const lum = Math.min(1, 0.25 + top / 14);
      g.fillStyle = `rgba(${Math.round(150 * lum + 40)},${Math.round(165 * lum + 40)},${Math.round(180 * lum + 40)},0.9)`;
      const [cx, cy] = worldToMap(s.position[0], s.position[2], rect, W, H);
      if (s.shape === "cylinder") {
        g.beginPath();
        g.arc(cx, cy, Math.max(1, s.size[0] * scale), 0, Math.PI * 2);
        g.fill();
      } else {
        g.save();
        g.translate(cx, cy);
        g.rotate(-(s.rotation?.[1] ?? 0));
        g.fillRect((-s.size[0] * scale) / 2, (-s.size[2] * scale) / 2, Math.max(1, s.size[0] * scale), Math.max(1, s.size[2] * scale));
        g.restore();
      }
    }
    layer.current = off;
  }, [env, rect, H]);

  useEffect(() => {
    const fwd = new Vector3();
    const id = window.setInterval(() => {
      const c = canvas.current;
      const g = c?.getContext("2d");
      if (!c || !g) return;
      g.clearRect(0, 0, W, H);
      if (layer.current) g.drawImage(layer.current, 0, 0);
      const k = Math.min(W / (rect.maxX - rect.minX), H / (rect.maxZ - rect.minZ));
      for (const m of getMarkers?.() ?? []) {
        const [mx, my] = worldToMap(m.x, m.z, rect, W, H);
        g.beginPath();
        g.arc(mx, my, Math.max(3, m.r * k), 0, Math.PI * 2);
        g.fillStyle = m.active ? "rgba(255,190,40,0.9)" : "rgba(255,255,255,0.25)";
        g.fill();
      }
      const { position, quaternion } = session.pose;
      const [px, py] = worldToMap(position.x, position.z, rect, W, H);
      fwd.set(0, 0, -1).applyQuaternion(quaternion);
      const ang = Math.atan2(fwd.x, -fwd.z);
      g.save();
      g.translate(px, py);
      g.rotate(ang);
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 6);
      g.lineTo(0, 3);
      g.lineTo(-5, 6);
      g.closePath();
      g.fillStyle = "#4ade80";
      g.fill();
      g.strokeStyle = "#04130a";
      g.lineWidth = 1;
      g.stroke();
      g.restore();
    }, 100);
    return () => window.clearInterval(id);
  }, [session, rect, H, getMarkers]);

  return <canvas ref={canvas} data-testid="minimap" width={W} height={H} className="pointer-events-none border border-white/20" style={{ width: W, height: H }} />;
}
