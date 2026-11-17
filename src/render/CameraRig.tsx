"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { FlightSession } from "@/sim/session";

const DEG = Math.PI / 180;
const _tel = {
  speedH: 0, speedV: 0, altitude: 0, heading: 0, battery: 1, health: 1, flightTime: 0, tiltDeg: 0,
  motors: [0, 0, 0, 0] as [number, number, number, number], position: [0, 0, 0] as [number, number, number],
};

export interface CameraSettings {
  /** Overrides the drone's default FPV field of view (deg) when set. */
  fpvFov?: number;
  /** 0 disables vibration, 1 = drone default. */
  vibrationScale: number;
  /** Multiplier on the chase distance and height. */
  chaseScale?: number;
}

/** Drives the R3F camera from the interpolated sim pose: FPV (attached to airframe) or smoothed chase. */
export function CameraRig({ session, settings }: { session: FlightSession; settings: CameraSettings }) {
  const chasePos = useRef(new Vector3());
  const chaseInit = useRef(false);
  const tmp = useRef({
    v: new Vector3(),
    f: new Vector3(),
    off: new Vector3(),
    tilt: new Quaternion(),
    qx: new Quaternion(),
  });
  const lastMode = useRef<string>("");
  const t = useRef(0);

  useFrame((state, dt) => {
    const camera = state.camera as PerspectiveCamera;
    const { drone } = session.sim;
    const cfg = drone.camera;
    const { position, quaternion } = session.pose;
    const w = tmp.current;
    t.current += dt;

    if (lastMode.current !== session.cameraMode) {
      lastMode.current = session.cameraMode;
      camera.fov = session.cameraMode === "fpv" ? (settings.fpvFov ?? cfg.fpv.fovDeg) : cfg.chase.fovDeg;
      camera.updateProjectionMatrix();
      chaseInit.current = false;
    }

    if (session.cameraMode === "fpv") {
      w.off.set(...cfg.fpv.position).applyQuaternion(quaternion);
      camera.position.copy(position).add(w.off);
      // Subtle motor-driven vibration, scales with average rotor speed.
      const tel = session.sim.getTelemetry(_tel);
      const level = (tel.motors[0] + tel.motors[1] + tel.motors[2] + tel.motors[3]) / 4;
      const amp = cfg.fpv.vibration * settings.vibrationScale * level;
      if (amp > 0) {
        const s = t.current;
        camera.position.x += amp * Math.sin(s * 91.3) * Math.sin(s * 13.1);
        camera.position.y += amp * Math.sin(s * 77.7 + 1.3);
        camera.position.z += amp * Math.sin(s * 63.1 + 2.1);
      }
      w.tilt.setFromAxisAngle(w.v.set(1, 0, 0), cfg.fpv.tiltDeg * DEG);
      camera.quaternion.copy(quaternion).multiply(w.tilt);
    } else {
      // Heading from the drone's forward vector projected on the horizontal plane.
      w.f.set(0, 0, -1).applyQuaternion(quaternion);
      w.f.y = 0;
      if (w.f.lengthSq() < 1e-4) w.f.set(0, 0, -1);
      w.f.normalize();
      const cs = settings.chaseScale ?? 1;
      w.v.copy(position).addScaledVector(w.f, -cfg.chase.distance * cs);
      w.v.y += cfg.chase.height * cs;
      if (!chaseInit.current) {
        chasePos.current.copy(w.v);
        chaseInit.current = true;
      } else {
        chasePos.current.lerp(w.v, 1 - Math.exp(-7 * dt));
      }
      camera.position.copy(chasePos.current);
      camera.lookAt(position.x, position.y + 0.05, position.z);
    }
  }, -4);

  return null;
}
