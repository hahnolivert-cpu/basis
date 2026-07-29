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
export const serif = "var(--font-fraunces), Georgia, serif";
export const sans = "var(--font-inter), system-ui, sans-serif";
