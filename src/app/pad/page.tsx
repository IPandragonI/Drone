import type { Viewport } from "next";
import { Suspense } from "react";
import { PadController } from "@/ui/PadController";

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#0b0d0f" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

async function Pad({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <PadController session={first(sp.s)} token={first(sp.t)} relay={first(sp.r)} />;
}

export default function PadPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center bg-neutral-950 font-mono text-sm tracking-widest text-white/60">LOADING</div>}>
      <Pad searchParams={searchParams} />
    </Suspense>
  );
}
