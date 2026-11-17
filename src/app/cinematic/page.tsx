import { Suspense } from "react";
import { CinematicLoader } from "@/ui/CinematicLoader";

type SP = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

async function Cinematic({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <div className="fixed inset-0 bg-black">
      <CinematicLoader sky={first(sp.sky)} live={first(sp.live) === "1"} />
    </div>
  );
}

/** Replay of the recorded demonstration flight. Used to capture the landing-page video and as its live fallback. */
export default function CinematicPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <Cinematic searchParams={searchParams} />
    </Suspense>
  );
}
