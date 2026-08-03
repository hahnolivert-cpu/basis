-- Gives the Ask assistant (app/api/assistant/chat) a genuine SQL query tool
-- instead of only the pre-computed snapshot in lib/assistant/context.ts, so
-- it can answer questions the snapshot doesn't anticipate (e.g. "what did I
-- spend at Target last quarter"). Two layers keep this from being "hand an
-- LLM the service-role key":
--
-- 1. assistant_readonly only has SELECT on the tables below — notably NOT
--    plaid_items, which holds live bank access tokens. A function owned by
--    this role and marked SECURITY DEFINER runs with exactly its grants,
--    regardless of which key (including service_role) invokes it.
-- 2. Even within those tables, the transaction is forced read-only before
--    running the caller's SQL — this defeats the classic regex bypass of
--    a data-modifying CTE (`with x as (delete from t returning *) select
--    * from x`), since Postgres enforces read-only at the engine level,
--    not by pattern-matching the query text.
create role assistant_readonly nologin;
-- Postgres requires the executing role to be a member of a role before it
-- can transfer object ownership to it (below) — migrations run as
-- `postgres` on Supabase, which isn't superuser here.
grant assistant_readonly to postgres;
grant usage on schema public to assistant_readonly;
-- ALTER ... OWNER TO also requires CREATE on the schema, purely as a
-- Postgres permission check (it doesn't let this role create anything new
-- in practice — it never logs in, and nothing else grants it write access).
grant create on schema public to assistant_readonly;
grant select on
  accounts, holdings, snapshots, transactions, liabilities,
  dividend_cache, dividend_schedule_cache, earnings_cache,
  weekly_snapshots, card_spend
to assistant_readonly;

create function execute_readonly_query(query_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform set_config('transaction_read_only', 'on', true);
  perform set_config('statement_timeout', '5000', true);
  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) sub limit 500) t',
    query_text
  ) into result;
  return result;
end;
$$;

alter function execute_readonly_query(text) owner to assistant_readonly;
revoke all on function execute_readonly_query(text) from public;
grant execute on function execute_readonly_query(text) to service_role;
