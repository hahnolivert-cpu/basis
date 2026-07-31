-- Per-holding opt-out from net worth totals and every chart — for highly
-- uncertain marks (e.g. an illiquid angel investment) the user wants to see
-- listed but not counted by default.
alter table holdings add column included_in_net_worth boolean not null default true;
