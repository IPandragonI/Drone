import { Suspense } from "react";
import { FlightLoader } from "@/ui/FlightLoader";

type SP = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

async function Flight({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <FlightLoader droneId={first(sp.drone)} mode={first(sp.mode)} quality={first(sp.q)} env={first(sp.env)} weather={first(sp.weather)} sky={first(sp.sky)} mission={first(sp.mission)} difficulty={first(sp.difficulty)} debug={first(sp.debug) === "1"} />;
}

export default function FlyPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-neutral-950 font-mono text-sm tracking-widest text-white/60">LOADING</div>}>
      <Flight searchParams={searchParams} />
    </Suspense>
  );
}
