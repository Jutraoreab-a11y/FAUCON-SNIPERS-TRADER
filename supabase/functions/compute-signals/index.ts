// ============================================================
// EDGE FUNCTION : compute-signals
// Lit price_history et calcule les indicateurs du modèle :
// Spread WTI-Brent, Basis Gold/Silver (Spot-Futur), Z-Score, Percentile,
// corrélations (sur RENDEMENTS, pas les niveaux — cf. diagnostic calculs),
// puis écrit le résultat dans signals et economic_indicators.
//
// Déploiement : supabase functions deploy compute-signals
// Cron        : voir sql/schedule.sql (à lancer après fetch-yahoo)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ZSCORE_WINDOW = 60;      // PARAMETRES_GLISSANTS!B11 dans l'Excel
const PERCENTILE_WINDOW = 30;  // PARAMETRES_GLISSANTS!B8 (corrigé, cf. diagnostic)
const CORR_SHORT = 20;         // PARAMETRES_GLISSANTS!B4
const CORR_LONG = 60;          // PARAMETRES_GLISSANTS!B5
const Z_ALERTE = 1.5;
const Z_CRITIQUE = 2;

function mean(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stdev(arr: number[]) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}
function zscore(series: number[]) {
  // series[0] = valeur la plus récente
  if (series.length < ZSCORE_WINDOW) return null;
  const window = series.slice(0, ZSCORE_WINDOW);
  const sd = stdev(window);
  if (sd === 0) return null;
  return (window[0] - mean(window)) / sd;
}
function percentile(series: number[]) {
  if (series.length < PERCENTILE_WINDOW) return null;
  const window = series.slice(0, PERCENTILE_WINDOW);
  const current = window[0];
  const rank = window.filter((v) => v <= current).length;
  return (rank / window.length) * 100;
}
function returns(series: number[]) {
  // rendement[i] = (prix[i]-prix[i+1])/prix[i+1] ; series[0]=plus récent
  const out: number[] = [];
  for (let i = 0; i < series.length - 1; i++) {
    if (series[i + 1] !== 0) out.push((series[i] - series[i + 1]) / series[i + 1]);
  }
  return out;
}
function correlation(a: number[], b: number[], window: number) {
  if (a.length < window + 1 || b.length < window + 1) return null;
  const ra = returns(a).slice(0, window);
  const rb = returns(b).slice(0, window);
  const n = Math.min(ra.length, rb.length);
  if (n < window) return null;
  const ma = mean(ra.slice(0, n)), mb = mean(rb.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

async function getSeries(supabase: any, ticker: string, limit = 800): Promise<number[]> {
  const { data } = await supabase
    .from("price_history")
    .select("price")
    .eq("ticker", ticker)
    .eq("timeframe", "D1")
    .order("ts", { ascending: false })
    .limit(limit);
  return (data || []).map((r: any) => Number(r.price));
}

function statusFromZ(z: number | null) {
  if (z === null) return "NO DATA";
  if (z > Z_CRITIQUE) return "PANIQUE | Backwardation Critique";
  if (z > Z_ALERTE) return "TENSION";
  if (z < -Z_CRITIQUE) return "PANIQUE | Contango Extrême";
  if (z < -Z_ALERTE) return "TENSION";
  if (Math.abs(z) <= 0.75) return "ÉQUILIBRE";
  return "MOYEN";
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [gcSeries, xauSeries, siSeries, xagSeries, brentSeries, wtiSeries, cnhSeries] = await Promise.all([
    getSeries(supabase, "GC=F"),
    getSeries(supabase, "XAUUSD=X"),
    getSeries(supabase, "SI=F"),
    getSeries(supabase, "XAGUSD=X"),
    getSeries(supabase, "BZ=F"),
    getSeries(supabase, "CL=F"),
    getSeries(supabase, "USDCNH=X"),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const out: Record<string, unknown> = {};
  const rows: any[] = [];

  // ---- GOLD : Basis = Spot - Futur (les deux existent réellement sur Yahoo) ----
  if (gcSeries.length && xauSeries.length) {
    const basisGold = xauSeries.map((v, i) => (gcSeries[i] != null ? v - gcSeries[i] : null)).filter((v) => v != null) as number[];
    const z = zscore(basisGold);
    const p = percentile(basisGold);
    const corrShort = correlation(brentSeries, cnhSeries, CORR_SHORT); // confirmation macro générale
    rows.push({
      asset_id: "GOLD", date: today, basis_spread: basisGold[0] ?? null,
      zscore_60j: z, percentile_10j: p, corr_20j: corrShort, corr_60j: correlation(brentSeries, cnhSeries, CORR_LONG),
      pressure: statusFromZ(z), supply: p !== null ? `Percentile ${p.toFixed(0)}%` : "NO DATA",
      signal_label: z !== null && z > Z_ALERTE ? "BIAIS HAUSSIER" : z !== null && z < -Z_ALERTE ? "BIAIS BAISSIER" : "NEUTRE",
      tone: z !== null && z > Z_ALERTE ? "green" : z !== null && z < -Z_ALERTE ? "red" : "blue",
    });
    out.gold = { basis: basisGold[0], zscore: z, percentile: p };
  }

  // ---- SILVER : Basis = Spot - Futur ----
  if (siSeries.length && xagSeries.length) {
    const basisSilver = xagSeries.map((v, i) => (siSeries[i] != null ? v - siSeries[i] : null)).filter((v) => v != null) as number[];
    const z = zscore(basisSilver);
    const p = percentile(basisSilver);
    rows.push({
      asset_id: "SILVER", date: today, basis_spread: basisSilver[0] ?? null,
      zscore_60j: z, percentile_10j: p,
      pressure: statusFromZ(z), supply: p !== null ? `Percentile ${p.toFixed(0)}%` : "NO DATA",
      signal_label: z !== null && z > Z_ALERTE ? "BIAIS HAUSSIER" : z !== null && z < -Z_ALERTE ? "BIAIS BAISSIER" : "NEUTRE",
      tone: z !== null && z > Z_ALERTE ? "green" : z !== null && z < -Z_ALERTE ? "red" : "blue",
    });
    out.silver = { basis: basisSilver[0], zscore: z, percentile: p };
  }

  // ---- BRENT / WTI : Spread WTI-Brent (le vrai "Basis Spot-Futur" pétrole nécessite
  //      une source payante type Databento — non disponible via Yahoo gratuitement) ----
  if (brentSeries.length && wtiSeries.length) {
    const spread = wtiSeries.map((v, i) => (brentSeries[i] != null ? v - brentSeries[i] : null)).filter((v) => v != null) as number[];
    const z = zscore(spread);
    const p = percentile(spread);
    const corr20 = correlation(brentSeries, cnhSeries, CORR_SHORT);
    const corr60 = correlation(brentSeries, cnhSeries, CORR_LONG);
    rows.push({
      asset_id: "BRENT", date: today, basis_spread: spread[0] ?? null,
      zscore_60j: z, percentile_10j: p, corr_20j: corr20, corr_60j: corr60,
      pressure: statusFromZ(z), supply: "Basis Spot-Futur non disponible (source gratuite) — Spread WTI-Brent utilisé en proxy",
      institutional_note: corr20 !== null ? `Corrélation USD/CNH (20j, rendements) : ${corr20.toFixed(2)}` : "Données insuffisantes",
      signal_label: corr20 !== null && corr20 > 0 && z !== null && z > 0 ? "BIAIS HAUSSIER" : "NEUTRE",
      tone: corr20 !== null && corr20 > 0 && z !== null && z > 0 ? "green" : "blue",
    });
    rows.push({
      asset_id: "WTI", date: today, basis_spread: spread[0] != null ? -spread[0] : null,
      zscore_60j: z !== null ? -z : null, percentile_10j: p !== null ? 100 - p : null,
      pressure: "Suit le Spread WTI-Brent (voir BRENT)", supply: "Stocks EIA non branchés (à ajouter)",
      signal_label: "NEUTRE", tone: "blue",
    });
    out.spread_wti_brent = { value: spread[0], zscore: z, percentile: p };
  }

  if (rows.length) {
    const { error } = await supabase.from("signals").upsert(rows);
    if (error) out.signals_error = error.message;
  }

  // ---- Indicateurs économiques (bloc "Économie" du Dashboard) ----
  const econRows: any[] = [];
  for (const [code, ticker] of [["USDCNH", "USDCNH=X"], ["EURUSD", "EURUSD=X"], ["DXY", "DX-Y.NYB"], ["US500", "^GSPC"]]) {
    const series = await getSeries(supabase, ticker, 2);
    if (series.length) {
      const change = series.length > 1 ? ((series[0] - series[1]) / series[1]) * 100 : null;
      econRows.push({ code, value: series[0], change_pct: change });
    }
  }
  if (econRows.length) {
    const { error } = await supabase.from("economic_indicators").insert(econRows);
    if (error) out.econ_error = error.message;
  }

  return new Response(JSON.stringify({ ok: true, out }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
