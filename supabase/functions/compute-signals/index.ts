// ============================================================
// EDGE FUNCTION : compute-signals (v2)
// Réplique fidèle du modèle Excel "TRADING Dashboard.xlsx" (onglets Market.Tendance,
// Correlation+Confirm.BRENT, Gold.Silver, PARAMETRES_GLISSANTS) avec 100% de données
// réelles — jamais de valeur fabriquée. Quand une donnée source manque (spot pétrole
// physique, par exemple), le champ correspondant reste honnêtement null / "Indisponible".
//
// Historique 3 ans glissant : on recalcule ces indicateurs pour CHAQUE jour réel
// disponible dans price_history (jusqu'à ~3 ans, voir backfill-history), pas seulement
// aujourd'hui. La contrainte unique (asset_id, date) sur signals rend ce recalcul complet
// idempotent : relancer cette fonction écrase juste la ligne du jour concerné.
//
// Deux nouvelles colonnes JSONB portent le détail fidèle à l'Excel :
//  - tendance_detail       : ce qui alimente l'onglet Analyse > Tendance
//  - confirmation_detail   : ce qui alimente l'onglet Analyse > Confirmation
// Les colonnes existantes (basis_spread, zscore_60j, percentile_10j, corr_20j, corr_60j,
// pressure, supply, signal_label, tone) restent inchangées — utilisées par le Dashboard.
//
// Limites honnêtes assumées (documentées aussi dans la réponse à l'utilisateur) :
//  - BRENT n'a pas de spot pétrole physique gratuit en temps réel (recherché : oilpriceapi.com
//    et api-ninjas exigent une inscription + clé payante ; le scraping d'Investing.com a été
//    testé et est bloqué en dur par leur pare-feu anti-bot, HTTP 403, confirmé le 23/09/2026).
//    "Spread BRENT-WTI" utilise donc les FUTURES (BRENT_FUTURE / WTI_FUTURE) en proxy, explicitement
//    étiqueté comme tel. "Spread Brent-Futur" utilise désormais un CALENDAR SPREAD réel
//    (écart entre le contrat proche BRENT_FUTURE et un contrat à échéance lointaine BRENT_M2, tous
//    deux de vrais prix futures Yahoo Finance) — la technique standard des salles de marché
//    pour lire le contango/backwardation quand le vrai spot physique (Dated Brent) n'est pas
//    accessible. Ce n'est PAS le vrai basis spot-physique, mais un vrai signal de marché,
//    jamais une valeur fabriquée.
//  - GOLD/SILVER ont un vrai spot gratuit (gold-api.com) : leur Spread Spot-Futur est 100%
//    réel, avec Ouverture = premier instantané du jour, Fermeture = dernier instantané connu.
//  - Deux quirks du fichier Excel source ont été corrigés plutôt que reproduits à l'identique :
//      1) Gold.Silver!D2/E2 ("Gold/Silver Ratio", "Gold/BrentRatio") pointent en réalité vers
//         Market.Tendance (Basis Silver / Basis Gold) — un copier-coller manifestement erroné,
//         pas un vrai ratio. On calcule ici le VRAI ratio (spot Gold / spot Silver, spot Gold /
//         futures Brent).
//      2) Gold.Silver!I2 (DXY) référence une colonne supprimée (#REF!, cassée même dans
//         l'Excel). On branche ici le DXY réel (DXY) à la place.
//      3) Gold.Silver!N2 ("Signal Silver") compare une cellule texte à 0 (O3>0), une
//         auto-référence qui ne peut pas fonctionner. Remplacé par la tendance réelle de la
//         "Distance à la Moyenne" (jour vs veille) — seule donnée cohérente disponible pour
//         juger si le mouvement s'essouffle ou s'accélère.
//
// Déploiement : supabase functions deploy compute-signals
// Cron        : voir sql/schedule.sql (à lancer après fetch-yahoo)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ZSCORE_WINDOW = 60;       // PARAMETRES_GLISSANTS!B11
const PERCENTILE_WINDOW = 10;   // PARAMETRES_GLISSANTS!B19 = 10, header Excel "Percentile 10j"
const CORR_SHORT = 20;          // PARAMETRES_GLISSANTS!B4
const CORR_LONG = 60;           // PARAMETRES_GLISSANTS!B5
const Z_ALERTE = 1.5;
const Z_CRITIQUE = 2;
const CORR_FORTE = 0.7;         // PARAMETRES_GLISSANTS!B14
const CORR_MODEREE = 0.4;       // PARAMETRES_GLISSANTS!B15
const SILVER_Z_WINDOW = 20;     // Gold.Silver!M2 : fenêtre codée en dur à 20j (≠ 60j de Gold)
const SILVER_MA_WINDOW = 20;    // Gold.Silver!O2 : C2:C21 = moyenne mobile 20j

function mean(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stdev(arr: number[]) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}
function zscoreWin(series: number[], window: number) {
  if (series.length < window) return null;
  const w = series.slice(0, window);
  const sd = stdev(w);
  if (sd === 0) return null;
  return (w[0] - mean(w)) / sd;
}
function zscore(series: number[]) { return zscoreWin(series, ZSCORE_WINDOW); }
function percentile(series: number[]) {
  if (series.length < PERCENTILE_WINDOW) return null;
  const w = series.slice(0, PERCENTILE_WINDOW);
  const current = w[0];
  const rank = w.filter((v) => v <= current).length;
  return (rank / w.length) * 100;
}
function returns(series: number[]) {
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
function statusFromZ(z: number | null) {
  if (z === null) return "Indisponible";
  if (z > Z_CRITIQUE) return "PANIQUE | Backwardation Critique";
  if (z > Z_ALERTE) return "TENSION";
  if (z < -Z_CRITIQUE) return "PANIQUE | Contango Extrême";
  if (z < -Z_ALERTE) return "TENSION";
  if (Math.abs(z) <= 0.75) return "ÉQUILIBRE";
  return "MOYEN";
}
function round2(v: number | null) { return v == null ? null : Math.round(v * 100) / 100; }

type Bar = { date: string; open: number | null; close: number };

// D1 réel avec ouverture ET fermeture (price_history les stocke déjà toutes les deux).
async function getSeriesOC(supabase: any, ticker: string, limit = 1200): Promise<Bar[]> {
  // 23/09/2026 : depuis que ingest-manual-spot peut aussi écrire sur des tickers déjà
  // alimentés automatiquement par fetch-yahoo (BRENT_FUTURE, GOLD_FUTURE, SILVER_FUTURE, USD_CNH, SP500 — voir
  // ingest-manual-spot), un même (ticker, jour) peut désormais avoir 2 lignes en base : la
  // ligne automatique (ts = heure réelle de clôture Yahoo) et la ligne manuelle (ts = minuit
  // UTC) — des `ts` différents, donc l'upsert de price_history ne les fusionne PAS (sa clé de
  // conflit est ticker+timeframe+ts exact). Sans déduplication ici, cette fonction renvoyait
  // 2 entrées pour le même jour, et plus loin dans ce fichier chaque asset_id/date poussé 2
  // fois dans le même batch faisait planter l'upsert vers `signals` avec "ON CONFLICT DO
  // UPDATE command cannot affect row a second time" (constaté après le 1er import manuel
  // réel sur BRENT FUTURE). On récupère donc une marge de lignes en plus du quota demandé,
  // puis on ne garde qu'UNE ligne par jour — la saisie manuelle (vraie donnée Investing.com)
  // gagne toujours sur la donnée automatique quand les deux existent pour le même jour.
  const { data } = await supabase
    .from("price_history")
    .select("ts, open, price, source")
    .eq("ticker", ticker)
    .eq("timeframe", "D1")
    .order("ts", { ascending: false })
    .limit(limit + 60);
  const byDate = new Map<string, { open: number | null; close: number; isManual: boolean }>();
  for (const r of data || []) {
    if (r.price == null) continue;
    const date = String(r.ts).slice(0, 10);
    const isManual = typeof r.source === "string" && r.source.includes("manuelle");
    const existing = byDate.get(date);
    if (!existing || (isManual && !existing.isManual)) {
      byDate.set(date, { open: r.open != null ? Number(r.open) : null, close: Number(r.price), isManual });
    }
  }
  return Array.from(byDate.entries())
    .slice(0, limit)
    .map(([date, b]) => ({ date, open: b.open, close: b.close }));
}

// Spot Gold/Silver (gold-api.com) : pas d'historique gratuit, juste un flux d'instantanés
// depuis le début de la collecte. Ouverture = premier instantané du jour, Fermeture =
// dernier instantané connu ce jour-là (pour "aujourd'hui" = littéralement le prix live).
async function getSpotOCByDate(supabase: any, ticker: string): Promise<Record<string, { open: number; close: number }>> {
  const { data } = await supabase
    .from("price_history")
    .select("ts, price")
    .eq("ticker", ticker)
    .order("ts", { ascending: true })
    .limit(5000);
  const map: Record<string, { open: number; close: number }> = {};
  for (const r of data || []) {
    if (r.price == null) continue;
    const d = String(r.ts).slice(0, 10);
    const p = Number(r.price);
    if (!map[d]) map[d] = { open: p, close: p };
    else map[d].close = p;
  }
  return map;
}

async function upsertBatches(supabase: any, rows: any[], batchSize = 500) {
  let upserted = 0;
  let lastError: string | null = null;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("signals").upsert(batch, { onConflict: "asset_id,date" });
    if (!error) upserted += batch.length;
    else lastError = error.message;
  }
  return { upserted, lastError };
}

// ---------------------------------------------------------------------------
// Textes & seuils EXACTS du fichier Excel (Market.Tendance, colonnes C/D pour
// WTI-Brent ; F/G, I/J, L/M pour les Basis Spot-Futur Brent/Silver/Gold).
// ---------------------------------------------------------------------------
function etatRisqueWtiBrent(spread: number | null) {
  if (spread == null) return { etat: "Indisponible", risque: "Indisponible" };
  if (spread >= -10 && spread <= 0) return { etat: "Risque Logistique US", risque: "🚨 BLOCAGE LOGISTIQUE US : Le brut américain reste coincé localement. L'approvisionnement mondial dépend entièrement du Brent." };
  if (spread > 0 && spread <= 3) return { etat: "MOYEN", risque: "⚠️ FLUX TENDUS US : L'offre américaine est insuffisante pour soulager le marché mondial. Le Brent compense." };
  if (spread > 3 && spread <= 6) return { etat: "BON", risque: "🟢 APPROVISIONNEMENT SAIN : Arbitrage fluide. Le marché mondial s'approvisionne correctement et normalement." };
  if (spread > 6 && spread <= 10) return { etat: "Attention", risque: "💥 PRESSION SUR L'OFFRE : L'approvisionnement global se tend. Le Brent surperforme le WTI (Risque géopolitique majeur)." };
  if (spread > 10 && spread <= 15) return { etat: "SITUATION CRITIQUE", risque: "⚠️ SURCHARGE D'ARBITRAGE : Le Brent est devenu trop cher par rapport au WTI. Risque imminent de blocage de la demande mondiale." };
  return { etat: "PANIQUE", risque: "🚨 RUPTURE DE FLUX : Panique sur les approvisionnements. Le marché physique mondial est totalement déconnecté." };
}
function etatRisqueBasisSilver(basis: number | null) {
  if (basis == null) return { etat: "Indisponible", risque: "Indisponible" };
  if (basis < -0.15) return { etat: "🚨 CONTANGO EXTRÊME", risque: "Stockage saturé (Opportunité d'Arbitrage Cash & Carry)" };
  if (basis < 0) return { etat: "⚖️ CONTANGO STANDARD", risque: "Structure Saine (Marché normalement approvisionné)" };
  if (basis === 0) return { etat: "🎯 PARITÉ SANS ARBITRAGE", risque: "Convergence Parfaite Spot/Futur" };
  if (basis <= 0.08) return { etat: "⚠️ TENSION", risque: "Backwardation Initiale (Demande physique en hausse à court terme)" };
  return { etat: "🔥 PANIQUE | Backwardation Critique", risque: "Backwardation Critique (Pénurie de métal physique / Crise de liquidité !)" };
}
function etatRisqueBasisGold(basis: number | null) {
  if (basis == null) return { etat: "Indisponible", risque: "Indisponible" };
  if (basis < -8) return { etat: "🚨 CONTANGO EXTRÊME", risque: "Surcharge de portage (Opportunité d'Arbitrage Cash & Carry)" };
  if (basis < 0) return { etat: "⚖️ CONTANGO STANDARD", risque: "Structure Saine (Marché normalement approvisionné)" };
  if (basis === 0) return { etat: "🎯 PARITÉ SANS ARBITRAGE", risque: "Convergence Parfaite Spot/Futur" };
  if (basis <= 4) return { etat: "⚠️ TENSION", risque: "Prime sur le physique / Stress bancaire" };
  return { etat: "🔥 PANIQUE MACRO", risque: "Backwardation Critique (Fuite vers le physique / Crise systémique !)" };
}

// Calendar spread Brent = écart entre le contrat proche (BRENT_FUTURE) et un contrat à échéance
// lointaine (BRENT_M2, T+2 à T+5 mois, voir fetch-yahoo/index.ts) au même jour — signe =
// proche - lointain, donc positif = backwardation (tension court terme), négatif = contango
// (offre détendue / coût de portage normal). C'est un VRAI signal de marché sur des VRAIS
// prix de contrats futures, mais PAS le vrai basis spot-physique (Dated Brent), qui n'a
// aucune source gratuite — seuils calibrés sur l'amplitude typique des calendar spreads
// Brent (quelques dizaines de cents en temps normal, plusieurs dollars lors de tensions
// réelles sur l'offre).
function etatRisqueBrentCalendarSpread(spread: number | null) {
  if (spread == null) return { etat: "Indisponible", risque: "Indisponible" };
  if (spread > 2) return { etat: "🔥 BACKWARDATION FORTE", risque: "Le contrat proche se négocie nettement au-dessus du contrat lointain — tension marquée sur la disponibilité à court terme." };
  if (spread > 0.5) return { etat: "⚠️ BACKWARDATION", risque: "Prime sur le contrat proche — marché resserré à court terme, demande immédiate soutenue." };
  if (spread >= -0.5) return { etat: "⚖️ QUASI-PLAT", risque: "Écart faible entre les deux échéances — pas de signal fort de tension ou de surabondance à court terme." };
  if (spread >= -2) return { etat: "CONTANGO", risque: "Le contrat lointain coûte plus cher — structure détendue, cohérente avec une offre suffisante ou un coût de portage normal." };
  return { etat: "🚨 CONTANGO EXTRÊME", risque: "Écart important en faveur du contrat lointain — signale un excès d'offre à court terme ou une anticipation de baisse des prix." };
}

// ---------------------------------------------------------------------------
// Textes & seuils EXACTS de Correlation+Confirm.BRENT et Gold.Silver.
// ---------------------------------------------------------------------------
function signalCorr(corr: number | null) {
  if (corr == null) return "–";
  const a = Math.abs(corr);
  if (a > CORR_FORTE) return ":( FORTE";
  if (a > CORR_MODEREE) return ":/ MODÉRÉE";
  return ":) FAIBLE";
}
function interpretationStructureBrent(z: number | null) {
  if (z == null) return "Indisponible";
  if (z > 2) return "⚠️ RETOURNEMENT BAISSIER : Brent en surchauffe statistique (>+2). Risque de correction.";
  if (z < -2) return "💎 RETOURNEMENT HAUSSIER : Brent en capitulation statistique (<-2). Opportunité d'achat.";
  if (z >= -0.75 && z <= 0.75) return "⚖️ ZONE NEUTRE : Le prix est proche de sa moyenne. Pas de signal.";
  if (z > 0) return "📈 TENDANCE HAUSSIÈRE : Flux acheteur modéré.";
  return "📉 TENDANCE BAISSIÈRE : Flux vendeur modéré.";
}
function interpretationBrentVsChine(brentToday: number | null, brentYest: number | null, cnhToday: number | null, cnhYest: number | null, spreadToday: number | null, basisToday: number | null) {
  if (brentToday == null || brentYest == null || cnhToday == null || cnhYest == null) return "Indisponible";
  if (brentToday > brentYest && cnhToday >= cnhYest) return " BUY:GÉOPOLITIQUE : Le Brent monte mais le Yuan stagne ou baisse. Hausse non soutenue par la Chine.";
  if (brentToday < brentYest && cnhToday < cnhYest && ((spreadToday != null && spreadToday > 8) || (basisToday != null && basisToday > 3))) return " SELL:PRESSION TECHNIQUES : Le Yuan monte mais le Brent chute. Pression des Spreads (WTI-Brent/Basis) trop forte.";
  if (brentToday > brentYest && cnhToday < cnhYest) return "🟢 BUY NOW : SOUTIEN CHINE : Hausse saine. Le Yuan se renforce et tire le prix vers le haut.";
  if (brentToday < brentYest && cnhToday > cnhYest) return "🔴 SELL NOW FAIBLESSE ÉCO : Le Yuan chute et le pétrole capitule. Ralentissement global.";
  return "⚖️ NEUTRE : Flux équilibrés.";
}
function signalJournalierGold(goldToday: number | null, goldYest: number | null, cnhToday: number | null, cnhYest: number | null) {
  if (goldToday == null || goldYest == null || cnhToday == null || cnhYest == null) return "Indisponible";
  if (cnhToday < cnhYest && goldToday > goldYest) return "🟢 ACHAT FONDAMENTAL : Le Yuan se renforce (F baisse), l'Or monte. Demande réelle solide.";
  if (cnhToday >= cnhYest && goldToday > goldYest) return "💎 RÉSILIENCE : L'Or monte malgré un Yuan faible. Forte pression acheteuse hors Chine.";
  if (cnhToday > cnhYest && goldToday < goldYest) return "🔴 VENTE MACRO : Le Yuan s'affaiblit (F monte), l'Or capitule. Perte de pouvoir d'achat.";
  if (cnhToday <= cnhYest && goldToday < goldYest) return "🚨 ALERTE ROUGE : Le Yuan est fort mais l'Or baisse. Faiblesse interne critique ou arbitrage Taux.";
  return "⚪ NEUTRE";
}
function signalStructureGold(zGoldSpot: number | null, perfVsSp500: number | null) {
  if (zGoldSpot == null || perfVsSp500 == null) return "Indisponible";
  if (zGoldSpot > 1.5) return perfVsSp500 < 0 ? "🛑 DISTRIBUTION (Vente institutionnelle)" : "🚀 SURCHAUFFE (Euphorie)";
  if (zGoldSpot < -1.5) return perfVsSp500 > 0 ? "💎 ACCUMULATION (Achat institutionnel)" : "📉 CAPITULATION (Panique)";
  if (Math.abs(zGoldSpot) < 0.75) return "⚖️ PIVOT / NEUTRE";
  return perfVsSp500 > 0 ? "📈 HAUSSE SAINE" : "📉 BAISSE SAINE";
}
// Adaptation d'une formule Excel auto-référencée buguée (Gold.Silver!N2 compare une
// cellule TEXTE à 0). Remplacée par la tendance réelle de la Distance à la Moyenne.
function signalSilver(zSilver20: number | null, distTrendUp: boolean | null) {
  if (zSilver20 == null) return "Indisponible";
  if (zSilver20 > 1.7) return distTrendUp === false ? "SELL NOW DISTRIBUTION SILVER" : "BUY NOW EUPHORIE SILVER";
  if (zSilver20 < -1.7) return distTrendUp === true ? "ATTENTION BUY : ACCUMULATION SILVER SI USD Faible" : "SELL: CAPITULATION SILVER si USD FORT";
  if (Math.abs(zSilver20) < 0.75) return "⚖️ NEUTRE SILVER";
  return distTrendUp === true ? "BUY NOW : HAUSSE SAINE SILVER" : "SELL NOW : BAISSE SAINE SILVER";
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [gcBars, siBars, brentBars, wtiBars, cnhBars, dxyBars, sp500Bars, xauOC, xagOC, m2Bars, brentSpotRealOC] = await Promise.all([
    getSeriesOC(supabase, "GOLD_FUTURE"),
    getSeriesOC(supabase, "SILVER_FUTURE"),
    getSeriesOC(supabase, "BRENT_FUTURE"),
    getSeriesOC(supabase, "WTI_FUTURE"),
    getSeriesOC(supabase, "USD_CNH"),
    getSeriesOC(supabase, "DXY"),
    getSeriesOC(supabase, "SP500"),
    getSpotOCByDate(supabase, "XAUUSD_SPOT"),
    getSpotOCByDate(supabase, "XAGUSD_SPOT"),
    // BRENT_M2 : calendar spread réel — contrat Brent à échéance lointaine (T+2 à T+5 mois),
    // auto-découvert et écrit par fetch-yahoo (voir commentaire dans fetch-yahoo/index.ts).
    // C'est une vraie série de bougies D1 (comme brentBars/wtiBars), pas un instantané
    // ponctuel — d'où getSeriesOC ici, et non getSpotOCByDate.
    getSeriesOC(supabase, "BRENT_M2"),
    // BRENT_SPOT_REAL : le VRAI spot physique Brent, saisi manuellement par l'utilisateur
    // depuis Investing.com (page "Saisie Spot", voir ingest-manual-spot/index.ts) — pas du
    // scraping (bloqué en dur, HTTP 403), une vraie donnée publique copiée par un humain.
    // Quand elle existe pour un jour donné, elle est préférée au calendar spread (BRENT_M2)
    // dans le calcul ci-dessous, car c'est un vrai basis spot-futur, pas un proxy.
    getSpotOCByDate(supabase, "BRENT_SPOT_REAL"),
  ]);

  const gcSeries = gcBars.map((b) => b.close);
  const siSeries = siBars.map((b) => b.close);
  const brentSeries = brentBars.map((b) => b.close);
  const wtiSeries = wtiBars.map((b) => b.close);
  const cnhSeries = cnhBars.map((b) => b.close);

  const cnhByDate: Record<string, number> = {};
  cnhBars.forEach((b) => (cnhByDate[b.date] = b.close));
  const dxyByDate: Record<string, number> = {};
  dxyBars.forEach((b) => (dxyByDate[b.date] = b.close));
  const sp500ByDate: Record<string, number> = {};
  sp500Bars.forEach((b) => (sp500ByDate[b.date] = b.close));
  // BRENT_M2 indexé par date (open + close, comme brentBars) pour retrouver facilement le
  // contrat lointain du même jour que chaque bougie BRENT_FUTURE dans la boucle BRENT/WTI ci-dessous.
  const m2ByDate: Record<string, { open: number | null; close: number }> = {};
  m2Bars.forEach((b) => (m2ByDate[b.date] = { open: b.open, close: b.close }));

  const out: Record<string, unknown> = {};
  const rows: any[] = [];

  // ============================================================================
  // GOLD
  // ============================================================================
  const goldSpotDates = Object.keys(xauOC).sort().reverse(); // plus récent d'abord
  const goldSpotClose = goldSpotDates.map((d) => xauOC[d].close);

  for (let i = 0; i <= gcSeries.length - ZSCORE_WINDOW; i++) {
    const window = gcSeries.slice(i);
    const z = zscore(window);
    const p = percentile(window);
    const date = gcBars[i].date;
    const spotOC = xauOC[date] ?? null;
    const basisClose = spotOC != null ? spotOC.close - gcSeries[i] : null;
    const basisOpen = spotOC != null && gcBars[i].open != null ? spotOC.open - (gcBars[i].open as number) : null;
    const basisVariation = basisClose != null && basisOpen != null ? basisClose - basisOpen : null;
    const { etat, risque } = etatRisqueBasisGold(basisClose);

    // --- Confirmation (Gold.Silver), uniquement sur les jours où le spot existe ---
    const gsIdx = goldSpotDates.indexOf(date);
    let corrUsdGold: number | null = null, zGoldSpot: number | null = null, dxyVal: number | null = null,
      perfVsSp500: number | null = null, sigJournalier = "Indisponible", sigStructure = "Indisponible",
      goldSilverRatio: number | null = null, goldBrentRatio: number | null = null;
    const silverSpotToday = xagOC[date]?.close ?? null;
    if (gsIdx !== -1) {
      const spotWindow = goldSpotClose.slice(gsIdx);
      zGoldSpot = zscore(spotWindow);
      dxyVal = dxyByDate[date] ?? null;
      goldSilverRatio = silverSpotToday ? spotOC!.close / silverSpotToday : null;
      goldBrentRatio = gcSeries[i] ? spotOC!.close / brentSeries[i] : null;
      // CORR USD/GOLD (spot) sur la fenêtre courte : alignement par date, on n'avance que si
      // le CNH existe pour chaque jour de la fenêtre.
      if (spotWindow.length >= CORR_SHORT + 1) {
        const cnhAligned = goldSpotDates.slice(gsIdx, gsIdx + CORR_SHORT + 1).map((d) => cnhByDate[d]);
        if (cnhAligned.every((v) => v != null)) corrUsdGold = correlation(spotWindow.slice(0, CORR_SHORT + 1), cnhAligned as number[], CORR_SHORT);
      }
      // Performance Gold spot (jour vs veille) - Performance S&P500 (jour vs veille)
      if (gsIdx + 1 < goldSpotDates.length) {
        const prevDate = goldSpotDates[gsIdx + 1];
        const goldToday = spotOC!.close, goldYest = xauOC[prevDate].close;
        const cnhToday = cnhByDate[date] ?? null, cnhYest = cnhByDate[prevDate] ?? null;
        const sp500Today = sp500ByDate[date] ?? null, sp500Yest = sp500ByDate[prevDate] ?? null;
        const goldPerf = ((goldToday - goldYest) / goldYest) * 100;
        const sp500Perf = sp500Today != null && sp500Yest != null ? ((sp500Today - sp500Yest) / sp500Yest) * 100 : null;
        perfVsSp500 = sp500Perf != null ? goldPerf - sp500Perf : null;
        sigJournalier = signalJournalierGold(goldToday, goldYest, cnhToday, cnhYest);
      }
      sigStructure = signalStructureGold(zGoldSpot, perfVsSp500);
    }

    rows.push({
      asset_id: "GOLD", date, basis_spread: basisClose,
      zscore_60j: z, percentile_10j: p,
      corr_20j: correlation(gcSeries.slice(i), cnhSeries.slice(i), CORR_SHORT),
      corr_60j: correlation(gcSeries.slice(i), cnhSeries.slice(i), CORR_LONG),
      pressure: statusFromZ(z),
      supply: basisClose != null
        ? `Spot XAU (gold-api.com) : ${spotOC!.close.toFixed(2)} $ · Futur GOLD_FUTURE : ${gcSeries[i].toFixed(2)} $`
        : "Basis Spot-Futur non disponible ce jour-là (spot gold-api.com pas encore collecté à cette date)",
      signal_label: z !== null && z > Z_ALERTE ? "BIAIS HAUSSIER" : z !== null && z < -Z_ALERTE ? "BIAIS BAISSIER" : "NEUTRE",
      tone: z !== null && z > Z_ALERTE ? "green" : z !== null && z < -Z_ALERTE ? "red" : "blue",
      tendance_detail: {
        spread_ouverture: round2(basisOpen), spread_fermeture: round2(basisClose), spread_variation: round2(basisVariation),
        etat_marche: etat, risque_interpretation: risque,
        // Compteur honnête de l'historique spot RÉEL collecté (gold-api.com ne fournit qu'un
        // instantané courant, jamais d'historique — voir getSpotOCByDate). Sert au frontend à
        // afficher "Xj de spot collectés depuis le [date]" plutôt qu'un "Indisponible" qui
        // laisserait croire à un bug permanent : les dates ANTÉRIEURES au démarrage de la
        // collecte resteront Indisponible pour toujours (aucune source gratuite ne republie
        // l'historique du spot physique Gold/Silver), mais les jours à venir se rempliront
        // automatiquement, un par un, tant que fetch-yahoo tourne chaque jour.
        spot_jours_collectes: goldSpotDates.length, spot_depuis: goldSpotDates[goldSpotDates.length - 1] || null,
      },
      confirmation_detail: {
        // Prix bruts spot (identiques à l'onglet Excel Gold.Silver, colonnes B/C) — ajoutés
        // pour affichage direct dans le tableau Confirmation, sans recalcul côté client.
        gold_spot_price: round2(spotOC?.close ?? null), silver_spot_price: round2(silverSpotToday),
        corr_usd_gold_20j: round2(corrUsdGold), zscore_spot_60j: round2(zGoldSpot), dxy: round2(dxyVal),
        performance_vs_sp500: round2(perfVsSp500), gold_silver_ratio: round2(goldSilverRatio), gold_brent_ratio: round2(goldBrentRatio),
        signal_journalier: sigJournalier, signal_structure: sigStructure,
      },
    });
    if (i === 0) out.gold = { zscore: z, percentile: p, basis: basisClose };
  }

  // ============================================================================
  // SILVER
  // ============================================================================
  const silverSpotDates = Object.keys(xagOC).sort().reverse();
  const silverSpotClose = silverSpotDates.map((d) => xagOC[d].close);
  // Distance à la moyenne (20j) pré-calculée pour toute la fenêtre spot, pour pouvoir
  // ensuite comparer jour vs veille (tendance) sans recalcul redondant.
  const silverDistArr: (number | null)[] = silverSpotDates.map((_, idx) => {
    const w = silverSpotClose.slice(idx, idx + SILVER_MA_WINDOW);
    return w.length >= SILVER_MA_WINDOW ? silverSpotClose[idx] - mean(w) : null;
  });

  for (let i = 0; i <= siSeries.length - ZSCORE_WINDOW; i++) {
    const window = siSeries.slice(i);
    const z = zscore(window);
    const p = percentile(window);
    const date = siBars[i].date;
    const spotOC = xagOC[date] ?? null;
    const basisClose = spotOC != null ? spotOC.close - siSeries[i] : null;
    const basisOpen = spotOC != null && siBars[i].open != null ? spotOC.open - (siBars[i].open as number) : null;
    const basisVariation = basisClose != null && basisOpen != null ? basisClose - basisOpen : null;
    const { etat, risque } = etatRisqueBasisSilver(basisClose);

    const svIdx = silverSpotDates.indexOf(date);
    const goldSpotTodayForSilver = xauOC[date]?.close ?? null;
    let zSilver20: number | null = null, distMoyenne: number | null = null, sigSilver = "Indisponible";
    if (svIdx !== -1) {
      zSilver20 = zscoreWin(silverSpotClose.slice(svIdx), SILVER_Z_WINDOW);
      distMoyenne = silverDistArr[svIdx];
      const distPrev = svIdx + 1 < silverDistArr.length ? silverDistArr[svIdx + 1] : null;
      const distTrendUp = distMoyenne != null && distPrev != null ? distMoyenne > distPrev : null;
      sigSilver = signalSilver(zSilver20, distTrendUp);
    }

    rows.push({
      asset_id: "SILVER", date, basis_spread: basisClose,
      zscore_60j: z, percentile_10j: p,
      corr_20j: correlation(siSeries.slice(i), cnhSeries.slice(i), CORR_SHORT),
      corr_60j: correlation(siSeries.slice(i), cnhSeries.slice(i), CORR_LONG),
      pressure: statusFromZ(z),
      supply: basisClose != null
        ? `Spot XAG (gold-api.com) : ${spotOC!.close.toFixed(2)} $ · Futur SILVER_FUTURE : ${siSeries[i].toFixed(2)} $`
        : "Basis Spot-Futur non disponible ce jour-là (spot gold-api.com pas encore collecté à cette date)",
      signal_label: z !== null && z > Z_ALERTE ? "BIAIS HAUSSIER" : z !== null && z < -Z_ALERTE ? "BIAIS BAISSIER" : "NEUTRE",
      tone: z !== null && z > Z_ALERTE ? "green" : z !== null && z < -Z_ALERTE ? "red" : "blue",
      tendance_detail: {
        spread_ouverture: round2(basisOpen), spread_fermeture: round2(basisClose), spread_variation: round2(basisVariation),
        etat_marche: etat, risque_interpretation: risque,
        // Voir le commentaire équivalent dans le bloc GOLD ci-dessus : compteur honnête de
        // l'historique spot réel collecté (gold-api.com), pour affichage "Xj collectés" côté
        // frontend plutôt qu'un "Indisponible" trompeur sur les dates avant le démarrage.
        spot_jours_collectes: silverSpotDates.length, spot_depuis: silverSpotDates[silverSpotDates.length - 1] || null,
      },
      confirmation_detail: {
        // Prix bruts spot (identiques à l'onglet Excel Gold.Silver, colonnes B/C) — ajoutés
        // pour affichage direct dans le tableau Confirmation, sans recalcul côté client.
        silver_spot_price: round2(spotOC?.close ?? null), gold_spot_price: round2(goldSpotTodayForSilver),
        zscore_spot_20j: round2(zSilver20), distance_moyenne_20j: round2(distMoyenne),
        signal_silver: sigSilver,
      },
    });
    if (i === 0) out.silver = { zscore: z, percentile: p, basis: basisClose };
  }

  // ============================================================================
  // BRENT / WTI
  // ============================================================================
  const spreadLen = Math.min(brentSeries.length, wtiSeries.length);
  const spreadSeries: number[] = [];
  for (let i = 0; i < spreadLen; i++) spreadSeries.push(wtiSeries[i] - brentSeries[i]);

  for (let i = 0; i <= spreadSeries.length - ZSCORE_WINDOW; i++) {
    const window = spreadSeries.slice(i);
    const z = zscore(window);
    const p = percentile(window);
    const date = brentBars[i].date;

    // Spread BRENT-WTI (futures BRENT_FUTURE/WTI_FUTURE en proxy — pas de spot pétrole gratuit) :
    // ouverture, fermeture, variation. Signe Excel = Brent - WTI.
    const closeSpreadBW = brentSeries[i] - wtiSeries[i];
    const openSpreadBW = brentBars[i].open != null && wtiBars[i]?.open != null ? (brentBars[i].open as number) - (wtiBars[i].open as number) : null;
    const varSpreadBW = openSpreadBW != null ? closeSpreadBW - openSpreadBW : null;
    const { etat: etatBW, risque: risqueBW } = etatRisqueWtiBrent(closeSpreadBW);

    const corr20 = correlation(brentSeries.slice(i), cnhSeries.slice(i), CORR_SHORT);
    const corr60 = correlation(brentSeries.slice(i), cnhSeries.slice(i), CORR_LONG);
    const corrWtiBrent20 = correlation(brentSeries.slice(i), wtiSeries.slice(i), CORR_SHORT);
    const brentYest = i + 1 < brentSeries.length ? brentSeries[i + 1] : null;
    const cnhYest = i + 1 < cnhSeries.length ? cnhSeries[i + 1] : null;

    // Priorité au VRAI spot physique saisi manuellement (voir BRENT_SPOT_REAL ci-dessus) :
    // c'est un vrai basis spot-futur (spot - futures), pas un proxy. Quand il n'existe pas
    // encore pour ce jour (avant que l'utilisateur n'ait fait sa saisie, ou jour non encore
    // rattrapé), on retombe sur le calendar spread (BRENT_M2, voir etatRisqueBrentCalendarSpread)
    // — jamais de valeur fabriquée dans les deux cas.
    const brentSpotRealToday = brentSpotRealOC[date] ?? null;
    const m2Today = m2ByDate[date] ?? null;
    let basisSourceType: "spot_reel" | "calendar_spread" | null = null;
    let bfOuverture: number | null = null, bfFermeture: number | null = null, bfVariation: number | null = null;
    let etatBrentFutur = "Indisponible", risqueBrentFutur = "Indisponible", sourceBrentFutur: string | null = null;
    if (brentSpotRealToday != null) {
      basisSourceType = "spot_reel";
      bfFermeture = brentSpotRealToday.close - brentSeries[i];
      bfOuverture = brentBars[i].open != null ? brentSpotRealToday.open - (brentBars[i].open as number) : null;
      bfVariation = bfFermeture != null && bfOuverture != null ? bfFermeture - bfOuverture : null;
      ({ etat: etatBrentFutur, risque: risqueBrentFutur } = etatRisqueBrentCalendarSpread(bfFermeture));
      sourceBrentFutur = "Vrai spot physique Brent (saisi manuellement depuis Investing.com) vs Futures BRENT_FUTURE (Yahoo) — vrai basis spot-futur réel.";
    } else if (m2Today != null) {
      basisSourceType = "calendar_spread";
      bfFermeture = brentSeries[i] - m2Today.close;
      bfOuverture = m2Today.open != null && brentBars[i].open != null ? (brentBars[i].open as number) - m2Today.open : null;
      bfVariation = bfFermeture != null && bfOuverture != null ? bfFermeture - bfOuverture : null;
      ({ etat: etatBrentFutur, risque: risqueBrentFutur } = etatRisqueBrentCalendarSpread(bfFermeture));
      sourceBrentFutur = "Calendar spread réel : contrat proche BRENT_FUTURE vs contrat lointain Yahoo Finance (voir fetch-yahoo) — PAS le vrai spot physique OTC (Dated Brent), qui n'a aucune source gratuite automatisée. Sera remplacé par le vrai spot dès qu'il sera saisi pour ce jour.";
    }

    rows.push({
      asset_id: "BRENT", date, basis_spread: spreadSeries[i],
      zscore_60j: z, percentile_10j: p, corr_20j: corr20, corr_60j: corr60,
      pressure: statusFromZ(z), supply: "Basis Spot-Futur non disponible (source gratuite) — Spread WTI-Brent utilisé en proxy",
      institutional_note: corr20 !== null ? `Corrélation USD/CNH (20j, rendements) : ${corr20.toFixed(2)}` : "Données insuffisantes",
      signal_label: corr20 !== null && corr20 > 0 && z !== null && z > 0 ? "BIAIS HAUSSIER" : "NEUTRE",
      tone: corr20 !== null && corr20 > 0 && z !== null && z > 0 ? "green" : "blue",
      tendance_detail: {
        wti_brent: { ouverture: round2(openSpreadBW), fermeture: round2(closeSpreadBW), variation: round2(varSpreadBW), etat_marche: etatBW, risque_interpretation: risqueBW, source: "Futures BRENT_FUTURE / WTI_FUTURE (pas de spot pétrole physique gratuit)" },
        brent_futur: basisSourceType != null
          ? { ouverture: round2(bfOuverture), fermeture: round2(bfFermeture), variation: round2(bfVariation), etat_marche: etatBrentFutur, risque_interpretation: risqueBrentFutur, source: sourceBrentFutur, type: basisSourceType }
          : { ouverture: null, fermeture: null, variation: null, etat_marche: "Indisponible", risque_interpretation: "Ni spot réel saisi, ni contrat à échéance lointaine trouvé pour ce jour.", source: null, type: null },
      },
      confirmation_detail: {
        // Prix bruts (proxy futures BRENT_FUTURE/WTI_FUTURE pour Brent/WTI, cf. tendance_detail.wti_brent.source)
        // et USD/CNH — identiques aux colonnes B/C/D de l'onglet Excel Correlation+Confirm.BRENT.
        brent_price: round2(brentSeries[i]), wti_price: round2(wtiSeries[i]), usd_cnh: round2(cnhSeries[i]),
        // Prix du contrat Brent à échéance lointaine utilisé pour le calendar spread — voir brent_futur ci-dessus.
        brent_m2_price: round2(m2Today?.close ?? null),
        // Vrai spot physique Brent (saisie manuelle), quand disponible pour ce jour — voir brent_futur ci-dessus.
        brent_spot_reel_price: round2(brentSpotRealToday?.close ?? null),
        corr_wti_brent_20j: round2(corrWtiBrent20), signal_corr_court: signalCorr(corr20), signal_corr_moyen: signalCorr(corr60),
        interpretation_structure: interpretationStructureBrent(z),
        interpretation_chine: interpretationBrentVsChine(brentSeries[i], brentYest, cnhSeries[i], cnhYest, closeSpreadBW, null),
      },
    });
    rows.push({
      asset_id: "WTI", date, basis_spread: -spreadSeries[i],
      zscore_60j: z !== null ? -z : null, percentile_10j: p !== null ? 100 - p : null,
      pressure: "Suit le Spread WTI-Brent (voir BRENT)", supply: "Stocks EIA non branchés (à ajouter)",
      signal_label: "NEUTRE", tone: "blue",
    });
    if (i === 0) out.spread_wti_brent = { value: spreadSeries[i], zscore: z, percentile: p };
  }

  if (rows.length) {
    const { upserted, lastError } = await upsertBatches(supabase, rows);
    out.signals_rows = upserted;
    if (lastError) out.signals_error = lastError;
  }

  // ---- Indicateurs économiques (bloc "Économie" du Dashboard) — juste le jour courant,
  //      pas d'historique glissant demandé ici. ----
  const econRows: any[] = [];
  for (const [code, ticker] of [["USDCNH", "USD_CNH"], ["EURUSD", "EUR_USD"], ["DXY", "DXY"], ["US500", "SP500"]]) {
    const { data: bars } = await supabase
      .from("price_history").select("ts, price").eq("ticker", ticker).eq("timeframe", "D1")
      .order("ts", { ascending: false }).limit(2);
    if (bars && bars.length) {
      const change = bars.length > 1 ? ((bars[0].price - bars[1].price) / bars[1].price) * 100 : null;
      econRows.push({ code, value: bars[0].price, change_pct: change });
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
