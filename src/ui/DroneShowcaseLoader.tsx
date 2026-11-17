"use client";

import dynamic from "next/dynamic";

// WebGL and three.js object ids are browser-only (Next rejects Math.random() during prerender).
const DroneShowcase = dynamic(() => import("./DroneShowcase").then((m) => m.DroneShowcase), {
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center bg-[#0b0d0f] font-mono text-sm tracking-widest text-white/60">LOADING DRONES</div>,
});

export function DroneShowcaseLoader() {
  return <DroneShowcase />;
}
