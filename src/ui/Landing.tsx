/* eslint-disable @next/next/no-img-element -- marketing images are pre-optimised static files with explicit sizes */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadSelectedDrone } from "@/storage/selection";

/** Fade/slide a block in when it scrolls into view (instant when the user prefers reduced motion). */
function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setShown(true), io.disconnect()), { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`transition-all duration-[900ms] ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const eyebrow = "font-mono text-[11px] uppercase tracking-[0.3em] text-amber-300";
const h2 = "mt-3 text-4xl font-semibold uppercase leading-[1.02] tracking-tight sm:text-6xl";

function HeroVideo() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="absolute inset-0 bg-[#0b0d0f]">
      <img src="/video/hero-poster.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
      {!failed && (
        <video
          data-testid="hero-video"
          className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/video/hero-poster.jpg"
          onError={() => setFailed(true)}
        >
          <source src="/video/hero.webm" type="video/webm" />
          <source src="/video/hero.mp4" type="video/mp4" />
        </video>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,13,15,0.72)_0%,rgba(11,13,15,0.28)_38%,rgba(11,13,15,0.55)_72%,#0b0d0f_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_60%,rgba(11,13,15,0.78)_0%,transparent_60%)]" />
    </div>
  );
}

function Nav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? "border-b border-white/10 bg-[#0b0d0f]/85 backdrop-blur" : "bg-transparent"}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <img src="/brand/logo-white.svg" alt="" width={38} height={27} className="h-[27px] w-auto" />
          <span className="font-mono text-xs uppercase tracking-[0.3em]">Drone Sim</span>
        </Link>
        <nav className="hidden items-center gap-8 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70 md:flex">
          <a href="#simulator" className="hover:text-white">Simulator</a>
          <Link href="/drones" className="hover:text-white">Drones</Link>
          <a href="#environments" className="hover:text-white">Environments</a>
          <a href="#controls" className="hover:text-white">Controls</a>
          <Link href="/missions" className="hover:text-white">Missions</Link>
        </nav>
        <Link data-testid="nav-launch" href="/launch" className="bg-amber-400 px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-black hover:bg-white">
          Launch
        </Link>
      </div>
    </header>
  );
}

export function Landing() {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    loadSelectedDrone().then(setSelected);
  }, []);

  return (
    <main className="bg-[#0b0d0f] text-white">
      <Nav />

      {/* ------------------------------------------------ hero */}
      <section className="relative flex min-h-[100svh] items-end overflow-hidden">
        <HeroVideo />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-16 pt-40 sm:pb-24">
          <div className={eyebrow}>Semi-realistic FPV simulation</div>
          <h1 data-testid="hero-title" className="mt-4 text-[clamp(3.2rem,11vw,9.5rem)] font-semibold uppercase leading-[0.9] tracking-[-0.03em]">
            Master
            <br />
            the flight.
          </h1>
          <p className="mt-7 max-w-xl text-lg text-white/75">
            Experience realistic FPV drone simulation. Explore industrial environments, master your controls and push your piloting skills further.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link data-testid="cta-launch" href="/launch" className="bg-amber-400 px-9 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-black hover:bg-white">
              Launch the simulator
            </Link>
            <Link data-testid="cta-drones" href="/drones" className="border border-white/45 px-9 py-4 text-sm font-semibold uppercase tracking-[0.2em] hover:border-amber-300 hover:text-amber-300">
              Discover the drones
            </Link>
          </div>
          {selected && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
              Your last pick: <span className="text-white/80">{selected.replace(/-/g, " ")}</span> ·{" "}
              <Link href={`/fly?drone=${selected}`} className="text-amber-300 hover:text-amber-200">
                fly it now
              </Link>
            </p>
          )}
          <dl className="mt-14 grid max-w-4xl grid-cols-2 gap-x-10 gap-y-5 border-t border-white/20 pt-6 sm:grid-cols-4">
            {[
              ["120 Hz", "fixed-step physics"],
              ["3", "drones, 3 flight modes"],
              ["5", "environments, any weather"],
              ["3", "ways to fly: phone, pad, keys"],
            ].map(([k, v]) => (
              <div key={v}>
                <dt className="font-mono text-3xl tabular-nums">{k}</dt>
                <dd className="mt-1 text-[11px] uppercase tracking-[0.15em] text-white/55">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ discover */}
      <section id="simulator" className="mx-auto max-w-7xl px-6 py-28">
        <div className="grid items-end gap-10 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <div className={eyebrow}>Discover the simulator</div>
            <h2 className={h2}>
              Four motors.
              <br />
              Real consequences.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="max-w-lg text-white/65">
              Every rotor is simulated on its own, with motor lag, battery sag, drag, collision damage and wind. Hit a pillar at speed and a motor weakens. There is no
              autopilot hiding the physics: you fly the airframe.
            </p>
          </Reveal>
        </div>
        <div className="mt-14 grid gap-4 lg:grid-cols-12 lg:grid-rows-2">
          <Reveal className="relative overflow-hidden lg:col-span-8 lg:row-span-2">
            <img src="/img/hall-fpv.jpg" alt="FPV view through the steel structure of the industrial hall" width={1600} height={900} loading="lazy" className="h-full min-h-[320px] w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-6">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-300">Industrial complex</div>
              <div className="mt-1 text-xl">Pipes, catwalks and steel beams, textured and lit like a real plant.</div>
            </div>
          </Reveal>
          <Reveal className="relative overflow-hidden lg:col-span-4" delay={100}>
            <img src="/img/hall-chase.jpg" alt="Chase camera view of the FPV drone under the mezzanine" width={1200} height={675} loading="lazy" className="h-full min-h-[200px] w-full object-cover" />
            <div className="absolute left-4 top-4 bg-black/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] backdrop-blur">Chase camera</div>
          </Reveal>
          <Reveal className="flex flex-col justify-center border border-white/15 bg-white/[0.03] p-7 lg:col-span-4" delay={200}>
            <div className="font-mono text-5xl tabular-nums text-amber-300">4 × 1</div>
            <p className="mt-3 text-sm text-white/65">independent rotors, each with its own thrust, lag and damage. Propellers spin at their simulated speed.</p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ drones */}
      <section id="drones" className="border-y border-white/10 bg-[#0e1114] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <div className={eyebrow}>Choose your drone</div>
            <h2 className={h2}>Three airframes.<br />Three personalities.</h2>
          </Reveal>
          <div className="mt-16 space-y-20">
            {[
              { id: "fpv-freestyle", img: "/img/drone-fpv.jpg", name: "FPV Freestyle 5\"", tag: "Raw power. Acro precision.", text: "Around 8:1 thrust-to-weight and fully manual rates. The fastest, least forgiving airframe in the fleet.", flip: false },
              { id: "inspection", img: "/img/drone-inspection.jpg", name: "Inspection Quad", tag: "Steady hands for tight work.", text: "A heavy, stable platform with a stabilised gimbal camera. Built to hold position next to a pipe, not to race.", flip: true },
              { id: "cinewhoop", img: "/img/drone-cinewhoop.jpg", name: "Cinewhoop 3\"", tag: "Safe in tight spaces.", text: "Ducted props that forgive contact and a compact frame that fits narrow corridors. Smooth, controllable, indoor-ready.", flip: false },
            ].map((d) => (
              <Reveal key={d.id}>
                <div className={`grid items-center gap-8 lg:grid-cols-[1.4fr_1fr] ${d.flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
                  <Link href="/drones" className="group relative block overflow-hidden border border-white/10">
                    <img src={d.img} alt={`${d.name} 3D render`} width={1400} height={800} loading="lazy" className="w-full transition-transform duration-700 group-hover:scale-[1.03]" />
                    <span className="absolute bottom-3 right-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 group-hover:text-amber-300">Open in 3D →</span>
                  </Link>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/45">{d.id.replace("-", " ")}</div>
                    <h3 className="mt-2 text-3xl font-semibold uppercase tracking-tight">{d.name}</h3>
                    <div className="mt-1 text-lg text-amber-300">{d.tag}</div>
                    <p className="mt-4 max-w-md text-white/65">{d.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-16">
            <Link href="/drones" className="inline-block border border-white/40 px-8 py-4 text-sm font-semibold uppercase tracking-[0.2em] hover:border-amber-300 hover:text-amber-300">
              Explore every drone in 3D
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ environments */}
      <section id="environments">
        <div className="relative min-h-[80vh] overflow-hidden">
          <img src="/img/hall-mezz.jpg" alt="Mezzanine and storage racks inside the industrial hall" width={1920} height={1080} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0d0f] via-[#0b0d0f]/70 to-transparent" />
          <div className="relative mx-auto flex min-h-[80vh] max-w-7xl items-center px-6 py-24">
            <Reveal className="max-w-xl">
              <div className={eyebrow}>Explore industrial environments</div>
              <h2 className={h2}>Inside the plant.</h2>
              <p className="mt-5 text-white/70">
                A 48-metre production hall with a workshop, mezzanine, storage racks, catwalks, ducting and machinery. Narrow corridors, overhead obstacles and
                real concrete, steel and rust, with industrial lighting and daylight through the windows.
              </p>
              <ul className="mt-6 space-y-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white/60">
                <li>· PBR concrete, steel, wood and weathered metal</li>
                <li>· Collision from simplified geometry, never the visual mesh</li>
                <li>· Always calm air indoors</li>
              </ul>
            </Reveal>
          </div>
        </div>
        <div className="relative min-h-[80vh] overflow-hidden">
          <img src="/img/yard.jpg" alt="Quarry yard under a procedural sky with clouds" width={1920} height={1080} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-l from-[#0b0d0f] via-[#0b0d0f]/55 to-transparent" />
          <div className="relative mx-auto flex min-h-[80vh] max-w-7xl items-center justify-end px-6 py-24">
            <Reveal className="max-w-xl">
              <div className={eyebrow}>Out in the open</div>
              <h2 className={h2}>Quarry yard.</h2>
              <p className="mt-5 text-white/70">
                Gantry cranes, fuel tanks, container stacks and a tall tower under a procedural sky: sun, clouds, haze and fog, with changing wind that pushes you off
                your line.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Clear", "Cloudy", "Overcast", "Golden hour", "Fog"].map((s) => (
                  <span key={s} className="border border-white/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/75">
                    {s}
                  </span>
                ))}
                {["Calm", "Breeze", "Gusty"].map((s) => (
                  <span key={s} className="border border-amber-300/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200">
                    Wind: {s}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ more maps */}
      <section className="mx-auto max-w-7xl px-6 pb-28 pt-24">
        <Reveal>
          <div className={eyebrow}>Three more worlds</div>
          <h2 className={h2}>From forest to harbour.</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
          {[
            { img: "/img/map-forest.jpg", name: "Pine Valley", text: "Fly the trail between the pines and cross the river on a timber bridge.", cls: "lg:row-span-1" },
            { img: "/img/map-wind.jpg", name: "Desert Wind Farm", text: "Climb to hub height and inspect 46 m turbines.", cls: "lg:mt-10" },
            { img: "/img/map-harbor.jpg", name: "Harbor District", text: "Thread the container aisles and slip under a quay crane.", cls: "lg:mt-20" },
          ].map((m, i) => (
            <Reveal key={m.name} delay={i * 120} className={m.cls}>
              <Link href={`/launch`} className="group relative block overflow-hidden border border-white/10">
                <img src={m.img} alt={`${m.name} map`} width={1200} height={675} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5">
                  <div className="text-lg font-semibold uppercase tracking-wide">{m.name}</div>
                  <div className="mt-1 text-sm text-white/65">{m.text}</div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ controls */}
      <section id="controls" className="mx-auto max-w-7xl px-6 py-28">
        <div className="grid items-center gap-16 lg:grid-cols-[1fr_1.15fr]">
          <Reveal>
            <div className={eyebrow}>Take control</div>
            <h2 className={h2}>Fly it your way.</h2>
            <p className="mt-5 max-w-md text-white/65">Pick up the radio you already own, or use the phone in your pocket. Switch between them mid-flight: throttle hands over without a jump.</p>
            <dl className="mt-8 space-y-6">
              <div>
                <dt className="text-lg">Smartphone</dt>
                <dd className="mt-1 text-sm text-white/60">Scan a QR code, rotate to landscape and fly with two multitouch sticks. Local Wi-Fi, WebRTC when available, with a hard failsafe if the link drops.</dd>
              </div>
              <div>
                <dt className="text-lg">Gamepad</dt>
                <dd className="mt-1 text-sm text-white/60">Mode 1 and Mode 2 layouts, calibration, expo, deadzones and inversion. Throttle in integrate or radio-style absolute mode.</dd>
              </div>
              <div>
                <dt className="text-lg">Keyboard</dt>
                <dd className="mt-1 text-sm text-white/60">Smooth, slewed sticks for quick sessions, with AZERTY-friendly defaults.</dd>
              </div>
            </dl>
          </Reveal>
          <Reveal delay={150} className="relative">
            <div className="relative mx-auto aspect-[16/10] w-full max-w-2xl">
              <div className="absolute left-0 top-[8%] w-[62%] rotate-[-2deg] border border-white/15 bg-[#14181c] p-4 shadow-2xl">
                <div className="grid grid-cols-5 gap-1.5 font-mono text-xs">
                  {["", "Z", "", "E", "", "Q", "S", "D", "", "", "A", "", "", "", ""].map((k, i) => (
                    <div key={i} className={`flex aspect-square items-center justify-center rounded-md border text-white/80 ${k ? "border-white/25 bg-white/[0.06]" : "border-transparent"}`}>
                      {k}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                  <span>Keyboard</span>
                  <span>↑ ↓ throttle</span>
                </div>
              </div>
              <div className="absolute bottom-0 left-[6%] w-[52%] rotate-[1.5deg] border border-white/15 bg-[#14181c] p-4 shadow-2xl">
                <svg viewBox="0 0 220 110" className="w-full" fill="none" stroke="currentColor" strokeWidth="2.5" aria-label="Gamepad">
                  <path d="M60 22h100c24 0 36 28 44 56 4 14-4 24-16 24-12 0-18-8-26-18H78c-8 10-14 18-26 18-12 0-20-10-16-24 8-28 20-56 24-56z" className="text-white/70" />
                  <circle cx="72" cy="52" r="12" className="text-amber-300" />
                  <circle cx="132" cy="68" r="12" className="text-amber-300" />
                  <path d="M96 40v14M89 47h14" className="text-white/70" />
                  <circle cx="158" cy="44" r="3.5" className="text-white/70" /><circle cx="172" cy="52" r="3.5" className="text-white/70" /><circle cx="158" cy="60" r="3.5" className="text-white/70" /><circle cx="144" cy="52" r="3.5" className="text-white/70" />
                </svg>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">Gamepad · Mode 1 / 2</div>
              </div>
              <div className="absolute right-0 top-0 w-[55%] overflow-hidden rounded-[22px] border-[5px] border-[#2a2f35] bg-black shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
                <img src="/img/pad.jpg" alt="The smartphone controller in landscape with two touch sticks" width={844} height={390} loading="lazy" className="w-full" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ missions */}
      <section id="train" className="border-t border-white/10 bg-[#0e1114] py-28">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-[1fr_1.2fr]">
          <Reveal>
            <div className={eyebrow}>Train and improve</div>
            <h2 className={h2}>Prove it<br />on the clock.</h2>
            <ol className="mt-10 divide-y divide-white/10 border-y border-white/10">
              {[
                ["01", "Hall Slalom", "Precision course: eight gates through the main hall."],
                ["02", "Hall Inspection", "Hold position beside machinery and pipework."],
                ["03", "Beacon Hunt", "Find five hidden beacons before time runs out."],
                ["04", "Yard Circuit", "An outdoor lap in a steady breeze."],
              ].map(([n, t, d]) => (
                <li key={n} className="flex gap-6 py-5">
                  <span className="font-mono text-sm text-amber-300">{n}</span>
                  <div>
                    <div className="text-lg uppercase tracking-wide">{t}</div>
                    <div className="text-sm text-white/55">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-white/55">Scored on targets, time, health and clean flying. Gold, silver and bronze medals. Your best runs and statistics are saved locally.</p>
            <Link href="/missions" className="mt-8 inline-block bg-white px-8 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-black hover:bg-amber-400">
              View missions
            </Link>
          </Reveal>
          <Reveal delay={150} className="relative">
            <img src="/img/mission-gates.jpg" alt="Mission HUD with a glowing target gate in the hall" width={1600} height={900} loading="lazy" className="w-full border border-white/10" />
            <img src="/img/mission-result.jpg" alt="Mission result card with a gold medal" width={900} height={506} loading="lazy" className="absolute -bottom-8 -left-6 hidden w-[46%] border border-white/20 shadow-2xl sm:block" />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ final CTA */}
      <section className="relative overflow-hidden py-32 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,180,31,0.16),transparent_60%)]" />
        <Reveal className="relative mx-auto max-w-3xl px-6">
          <h2 className="text-5xl font-semibold uppercase leading-[0.95] tracking-tight sm:text-7xl">Ready for take-off?</h2>
          <p className="mt-5 text-white/65">No install. Runs in your browser.</p>
          <Link href="/launch" className="mt-9 inline-block bg-amber-400 px-10 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-black hover:bg-white">
            Launch the simulator
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
          <span>Drone Simulator · semi-realistic, not a certified training device</span>
          <span className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/drones" className="hover:text-white">Drones</Link>
            <Link href="/missions" className="hover:text-white">Missions</Link>
            <Link href="/stats" className="hover:text-white">Stats</Link>
            <Link href="/settings" className="hover:text-white">Settings</Link>
            <span>Textures: ambientCG (CC0)</span>
          </span>
        </div>
      </footer>
    </main>
  );
}
