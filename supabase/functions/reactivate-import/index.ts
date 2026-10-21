// ============================================================
// EDGE FUNCTION : reactivate-import
//
// "Repousse" un import passé en priorité dans les calculs : réapplique exactement les valeurs
// que CET import avait envoyées à l'époque (import_log.rows_snapshot, sauvegardées lors de
// l'import d'origine par ingest-manual-spot), en écrasant ce qu'un import plus récent aurait
// pu écrire depuis pour les mêmes dates — sans avoir à redemander le fichier à l'utilisateur.
// Comme un import normal, c'est un upsert par (ticker, timeframe, date) : seules les dates
// couvertes par CET import sont touchées, jamais tout l'historique du ticker.
//
// Les lignes réécrites sont remarquées avec import_id = cet import : il redevient donc, pour
// ses propres dates, le "propriétaire" visible dans price_history — jusqu'à ce qu'un import
// encore plus récent (ou une nouvelle réactivation d'un autre import) ne les recouvre à
// nouveau.
//
// 24/09/2026 : comme ingest-manual-spot, cette réécriture change price_history — donc on
// relance compute-signals juste après, pour qu'Analyse/Dashboard reflètent immédiatement les
// valeurs repoussées, sans geste séparé ni attente du cron.
//
// Appel : POST /reactivate-import { importId }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SnapshotRow = { date: string; open: number | null; high: number | null; low: number | null; close: number };

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

  const importId = body?.importId;
  if (typeof importId !== "number" || !Number.isFinite(importId)) {
    return new Response(JSON.stringify({ ok: false, error: "importId manquant ou invalide" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: importRow, error: fetchError } = await supabase
    .from("import_log")
    .select("ticker, rows_snapshot")
    .eq("id", importId)
    .maybeSingle();

  if (fetchError) {
    return new Response(JSON.stringify({ ok: false, error: fetchError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!importRow) {
    return new Response(JSON.stringify({ ok: false, error: "Import introuvable (déjà supprimé ?)" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const ticker = importRow.ticker as string;
  const snapshot = importRow.rows_snapshot as SnapshotRow[] | null;
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "Aucune donnée sauvegardée pour cet import (import antérieur à cette fonctionnalité ?)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const upsertRows = snapshot.map((r) => ({
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

  // Automatisation complète : ces valeurs repoussées changent price_history — on relance
  // compute-signals pour qu'Analyse/Dashboard soient à jour immédiatement, même si l'upsert
  // ci-dessus a eu des erreurs partielles.
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
    upserted,
    erreur: lastError,
    signalsRefreshed,
    signalsError,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
