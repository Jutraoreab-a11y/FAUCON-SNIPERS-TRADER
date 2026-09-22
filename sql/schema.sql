-- ============================================================
-- QUANT-MACRO SAAS — SCHÉMA SUPABASE
-- À exécuter dans Supabase > SQL Editor > New query
-- ============================================================

-- Prix bruts récupérés depuis Yahoo Finance — plusieurs granularités (D1 pour l'historique
-- long terme, 15m pour l'intraday). Une ligne par ticker/timeframe/horodatage.
create table if not exists price_history (
  id bigint generated always as identity primary key,
  ticker text not null,          -- ex: 'GC=F', 'BZ=F', 'USDCNH=X'
  timeframe text not null default 'D1',  -- 'D1' | '15m'
  ts timestamptz not null,       -- horodatage exact de la bougie
  open numeric, high numeric, low numeric,
  price numeric not null,        -- close
  volume numeric,
  source text default 'yahoo',
  fetched_at timestamptz default now(),
  unique (ticker, timeframe, ts)
);
create index if not exists idx_price_history_lookup on price_history (ticker, timeframe, ts desc);

create table if not exists assets (
  id text primary key,               -- 'GOLD' | 'SILVER' | 'BRENT' | 'WTI'
  name text not null
);
insert into assets (id, name) values
  ('GOLD','Gold'), ('SILVER','Silver'), ('BRENT','Brent'), ('WTI','WTI')
on conflict (id) do nothing;

create table if not exists signals (
  id bigint generated always as identity primary key,
  asset_id text references assets(id),
  date date not null,
  basis_spread numeric,
  zscore_60j numeric,
  percentile_10j numeric,
  corr_20j numeric,
  corr_60j numeric,
  pressure text,
  supply text,
  institutional_note text,
  signal_label text,        -- 'BIAIS HAUSSIER' | 'BIAIS BAISSIER' | 'RÉSILIENCE' | 'NEUTRE'
  tone text,                -- 'green' | 'red' | 'blue'
  created_at timestamptz default now()
);

create table if not exists economic_indicators (
  id bigint generated always as identity primary key,
  code text not null,       -- 'USDCNH' | 'EURUSD' | 'DXY' | 'US500'
  value numeric,
  change_pct numeric,
  ts timestamptz default now()
);

create table if not exists news (
  id bigint generated always as identity primary key,
  title text not null,
  source text,
  asset_tag text,
  impact_level text,        -- 'Haute' | 'Moyenne' | 'Basse'
  published_at timestamptz default now()
);

create table if not exists risk_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_size numeric default 10000,
  risk_per_trade_pct numeric default 0.5,
  total_risk_pct numeric default 5,
  daily_risk_pct numeric default 2,
  max_trades_per_day int default 5,
  updated_at timestamptz default now()
);

create table if not exists journal_entries (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  entry_date date not null,
  session text not null,      -- 'pre' | 'asie' | 'londres' | 'ny'
  actif text,
  sens text,                  -- 'Acheteur' | 'Vendeur'
  zone text,
  note text,
  updated_at timestamptz default now(),
  unique (user_id, entry_date, session)
);

create table if not exists mt5_accounts (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  login text not null,
  server text not null,
  status text default 'connected',
  created_at timestamptz default now()
);

create table if not exists mt5_snapshots (
  id bigint generated always as identity primary key,
  mt5_account_id bigint references mt5_accounts(id) on delete cascade,
  ts timestamptz default now(),
  balance numeric,
  equity numeric,
  win_rate numeric,
  avg_rr numeric,
  drawdown_max numeric
);

create table if not exists execution_webhooks (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  label text not null,
  url text not null,
  active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- SÉCURITÉ : chaque utilisateur ne voit/modifie que ses données
-- ============================================================
alter table risk_plans enable row level security;
alter table journal_entries enable row level security;
alter table mt5_accounts enable row level security;
alter table execution_webhooks enable row level security;

create policy "own risk plan" on risk_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own journal entries" on journal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own mt5 accounts" on mt5_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own webhooks" on execution_webhooks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- signals, economic_indicators, news, assets, price_history restent publics en lecture
alter table price_history enable row level security;
create policy "public read price_history" on price_history for select using (true);
alter table signals enable row level security;
create policy "public read signals" on signals for select using (true);
alter table economic_indicators enable row level security;
create policy "public read econ" on economic_indicators for select using (true);
alter table news enable row level security;
create policy "public read news" on news for select using (true);
