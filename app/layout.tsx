import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, themeBootstrapScript } from "@/lib/theme-context";

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
  title: "Ascentic",
  description: "Single-user personal portfolio and net worth tracker",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={ibmPlexMono.variable} suppressHydrationWarning>
      <head>
        {/* Sets data-theme from localStorage before first paint, so a saved
            dark preference never flashes light on load. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
