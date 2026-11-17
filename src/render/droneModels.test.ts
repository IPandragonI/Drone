import { describe, expect, it } from "vitest";
import { Box3, Mesh, Vector3 } from "three";
import { DRONE_LIST } from "@/config/drones";
import { MOTOR_X_SIGN, MOTOR_Z_SIGN } from "@/sim/flight/mixer";
import { buildDroneModel } from "./droneModels";

describe("drone models", () => {
  for (const drone of DRONE_LIST) {
    describe(drone.id, () => {
      const model = buildDroneModel(drone);
      model.root.updateMatrixWorld(true);

      it("has four propellers exactly at the simulated motor positions", () => {
        expect(model.props).toHaveLength(4);
        const a = drone.physics.armLengthM / Math.SQRT2;
        model.props.forEach((p, i) => {
          expect(p.position.x).toBeCloseTo(MOTOR_X_SIGN[i] * a, 6);
          expect(p.position.z).toBeCloseTo(MOTOR_Z_SIGN[i] * a, 6);
        });
      });

      it("spans a realistic size for its class and stays centred on the origin", () => {
        const box = new Box3().setFromObject(model.root);
        const size = box.getSize(new Vector3());
        const c = box.getCenter(new Vector3());
        const span = Math.max(size.x, size.z);
        const motorSpan = drone.physics.armLengthM * 2 + drone.model.propRadiusM * 2;
        expect(span).toBeGreaterThan(motorSpan * 0.7);
        expect(span).toBeLessThan(motorSpan * 1.5);
        expect(Math.abs(c.x)).toBeLessThan(0.03);
        expect(Math.abs(c.z)).toBeLessThan(0.05);
        expect(size.y).toBeLessThan(0.3);
      });

      it("keeps the airframe inside a modest margin of the physics collider (props may overhang)", () => {
        const body = new Box3();
        model.root.traverse((o) => {
          if (o instanceof Mesh && o.name.startsWith("parts-")) body.expandByObject(o);
        });
        const h = drone.physics.colliderHalfExtents;
        expect(body.max.y).toBeLessThan(h[1] * 2 + 0.14);
        expect(body.min.y).toBeGreaterThan(-h[1] * 2 - 0.1);
      });

      it("draws with only a handful of draw calls (merged parts + props)", () => {
        let meshes = 0;
        model.root.traverse((o) => {
          if (o instanceof Mesh) meshes++;
        });
        expect(meshes).toBeLessThan(11 + 4 * 3 + 1);
      });

      it("spins props by rotor speed, in alternating directions, and not when stopped", () => {
        const before = model.props.map((p) => p.rotation.y);
        model.update([0, 0, 0, 0], 0.016);
        model.props.forEach((p, i) => expect(p.rotation.y).toBe(before[i]));
        model.update([1, 1, 1, 1], 0.016);
        const d = model.props.map((p, i) => p.rotation.y - before[i]);
        expect(Math.sign(d[0])).toBe(-Math.sign(d[1]));
        expect(Math.abs(d[0])).toBeGreaterThan(0.5);
        const slow = model.props[0].rotation.y;
        model.update([0.25, 0.25, 0.25, 0.25], 0.016);
        expect(Math.abs(model.props[0].rotation.y - slow)).toBeLessThan(Math.abs(d[0]));
      });
    });
  }
});
