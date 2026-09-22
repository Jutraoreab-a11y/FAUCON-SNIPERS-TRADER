// ============================================================
// EDGE FUNCTION : fetch-yahoo
// Récupère le dernier prix depuis Yahoo Finance et l'enregistre dans
// price_history, à la granularité demandée.
//
// Appel :
//   /fetch-yahoo?interval=15m   (par défaut) -> dernière bougie 15 minutes
//   /fetch-yahoo?interval=1d                 -> clôture du jour (D1)
//
// Usage perso uniquement — endpoint non-officiel Yahoo, sans garantie
// de stabilité. Pas de source pour du 15min au-delà de ~60 jours en arrière
// (limite Yahoo elle-même) — voir backfill-history pour le rattrapage initial.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TICKERS: Record<string, string> = {
  GOLD_FUT: "GC=F", GOLD_SPOT: "XAUUSD=X",
  SILVER_FUT: "SI=F", SILVER_SPOT: "XAGUSD=X",
  BRENT: "BZ=F", WTI: "CL=F",
  USDCNH: "USDCNH=X", EURUSD: "EURUSD=X",
  DXY: "DX-Y.NYB", US500: "^GSPC",
};

async function fetchLastBar(ticker: string, interval: "15m" | "1d") {
  const range = interval === "15m" ? "1d" : "5d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; QuantMacroPersonalUse/1.0)" } });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps.length || !quote) return null;

  // Dernière bougie complète (on ignore la toute dernière si elle est nulle = en cours de formation)
  for (let i = timestamps.length - 1; i >= 0; i--) {
    const close = quote.close?.[i];
    if (close != null) {
      return {
        ts: new Date(timestamps[i] * 1000).toISOString(),
        open: quote.open?.[i] ?? null,
        high: quote.high?.[i] ?? null,
        low: quote.low?.[i] ?? null,
        price: close,
        volume: quote.volume?.[i] ?? null,
      };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const interval = (url.searchParams.get("interval") === "1d" ? "1d" : "15m") as "15m" | "1d";
  const timeframe = interval === "1d" ? "D1" : "15m";

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const results: Record<string, string> = {};

  for (const [label, ticker] of Object.entries(TICKERS)) {
    try {
      const bar = await fetchLastBar(ticker, interval);
      if (!bar) { results[label] = "échec"; continue; }
      const { error } = await supabase.from("price_history").upsert(
        { ticker, timeframe, ts: bar.ts, open: bar.open, high: bar.high, low: bar.low, price: bar.price, volume: bar.volume, source: "yahoo" },
        { onConflict: "ticker,timeframe,ts" }
      );
      results[label] = error ? `erreur: ${error.message}` : `ok (${bar.price})`;
    } catch (e) {
      results[label] = `exception: ${(e as Error).message}`;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return new Response(JSON.stringify({ ok: true, timeframe, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
