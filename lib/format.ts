export const fmt = (n: number, dp = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const usd = (n: number, dp = 0) => (n < 0 ? "-$" : "$") + fmt(Math.abs(n), dp);

export const usdK = (n: number) =>
  Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + Math.round(n / 1000) + "k";

export const sign = (n: number, s: string) => (n >= 0 ? "+" : "") + s;
