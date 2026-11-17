import type { Metadata } from "next";
import { HomeMenu } from "@/ui/HomeMenu";

export const metadata: Metadata = { title: "Launch · Drone Simulator" };

export default function LaunchPage() {
  return <HomeMenu />;
}
