-- Every table here has RLS enabled with no policies (see CLAUDE.md) — that's
-- exactly what blocked the service_role key from ever needing a policy of
-- its own (it bypasses RLS outright), but it means assistant_readonly's
-- GRANT SELECT from the prior migration was actually returning zero rows:
-- RLS enabled + no matching policy denies every row to any non-bypassing
-- role, table grant notwithstanding. Add an explicit read-only policy per
-- exposed table, scoped to just this role.
create policy assistant_readonly_select on accounts for select to assistant_readonly using (true);
create policy assistant_readonly_select on holdings for select to assistant_readonly using (true);
create policy assistant_readonly_select on snapshots for select to assistant_readonly using (true);
create policy assistant_readonly_select on transactions for select to assistant_readonly using (true);
create policy assistant_readonly_select on liabilities for select to assistant_readonly using (true);
create policy assistant_readonly_select on dividend_cache for select to assistant_readonly using (true);
create policy assistant_readonly_select on dividend_schedule_cache for select to assistant_readonly using (true);
create policy assistant_readonly_select on earnings_cache for select to assistant_readonly using (true);
create policy assistant_readonly_select on weekly_snapshots for select to assistant_readonly using (true);
create policy assistant_readonly_select on card_spend for select to assistant_readonly using (true);
-- plaid_items deliberately gets no policy and no grant — it holds live bank
-- access tokens and the query tool must never be able to read it.
