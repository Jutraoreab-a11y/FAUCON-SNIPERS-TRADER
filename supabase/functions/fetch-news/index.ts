// ============================================================
// EDGE FUNCTION : fetch-news
// Récupère de vraies actualités liées à chaque actif suivi, via l'endpoint
// de recherche Yahoo Finance (query1.finance.yahoo.com/v1/finance/search).
// Interroger par TICKER (et non par mot-clé libre type "gold") est important :
// une recherche par mot-clé renvoie l'actualité générale de Yahoo (non pertinente),
// alors qu'une recherche par ticker (ex: "GC=F") renvoie les vraies actualités
// liées à ce marché précis (vérifié manuellement avant d'écrire cette fonction).
//
// On ne fabrique jamais de "niveau d'impact" (Haute/Moyenne/Basse) : Yahoo ne
// fournit pas cette info, donc on ne l'invente pas — impact_level reste null.
// On dédoublonne par titre (pas de contrainte unique en base à gérer côté SQL).
//
// Pertinence : Yahoo renvoie aussi des articles sans rapport avec le ticker interrogé
// (actions individuelles, actualité générale) — on ne garde que ceux dont le champ
// relatedTickers contient réellement le ticker demandé. Pour les indices (DX-Y.NYB,
// ^GSPC), Yahoo ne tague quasiment jamais un article avec le ticker de l'indice lui-même :
// il est normal et honnête que ces deux catégories restent souvent vides plutôt que de
// remplir le flux avec du bruit.
//
// Appel : POST /functions/v1/fetch-news
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOURCES: Record<string, string> = {
  GOLD: "GC=F",
  SILVER: "SI=F",
  BRENT: "BZ=F",
  WTI: "CL=F",
  DXY: "DX-Y.NYB",
  US500: "^GSPC",
};

async function fetchNewsFor(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=20&quotesCount=0`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; QuantMacroPersonalUse/1.0)" } });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json?.news) ? json.news : [];
}

Deno.serve(async (_req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const summary: Record<string, { found: number; inserted: number; error?: string }> = {};

  for (const [assetTag, ticker] of Object.entries(SOURCES)) {
    let found = 0;
    let inserted = 0;
    let errorNote: string | undefined;
    try {
      const items = await fetchNewsFor(ticker);
      found = items.length;
      for (const item of items) {
        const title: string | undefined = item?.title;
        if (!title) continue;

        // Filtre de pertinence réel (vérifié manuellement) : Yahoo renvoie souvent, en plus
        // des vraies actus du marché demandé, des articles génériques (actions individuelles,
        // actualité générale) qui n'ont aucun rapport avec le ticker interrogé — surtout pour
        // les indices (DX-Y.NYB, ^GSPC). Le champ relatedTickers de Yahoo dit si CET article
        // est réellement associé à CE marché ; s'il ne l'est pas, on ne l'insère pas plutôt
        // que d'afficher une actualité sans rapport comme si elle concernait l'actif.
        const relatedTickers: string[] = Array.isArray(item?.relatedTickers) ? item.relatedTickers : [];
        if (!relatedTickers.includes(ticker)) continue;

        // Dédoublonnage honnête : si ce titre existe déjà, on ne le réinsère pas.
        const { data: existing } = await supabase.from("news").select("id").eq("title", title).limit(1);
        if (existing && existing.length > 0) continue;

        const publishedAt = item?.providerPublishTime
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : new Date().toISOString();

        const { error } = await supabase.from("news").insert({
          title,
          source: item?.publisher || "Yahoo Finance",
          asset_tag: assetTag,
          impact_level: null, // jamais inventé — Yahoo ne fournit pas cette donnée
          published_at: publishedAt,
          link: item?.link || null,
        });
        if (error) errorNote = error.message;
        else inserted++;
      }
    } catch (e) {
      errorNote = (e as Error).message;
    }
    summary[assetTag] = { found, inserted, ...(errorNote ? { error: errorNote } : {}) };
    await new Promise((r) => setTimeout(r, 300)); // ménager l'endpoint Yahoo
  }

  // Hygiène : on garde 30 jours d'actualités, pas plus.
  await supabase.from("news").delete().lt("published_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());

  return new Response(JSON.stringify({ ok: true, summary }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
