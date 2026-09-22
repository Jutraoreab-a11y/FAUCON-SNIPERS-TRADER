// ============================================================
// EDGE FUNCTION : backfill-history
// À lancer UNE FOIS (ou occasionnellement) pour remplir l'historique :
//  - 2 ans en D1 (quotidien) — pour comparer les périodes, calculer
//    Z-Score/Percentile sur longue période, etc.
//  - 60 jours en 15 minutes — le maximum que Yahoo permette gratuitement
//    en intraday. Au-delà, il faudra une source payante (Databento) pour
//    reconstituer un historique 15min plus ancien.
//
// Appel : supabase functions invoke backfill-history
// Attention : peut prendre plusieurs minutes (beaucoup de données à écrire).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TICKERS: Record<string, string> = {
  GOLD_FUT: "GC=F", GOLD_SPOT: "XAUUSD=X",
  SILVER_FUT: "SI=F", SILVER_SPOT: "XAGUSD=X",
  BRENT: "BZ=F", WTI: "CL=F",
  USDCNH: "USDCNH=X", EURUSD: "EURUSD=X",
  DXY: "DX-Y.NYB", US500: "^GSPC",
};

async function fetchHistory(ticker: string, range: string, interval: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; QuantMacroPersonalUse/1.0)" } });
  if (!res.ok) return [];
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps.length || !quote) return [];

  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null) continue;
    bars.push({
      ts: new Date(timestamps[i] * 1000).toISOString(),
      open: quote.open?.[i] ?? null,
      high: quote.high?.[i] ?? null,
      low: quote.low?.[i] ?? null,
      price: close,
      volume: quote.volume?.[i] ?? null,
    });
  }
  return bars;
}

async function insertBatches(supabase: any, rows: any[], batchSize = 500) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("price_history").upsert(batch, { onConflict: "ticker,timeframe,ts" });
    if (!error) inserted += batch.length;
    else console.error("Erreur insertion batch:", error.message);
  }
  return inserted;
}

Deno.serve(async (_req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const summary: Record<string, { d1: number; m15: number }> = {};

  for (const [label, ticker] of Object.entries(TICKERS)) {
    // 2 ans en quotidien
    const daily = await fetchHistory(ticker, "2y", "1d");
    const dailyRows = daily.map((b) => ({ ticker, timeframe: "D1", source: "yahoo", ...b }));
    const d1Count = await insertBatches(supabase, dailyRows);

    await new Promise((r) => setTimeout(r, 400)); // ménager l'endpoint Yahoo

    // 60 jours en 15 minutes (maximum disponible gratuitement)
    const intraday = await fetchHistory(ticker, "60d", "15m");
    const intradayRows = intraday.map((b) => ({ ticker, timeframe: "15m", source: "yahoo", ...b }));
    const m15Count = await insertBatches(supabase, intradayRows);

    summary[label] = { d1: d1Count, m15: m15Count };
    await new Promise((r) => setTimeout(r, 400));
  }

  return new Response(JSON.stringify({ ok: true, summary }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
