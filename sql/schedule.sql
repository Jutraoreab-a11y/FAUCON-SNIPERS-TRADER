-- ============================================================
-- PLANIFICATION AUTOMATIQUE (cron)
-- À exécuter APRÈS avoir déployé fetch-yahoo, compute-signals et
-- après avoir lancé backfill-history au moins une fois (voir README).
-- Remplace <PROJECT_REF> et <SERVICE_ROLE_KEY> par tes vraies valeurs.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Capture une bougie 15 minutes, en continu, du lundi au vendredi (heures de marché larges, 06h-22h UTC)
select cron.schedule(
  'fetch-yahoo-15m',
  '*/15 6-22 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/fetch-yahoo?interval=15m',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  );
  $$
);

-- Capture la clôture quotidienne propre (D1) une fois par jour
select cron.schedule(
  'fetch-yahoo-daily',
  '0 22 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/fetch-yahoo?interval=1d',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  );
  $$
);

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
-- Tout arrêter :    select cron.unschedule('fetch-yahoo-15m');
--                   select cron.unschedule('fetch-yahoo-daily');
--                   select cron.unschedule('compute-signals-daily');
