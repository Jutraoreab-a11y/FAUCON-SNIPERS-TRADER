-- ============================================================
-- Couche IA : palette de sources + résultats cités
-- À exécuter dans Supabase > SQL Editor (après schema.sql)
-- ============================================================

create table if not exists sources (
  id bigint generated always as identity primary key,
  name text not null,
  domain text not null unique,        -- ex: 'fred.stlouisfed.org' (sans https://)
  type text default 'news',           -- 'macro' | 'news' | 'marche' | 'banque_centrale'
  active boolean default true,
  last_fetch_at timestamptz,
  last_status text,                   -- 'ok' | 'erreur: ...'
  created_at timestamptz default now()
);

create table if not exists ai_findings (
  id bigint generated always as identity primary key,
  topic text not null,                -- 'GOLD' | 'SILVER' | 'BRENT' | 'WTI' | 'FED' | 'USD' | 'MACRO'
  kind text default 'resume',         -- 'resume' | 'donnee' | 'evenement'
  summary text not null,
  value text,                         -- valeur citée si pertinent (ex: '4.50%')
  impact_level text,                  -- laissé NULL : on n'invente pas de niveau d'impact
  source_name text,
  source_url text not null,           -- OBLIGATOIRE : pas de source = pas de résultat
  fetched_at timestamptz default now()
);
create index if not exists ai_findings_topic_idx on ai_findings (topic, fetched_at desc);

-- news.link existe déjà : les news IA y stockent l'URL de la source.

alter table sources enable row level security;
alter table ai_findings enable row level security;
create policy "public read sources" on sources for select using (true);
create policy "public read ai_findings" on ai_findings for select using (true);
-- Usage perso sans auth : modification de la palette depuis l'app autorisée.
-- (À restreindre par utilisateur si tu ouvres l'app à d'autres personnes.)
create policy "anon manage sources" on sources for all using (true) with check (true);

insert into sources (name, domain, type) values
  ('FRED (Réserve fédérale St. Louis)', 'fred.stlouisfed.org', 'macro'),
  ('Federal Reserve', 'federalreserve.gov', 'banque_centrale'),
  ('U.S. EIA (énergie)', 'eia.gov', 'macro'),
  ('World Gold Council', 'gold.org', 'marche'),
  ('Reuters', 'reuters.com', 'news'),
  ('Investing.com', 'investing.com', 'news'),
  ('XTB', 'xtb.com', 'news'),
  ('Yahoo Finance', 'finance.yahoo.com', 'marche'),
  ('TradingView', 'tradingview.com', 'marche'),
  ('OPEC', 'opec.org', 'macro')
on conflict (domain) do nothing;
