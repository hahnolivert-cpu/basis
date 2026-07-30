import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Body text AND headings use the system font stack, not a bundled webfont —
// SF Pro is Apple's proprietary font and isn't on Google Fonts or licensed
// for self-hosting. -apple-system/BlinkMacSystemFont resolve to real San
// Francisco on macOS, iOS and iPadOS (Safari and Chrome both honor it), with
// Segoe UI / Roboto / sans-serif as sane fallbacks elsewhere. See lib/theme.ts.
//
// IBM Plex Mono (numerals) stays as a bundled webfont — it's the ledger
// design system's number typeface, not generic UI chrome; see CLAUDE.md.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ascendia",
  description: "Single-user personal portfolio and net worth tracker",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <body>{children}</body>
    </html>
  );
}
