import { runIbkrSync } from "./ibkr";
import { runBrexSync } from "./brex";

// Every provider sync, run in-process. Add Plaid (Chase + Robinhood) here as it
// lands; the dashboard button and the weekly cron both go through runAllSyncs so
// they stay in step automatically.
const TARGETS: { name: string; run: (opts: { dryRun: boolean }) => Promise<unknown> }[] = [
  { name: "ibkr", run: runIbkrSync },
  { name: "brex", run: runBrexSync },
];

export type SyncRunResult = { target: string; ok: boolean; error?: string; [k: string]: unknown };

export async function runAllSyncs({ dryRun = false }: { dryRun?: boolean } = {}) {
  const results: SyncRunResult[] = await Promise.all(
    TARGETS.map(async (t) => {
      try {
        const out = await t.run({ dryRun });
        return { target: t.name, ok: true, ...(out as object) };
      } catch (e) {
        return { target: t.name, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  const failed = results.filter((r) => !r.ok).length;
  return { dryRun, ranAt: new Date().toISOString(), succeeded: results.length - failed, failed, results };
}
