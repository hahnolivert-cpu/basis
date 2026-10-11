export const fmt = (n: number, dp = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const usd = (n: number, dp = 0) => (n < 0 ? "-$" : "$") + fmt(Math.abs(n), dp);

export const usdK = (n: number) =>
  Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + Math.round(n / 1000) + "k";

export const eur = (n: number, dp = 0) => (n < 0 ? "-€" : "€") + fmt(Math.abs(n), dp);

export const eurK = (n: number) =>
  Math.abs(n) >= 1e6 ? "€" + (n / 1e6).toFixed(2) + "M" : "€" + Math.round(n / 1000) + "k";

export const sign = (n: number, s: string) => (n >= 0 ? "+" : "") + s;

// Replaces digits in an already-formatted string with bullets, keeping every
// other character ($ sign, commas, decimal point, minus/plus) — "$1,234.56"
// becomes "$•,•••.••". Preserves the real string's length/shape instead of
// swapping in a fixed-width placeholder, so masked amounts don't cause
// layout jumps or reveal magnitude by looking suspiciously uniform.
export const maskDigits = (formatted: string) => formatted.replace(/[0-9]/g, "•");
