// ============================================================
// EDGE FUNCTION : delete-import
//
// Supprime définitivement un import de "Historique des imports" (table import_log). La
// contrainte price_history.import_id -> import_log.id ON DELETE CASCADE fait le reste
// automatiquement : toutes les lignes de price_history encore rattachées à cet import (celles
// qu'un import plus récent n'a pas déjà écrasées pour les mêmes dates) sont supprimées avec
// lui, en une seule opération atomique côté base.
//
// Pour vider complètement l'historique d'un ticker : supprimer tous ses imports listés ici,
// un par un (ou plusieurs appels successifs) — il ne peut alors plus rien rester en base pour
// ce ticker, puisque chaque ligne de price_history appartient toujours à un import précis.
//
// 24/09/2026 : comme ingest-manual-spot et reactivate-import, cette suppression peut changer
// price_history (les lignes cascadées) — donc on relance compute-signals juste après, pour
// qu'Analyse/Dashboard reflètent immédiatement la disparition de ces données, sans geste
// séparé ni attente du cron.
//
// Appel : POST /delete-import { importId }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  // On lit d'abord le ticker concerné, uniquement pour le renvoyer dans la réponse (confort
  // d'affichage côté client) — l'absence de la ligne n'empêche pas la suppression de continuer.
  const { data: existing } = await supabase.from("import_log").select("ticker").eq("id", importId).maybeSingle();

  const { error } = await supabase.from("import_log").delete().eq("id", importId);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Automatisation complète : la suppression peut avoir fait disparaître des lignes de
  // price_history (cascade) — on relance compute-signals pour qu'Analyse/Dashboard soient à
  // jour immédiatement.
  const result = await triggerComputeSignals(supabaseUrl, serviceKey);

  return new Response(JSON.stringify({
    ok: true,
    importId,
    ticker: existing?.ticker ?? null,
    signalsRefreshed: result.ok,
    signalsError: result.error,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
