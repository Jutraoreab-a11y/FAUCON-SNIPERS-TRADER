-- ============================================================
-- PLANIFICATION AUTOMATIQUE (cron)
-- À exécuter APRÈS avoir déployé compute-signals, ingest-manual-spot et fetch-news.
-- Remplace <PROJECT_REF> et <SERVICE_ROLE_KEY> par tes vraies valeurs.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- fetch-yahoo (temps réel + clôture quotidienne) retiré le 23/09/2026 : plus aucune
-- collecte automatique de prix, uniquement la saisie manuelle Investing.com
-- (ingest-manual-spot) — source unique, contrôlée, jamais de donnée inventée.
-- Si ces jobs cron existent encore côté Supabase, les arrêter avec :
--   select cron.unschedule('fetch-yahoo-15m');
--   select cron.unschedule('fetch-yahoo-daily');

-- Recalcule les indicateurs (Z-Score, Percentile, corrélations) après la clôture
select cron.schedule(
  'compute-signals-daily',
  '10 22 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/compute-signals',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  );
  $$
);

-- Vérifier :        select * from cron.job;
-- Tout arrêter :    select cron.unschedule('compute-signals-daily');

-- Rafraîchit les actualités réelles (Yahoo Finance, par ticker) 4 fois par jour
select cron.schedule(
  'fetch-news-4x',
  '15 6,11,16,21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/fetch-news',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  );
  $$
);
-- Tout arrêter :    select cron.unschedule('fetch-news-4x');
-- ---------- Couche IA (Anthropic) : lecture de la palette de sources ----------
-- 3 passages par jour ouvré (ouverture Londres, ouverture NY, clôture). Coût API à surveiller.
select cron.schedule(
  'ai-research',
  '0 7,13,21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/ai-research',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
    timeout_milliseconds := 120000
  );
  $$
);
-- Arrêter : select cron.unschedule('ai-research');
