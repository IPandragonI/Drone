import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Drone Simulator",
    short_name: "Drone Sim",
    description: "Semi-realistic FPV drone flight simulator for industrial environments.",
    start_url: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0b0d0f",
    theme_color: "#0b0d0f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
