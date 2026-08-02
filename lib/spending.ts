// Credit card spending: CSV import parsing + client-side aggregation.
// Money is integer cents everywhere except the raw CSV, which is dollars.

export type SpendRow = {
  id: string;
  source: string;
  cardLast4: string;
  date: string; // transaction_date, YYYY-MM-DD
  description: string;
  category: string;
  amountCents: number; // positive = purchase, negative = refund/credit
  reimbursedBy: string | null;
};

export type ParsedSpendRow = {
  source: string;
  cardLast4: string;
  transactionDate: string;
  postedDate: string | null;
  description: string;
  category: string;
  amountCents: number;
  externalId: string;
};

// Card payments settle the statement balance — they're a transfer between
// accounts already counted elsewhere in net worth, not spending, so they
// never make it into card_spend.
const NON_SPEND_CATEGORIES = new Set(["Payment/Credit"]);

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

// Parses a Capital One "transaction download" CSV:
// Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
//
// occurrenceIndex (per identical card+date+description+debit+credit
// combination) is folded into the external id so re-uploading the same file
// is a no-op, while two genuinely identical same-day line items still get
// distinct ids instead of colliding.
export function parseCapitalOneCsv(text: string): ParsedSpendRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col("transaction date");
  const iPosted = col("posted date");
  const iCard = col("card no.");
  const iDesc = col("description");
  const iCategory = col("category");
  const iDebit = col("debit");
  const iCredit = col("credit");
  if (iDate < 0 || iCard < 0 || iDesc < 0 || iCategory < 0) {
    throw new Error("CSV is missing an expected column (Transaction Date / Card No. / Description / Category)");
  }

  const seen = new Map<string, number>();
  const rows: ParsedSpendRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    if (cells.every((c) => c.trim() === "")) continue;
    const category = (cells[iCategory] ?? "").trim() || "Other";
    if (NON_SPEND_CATEGORIES.has(category)) continue;

    const debit = parseFloat(cells[iDebit] ?? "");
    const credit = parseFloat(cells[iCredit] ?? "");
    const amountCents = Number.isFinite(debit) ? Math.round(debit * 100) : Number.isFinite(credit) ? -Math.round(credit * 100) : 0;
    if (amountCents === 0) continue;

    const transactionDate = (cells[iDate] ?? "").trim();
    const description = (cells[iDesc] ?? "").trim();
    const cardLast4 = (cells[iCard] ?? "").trim();
    const dedupeKey = [cardLast4, transactionDate, description, cells[iDebit], cells[iCredit]].join("|");
    const occurrence = seen.get(dedupeKey) ?? 0;
    seen.set(dedupeKey, occurrence + 1);

    rows.push({
      source: "capital_one",
      cardLast4,
      transactionDate,
      postedDate: iPosted >= 0 ? (cells[iPosted] ?? "").trim() || null : null,
      description,
      category,
      amountCents,
      externalId: `capital_one|${dedupeKey}|${occurrence}`,
    });
  }
  return rows;
}

// Brex's card API reports a merchant category code instead of the plain-
// English category Capital One's CSV export gives us directly — mapped here
// to the same vocabulary (falling back to "Other" for anything unmapped) so
// the two sources roll up into one coherent category breakdown rather than
// Brex spend all landing in a single miscellaneous bucket.
const MCC_CATEGORY: Record<string, string> = {
  "5812": "Dining", "5813": "Dining", "5814": "Dining",
  "4121": "Other Travel", "4111": "Other Travel", "4112": "Other Travel", "4722": "Other Travel", "7523": "Other Travel",
  "5411": "Merchandise", "5499": "Merchandise", "5462": "Merchandise", "5921": "Merchandise", "5999": "Merchandise",
  "5310": "Merchandise", "5331": "Merchandise", "5441": "Merchandise", "5651": "Merchandise", "5691": "Merchandise",
  "5712": "Merchandise", "5942": "Merchandise", "5944": "Merchandise", "5946": "Merchandise", "5993": "Merchandise",
  "5997": "Merchandise", "5251": "Merchandise", "5422": "Merchandise", "5655": "Merchandise", "5994": "Merchandise",
  "5941": "Merchandise", "5309": "Merchandise", "5611": "Merchandise", "5045": "Merchandise", "5732": "Merchandise",
  "5734": "Software", "7372": "Software", "4816": "Software", "5968": "Software", "5818": "Software", "5815": "Software",
  "7997": "Health Care", "5912": "Health Care", "8099": "Health Care", "7298": "Health Care", "8011": "Health Care",
  "8021": "Health Care", "8062": "Health Care", "8071": "Health Care",
  "4899": "Phone/Cable", "4814": "Phone/Cable",
  "4900": "Utilities", "9399": "Utilities",
  "5541": "Gas/Automotive", "5542": "Gas/Automotive", "5511": "Gas/Automotive",
  "7011": "Lodging",
  "3000": "Airfare", "3001": "Airfare", "3008": "Airfare", "3009": "Airfare", "3034": "Airfare", "3058": "Airfare",
  "3072": "Airfare", "3127": "Airfare", "3132": "Airfare", "3174": "Airfare", "3245": "Airfare", "4511": "Airfare",
  "3355": "Car Rental", "3389": "Car Rental", "7512": "Car Rental",
  "7399": "Professional Services", "8999": "Professional Services", "8931": "Professional Services",
  "8244": "Professional Services", "8299": "Professional Services",
  "6300": "Insurance", "5960": "Insurance",
  "7999": "Entertainment", "7922": "Entertainment", "7941": "Entertainment",
  "7230": "Other Services", "8699": "Other Services", "8398": "Other Services", "4215": "Other Services",
};

export function mccToCategory(mcc: string | null): string {
  return (mcc && MCC_CATEGORY[mcc]) || "Other";
}

// Groups a description down to a stable merchant key for subscription
// detection — strips trailing order/transaction ids and normalizes
// whitespace/case, so "APPLE.COM/BILL" always matches itself but
// "ONEQUINCE* Q10005419" and "ONEQUINCE* Q27249072" (different order ids
// each time) also collapse to one merchant instead of looking like one-offs.
export function normalizeMerchant(description: string): string {
  return description
    .toUpperCase()
    .replace(/[#*]?\s*[A-Z]{0,3}\d{4,}[A-Z0-9]*/g, "") // trailing numeric ids
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

// Personal spend excludes anything reimbursed via Brex (that's 976's
// expense, not personal) and never includes refunds/credits pulling the
// total negative in a single-month view — a big refund just nets down
// that month's spend, same as a real statement would show it.
export function personalRows(rows: SpendRow[]): SpendRow[] {
  return rows.filter((r) => !r.reimbursedBy);
}

export function reimbursedRows(rows: SpendRow[]): SpendRow[] {
  return rows.filter((r) => r.reimbursedBy);
}

export function byMonth(rows: SpendRow[]): { month: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = monthKey(r.date);
    map.set(k, (map.get(k) ?? 0) + r.amountCents / 100);
  }
  return Array.from(map.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function byCategory(rows: SpendRow[]): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.amountCents <= 0) continue; // refunds don't get their own category slice
    map.set(r.category, (map.get(r.category) ?? 0) + r.amountCents / 100);
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export type RecurringMerchant = {
  merchant: string;
  category: string;
  months: number;
  lastDate: string;
  avgAmount: number;
  minAmount: number;
  maxAmount: number;
  totalAmount: number;
};

// Anything charged by the same merchant in 3+ distinct months — true
// subscriptions (Apple, Xfinity) and merely-habitual recurring charges
// (a monthly haircut) both surface here; the amount range makes the
// difference obvious at a glance rather than the heuristic having to guess.
export function detectRecurring(rows: SpendRow[]): RecurringMerchant[] {
  const groups = new Map<string, SpendRow[]>();
  for (const r of rows) {
    if (r.amountCents <= 0) continue;
    const key = normalizeMerchant(r.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const out: RecurringMerchant[] = [];
  for (const [merchant, group] of Array.from(groups)) {
    const months = new Set(group.map((r) => monthKey(r.date)));
    if (months.size < 3) continue;
    const amounts = group.map((r) => r.amountCents / 100);
    out.push({
      merchant,
      category: group[0].category,
      months: months.size,
      lastDate: group.reduce((max, r) => (r.date > max ? r.date : max), group[0].date),
      avgAmount: amounts.reduce((s, a) => s + a, 0) / amounts.length,
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      totalAmount: amounts.reduce((s, a) => s + a, 0),
    });
  }
  return out.sort((a, b) => b.months - a.months || b.totalAmount - a.totalAmount);
}
