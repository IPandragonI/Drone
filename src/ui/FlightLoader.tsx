"use client";

import dynamic from "next/dynamic";
import type { FlightViewProps } from "./FlightView";

// Rapier WASM + WebGL are browser-only.
const FlightView = dynamic(() => import("./FlightView"), { ssr: false });

export function FlightLoader(props: FlightViewProps) {
  return <FlightView {...props} />;
}
