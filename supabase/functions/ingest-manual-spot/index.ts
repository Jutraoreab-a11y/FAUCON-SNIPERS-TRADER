// ============================================================
// EDGE FUNCTION : ingest-manual-spot
//
// Reçoit le vrai spot physique (Brent, WTI, Gold, Silver) que l'utilisateur a lui-même
// copié depuis Investing.com (page "Historical Data" ou export CSV) et collé dans la page
// "Saisie Spot" du SaaS — jamais scrapé automatiquement : Investing.com bloque en dur
// (HTTP 403) toute requête serveur, mais n'empêche personne de consulter et copier ces
// mêmes données dans un vrai navigateur. Ce n'est donc pas une donnée inventée : c'est la
// vraie donnée publique de marché, saisie par un humain plutôt que par un robot.
//
// Le parsing du texte collé (dates, séparateurs, virgules de milliers) est fait côté
// client (js/app.js) pour permettre un aperçu avant envoi — cette fonction ne reçoit que
// des lignes déjà normalisées {date: "YYYY-MM-DD", open, high, low, close}.
//
// Sémantique d'écrasement (demandée explicitement) : un nouvel import n'écrase QUE les
// dates "à cheval" entre l'ancien et le nouveau fichier (upsert sur ticker+timeframe+date) —
// jamais tout l'historique du ticker. Ça permet d'importer un fichier partiel (ex. juste le
// dernier mois) sans effacer les années précédentes déjà en base.
//
// Chaque ligne écrite est marquée avec l'id de CET import (colonne price_history.import_id),
// et cet import lui-même conserve une copie exacte de ce qu'il a envoyé (import_log.rows_snapshot)
// — ce qui permet, depuis "Historique des imports" :
//   - de supprimer précisément un import (et, via ON DELETE CASCADE sur import_id, uniquement
//     les lignes de prix qui lui appartiennent encore à cet instant — celles qu'un import plus
//     récent n'a pas déjà remplacées) ;
//   - de "repousser" un import plus ancien dans les calculs (voir reactivate-import), c-a-d
//     réappliquer ses valeurs même si un import plus récent les avait depuis écrasées, sans
//     avoir à redemander le fichier.
// Pour vider complètement l'historique d'un ticker : supprimer tous ses imports un par un.
//
// 24/09/2026 : AUTOMATISATION COMPLÈTE demandée explicitement — avant ce changement, un
// import mettait à jour price_history mais PAS signals/economic_indicators (lus par Analyse
// et Dashboard) : il fallait relancer compute-signals à la main, ou attendre le cron
// compute-signals-daily (jusqu'à 24h de retard). Résultat vécu : "j'ai reimporter. rien ne
// bouge." Maintenant, dès que l'upsert de price_history est fait, cette fonction appelle
// elle-même compute-signals AVANT de répondre — un seul geste (choisir l'actif, coller le
// fichier) et tout est à jour (price_history ET signals/economic_indicators) au moment où
// la réponse revient au navigateur. Ce n'est plus un bug potentiel : c'est le comportement
// normal, documenté ici. Si compute-signals échoue (ex. Supabase indisponible), l'import
// reste acquis (les prix sont déjà en base) — seul le recalcul est signalé en échec via
// signalsRefreshed:false / signalsError, pour ne jamais donner une fausse impression de succès.
//
// Appel : POST /ingest-manual-spot  { ticker, rows: [{date, open, high, low, close}, ...], filename }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS : cette fonction est appelée DIRECTEMENT depuis le navigateur (page Saisie Spot, via
// supabaseClient.functions.invoke), contrairement aux autres fonctions du projet (fetch-yahoo,
// compute-signals) qui n'étaient testées que par curl — curl ignore CORS, un navigateur non :
// sans ces en-têtes et sans répondre à la requête préflight OPTIONS, le navigateur bloque la
// réponse avant même qu'elle atteigne le code appelant, ce qui remonte côté client comme
// "Failed to send a request to the Edge Function" — pas une erreur de logique métier, une
// erreur de transport.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 4 tickers "spot réel" + 6 tickers déjà alimentés par ailleurs par le passé (fetch-yahoo,
// gold-api.com) : un import manuel sur CEUX-LA sert à corriger/backfiller leur historique.
// Codes alignés sur ceux déjà écrits par fetch-yahoo (BRENT_FUTURE, WTI_FUTURE, GOLD_FUTURE, SILVER_FUTURE, USD_CNH, SP500).
const ALLOWED_TICKERS = new Set([
  "BRENT_SPOT_REAL", "WTI_SPOT_REAL", "XAUUSD_SPOT", "XAGUSD_SPOT",
  "BRENT_FUTURE", "WTI_FUTURE", "GOLD_FUTURE", "SILVER_FUTURE", "USD_CNH", "SP500",
]);

type IncomingRow = { date: string; open: number | null; high: number | null; low: number | null; close: number };

function isValidRow(r: any): r is IncomingRow {
  return (
    r && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    typeof r.close === "number" && Number.isFinite(r.close) &&
    (r.open == null || Number.isFinite(r.open)) &&
    (r.high == null || Number.isFinite(r.high)) &&
    (r.low == null || Number.isFinite(r.low))
  );
}

// Appelle compute-signals (dans le même projet Supabase) juste après une écriture réussie
// dans price_history, pour que signals/economic_indicators (lus par Analyse et Dashboard)
// reflètent immédiatement les nouvelles données — plus besoin de geste séparé. Le service
// role key sert de jeton d'authentification (compute-signals est protégée comme toute edge
// function du projet) ; ce n'est pas un appel public, uniquement de serveur à serveur.
async function triggerComputeSignals(supabaseUrl: string, serviceKey: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/compute-signals`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `compute-signals HTTP ${res.status} : ${text.slice(0, 300)}` };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: `Appel compute-signals impossible : ${String(e)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false, error: "Corps JSON invalide" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const ticker = body?.ticker;
  const rows = body?.rows;
  const filename = typeof body?.filename === "string" && body.filename ? body.filename : "inconnu";

  if (typeof ticker !== "string" || !ALLOWED_TICKERS.has(ticker)) {
    return new Response(JSON.stringify({ ok: false, error: `Ticker non autorisé : ${ticker}. Autorisés : ${[...ALLOWED_TICKERS].join(", ")}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "Aucune ligne à enregistrer (rows vide)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const valid: IncomingRow[] = [];
  const rejected: any[] = [];
  for (const r of rows) {
    if (isValidRow(r)) valid.push(r);
    else rejected.push(r);
  }

  if (valid.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "Aucune ligne valide dans ce fichier" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // 1) On enregistre l'import EN PREMIER, avec une copie exacte de ses lignes (rows_snapshot) :
  // on a besoin de son id avant d'écrire dans price_history (pour marquer les lignes), et le
  // snapshot permet de le "repousser" plus tard sans redemander le fichier à l'utilisateur.
  const { data: importRow, error: importInsertError } = await supabase
    .from("import_log")
    .insert({
      ticker,
      filename,
      lignes_recues: rows.length,
      lignes_valides: valid.length,
      lignes_enregistrees: 0, // mis à jour juste après avec le vrai compte
      rows_snapshot: valid,
    })
    .select("id")
    .single();

  if (importInsertError || !importRow) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Échec d'enregistrement de l'import : " + (importInsertError?.message || "inconnu"),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const importId = importRow.id as number;

  // 2) Upsert (jamais de suppression globale) : seules les dates présentes dans CE fichier
  // sont écrasées ("dates à cheval") ; tout le reste de l'historique du ticker est intact.
  const upsertRows = valid.map((r) => ({
    ticker, timeframe: "D1", ts: `${r.date}T00:00:00.000Z`,
    open: r.open, high: r.high, low: r.low, price: r.close,
    source: "investing.com (saisie manuelle)",
    import_id: importId,
  }));

  let upserted = 0;
  let lastError: string | null = null;
  const batchSize = 500;
  for (let i = 0; i < upsertRows.length; i += batchSize) {
    const batch = upsertRows.slice(i, i + batchSize);
    const { error } = await supabase.from("price_history").upsert(batch, { onConflict: "ticker,timeframe,ts" });
    if (!error) upserted += batch.length;
    else lastError = error.message;
  }

  // On corrige le compte réel dans le log (best-effort : une erreur ici ne doit pas faire
  // échouer l'import, qui a déjà eu lieu à ce stade).
  try {
    await supabase.from("import_log").update({ lignes_enregistrees: upserted }).eq("id", importId);
  } catch (_e) {
    // ignoré volontairement
  }

  // 3) Automatisation complète : on relance compute-signals tout de suite, pour qu'Analyse
  // et Dashboard soient à jour dès que cette réponse revient — voir commentaire en tête de
  // fichier. On le fait même si l'upsert ci-dessus a eu des erreurs partielles (les lignes
  // qui SONT passées méritent d'être reflétées), mais jamais si aucune ligne n'a été écrite.
  let signalsRefreshed = false;
  let signalsError: string | null = null;
  if (upserted > 0) {
    const result = await triggerComputeSignals(supabaseUrl, serviceKey);
    signalsRefreshed = result.ok;
    signalsError = result.error;
  }

  return new Response(JSON.stringify({
    ok: !lastError,
    ticker,
    importId,
    recues: rows.length,
    valides: valid.length,
    rejetees: rejected.length,
    upserted,
    erreur: lastError,
    signalsRefreshed,
    signalsError,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
