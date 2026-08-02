// Design tokens — cool paper, ledger-green ink, serif display, mono numerals.
//
// Values are CSS var() references, not literal hex, so the whole app
// retheme on the `data-theme` attribute lib/theme-context.tsx sets on
// <html> — see app/globals.css for the light/dark values each one
// resolves to. Every component reads colors through this object rather
// than hardcoding hex, so light/dark stays a one-file concern.
export const T = {
  paper: "var(--paper)",
  card: "var(--card)",
  ink: "var(--ink)",
  inkSoft: "var(--ink-soft)",
  line: "var(--line)",
  ledger: "var(--ledger)",
  gain: "var(--gain)",
  loss: "var(--loss)",
  // Secondary surface tints for table headers, alt/detail rows, and
  // highlighted totals rows.
  headerBg: "var(--header-bg)",
  subtleBg: "var(--subtle-bg)",
  tint: "var(--tint)",
  track: "var(--track)",
  // Chart tooltip pills are always dark-on-light regardless of page theme.
  tooltipBg: "var(--tooltip-bg)",
  chart: [
    "var(--chart-0)",
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
    "var(--chart-7)",
  ],
} as const;

export const mono = "var(--font-ibm-plex-mono), ui-monospace, monospace";
// System font stack — resolves to real SF Pro on macOS/iOS/iPadOS (Safari and
// Chrome both honor -apple-system/BlinkMacSystemFont), Segoe UI on Windows,
// Roboto on Android. SF Pro itself can't be bundled: it isn't on Google Fonts
// and Apple's license doesn't permit self-hosting it for general web use.
export const sans = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, system-ui, sans-serif";
// Headings previously used a bundled serif (Fraunces); the app now uses one
// system font everywhere, including headlines, so this aliases `sans`.
export const serif = sans;
