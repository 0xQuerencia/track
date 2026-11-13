import type { Metadata } from "next";
import { Bricolage_Grotesque, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/shell.css";
import "@/styles/components.css";
import "@/styles/tables.css";
import "@/styles/pages.css";
import "@/styles/motion.css";
import "@/styles/atlas.css";
import "@/styles/track.css";
import { TrackShell } from "@/components/track-shell";

const wordmarkFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-wordmark",
  display: "swap",
});
const sansFont = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-ui-sans",
  display: "swap",
});
const monoFont = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-ui-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Track",
  description: "A personal life operating system.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${wordmarkFont.variable} ${sansFont.variable} ${monoFont.variable} dark`}
    >
      <body>
        <TrackShell>{children}</TrackShell>
      </body>
    </html>
  );
}
