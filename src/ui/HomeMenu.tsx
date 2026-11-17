"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DRONE_LIST } from "@/config/drones";
import type { GraphicsQuality } from "@/config/graphics";
import { ENVIRONMENTS } from "@/env/registry";
import type { WeatherPreset } from "@/sim/wind";
import type { FlightMode } from "@/sim/types";
import { loadGameSettings } from "@/storage/gameSettings";
import { loadSelectedDrone } from "@/storage/selection";

const QUALITIES: GraphicsQuality[] = ["low", "medium", "high"];
const WEATHERS: WeatherPreset[] = ["calm", "breeze", "gusty"];

/** Launcher: environment, drone, flight mode, weather and graphics, then Free Flight; plus missions, stats and settings. */
export function HomeMenu() {
  const [envId, setEnvId] = useState(ENVIRONMENTS[0].id);
  const env = ENVIRONMENTS.find((e) => e.id === envId) ?? ENVIRONMENTS[0];
  const [droneId, setDroneId] = useState(DRONE_LIST[0].id);
  const drone = DRONE_LIST.find((d) => d.id === droneId) ?? DRONE_LIST[0];
  const [modeSel, setModeSel] = useState<FlightMode | null>(null);
  const mode: FlightMode = modeSel && drone.flightModes.includes(modeSel) ? modeSel : drone.defaultMode;
  const [quality, setQuality] = useState<GraphicsQuality>("medium");
  const [weather, setWeather] = useState<WeatherPreset>("calm");

  useEffect(() => {
    loadGameSettings().then((s) => setQuality(s.graphics.quality));
    // The drone picked in the showcase becomes the default for the next flight.
    loadSelectedDrone().then((id) => id && DRONE_LIST.some((d) => d.id === id) && setDroneId(id));
  }, []);

  const chip = (active: boolean) =>
    `border px-4 py-2 text-left text-sm uppercase tracking-[0.14em] transition-colors ${
      active ? "border-amber-400 bg-amber-400 text-black" : "border-white/20 text-white/75 hover:border-white/50"
    }`;
  const sub = (active: boolean) => `mt-1 text-[11px] normal-case tracking-normal ${active ? "text-black/70" : "text-white/45"}`;
  const heading = "mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/50";

  const params = new URLSearchParams({ drone: drone.id, mode, q: quality, env: env.id });
  if (env.outdoor) params.set("weather", weather);

  return (
    <main className="min-h-screen bg-[#101214] text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-between px-6 py-10">
        <header className="flex items-baseline justify-between border-b border-white/15 pb-4 font-mono text-xs uppercase tracking-[0.3em] text-white/60">
          <Link href="/" className="flex items-center gap-3 hover:text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-white.svg" alt="" width={28} height={20} className="h-5 w-auto" />
            Drone Simulator
          </Link>
          <span>Build 1.1</span>
        </header>

        <section className="py-10">
          <h1 className="text-5xl font-semibold uppercase leading-[1.05] tracking-tight sm:text-7xl">
            Industrial
            <br />
            flight simulation
          </h1>
          <p className="mt-6 max-w-xl text-white/65">
            Quadcopter dynamics with four simulated motors and fixed 120 Hz physics. Fly freely, take on missions, or use a gamepad or your phone as the
            controller.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              data-testid="start-free"
              href={`/fly?${params.toString()}`}
              className="inline-block bg-white px-8 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-black hover:bg-amber-400"
            >
              Start free flight
            </Link>
            <Link data-testid="open-missions" href="/missions" className="inline-block border border-white/40 px-8 py-3 text-sm font-semibold uppercase tracking-[0.2em] hover:border-amber-400 hover:text-amber-300">
              Missions
            </Link>
          </div>

          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.6fr_1fr_1fr]">
            <div>
              <div className={heading}>Environment</div>
              <div className="flex flex-col gap-2">
                {ENVIRONMENTS.map((e) => (
                  <button key={e.id} data-testid={`env-${e.id}`} onClick={() => setEnvId(e.id)} className={chip(e.id === envId)}>
                    <div>{e.name}</div>
                    <div className={sub(e.id === envId)}>{e.description}</div>
                  </button>
                ))}
              </div>
              {env.outdoor && (
                <div className="mt-4">
                  <div className={heading}>Weather</div>
                  <div className="flex gap-2">
                    {WEATHERS.map((w) => (
                      <button key={w} data-testid={`weather-${w}`} onClick={() => setWeather(w)} className={chip(w === weather)}>
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className={heading}>Drone</div>
              <div className="flex flex-col gap-2">
                {DRONE_LIST.map((d) => (
                  <button key={d.id} onClick={() => setDroneId(d.id)} className={chip(d.id === droneId)}>
                    <div>{d.name}</div>
                    <div className={sub(d.id === droneId)}>{d.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className={heading}>Flight mode</div>
              <div className="flex flex-col gap-2">
                {drone.flightModes.map((m) => (
                  <button key={m} onClick={() => setModeSel(m)} className={chip(m === mode)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className={heading}>Graphics</div>
              <div className="flex flex-col gap-2">
                {QUALITIES.map((q) => (
                  <button key={q} onClick={() => setQuality(q)} className={chip(q === quality)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="flex gap-6 border-t border-white/15 pt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/75">
          <Link data-testid="open-drones" href="/drones" className="hover:text-white">
            Drones in 3D
          </Link>
          <Link data-testid="open-stats" href="/stats" className="hover:text-white">
            Stats and history
          </Link>
          <Link data-testid="open-settings" href="/settings" className="hover:text-white">
            Settings
          </Link>
          <span className="text-white/40">Phone controller: Phone button in flight</span>
        </footer>
      </div>
    </main>
  );
}
