import { XMLParser } from "fast-xml-parser";

// IBKR Flex Web Service client.
//
// Two-step protocol: SendRequest returns a reference code, then GetStatement
// exchanges that code for the statement. IBKR generates the statement
// asynchronously and answers with Warn/1019 ("statement generation in
// progress") until it is ready, so GetStatement has to be polled.

const BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

export type FlexPosition = {
  symbol: string;
  description: string;
  assetCategory: string;
  currency: string;
  qty: number;
  costBasisMoney: number;
  positionValue: number;
  markPrice: number;
};

export type FlexCash = { currency: string; endingCash: number };

export type FlexTxn = {
  externalId: string;
  date: string; // YYYY-MM-DD
  type: "buy" | "sell" | "dividend" | "interest" | "transfer";
  symbol: string | null;
  amount: number; // signed dollars
  description: string;
};

export type FlexStatement = {
  accountId: string;
  fromDate: string | null;
  toDate: string | null;
  positions: FlexPosition[];
  cash: FlexCash[];
  transactions: FlexTxn[];
  skipped: string[];
};

// fast-xml-parser collapses a single child into an object rather than an array;
// everything downstream wants a list.
function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

// Flex emits dates as YYYYMMDD, or YYYYMMDD;HHMMSS for dateTime fields.
function flexDate(v: unknown): string {
  const s = String(v ?? "").trim();
  const digits = s.split(/[;\s]/)[0].replace(/-/g, "");
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

// Maps a Flex CashTransaction `type` string onto our transactions.type enum.
// Returns null for categories we deliberately don't record.
function cashTxnType(raw: string): FlexTxn["type"] | null {
  const t = raw.toLowerCase();
  if (t.includes("dividend") || t.includes("payment in lieu")) return "dividend";
  if (t.includes("interest")) return "interest";
  if (t.includes("deposit") || t.includes("withdrawal") || t.includes("transfer")) return "transfer";
  if (t.includes("fee") || t.includes("tax")) return "transfer";
  return null;
}

// STK covers both single stocks and ETFs in Flex; our schema stores both as
// Equities and distinguishes ETFs elsewhere.
export function assetClassFor(assetCategory: string): "Cash" | "Equities" | "Crypto" | null {
  const c = assetCategory.toUpperCase();
  if (c === "STK" || c === "FUND" || c === "ETF") return "Equities";
  if (c === "CRYPTO") return "Crypto";
  if (c === "CASH") return null; // handled via CashReport
  return null; // OPT, FUT, BOND, etc. — not modelled yet
}

export function parseFlexStatement(xml: string): FlexStatement {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    trimValues: true,
  });
  const doc = parser.parse(xml);

  const resp = doc?.FlexQueryResponse;
  if (!resp) throw new Error("Response is not a FlexQueryResponse — check the query ID and that it returns XML");

  const stmt = toArray(resp.FlexStatements?.FlexStatement)[0];
  if (!stmt) throw new Error("FlexQueryResponse contained no FlexStatement");

  const skipped: string[] = [];

  const positions: FlexPosition[] = [];
  for (const p of toArray(stmt.OpenPositions?.OpenPosition)) {
    const cls = assetClassFor(String(p.assetCategory ?? ""));
    if (cls === null) {
      skipped.push(`position ${p.symbol ?? "?"} (assetCategory ${p.assetCategory ?? "?"})`);
      continue;
    }
    positions.push({
      symbol: String(p.symbol ?? "").trim(),
      description: String(p.description ?? "").trim(),
      assetCategory: String(p.assetCategory ?? "").trim(),
      currency: String(p.currency ?? "USD").trim(),
      qty: num(p.position),
      // costBasisMoney is the total; fall back to price x qty if absent.
      costBasisMoney: p.costBasisMoney !== undefined ? num(p.costBasisMoney) : num(p.costBasisPrice) * num(p.position),
      positionValue: num(p.positionValue),
      markPrice: num(p.markPrice),
    });
  }

  // BASE_SUMMARY duplicates the base-currency total; keep the real currencies.
  const cash: FlexCash[] = toArray(stmt.CashReport?.CashReportCurrency)
    .filter((c) => String(c.currency ?? "").toUpperCase() !== "BASE_SUMMARY")
    .map((c) => ({ currency: String(c.currency ?? "").trim(), endingCash: num(c.endingCash) }));

  const transactions: FlexTxn[] = [];

  for (const t of toArray(stmt.Trades?.Trade)) {
    const side = String(t.buySell ?? "").toUpperCase();
    const type = side.startsWith("BUY") ? "buy" : side.startsWith("SELL") ? "sell" : null;
    const id = String(t.tradeID ?? "").trim();
    if (!type || !id) {
      skipped.push(`trade ${t.symbol ?? "?"} (buySell "${t.buySell ?? ""}", tradeID "${id}")`);
      continue;
    }
    transactions.push({
      externalId: `ibkr:trade:${id}`,
      date: flexDate(t.tradeDate ?? t.dateTime),
      type,
      symbol: String(t.symbol ?? "").trim() || null,
      // netCash is proceeds net of commission, already signed by direction.
      amount: t.netCash !== undefined ? num(t.netCash) : num(t.proceeds),
      description: `${side} ${num(t.quantity)} ${t.symbol ?? ""} @ ${num(t.tradePrice)}`.trim(),
    });
  }

  for (const c of toArray(stmt.CashTransactions?.CashTransaction)) {
    const raw = String(c.type ?? "");
    const type = cashTxnType(raw);
    const id = String(c.transactionID ?? "").trim();
    if (!type || !id) {
      skipped.push(`cash transaction "${raw}" (transactionID "${id}")`);
      continue;
    }
    transactions.push({
      externalId: `ibkr:cash:${id}`,
      date: flexDate(c.dateTime ?? c.settleDate ?? c.reportDate),
      type,
      symbol: String(c.symbol ?? "").trim() || null,
      amount: num(c.amount),
      description: raw,
    });
  }

  return {
    accountId: String(stmt.accountId ?? "").trim(),
    fromDate: stmt.fromDate ? flexDate(stmt.fromDate) : null,
    toDate: stmt.toDate ? flexDate(stmt.toDate) : null,
    positions,
    cash,
    transactions,
    skipped,
  };
}

// Surfaces IBKR's own error envelope, which arrives with HTTP 200.
function flexError(xml: string): string | null {
  const status = /<Status>([^<]*)<\/Status>/i.exec(xml)?.[1]?.trim();
  const code = /<ErrorCode>([^<]*)<\/ErrorCode>/i.exec(xml)?.[1]?.trim();
  const msg = /<ErrorMessage>([^<]*)<\/ErrorMessage>/i.exec(xml)?.[1]?.trim();
  if (status && status.toLowerCase() !== "success" && code) return `IBKR ${status} ${code}: ${msg ?? "no message"}`;
  return null;
}

export async function sendRequest(token: string, queryId: string): Promise<{ referenceCode: string; url: string }> {
  const res = await fetch(`${BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`, {
    cache: "no-store",
  });
  const xml = await res.text();
  if (!res.ok) throw new Error(`SendRequest HTTP ${res.status}`);

  const referenceCode = /<ReferenceCode>([^<]*)<\/ReferenceCode>/i.exec(xml)?.[1]?.trim();
  const url = /<Url>([^<]*)<\/Url>/i.exec(xml)?.[1]?.trim();
  if (!referenceCode || !url) {
    throw new Error(flexError(xml) ?? `SendRequest returned no reference code. Body: ${xml.slice(0, 300)}`);
  }
  return { referenceCode, url };
}

// Error code 1019 means "statement generation in progress" — the one case
// worth retrying. Anything else is surfaced immediately.
export async function getStatement(
  url: string,
  token: string,
  referenceCode: string,
  { attempts = 8, delayMs = 3000 }: { attempts?: number; delayMs?: number } = {}
): Promise<string> {
  let lastError = "";
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${url}?q=${encodeURIComponent(referenceCode)}&t=${encodeURIComponent(token)}&v=3`, {
      cache: "no-store",
    });
    const xml = await res.text();

    if (xml.includes("<FlexQueryResponse")) return xml;

    const err = flexError(xml);
    const inProgress = /<ErrorCode>1019<\/ErrorCode>/i.test(xml);
    if (err && !inProgress) throw new Error(err);
    lastError = err ?? `unexpected body: ${xml.slice(0, 200)}`;

    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Statement not ready after ${attempts} attempts. Last: ${lastError}`);
}

export async function fetchFlexStatement(token: string, queryId: string, opts?: { attempts?: number; delayMs?: number }) {
  const { referenceCode, url } = await sendRequest(token, queryId);
  const xml = await getStatement(url, token, referenceCode, opts);
  return { xml, statement: parseFlexStatement(xml) };
}
