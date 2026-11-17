"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACESFilmicToneMapping, Box3, PMREMGenerator, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { DroneConfig } from "@/config/drones/types";
import { buildDroneModel } from "@/render/droneModels";

/** Procedural studio reflections (no downloaded HDRI). */
function StudioEnvironment() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene } = get();
    const pmrem = new PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.6;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [get]);
  return null;
}

/** Frames the camera once the model size is known and records that pose as the "reset" view. */
function FitCamera({ size, controls }: { size: Vector3 | null; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (!size) return;
    const { camera } = get();
    const d = Math.max(size.x, size.z) * 1.55 + 0.08;
    camera.position.set(d * 0.8, d * 0.5, d * 0.95);
    camera.lookAt(0, 0, 0);
    const c = controls.current;
    if (c) {
      c.target.set(0, 0, 0);
      c.update();
      c.saveState();
    }
  }, [size, controls, get]);
  return null;
}

function Model({ drone, spin, onSize }: { drone: DroneConfig; spin: boolean; onSize: (size: Vector3) => void }) {
  const model = useMemo(() => buildDroneModel(drone), [drone]);
  const idle = useRef([0.34, 0.34, 0.34, 0.34]);
  useEffect(() => {
    const box = new Box3().setFromObject(model.root);
    onSize(box.getSize(new Vector3()));
    return () => model.dispose();
  }, [model, onSize]);
  useFrame((_, dt) => {
    model.update(idle.current, spin ? dt : 0);
  });
  return <primitive object={model.root} />;
}

/**
 * Interactive 3D viewer for one drone: orbit (drag), zoom (wheel/pinch), pan (right-drag), auto-rotation until the user
 * interacts, reset button. Rendering pauses while the viewer is off-screen so several viewers on a page stay cheap.
 */
export function DroneViewer({ drone, testId }: { drone: DroneConfig; testId?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState<Vector3 | null>(null);
  const [auto, setAuto] = useState(true);
  const [spin, setSpin] = useState(true);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const dist = size ? Math.max(size.x, size.z) * 1.9 + 0.1 : 0.7;
  const maxDim = size ? Math.max(size.x, size.y, size.z) : 0.4;

  return (
    <div ref={wrap} data-testid={testId} className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#2a3036_0%,#14181c_62%,#0b0d0f_100%)]">
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 2]}
        shadows
        gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.85 }}
        camera={{ position: [dist * 0.75, dist * 0.5, dist * 0.9], fov: 34, near: 0.01, far: 40 }}
      >
        <StudioEnvironment />
        <ambientLight intensity={0.25} />
        <directionalLight position={[2, 3, 2]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-0.6} shadow-camera-right={0.6} shadow-camera-top={0.6} shadow-camera-bottom={-0.6} shadow-bias={-0.0005} />
        <directionalLight position={[-2.5, 1.2, -2]} intensity={0.7} color="#bcd4f5" />
        <directionalLight position={[0, -1, 3]} intensity={0.35} color="#ffd9b0" />
        <Model drone={drone} spin={spin} onSize={setSize} />
        <FitCamera size={size} controls={controls} />
        <ContactShadows position={[0, -(size ? size.y * 0.62 : 0.1), 0]} opacity={0.55} scale={maxDim * 6} blur={2.6} far={maxDim * 2.2} resolution={512} color="#000000" />
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          autoRotate={auto}
          autoRotateSpeed={1.1}
          minDistance={maxDim * 0.9}
          maxDistance={maxDim * 7}
          maxPolarAngle={Math.PI * 0.62}
          onStart={() => setAuto(false)}
        />
      </Canvas>
      <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Drag: rotate · Wheel: zoom · Right-drag: pan</div>
      <div className="absolute bottom-3 right-4 flex gap-3">
        <button
          data-testid={testId ? `${testId}-spin` : undefined}
          onClick={() => setSpin((s) => !s)}
          className="border border-white/25 bg-black/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/80 backdrop-blur hover:border-white/60"
        >
          Props {spin ? "on" : "off"}
        </button>
        <button
          data-testid={testId ? `${testId}-reset` : undefined}
          onClick={() => {
            controls.current?.reset();
            setAuto(true);
          }}
          className="border border-white/25 bg-black/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/80 backdrop-blur hover:border-white/60"
        >
          Reset view
        </button>
      </div>
    </div>
  );
}
