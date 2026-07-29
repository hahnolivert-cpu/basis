-- Seed accounts + holdings from design-reference/prototype.jsx BASE_HOLDINGS.
-- Fixed UUIDs for direct account_id references; values are cents, rounded
-- from the prototype's dollar-and-cents figures. ETF rows carry no
-- sector/geo (the prototype derives those dynamically via ETF_DATA).

insert into accounts (id, institution, name, portfolio, type) values
  ('2f112025-a206-4577-a550-9d00cad2447c', 'Brex', 'Brex', 'capital', 'cash'),
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'IBKR', 'IBKR ··6994', 'capital', 'brokerage'),
  ('dbb89da2-3bb7-4fa6-b785-ed18f85faa34', 'Paxos', 'Paxos', 'capital', 'crypto'),
  ('9ae42852-77ca-454f-a04d-18d5003ea11e', 'Chase', 'Chase', 'personal', 'cash'),
  ('d3d12e10-aec7-4ea3-bce3-67b5877d9672', 'Robinhood', 'Robinhood', 'personal', 'brokerage');

insert into holdings (account_id, symbol, name, qty, cost_basis_cents, value_cents, asset_class, sector, geo, yield_pct) values
  -- ---- 976 Capital · Cash (Brex) ----
  ('2f112025-a206-4577-a550-9d00cad2447c', 'Brex Checking', 'Primary checking ··1593', null, 305700, 305700, 'Cash', 'Cash', 'United States', 0),
  ('2f112025-a206-4577-a550-9d00cad2447c', 'Brex Treasury', 'Treasury ··5461', null, 37071400, 37071400, 'Cash', 'Cash', 'United States', 4.3),
  -- ---- 976 Capital · IBKR ----
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'MSTR', 'Strategy Inc', 13.7, 770193, 280963, 'Equities', 'Technology', 'United States', 0),
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'SPHQ', 'Invesco S&P 500 Quality ETF', 266.57, 1650498, 1919287, 'Equities', null, null, 1.3),
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'GOOGL', 'Alphabet Inc.', 76.88, 1412232, 1506918, 'Equities', 'Comm. Services', 'United States', 0.45),
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'ILF', 'iShares Latin America 40 ETF', 317.14, 920911, 919715, 'Equities', null, null, 5.6),
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'TTD', 'The Trade Desk, Inc.', 66.91, 638055, 508545, 'Equities', 'Technology', 'United States', 0),
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'SGOV', 'iShares 0-3 Mo Treasury ETF (est.)', 1542.29, 15420000, 15500000, 'Equities', null, null, 4.7),
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'NVDA', 'NVIDIA Corp (est.)', 200, 2100000, 3640000, 'Equities', 'Technology', 'United States', 0.03),
  ('b015c006-544a-49cf-93b5-757f81fbcdeb', 'AMZN', 'Amazon.com (est.)', 125.21, 2480000, 2930000, 'Equities', 'Consumer Disc.', 'United States', 0),
  -- ---- 976 Capital · Crypto (Paxos) ----
  ('dbb89da2-3bb7-4fa6-b785-ed18f85faa34', 'BTC', 'Bitcoin · 0.1365', 0.1365, 610000, 871100, 'Crypto', 'Crypto', 'Global', 0),
  ('dbb89da2-3bb7-4fa6-b785-ed18f85faa34', 'ETH', 'Ethereum · 3.1152', 3.1152, 740000, 596000, 'Crypto', 'Crypto', 'Global', 0),
  ('dbb89da2-3bb7-4fa6-b785-ed18f85faa34', 'SOL', 'Solana · 21.04', 21.0405, 190000, 156400, 'Crypto', 'Crypto', 'Global', 0),
  -- ---- Personal ----
  ('9ae42852-77ca-454f-a04d-18d5003ea11e', 'Chase Checking', 'Total checking ··4410 (est.)', null, 6171900, 6171900, 'Cash', 'Cash', 'United States', 0),
  ('d3d12e10-aec7-4ea3-bce3-67b5877d9672', 'VOO', 'Vanguard S&P 500 ETF (est.)', 500, 22800000, 28500000, 'Equities', null, null, 1.25),
  ('d3d12e10-aec7-4ea3-bce3-67b5877d9672', 'AAPL', 'Apple Inc (est.)', 176.19, 2200000, 3700000, 'Equities', 'Technology', 'United States', 0.4),
  ('d3d12e10-aec7-4ea3-bce3-67b5877d9672', 'GOOGL', 'Alphabet Inc. (est.)', 76.53, 1200000, 1500000, 'Equities', 'Comm. Services', 'United States', 0.45),
  ('d3d12e10-aec7-4ea3-bce3-67b5877d9672', 'LINK', 'Chainlink · USD', 4209.17, 10172845, 6734666, 'Crypto', 'Crypto', 'Global', 0),
  ('d3d12e10-aec7-4ea3-bce3-67b5877d9672', 'HYPE', 'Hyperliquid · USD', 561.34, 1818495, 2357644, 'Crypto', 'Crypto', 'Global', 0);
