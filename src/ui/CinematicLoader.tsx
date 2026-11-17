"use client";

import dynamic from "next/dynamic";

const CinematicView = dynamic(() => import("./CinematicView").then((m) => m.CinematicView), { ssr: false });

export function CinematicLoader({ sky, live }: { sky?: string; live?: boolean }) {
  return <CinematicView sky={sky} live={live} />;
}
