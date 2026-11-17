import type { Metadata } from "next";
import { DroneShowcaseLoader } from "@/ui/DroneShowcaseLoader";

export const metadata: Metadata = { title: "Drones · Drone Simulator", description: "Explore the simulator's drones in interactive 3D and choose one for your next flight." };

export default function DronesPage() {
  return <DroneShowcaseLoader />;
}
