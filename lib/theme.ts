// Design tokens — cool paper, ledger-green ink, serif display, mono numerals.
export const T = {
  paper: "#F6F8F6",
  card: "#FFFFFF",
  ink: "#152019",
  inkSoft: "#5C6B62",
  line: "#E2E8E3",
  ledger: "#0E5B43",
  gain: "#0F8A5F",
  loss: "#C43D31",
  chart: ["#0E5B43", "#3E7C68", "#6E9D8D", "#2F4858", "#C09A5B", "#7A6C5D", "#A85D4A", "#9EBEB2"],
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
