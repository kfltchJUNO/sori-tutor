import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sori-Tutor · AI Korean Pronunciation Coach",
    short_name: "소리튜터",
    description: "AI-powered Korean pronunciation coaching with real-time phoneme-level feedback.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
