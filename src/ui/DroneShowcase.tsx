"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Box3, Vector3 } from "three";
import { DRONE_LIST } from "@/config/drones";
import { DRONE_SHOWCASE } from "@/config/drones/showcase";
import type { DroneConfig } from "@/config/drones/types";
import { GRAVITY } from "@/config/sim";
import { buildDroneModel } from "@/render/droneModels";
import { loadSelectedDrone, saveSelectedDrone } from "@/storage/selection";
import { DroneViewer } from "./DroneViewer";

/** Everything derived from the real configs and the real model, so the catalog can never disagree with the simulation. */
function specsFor(d: DroneConfig) {
  const m = buildDroneModel(d);
  const size = new Box3().setFromObject(m.root).getSize(new Vector3());
  m.dispose();
  const p = d.physics;
  const thrustN = 4 * p.maxThrustPerMotorN;
  const mm = (v: number) => `${Math.round(v * 1000)} mm`;
  return {
    mass: `${Math.round(p.massKg * 1000)} g`,
    dimensions: `${mm(size.x)} × ${mm(size.z)} × ${mm(size.y)}`,
    diagonal: mm(p.armLengthM * 2),
    props: `${(d.model.propRadiusM * 2 * 39.37).toFixed(1)} in`,
    thrust: `${thrustN.toFixed(0)} N (${(thrustN / GRAVITY).toFixed(1)} kgf)`,
    twr: `${(thrustN / (p.massKg * GRAVITY)).toFixed(1)} : 1`,
    tilt: `${p.maxTiltDeg}°`,
    rates: `${p.maxRatesDegS.roll} / ${p.maxRatesDegS.pitch} / ${p.maxRatesDegS.yaw} °/s`,
    battery: `${d.battery.capacityWh} Wh`,
    camera: `${d.camera.fpv.fovDeg}° FOV · ${d.camera.fpv.tiltDeg}° tilt`,
  };
}

export function DroneShowcase() {
  const [selected, setSelected] = useState<string | null>(null);
  const specs = useMemo(() => Object.fromEntries(DRONE_LIST.map((d) => [d.id, specsFor(d)])), []);

  useEffect(() => {
    loadSelectedDrone().then((id) => id && DRONE_LIST.some((d) => d.id === id) && setSelected(id));
  }, []);

  // Confirm only once the choice is stored, so "Selected" always means it will survive a reload.
  const choose = (id: string) => {
    void saveSelectedDrone(id).then(() => setSelected(id));
  };

  const row = "flex items-baseline justify-between gap-4 border-b border-white/10 py-2";
  const label = "font-mono text-[10px] uppercase tracking-[0.2em] text-white/45";

  return (
    <main className="min-h-screen bg-[#0b0d0f] text-white">
      <header className="mx-auto flex max-w-7xl items-baseline justify-between px-6 py-6">
        <Link href="/" className="font-mono text-xs uppercase tracking-[0.3em] text-white/60 hover:text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-white.svg" alt="" width={28} height={20} className="mr-3 inline-block h-5 w-auto align-middle" />
          Drone Simulator
        </Link>
        <div className="flex gap-6 font-mono text-[11px] uppercase tracking-[0.2em]">
          <Link href="/missions" className="text-white/60 hover:text-white">
            Missions
          </Link>
          <Link href="/settings" className="text-white/60 hover:text-white">
            Settings
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-10 pt-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-amber-300">The fleet</div>
        <h1 className="mt-2 text-5xl font-semibold uppercase leading-none tracking-tight sm:text-7xl">Choose your drone</h1>
        <p className="mt-5 max-w-2xl text-white/65">
          Three airframes, three personalities. Rotate, zoom and inspect each one, then pick the drone for your next flight. All figures below come
          straight from the simulation, so what you read is what you fly.
        </p>
        {selected && (
          <p data-testid="selected-banner" className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
            Selected for your next flight: {DRONE_LIST.find((d) => d.id === selected)?.name}
          </p>
        )}
      </section>

      {DRONE_LIST.map((d, i) => {
        const info = DRONE_SHOWCASE[d.id];
        const s = specs[d.id];
        const isSel = selected === d.id;
        return (
          <section key={d.id} data-testid={`drone-${d.id}`} className="border-t border-white/10">
            <div className={`mx-auto grid max-w-7xl gap-0 lg:grid-cols-[1.35fr_1fr] ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div className="h-[420px] sm:h-[520px] lg:h-[640px]">
                <DroneViewer drone={d} testId={`viewer-${d.id}`} />
              </div>
              <div className="flex flex-col justify-center px-6 py-10 lg:px-12">
                <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-amber-300">{info.category}</div>
                <h2 className="mt-2 text-4xl font-semibold uppercase leading-tight tracking-tight">{d.name}</h2>
                <p className="mt-1 text-lg text-white/80">{info.tagline}</p>
                <p className="mt-4 text-sm text-white/65">{info.role}</p>

                <div className="mt-6">
                  <div className={label}>Flight modes</div>
                  <div className="mt-2 flex gap-2">
                    {d.flightModes.map((m) => (
                      <span key={m} className={`border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] ${m === d.defaultMode ? "border-amber-400 text-amber-300" : "border-white/25 text-white/70"}`}>
                        {m}
                        {m === d.defaultMode ? " · default" : ""}
                      </span>
                    ))}
                  </div>
                </div>

                <dl className="mt-6 text-sm" data-testid={`specs-${d.id}`}>
                  {(
                    [
                      ["Weight", s.mass],
                      ["Dimensions (L × W × H)", s.dimensions],
                      ["Motor diagonal", s.diagonal],
                      ["Propellers", s.props],
                      ["Simulated thrust", s.thrust],
                      ["Thrust-to-weight", s.twr],
                      ["Max tilt (Angle)", s.tilt],
                      ["Max rates (roll/pitch/yaw)", s.rates],
                      ["Battery", s.battery],
                      ["FPV camera", s.camera],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className={row}>
                      <dt className="text-white/55">{k}</dt>
                      <dd className="font-mono text-white">{v}</dd>
                    </div>
                  ))}
                </dl>

                <ul className="mt-6 space-y-2 text-sm text-white/70">
                  {info.traits.map((t) => (
                    <li key={t} className="flex gap-3">
                      <span className="mt-2 h-1 w-3 shrink-0 bg-amber-400" />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-white/40">{info.classNote} Parameters are plausible estimates for the class, not measured from a specific product.</p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    data-testid={`select-${d.id}`}
                    onClick={() => choose(d.id)}
                    className={`px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] ${isSel ? "bg-emerald-400 text-black" : "bg-white text-black hover:bg-amber-400"}`}
                  >
                    {isSel ? "Selected ✓" : "Use this drone"}
                  </button>
                  <Link
                    data-testid={`fly-${d.id}`}
                    href={`/fly?drone=${d.id}&mode=${d.defaultMode}`}
                    onClick={() => choose(d.id)}
                    className="border border-white/40 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] hover:border-amber-400 hover:text-amber-300"
                  >
                    Fly now
                  </Link>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </main>
  );
}
