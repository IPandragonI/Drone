"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import type { FlightSession } from "@/sim/session";
import { buildDroneModel } from "./droneModels";

const _tel = {
  speedH: 0, speedV: 0, altitude: 0, heading: 0, battery: 1, health: 1, flightTime: 0, tiltDeg: 0,
  motors: [0, 0, 0, 0] as [number, number, number, number], position: [0, 0, 0] as [number, number, number],
};

/**
 * The drone as seen in the chase camera: a detailed model that follows the interpolated simulation pose and spins each
 * propeller at its simulated rotor speed. Hidden in FPV (the camera sits on the airframe).
 */
export function DroneModel({ session }: { session: FlightSession }) {
  const root = useRef<Group>(null);
  const model = useMemo(() => buildDroneModel(session.sim.drone), [session.sim.drone]);

  useEffect(() => () => model.dispose(), [model]);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    g.visible = session.cameraMode === "chase";
    g.position.copy(session.pose.position);
    g.quaternion.copy(session.pose.quaternion);
    if (!g.visible) return;
    model.update(session.sim.getTelemetry(_tel).motors, dt);
  }, -5);

  return (
    <group ref={root}>
      <primitive object={model.root} />
    </group>
  );
}
