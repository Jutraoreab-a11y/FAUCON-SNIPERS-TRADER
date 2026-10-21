// ai-research : l'IA (Anthropic + recherche web) lit UNIQUEMENT les domaines de la palette
// `sources`, puis écrit des résultats cités dans `ai_findings` et `news`.
// Règles : pas d'URL de source = résultat rejeté ; l'IA ne remplace jamais les prix Yahoo (price_history).
// Secrets requis : ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const MAX_SEARCHES = 5;

const TOPICS: Record<string, string> = {
  GOLD: "Or (XAU/USD) : pression acheteuse/vendeuse, achats des banques centrales, flux ETF, taux réels, actualités marquantes des dernières 24h.",
  SILVER: "Argent (XAG/USD) : demande industrielle, ratio or/argent, stocks, actualités des dernières 24h.",
  OIL: "Pétrole Brent et WTI : approvisionnement (OPEP+, stocks EIA, production), tensions géopolitiques, actualités des dernières 24h.",
  MACRO: "Macro : décisions/taux de la Fed, dollar (DXY), USD/CNH, EUR/USD, S&P 500, publications économiques majeures du jour.",
};

type Finding = {
  topic: string; kind?: string; summary: string; value?: string | null;
  impact_level?: string; source_name?: string; source_url: string;
};

function host(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

async function askClaude(topicKey: string, brief: string, domains: string[]): Promise<Finding[]> {
  const system =
    "Tu es un analyste de recherche pour un outil d'analyse macro (usage personnel, aucune exécution d'ordres). " +
    "Utilise la recherche web (limitée à une liste de sources autorisées) pour relever des faits récents. " +
    "N'invente JAMAIS un chiffre : chaque élément doit provenir d'une page lue et porter son URL exacte. " +
    "Vocabulaire analytique (haussier/baissier), jamais de conseil d'achat/vente. " +
    "Réponds UNIQUEMENT par un tableau JSON, sans texte autour : " +
    '[{"topic":"GOLD|SILVER|BRENT|WTI|FED|USD|MACRO","kind":"resume|donnee|evenement","summary":"1-2 phrases en français",' +
    '"value":"chiffre cité ou null","impact_level":"Haute|Moyenne|Basse","source_name":"nom du site","source_url":"URL exacte"}]. ' +
    "Maximum 5 éléments. Tableau vide [] si rien de fiable.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      tools: [{
        type: "web_search_20250305", name: "web_search",
        max_uses: MAX_SEARCHES, allowed_domains: domains,
      }],
      messages: [{ role: "user", content: `Sujet ${topicKey} — ${brief}\nDate : ${new Date().toISOString()}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();

  // URLs réellement renvoyées par la recherche : sert à valider les sources citées
  const seen = new Set<string>();
  for (const b of data.content ?? []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) seen.add(r.url);
    }
  }
  const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr: Finding[] = [];
  try { arr = JSON.parse(m[0]); } catch { return []; }

  return arr.filter((f) =>
    f && f.summary && f.source_url &&
    domains.some((d) => host(f.source_url) === d || host(f.source_url).endsWith("." + d)) &&
    seen.has(f.source_url)
  );
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const only = new URL(req.url).searchParams.get("topic"); // ?topic=GOLD pour un seul sujet

    const { data: src, error } = await supabase.from("sources").select("*").eq("active", true);
    if (error) throw error;
    const domains = (src ?? []).map((s) => s.domain);
    if (domains.length === 0) return Response.json({ ok: false, error: "Aucune source active dans la palette" }, { status: 400 });

    const keys = only ? [only.toUpperCase()] : Object.keys(TOPICS);
    let inserted = 0; const errors: string[] = [];

    for (const k of keys) {
      if (!TOPICS[k]) continue;
      try {
        const findings = await askClaude(k, TOPICS[k], domains);
        if (findings.length) {
          const { error: e1 } = await supabase.from("ai_findings").insert(findings.map((f) => ({
            topic: (f.topic ?? k).toUpperCase(), kind: f.kind ?? "resume", summary: f.summary,
            value: f.value ?? null, impact_level: null,
            source_name: f.source_name ?? host(f.source_url), source_url: f.source_url,
          })));
          if (e1) throw e1;
          // Les évènements alimentent aussi le bloc News du dashboard
          const ev = findings.filter((f) => f.kind === "evenement" || f.kind === "resume").slice(0, 3);
          if (ev.length) await supabase.from("news").insert(ev.map((f) => ({
            title: f.summary, source: f.source_name ?? host(f.source_url),
            asset_tag: (f.topic ?? k).toUpperCase(), link: f.source_url,
          })));
          inserted += findings.length;
        }
      } catch (e) { errors.push(`${k}: ${(e as Error).message}`); }
    }

    // Statut par source (affiché dans Paramètres)
    const status = errors.length ? `erreur: ${errors[0].slice(0, 120)}` : "ok";
    await supabase.from("sources").update({ last_fetch_at: new Date().toISOString(), last_status: status }).eq("active", true);

    return Response.json({ ok: errors.length === 0, inserted, errors });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
