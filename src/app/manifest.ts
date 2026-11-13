import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Track",
    short_name: "Track",
    description: "A personal life operating system.",
    start_url: "/",
    display: "standalone",
    background_color: "#111315",
    theme_color: "#111315",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
