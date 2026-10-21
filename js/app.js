// ============================================================
// FAUCON SNIPERS TRADER — APP.JS
// Navigation + rendu des sections + intégration Supabase.
// Tant que Supabase n'est pas configuré (js/config.js), tout
// tourne avec les données d'exemple de js/mockData.js.
// ============================================================

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "analyse", label: "Analyse" },
  { id: "saisie", label: "Saisie Spot" },
  { id: "calculateur", label: "Calculateur de position" },
  { id: "journal", label: "Journal" },
  { id: "performance", label: "Performance / MT5" },
  { id: "parametres", label: "Paramètres" },
];

// ---------------- Profil utilisateur (local, remplace le "Alex" en dur) ----------------
const PROFILE_STORAGE_KEY = "fst_profile";
const DEFAULT_PROFILE = { prenom: "Trader", email: "" };

function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...parsed, prenom: parsed.prenom && parsed.prenom.trim() ? parsed.prenom.trim() : DEFAULT_PROFILE.prenom };
  } catch (e) {
    return { ...DEFAULT_PROFILE };
  }
}
function saveProfile(patch) {
  const next = { ...getProfile(), ...patch };
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Profil : impossible d'enregistrer en local —", e.message);
  }
  return next;
}

let currentSection = "dashboard";

// ---------------- Navigation ----------------
function renderNav() {
  const nav = document.getElementById("nav");
  const mobileNav = document.getElementById("mobileNav");
  nav.innerHTML = "";
  mobileNav.innerHTML = "";

  NAV_ITEMS.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "nav-item" + (item.id === currentSection ? " active" : "");
    btn.textContent = item.label;
    btn.onclick = () => switchSection(item.id);
    nav.appendChild(btn);

    if (item.id !== "parametres") {
      const mBtn = document.createElement("button");
      mBtn.className = item.id === currentSection ? "active" : "";
      mBtn.textContent = item.label.split(" ")[0];
      mBtn.onclick = () => switchSection(item.id);
      mobileNav.appendChild(mBtn);
    }
  });
}

function switchSection(id) {
  currentSection = id;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + id).classList.add("active");
  renderNav();

  const title = document.getElementById("topbarTitle");
  const sub = document.getElementById("topbarSub");
  if (id === "dashboard") {
    const h = new Date().getHours();
    const g = h < 6 || h >= 18 ? "Bonsoir" : "Salut";
    title.textContent = `${g} ${getProfile().prenom} 👋`;
    sub.textContent = "";
  } else {
    title.textContent = NAV_ITEMS.find((n) => n.id === id).label;
    sub.textContent = "Vue du jour · mise à jour continue";
  }
}

// ---------------- Helpers ----------------
function statusTone(text) {
  const t = text.toUpperCase();
  if (t.includes("PANIQUE") || t.includes("CRITIQUE") || t.includes("BAISSIER") || t.includes("FAIBLESSE")) return "red";
  if (t.includes("BON") || t.includes("SAIN") || t.includes("SOUTIEN") || t.includes("HAUSSIÈRE") || t.includes("FORTE")) return "green";
  if (t.includes("MODÉRÉ") || t.includes("CONSOLIDATION") || t.includes("TENSION") || t.includes("FAIBLE")) return "amber";
  return "slate";
}
function pill(text) {
  return `<span class="pill ${statusTone(text)}">${text}</span>`;
}

// ============================================================
// Mise en forme conditionnelle façon Excel — mêmes couleurs que
// dans le classeur fourni (feuilles "Market.Tendance" et
// "Correlation+Confirm.BRENT") : styles intégrés Excel "Bon"/"Mauvais",
// rouge/jaune plein pour les états critiques, et l'échelle de couleur
// 3 couleurs par défaut d'Excel (rouge-jaune-vert) pour les jauges.
// ============================================================
const XLS = {
  good: ["#C6EFCE", "#006100"],       // style intégré Excel "Bon"
  bad: ["#FFC7CE", "#9C0006"],        // style intégré Excel "Mauvais"
  neutral: ["#FFEB9C", "#9C6500"],    // style intégré Excel "Neutre"
  solidGreen: ["#92D050", "#0b2e00"], // vert plein utilisé pour les états "BON"
  solidRed: ["#FF0000", "#FFFFFF"],   // rouge plein : PANIQUE / CRITIQUE
  slate: ["#334155", "#cbd5e1"],      // "NO DATA" / Indisponible — gris neutre, pas une alerte
};
const XLS_SCALE = { min: "#F8696B", mid: "#FFEB84", max: "#63BE7B" }; // color scale 3 couleurs par défaut d'Excel

function cfTd(text, tone) {
  const [bg, fg] = XLS[tone] || XLS.good;
  return `<td style="background:${bg};color:${fg};font-weight:700;">${text}</td>`;
}

// Niveau de risque (FAIBLE / MODÉRÉ / ÉLEVÉ / CRITIQUE) → code couleur Excel
function riskExcelTone(risque) {
  const r = risque.toUpperCase();
  if (r.includes("CRITIQUE")) return "solidRed";
  if (r.includes("ÉLEVÉ") || r.includes("ELEVE")) return "bad";
  if (r.includes("MODÉRÉ") || r.includes("MOYEN")) return "neutral";
  return "good";
}
// État / Signal / Structure (texte court) → code couleur Excel
function stateExcelTone(text) {
  const t = text.toUpperCase();
  if (t.includes("PANIQUE") || t.includes("CRISE")) return "solidRed";
  if (t.includes("BAISSIER") || t.includes("FAIBLESSE") || t.includes("PRESSION CHINE")) return "bad";
  if (t.includes("MODÉRÉ") || t.includes("CONSOLIDATION") || t.includes("NEUTRE") || t.includes("FAIBLE")) return "neutral";
  if (t.includes("HAUSSIER") || t.includes("HAUSSIÈRE") || t.includes("SOUTIEN") || t.includes("FORTE")) return "solidGreen";
  return "good";
}

function hexToRgb(hex) {
  const m = hex.replace("#", "");
  return { r: parseInt(m.substring(0, 2), 16), g: parseInt(m.substring(2, 4), 16), b: parseInt(m.substring(4, 6), 16) };
}
function mixColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return `rgb(${Math.round(a.r + (b.r - a.r) * t)},${Math.round(a.g + (b.g - a.g) * t)},${Math.round(a.b + (b.b - a.b) * t)})`;
}
function excelColorScale(value, min, max) {
  const v = Math.max(min, Math.min(max, value));
  const ratio = (v - min) / (max - min);
  return ratio < 0.5 ? mixColor(XLS_SCALE.min, XLS_SCALE.mid, ratio / 0.5) : mixColor(XLS_SCALE.mid, XLS_SCALE.max, (ratio - 0.5) / 0.5);
}

// Z-Score : dans le fichier Excel, |z| <= 2 = zone normale ("Bon"), au-delà = extrême ("Mauvais")
// — un écart statistique extrême est un risque, pas un signal positif.
function zscoreCell(valueStr) {
  const v = parseFloat(String(valueStr).replace(",", "."));
  if (isNaN(v)) return `<td>${valueStr}</td>`;
  return cfTd(valueStr, Math.abs(v) <= 2 ? "good" : "bad");
}
// Corrélation : négative = "Mauvais", positive = "Bon", > 0.8 = vert plein (comme dans le fichier)
function corrCell(valueStr) {
  const v = parseFloat(String(valueStr).replace(",", "."));
  if (isNaN(v)) return `<td>${valueStr}</td>`;
  return cfTd(valueStr, v > 0.8 ? "solidGreen" : v > 0 ? "good" : "bad");
}
// "Data bar" + color scale façon Excel pour les colonnes en pourcentage (ex: Percentile)
function percentileCell(pctStr) {
  const pct = parseFloat(pctStr);
  if (isNaN(pct)) return `<td>${pctStr}</td>`;
  const color = excelColorScale(pct, 0, 100);
  const w = Math.max(0, Math.min(100, pct));
  return `<td>
    <div style="position:relative;background:rgba(148,163,184,0.12);border-radius:3px;overflow:hidden;min-width:64px;">
      <div style="position:absolute;inset:0;width:${w}%;background:${color};opacity:0.55;"></div>
      <span style="position:relative;padding:2px 6px;display:inline-block;font-weight:700;">${pctStr}</span>
    </div>
  </td>`;
}

// ---------------- Dashboard : 100% données réelles (aucun repli fictif) ----------------
// Chaque valeur affichée vient d'un calcul réel sur les données Yahoo Finance en direct.
// Si une donnée est indisponible (réseau, endpoint bloqué...), on l'affiche honnêtement
// comme "indisponible" — on ne fabrique jamais de chiffre de remplacement.

// WTI retiré du Dashboard (carte en double avec BRENT, qui porte déjà le spread) —
// le prix WTI reste suivi en arrière-plan (price_history/compute-signals) car il sert
// au calcul du spread affiché dans la carte BRENT ci-dessous.
// spotTicker : prix spot réel (gold-api.com, gratuit/sans clé — voir fetch-yahoo côté
// serveur), affiché en plus du prix future sur la carte, quand la donnée existe.
// BRENT_SPOT : abandonné (aucune source gratuite de spot pétrole physique n'existe —
// contrairement à l'or/l'argent via gold-api.com — et le scraping d'Investing.com testé
// pour combler ce manque est bloqué en dur, HTTP 403, confirmé le 23/09/2026). La ligne
// "Spot" reste donc honnêtement "Indisponible" pour BRENT sur cette carte Dashboard.
// Le calendar spread réel (BRENT_FUTURE vs BRENT_M2, contrat lointain) est utilisé à la place,
// mais uniquement dans les tableaux Tendance/Confirmation de l'onglet Analyse (voir
// computeLiveSpread et renderTendanceTable/renderConfirmTable plus bas) — pas ici, pour ne
// jamais afficher un prix de contrat futures sous une étiquette "Spot".
const REAL_ASSETS = {
  GOLD: { name: "GOLD", ticker: "GOLD_FUTURE", spotTicker: "XAUUSD_SPOT" },
  SILVER: { name: "SILVER", ticker: "SILVER_FUTURE", spotTicker: "XAGUSD_SPOT" },
  BRENT: { name: "BRENT", ticker: "BRENT_FUTURE", spotTicker: "BRENT_SPOT" },
};

// Spread Brent-WTI affiché en plus de la Basis Spot-Futur propre à Brent (voir rendu de la
// carte) — reste calculé sur les futures (BRENT_FUTURE/WTI_FUTURE) tant que le spot pétrole n'existe pas.
const BASIS_LABELS = {
  GOLD: "Basis Spot-Futur (via signals, dernier calcul serveur)",
  SILVER: "Basis Spot-Futur (via signals, dernier calcul serveur)",
  BRENT: "Spread Brent - WTI (contrats futures)",
};

const REAL_ECONOMY = {
  USDCNH: { label: "USD/CNH" },
  EURUSD: { label: "EUR/USD" },
  DXY: { label: "DXY" },
  US500: { label: "US500" },
};

// Signal (BIAIS HAUSSIER / BAISSIER / NEUTRE) dérivé objectivement du Z-Score réel —
// jamais d'un texte narratif inventé. Repli utilisé seulement si la table Supabase
// "signals" n'a pas encore été calculée pour cet actif (compute-signals pas encore lancé).
function signalFromZ(z) {
  if (z == null) return { label: "SIGNAL INDISPONIBLE", tone: "slate" };
  if (z >= 1) return { label: "BIAIS HAUSSIER", tone: "green" };
  if (z <= -1) return { label: "BIAIS BAISSIER", tone: "red" };
  return { label: "NEUTRE", tone: "amber" };
}

// ---- Tendance / Confirmation / Sens à prendre aujourd'hui ----
// Règle 100% déterministe appliquée aux DEUX seules valeurs réellement calculées côté
// serveur (Z-Score 60j et Percentile 10j, table "signals") — aucune donnée fabriquée.
// Tendance = direction du Z-Score(60j). Confirmation = le Percentile(10j) (position du
// prix dans son range récent) va-t-il dans le même sens que la Tendance ? Sens à prendre
// = ACHETER/VENDRE seulement si Tendance ET Confirmation sont alignées, sinon NEUTRE.
// Affiché comme repère informatif dérivé de données réelles — pas un conseil financier.
function analyseFromSignal(zscore, percentile) {
  if (zscore == null) {
    return {
      tendance: { label: "Indisponible", tone: "slate" },
      confirmation: { label: "Indisponible", tone: "slate" },
      sens: { label: "NEUTRE - EN SURVEILLANCE", tone: "amber" },
    };
  }
  const dir = zscore >= 1 ? "hausse" : zscore <= -1 ? "baisse" : "neutre";
  const tendance = dir === "hausse"
    ? { label: "Haussière", tone: "green" }
    : dir === "baisse"
    ? { label: "Baissière", tone: "red" }
    : { label: "Neutre", tone: "amber" };

  let confirmation;
  if (dir === "neutre") {
    confirmation = { label: "Neutre", tone: "amber" };
  } else if (percentile == null) {
    confirmation = { label: "Indisponible", tone: "slate" };
  } else if (dir === "hausse") {
    confirmation = percentile >= 60 ? { label: "Confirmée", tone: "green" }
      : percentile <= 40 ? { label: "Non confirmée", tone: "red" }
      : { label: "Partielle", tone: "amber" };
  } else {
    confirmation = percentile <= 40 ? { label: "Confirmée", tone: "green" }
      : percentile >= 60 ? { label: "Non confirmée", tone: "red" }
      : { label: "Partielle", tone: "amber" };
  }

  let sens;
  if (dir === "hausse" && confirmation.label === "Confirmée") sens = { label: "ACHETER", tone: "green" };
  else if (dir === "baisse" && confirmation.label === "Confirmée") sens = { label: "VENDRE", tone: "red" };
  else sens = { label: "NEUTRE - EN SURVEILLANCE", tone: "amber" };

  return { tendance, confirmation, sens };
}

// Toutes les données du Dashboard (prix, Basis, Z-Score, Percentile, économie, taux 10 ans)
// viennent maintenant des tables Supabase (price_history / signals / economic_indicators),
// alimentées en continu côté serveur par les Edge Functions (fetch-yahoo en cron, voir
// sql/schedule.sql). Le Dashboard n'appelle donc plus jamais Yahoo Finance directement
// depuis le navigateur : ça marche pareil en local et une fois le site déployé ailleurs
// (plus besoin du proxy local tools/yahoo_proxy.py pour cette partie).
// Si Supabase n'est pas configuré ou qu'une donnée manque, on l'affiche honnêtement
// comme "indisponible" — on ne fabrique jamais de chiffre de remplacement.
async function getLatestQuoteFromSupabase(ticker) {
  if (!supabaseClient) return null;
  try {
    let { data } = await supabaseClient
      .from("price_history").select("price, ts")
      .eq("ticker", ticker).eq("timeframe", "15m")
      .order("ts", { ascending: false }).limit(2);
    if (!data || data.length < 1) {
      ({ data } = await supabaseClient
        .from("price_history").select("price, ts")
        .eq("ticker", ticker).eq("timeframe", "D1")
        .order("ts", { ascending: false }).limit(2));
    }
    if (!data || data.length < 1 || data[0].price == null) return null;
    const price = Number(data[0].price);
    const changePct = data.length > 1 && data[1].price != null
      ? ((price - Number(data[1].price)) / Number(data[1].price)) * 100
      : null;
    return { price, changePct };
  } catch (e) {
    console.warn(`[Dashboard] prix Supabase indisponible pour ${ticker} :`, e.message);
    return null;
  }
}

// Charge un actif réel : prix depuis price_history, Basis/Z-Score/Percentile/Signal
// depuis la table signals (calculés côté serveur par compute-signals).
async function loadRealAsset(assetId) {
  const def = REAL_ASSETS[assetId];
  const out = {
    id: assetId, name: def.name, live: null, spot: null,
    basisLabel: BASIS_LABELS[assetId], basisValue: null,
    zscore: null, percentile: null, signalLabel: null, signalTone: null,
  };
  out.live = await getLatestQuoteFromSupabase(def.ticker);
  if (def.spotTicker) out.spot = await getLatestQuoteFromSupabase(def.spotTicker);
  if (supabaseClient) {
    try {
      // Tri par date PUIS created_at (défense en profondeur : tant que le doublon éventuel
      // d'anciennes lignes signals sans contrainte unique n'est pas nettoyé côté base, on
      // veut toujours la ligne la plus récente, pas une ligne arbitraire du même jour).
      const { data, error } = await supabaseClient
        .from("signals").select("*")
        .eq("asset_id", assetId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const row = !error && data && data[0];
      if (row) {
        out.basisValue = row.basis_spread != null ? Number(row.basis_spread) : null;
        out.zscore = row.zscore_60j != null ? Number(row.zscore_60j) : null;
        out.percentile = row.percentile_10j != null ? Math.round(Number(row.percentile_10j)) : null;
        out.signalLabel = row.signal_label || null;
        out.signalTone = row.tone || null;
      }
    } catch (e) {
      console.warn(`[Dashboard] ${assetId} : signaux Supabase indisponibles :`, e.message);
    }
  }
  return out;
}

async function loadAssets() {
  return Promise.all(Object.keys(REAL_ASSETS).map(loadRealAsset));
}

function formatLiveEconomyValue(code, price) {
  if (code === "US500") return price.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  if (code === "DXY") return price.toFixed(2);
  return price.toFixed(4);
}

// Indicateurs macro 100% réels, lus depuis la table Supabase economic_indicators
// (alimentée par compute-signals à chaque exécution du cron).
async function loadEconomy() {
  const codes = Object.keys(REAL_ECONOMY);
  const fallback = (code) => ({ label: REAL_ECONOMY[code].label, live: false, value: null, change: null, tone: "slate" });
  if (!supabaseClient) return codes.map(fallback);
  return Promise.all(codes.map(async (code) => {
    try {
      const { data, error } = await supabaseClient
        .from("economic_indicators").select("*")
        .eq("code", code).order("ts", { ascending: false }).limit(1);
      const row = !error && data && data[0];
      if (!row || row.value == null) return fallback(code);
      return {
        label: REAL_ECONOMY[code].label,
        live: true,
        value: formatLiveEconomyValue(code, Number(row.value)),
        change: row.change_pct != null ? `${row.change_pct >= 0 ? "+" : ""}${Number(row.change_pct).toFixed(2)}%` : null,
        tone: row.change_pct == null ? "slate" : row.change_pct >= 0 ? "green" : "red",
      };
    } catch (e) {
      console.warn(`[Dashboard] économie ${code} indisponible :`, e.message);
      return fallback(code);
    }
  }));
}

// Actualités réelles (par ticker, jamais un mot-clé libre — voir fetch-news), lues
// depuis la table Supabase news.
async function loadNews() {
  if (!supabaseClient) return [];
  try {
    const { data, error } = await supabaseClient.from("news").select("*").order("published_at", { ascending: false }).limit(8);
    if (error || !data) return [];
    return data.map((n) => ({
      time: new Date(n.published_at).toLocaleString("fr-FR"), source: n.source, asset: n.asset_tag, title: n.title, link: n.link,
    }));
  } catch (e) {
    console.warn("[Dashboard] actualités indisponibles :", e.message);
    return [];
  }
}

// Phare : relation macro connue et déterministe (pas inventée) entre la direction du
// taux 10 ans US aujourd'hui (donnée réelle US10Y) et les matières premières — hausse des
// taux réels = coût d'opportunité plus élevé pour les actifs non rémunérés (or/argent) et
// souvent un dollar plus fort (pression sur le pétrole coté en USD) ; baisse = l'inverse.
// C'est un repère de lecture macro, pas une prédiction ni un conseil financier.
function phareTaux10Ans(changePct) {
  if (changePct == null || Math.abs(changePct) < 0.02) {
    return "🔦 Repère : taux stable aujourd'hui — pas de pression directionnelle notable sur l'or/l'argent/le pétrole via ce canal.";
  }
  if (changePct > 0) {
    return `🔦 Repère : hausse des taux 10 ans aujourd'hui (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%) → tend à peser sur l'or et l'argent (coût d'opportunité plus élevé) et à soutenir le dollar US, ce qui peut aussi peser sur le pétrole coté en USD.`;
  }
  return `🔦 Repère : baisse des taux 10 ans aujourd'hui (${changePct.toFixed(2)}%) → tend à soutenir l'or et l'argent (actifs non rémunérés plus attractifs) et à affaiblir le dollar US, ce qui peut soutenir le pétrole coté en USD.`;
}

// Proxy réel du bloc "Fed" : rendement du Trésor US 10 ans (US10Y), lu depuis
// price_history (alimenté par fetch-yahoo/backfill-history, comme les autres actifs).
async function renderFomcCard() {
  const el = document.getElementById("fomcCard");
  if (!el) return;
  const tnx = await getLatestQuoteFromSupabase("US10Y");
  if (tnx && tnx.price != null) {
    el.innerHTML = `
      <h2>TAUX 10 ANS US</h2>
      <p class="sub" style="margin:0;">Proxy réel du contexte Fed (US10Y), pas les probabilités FOMC elles-mêmes</p>
      <p style="font-size:22px;font-weight:700;margin:8px 0 2px;">${tnx.price.toFixed(2)} %</p>
      <p class="sub" style="margin:0 0 10px;color:${tnx.changePct != null ? (tnx.changePct >= 0 ? "var(--green)" : "var(--red)") : "inherit"};">${tnx.changePct != null ? `${tnx.changePct >= 0 ? "+" : ""}${tnx.changePct.toFixed(2)}% vs clôture précédente` : ""}</p>
      <p class="sub" style="margin:0;border-top:1px dashed var(--border);padding-top:8px;">${phareTaux10Ans(tnx.changePct)}</p>
    `;
  } else {
    el.innerHTML = `
      <h2>TAUX 10 ANS US (proxy Fed)</h2>
      <p class="sub" style="margin:0;">Indisponible pour le moment. Aucune valeur de remplacement affichée.</p>
    `;
  }
}

// État honnête de la carte "Performance du portefeuille" : aucune remontée réelle de PnL
// MT5 n'est encore branchée (lecture seule prévue plus tard, voir feuille de route README).
function renderPortfolioPerfCard() {
  const el = document.getElementById("portfolioPerfCard");
  if (!el) return;
  const hasAccounts = Array.isArray(mt5Accounts) && mt5Accounts.length > 0;
  el.innerHTML = `
    <h2>PERFORMANCE DU PORTEFEUILLE</h2>
    <p class="sub" style="margin:0;">
      ${hasAccounts
        ? "Compte(s) MT5 enregistrés en lecture seule, mais la remontée réelle du PnL n'est pas encore branchée (voir README, feuille de route)."
        : "Aucun compte MT5 connecté. Ajoute un compte dans Paramètres pour suivre tes vraies performances ici."}
    </p>
  `;
}

// Une ligne prix (Spot ou Futures) avec son propre delta coloré (vert si positif, rouge si
// négatif) — le delta vient de la comparaison des 2 dernières lignes réelles en base pour
// CE ticker précis (voir getLatestQuoteFromSupabase), donc chaque ligne a son vrai delta,
// pas une valeur recopiée d'un autre prix.
function priceRow(label, q) {
  if (!q || q.price == null) {
    return `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span class="sub">${label}</span><strong>Indisponible</strong></div>`;
  }
  const color = q.changePct != null ? (q.changePct >= 0 ? "var(--green)" : "var(--red)") : null;
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11px;margin-bottom:4px;">
    <span class="sub">${label}</span>
    <span><strong>${q.price.toFixed(2)}</strong>${q.changePct != null ? ` <strong style="color:${color};">${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%</strong>` : ""}</span>
  </div>`;
}

async function renderDashboard() {
  const assets = await loadAssets();
  document.getElementById("assetCards").innerHTML = assets.map((a) => {
    const analyse = analyseFromSignal(a.zscore, a.percentile);
    // Basis Spot-Futur calculé EN DIRECT côté client (spot le plus récent moins futures le
    // plus récent, tous deux déjà en base) — plus temps réel que d'attendre le prochain
    // passage de compute-signals (qui tourne sur son propre cron, moins fréquent).
    const liveBasis = (a.spot && a.spot.price != null && a.live && a.live.price != null)
      ? a.spot.price - a.live.price : null;
    return `
    <div class="card">
      <div style="margin-bottom:8px;"><strong style="font-size:13px;">${a.name}</strong></div>
      ${priceRow("Spot", a.spot)}
      ${priceRow(`Futures (contrat du jour) ${REAL_ASSETS[a.id].ticker}`, a.live)}
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span class="sub">Basis Spot-Futur</span><strong>${liveBasis != null ? fmtSigned(liveBasis) : "Indisponible"}</strong></div>
      ${a.id === "BRENT" ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span class="sub">${a.basisLabel}</span><strong>${a.basisValue != null ? fmtSigned(a.basisValue) : "Indisponible"}</strong></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:10px;"><span class="sub">Z-Score (60j) · Percentile (10j)</span><strong>${a.zscore != null ? fmtSigned(a.zscore) : "Indisp."} · ${a.percentile != null ? `${a.percentile}%` : "Indisp."}</strong></div>
      <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;"><span class="sub" style="font-size:11px;">TENDANCE</span><span class="badge ${analyse.tendance.tone}" style="font-size:10px;">${analyse.tendance.label}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;"><span class="sub" style="font-size:11px;">CONFIRMATION</span><span class="badge ${analyse.confirmation.tone}" style="font-size:10px;">${analyse.confirmation.label}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px dashed var(--border);padding-top:6px;"><span class="sub" style="font-size:11px;">SENS À PRENDRE AUJOURD'HUI</span><span class="badge ${analyse.sens.tone}" style="font-size:10px;">${analyse.sens.label}</span></div>
      </div>
    </div>
  `;
  }).join("");

  const economy = await loadEconomy();
  document.getElementById("economyCards").innerHTML = economy.map((e) => `
    <div class="card">
      <p class="sub" style="margin:0;">${e.label} ${e.live ? '<span style="color:var(--green);">●</span>' : ""}</p>
      ${e.live
        ? `<p style="font-size:18px;font-weight:700;margin:4px 0;">${e.value} <span style="font-size:12px;color:${e.tone === "green" ? "var(--green)" : "var(--red)"};">${e.change}</span></p>`
        : `<p style="font-size:13px;margin:4px 0;color:var(--sub);">Indisponible</p>`}
    </div>
  `).join("");

  await renderFomcCard();
  renderPortfolioPerfCard();

  const news = await loadNews();
  document.getElementById("newsList").innerHTML = news.length
    ? news.map((n) => `
    <div style="border-bottom:1px solid rgba(30,41,59,0.5);padding:8px 0;">
      <span class="badge slate" style="font-size:10px;">${n.source || "Yahoo Finance"}</span>
      <p style="font-size:12px;margin:6px 0 2px;">${n.link ? `<a href="${n.link}" target="_blank" rel="noopener" style="color:inherit;">${n.title}</a>` : n.title}</p>
      <p class="sub" style="margin:0;">${n.time} · ${n.asset}</p>
    </div>
  `).join("")
    : `<p class="sub" style="margin:0;">Aucune actualité pour le moment.</p>`;
}

// ---------------- Analyse ----------------
let currentAnalyseAsset = "BRENT";
let currentAnalysisTab = "tendance";

// ---- Vue "Tendance" et "Confirmation" : branchées sur la table Supabase "signals" ----
// Chaque ligne vient réellement d'un passage de compute-signals (une ligne par actif/jour,
// grâce à la contrainte unique asset_id+date — voir sql/schema.sql) : aucune valeur n'est
// générée ici, on affiche exactement ce qui est en base. L'historique démarre au jour où
// ce branchement a été mis en place — il s'enrichit tout seul, un jour réel à la fois, à
// chaque exécution du cron compute-signals (voir sql/schedule.sql).
function fmtSigned(v) {
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}

async function fetchSignalsHistory(assetId, limit = 1000) {
  if (!supabaseClient) return [];
  try {
    const { data, error } = await supabaseClient
      .from("signals").select("*")
      .eq("asset_id", assetId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    return !error && data ? data : [];
  } catch (e) {
    console.warn(`[Analyse] historique signals indisponible pour ${assetId} :`, e.message);
    return [];
  }
}

function emptyHistoryRow(colspan) {
  return `<tr><td colspan="${colspan}" style="text-align:center;padding:24px 12px;color:var(--sub);">
    Pas encore de ligne réelle pour cet actif (le premier passage de compute-signals sur ce
    jour n'a pas encore eu lieu, ou vient d'être fait — recharge dans quelques minutes).
  </td></tr>`;
}

// ---------------------------------------------------------------------------
// Mise en forme conditionnelle des textes Tendance/Confirmation (États du Marché,
// Risques & Interprétations, Signaux) : même logique que la mise en forme
// conditionnelle par mots-clés du fichier Excel (chaque texte contient déjà
// l'émoji/le mot qui déterminait la couleur de cellule dans Market.Tendance /
// Correlation+Confirm.BRENT / Gold.Silver), réutilise la palette Excel ci-dessus.
// ---------------------------------------------------------------------------
function xlsToneFromText(text) {
  if (text == null) return "slate";
  const t = String(text);
  if (t.includes("NO DATA") || t.includes("Indisponible") || t.includes("⏳")) return "slate";
  if (t.includes("🚨") || t.includes("🔥")) return "solidRed";
  if (t.includes("🔴") || t.includes("🛑") || t.includes("PANIQUE") || t.includes("CRITIQUE") || t.includes("RUPTURE")
    || t.includes("ALERTE ROUGE") || t.includes("VENTE") || t.includes("SELL") || t.includes("CAPITULATION")
    || t.includes("DISTRIBUTION") || t.toUpperCase().includes("BAISSIER") || t.includes("Risque Logistique")) return "bad";
  if (t.includes("🟢") || t.includes("💎") || t.includes("🚀")) return "solidGreen";
  if (t.includes("BON") || t.includes("SAIN") || t.includes("ACHAT") || t.includes("BUY") || t.includes("ACCUMULATION")
    || t.includes("RÉSILIENCE") || t.toUpperCase().includes("HAUSSIER") || t.includes("HAUSSE SAINE") || t.includes("SOUTIEN")) return "good";
  if (t.includes("⚠️") || t.includes("💥") || t.includes("TENSION") || t.toUpperCase().includes("MOYEN")
    || t.includes("Attention") || t.includes("SURCHAUFFE") || t.includes("EUPHORIE")) return "neutral";
  return "good"; // ⚖️ / 🎯 / ⚪ NEUTRE, PARITÉ, PIVOT... : zone normale, pas d'alerte
}
function xlsTd(text) {
  if (text == null || text === "") return `<td>Indisponible</td>`;
  return cfTd(text, xlsToneFromText(text));
}
// Cellule numérique signée simple (spreads, variations, basis) — vert/rouge selon le signe,
// sans code Excel dédié (ce ne sont pas des Z-Score/corrélations avec leurs propres seuils).
function signedNumTd(v, dec = 2) {
  if (v == null) return `<td>Indisponible</td>`;
  const color = v >= 0 ? "var(--green)" : "var(--red)";
  return `<td style="color:${color};font-weight:600;">${v >= 0 ? "+" : ""}${Number(v).toFixed(dec)}</td>`;
}
function plainNumTd(v, dec = 2) {
  return `<td>${v == null ? "Indisponible" : Number(v).toFixed(dec)}</td>`;
}

// ---------------------------------------------------------------------------
// Valeur "En cours" (live) pour les tableaux Tendance : spread calculé sur les derniers
// prix connus (price_history, via getLatestQuoteFromSupabase), affiché uniquement sur la
// ligne la plus récente — les jours passés sont déjà clôturés (Ouverture/Fermeture suffisent).
// Jamais de valeur inventée : "Indisponible" si l'un des deux prix manque.
// ---------------------------------------------------------------------------
async function computeLiveSpread(assetId) {
  if (assetId === "BRENT") {
    const [brentQ, wtiQ, m2Q] = await Promise.all([
      getLatestQuoteFromSupabase("BRENT_FUTURE"),
      getLatestQuoteFromSupabase("WTI_FUTURE"),
      getLatestQuoteFromSupabase("BRENT_M2"), // contrat lointain (calendar spread) — voir fetch-yahoo/compute-signals
    ]);
    return {
      wtiBrentLive: (brentQ && wtiQ) ? brentQ.price - wtiQ.price : null,
      // Calendar spread en direct : proche (BRENT_FUTURE) - lointain (BRENT_M2), même convention de
      // signe que compute-signals. Indisponible si le dernier contrat lointain n'a pas pu
      // être trouvé (jamais de valeur fabriquée en repli).
      brentFuturLive: (m2Q && brentQ) ? brentQ.price - m2Q.price : null,
    };
  }
  const def = REAL_ASSETS[assetId];
  if (!def || !def.spotTicker) return { spreadLive: null };
  const [spotQ, futQ] = await Promise.all([
    getLatestQuoteFromSupabase(def.spotTicker),
    getLatestQuoteFromSupabase(def.ticker),
  ]);
  return { spreadLive: (spotQ && futQ) ? spotQ.price - futQ.price : null };
}
function liveTd(v, isCurrentRow, dec = 2) {
  if (!isCurrentRow) return `<td style="color:var(--text-dim);">–</td>`;
  if (v == null) return `<td>Indisponible</td>`;
  return `<td class="cell-live">${Number(v).toFixed(dec)}</td>`;
}

// ---------------------------------------------------------------------------
// Signal de corrélation (":( FORTE" / ":/ MODÉRÉE" / ":) FAIBLE", texte Excel identique)
// → couleur Excel dédiée (pas la même logique que xlsToneFromText, mots-clés différents).
// ---------------------------------------------------------------------------
function corrSignalTone(text) {
  if (!text) return "slate";
  const t = text.toUpperCase();
  if (t.includes("FORTE")) return "solidGreen";
  if (t.includes("MODÉRÉE") || t.includes("MODEREE")) return "neutral";
  if (t.includes("FAIBLE")) return "bad";
  return "slate";
}
function corrSignalTd(text) {
  if (!text) return `<td>Indisponible</td>`;
  return cfTd(text, corrSignalTone(text));
}
// Z-Score avec véritable dégradé 3 couleurs (comme la mise en forme conditionnelle "color
// scale" du fichier Excel sur la colonne Z-Score Silver) — pas juste bon/mauvais binaire.
function zscoreScaleCell(valueStr) {
  const v = parseFloat(String(valueStr).replace(",", "."));
  if (isNaN(v)) return `<td>${valueStr}</td>`;
  const color = excelColorScale(v, -3, 3);
  return `<td style="background:${color};color:#0b1220;font-weight:700;">${valueStr}</td>`;
}

// ---------------------------------------------------------------------------
// Filtre unique au-dessus du tableau Tendance (23/09/2026, remplace l'ancien filtre par
// colonne façon AutoFilter Excel — une boîte par colonne, jugé trop chargé). Un seul champ
// de recherche : masque les lignes dont AUCUNE des colonnes Date / Ouv. / En cours / Ferm.
// ne contient le texte tapé (insensible à la casse). Les colonnes concernées changent selon
// l'actif (BRENT a 2 groupes de colonnes Ouv./En cours/Ferm., GOLD/SILVER un seul), donc
// setTendanceFilterCols() est appelée à chaque rendu du tableau avec les bons index.
// Le tableau Confirmation n'a pas de colonnes Ouv./En cours/Ferm. et n'a plus de filtre.
// ---------------------------------------------------------------------------
let tendanceFilterCols = [0, 1, 2, 3];
function setTendanceFilterCols(cols) { tendanceFilterCols = cols; }
function applyTendanceQuickFilter() {
  const input = document.getElementById("tendanceQuickFilter");
  const table = document.getElementById("tendanceTable");
  if (!input || !table) return;
  const val = input.value.trim().toLowerCase();
  const tbody = table.tBodies[0];
  if (!tbody) return;
  for (const row of tbody.rows) {
    if (!val) { row.style.display = ""; continue; }
    let visible = false;
    for (const col of tendanceFilterCols) {
      const cell = row.cells[col];
      if (cell && cell.textContent.toLowerCase().includes(val)) { visible = true; break; }
    }
    row.style.display = visible ? "" : "none";
  }
}
// Recalcule le "top" sticky de chaque ligne d'en-tête à partir de la hauteur réellement
// rendue des lignes précédentes (plutôt qu'une valeur en dur) : garantit qu'aucune ligne
// (groupe / sous-en-têtes) ne chevauche une autre, quelle que soit sa hauteur.
function fixStickyHeaderOffsets(tableId) {
  requestAnimationFrame(() => {
    const thead = document.querySelector(`#${tableId} thead`);
    if (!thead) return;
    let offset = 0;
    for (const row of thead.rows) {
      for (const cell of row.cells) cell.style.top = `${offset}px`;
      offset += row.offsetHeight;
    }
  });
}

async function fetchTendanceHistory(assetId) {
  const rows = await fetchSignalsHistory(assetId);
  return rows.filter((r) => r.tendance_detail);
}
async function fetchConfirmHistory(assetId) {
  const rows = await fetchSignalsHistory(assetId);
  return rows.filter((r) => r.confirmation_detail || r.zscore_60j != null);
}

// Note honnête affichée au-dessus des tableaux Tendance/Confirmation pour GOLD/SILVER :
// explique pourquoi les dates passées au démarrage de la collecte du spot (gold-api.com)
// resteront "Indisponible" pour toujours (aucune source gratuite ne republie l'historique
// du spot physique Gold/Silver — vérifié à nouveau le 23/09/2026, y compris FRED dont la
// série LBMA a été retirée en 2022), et que ce n'est pas un bug : le nombre de jours réels
// déjà collectés grandit d'un jour à chaque fois que fetch-yahoo tourne. Vide pour BRENT
// (pas de notion de "spot" ici, voir le calendar spread).
function spotCollectionNote(rows) {
  const d = rows && rows[0] && rows[0].tendance_detail;
  const jours = d && d.spot_jours_collectes != null ? d.spot_jours_collectes : null;
  if (jours == null) return "";
  const depuis = d.spot_depuis ? new Date(d.spot_depuis).toLocaleDateString("fr-FR") : "?";
  if (jours >= 60) return `Spot réel collecté depuis le ${depuis} (${jours} jours) — historique suffisant pour tous les calculs.`;
  return `Spot réel collecté depuis le ${depuis} (${jours} jour${jours > 1 ? "s" : ""} pour l'instant) — les dates antérieures à cette collecte resteront honnêtement "Indisponible" (aucune source gratuite ne republie l'historique du spot physique Gold/Silver). Le Z-Score (60j) apparaîtra automatiquement une fois 60 jours réels accumulés, la Corrélation (20j) et la Performance dès quelques jours de plus.`;
}

async function renderTendanceTable() {
  const labelEl = document.getElementById("tendanceAssetLabel");
  if (labelEl) labelEl.textContent = currentAnalyseAsset;
  const thead = document.querySelector("#tendanceTable thead");
  const tbody = document.querySelector("#tendanceTable tbody");
  if (!thead || !tbody) return;
  const noteEl = document.getElementById("tendanceSpotNote");
  const [rows, live] = await Promise.all([
    fetchTendanceHistory(currentAnalyseAsset),
    computeLiveSpread(currentAnalyseAsset),
  ]);

  if (currentAnalyseAsset === "BRENT") {
    if (noteEl) noteEl.textContent = "";
    thead.innerHTML = `
      <tr class="thead-row1">
        <th rowspan="2">Date</th>
        <th colspan="6" class="thgrp-a">Spread BRENT-WTI</th>
        <th colspan="6" class="thgrp-b">Spread Calendaire Brent (M1 vs M+2/M+3)</th>
      </tr>
      <tr class="thead-row2">
        <th class="thgrp-a">Ouv.</th><th class="thgrp-a">En cours</th><th class="thgrp-a">Ferm.</th><th class="thgrp-a">Var.</th><th class="thgrp-a">État du Marché</th><th class="thgrp-a">Risque &amp; Interprétation</th>
        <th class="thgrp-b">Ouv.</th><th class="thgrp-b">En cours</th><th class="thgrp-b">Ferm.</th><th class="thgrp-b">Var.</th><th class="thgrp-b">État du Marché</th><th class="thgrp-b">Risque &amp; Interprétation</th>
      </tr>
`;
    setTendanceFilterCols([0, 1, 2, 3, 7, 8, 9]);
    fixStickyHeaderOffsets("tendanceTable");
    tbody.innerHTML = rows.length ? rows.map((r, idx) => {
      const wb = r.tendance_detail.wti_brent || {};
      const bf = r.tendance_detail.brent_futur || {};
      const isNow = idx === 0;
      return `<tr>
        <td><strong>${new Date(r.date).toLocaleDateString("fr-FR")}</strong></td>
        ${plainNumTd(wb.ouverture)}${liveTd(live.wtiBrentLive, isNow)}${plainNumTd(wb.fermeture)}${signedNumTd(wb.variation)}
        ${xlsTd(wb.etat_marche)}${xlsTd(wb.risque_interpretation)}
        ${plainNumTd(bf.ouverture)}${liveTd(live.brentFuturLive, isNow)}${plainNumTd(bf.fermeture)}${signedNumTd(bf.variation)}
        ${xlsTd(bf.etat_marche)}${xlsTd(bf.risque_interpretation)}
      </tr>`;
    }).join("") : emptyHistoryRow(13);
    applyTendanceQuickFilter();
    return;
  }

  // GOLD / SILVER : Spread Spot-Futur (100% réel, gold-api.com vs futures)
  if (noteEl) noteEl.textContent = spotCollectionNote(rows);
  thead.innerHTML = `
    <tr class="thead-row1">
      <th rowspan="2">Date</th>
      <th colspan="6" class="thgrp-a">Spread Spot-Futur</th>
    </tr>
    <tr class="thead-row2">
      <th class="thgrp-a">Ouv.</th><th class="thgrp-a">En cours</th><th class="thgrp-a">Ferm.</th><th class="thgrp-a">Var.</th><th class="thgrp-a">État du Marché</th><th class="thgrp-a">Risque &amp; Interprétation</th>
    </tr>
`;
  setTendanceFilterCols([0, 1, 2, 3]);
    fixStickyHeaderOffsets("tendanceTable");
  tbody.innerHTML = rows.length ? rows.map((r, idx) => {
    const d = r.tendance_detail;
    const isNow = idx === 0;
    return `<tr>
      <td><strong>${new Date(r.date).toLocaleDateString("fr-FR")}</strong></td>
      ${plainNumTd(d.spread_ouverture)}${liveTd(live.spreadLive, isNow)}${plainNumTd(d.spread_fermeture)}${signedNumTd(d.spread_variation)}
      ${xlsTd(d.etat_marche)}${xlsTd(d.risque_interpretation)}
    </tr>`;
  }).join("") : emptyHistoryRow(7);
  applyTendanceQuickFilter();
}

async function renderConfirmTable() {
  const labelEl = document.getElementById("confirmAssetLabel");
  if (labelEl) labelEl.textContent = currentAnalyseAsset;
  const thead2 = document.querySelector("#confirmTable thead");
  const tbody2 = document.querySelector("#confirmTable tbody");
  if (!thead2 || !tbody2) return;
  const noteEl2 = document.getElementById("confirmSpotNote");
  const rows = await fetchConfirmHistory(currentAnalyseAsset);

  if (currentAnalyseAsset === "BRENT") {
    if (noteEl2) noteEl2.textContent = "";
    thead2.innerHTML = `
      <tr class="thead-flat">
        <th>Date</th><th>Brent_Spot (proxy BRENT_FUTURE)</th><th>WTI_Spot (proxy WTI_FUTURE)</th><th>Brent M+2/M+3 (calendaire)</th><th>USD/CNH</th>
        <th>Spread WTI-Brent</th><th>Basis Brent-Futur</th>
        <th>Z-Score Spread (60j)</th><th>Percentile (10j)</th>
        <th>Corr CNH/Brent court (20j)</th><th>Corr CNH/Brent moyen (60j)</th><th>Corr WTI/Brent (20j)</th>
        <th>Signal Corr Court</th><th>Signal Corr Moyen</th>
        <th>Interprétation Structure (vs moyenne)</th><th>Interprétation Brent vs Chine</th>
      </tr>
`;
    fixStickyHeaderOffsets("confirmTable");
    tbody2.innerHTML = rows.length ? rows.map((r) => {
      const c = r.confirmation_detail || {};
      const wb = (r.tendance_detail && r.tendance_detail.wti_brent) || {};
      const bf = (r.tendance_detail && r.tendance_detail.brent_futur) || {};
      return `<tr>
        <td><strong>${new Date(r.date).toLocaleDateString("fr-FR")}</strong></td>
        ${plainNumTd(c.brent_price)}${plainNumTd(c.wti_price)}${plainNumTd(c.brent_m2_price)}${plainNumTd(c.usd_cnh, 4)}
        ${plainNumTd(wb.fermeture)}${plainNumTd(bf.fermeture)}
        ${r.zscore_60j != null ? zscoreCell(Number(r.zscore_60j).toFixed(2)) : "<td>Indisponible</td>"}
        ${r.percentile_10j != null ? percentileCell(Math.round(Number(r.percentile_10j)).toString()) : "<td>Indisponible</td>"}
        ${r.corr_20j != null ? corrCell(Number(r.corr_20j).toFixed(2)) : "<td>Indisponible</td>"}
        ${r.corr_60j != null ? corrCell(Number(r.corr_60j).toFixed(2)) : "<td>Indisponible</td>"}
        ${c.corr_wti_brent_20j != null ? corrCell(Number(c.corr_wti_brent_20j).toFixed(2)) : "<td>Indisponible</td>"}
        ${corrSignalTd(c.signal_corr_court)}${corrSignalTd(c.signal_corr_moyen)}
        ${xlsTd(c.interpretation_structure)}${xlsTd(c.interpretation_chine)}
      </tr>`;
    }).join("") : emptyHistoryRow(16);
    return;
  }

  if (currentAnalyseAsset === "GOLD") {
    if (noteEl2) noteEl2.textContent = spotCollectionNote(rows);
    thead2.innerHTML = `
      <tr class="thead-flat">
        <th>Date</th><th>Gold Spot</th><th>Silver Spot</th>
        <th>Z-Score Spot (60j)</th><th>Corr USD/Gold (20j)</th><th>DXY</th>
        <th>Perf. vs S&amp;P500</th><th>Ratio Gold/Silver</th><th>Ratio Gold/Brent</th>
        <th>Signal Journalier GOLD/USD</th><th>Signal Structure/Sens</th>
      </tr>
`;
    fixStickyHeaderOffsets("confirmTable");
    tbody2.innerHTML = rows.length ? rows.map((r) => {
      const c = r.confirmation_detail || {};
      return `<tr>
        <td><strong>${new Date(r.date).toLocaleDateString("fr-FR")}</strong></td>
        ${plainNumTd(c.gold_spot_price)}${plainNumTd(c.silver_spot_price)}
        ${c.zscore_spot_60j != null ? zscoreCell(Number(c.zscore_spot_60j).toFixed(2)) : "<td>Indisponible</td>"}
        ${c.corr_usd_gold_20j != null ? corrCell(Number(c.corr_usd_gold_20j).toFixed(2)) : "<td>Indisponible</td>"}
        ${plainNumTd(c.dxy)}${signedNumTd(c.performance_vs_sp500)}
        ${plainNumTd(c.gold_silver_ratio)}${plainNumTd(c.gold_brent_ratio)}
        ${xlsTd(c.signal_journalier)}${xlsTd(c.signal_structure)}
      </tr>`;
    }).join("") : emptyHistoryRow(11);
    return;
  }

  // SILVER
  if (noteEl2) noteEl2.textContent = spotCollectionNote(rows);
  thead2.innerHTML = `
    <tr class="thead-flat">
      <th>Date</th><th>Gold Spot</th><th>Silver Spot</th>
      <th>Z-Score Spot (20j)</th><th>Distance à la Moyenne (20j)</th><th>Signal Silver</th>
    </tr>
`;
    fixStickyHeaderOffsets("confirmTable");
  tbody2.innerHTML = rows.length ? rows.map((r) => {
    const c = r.confirmation_detail || {};
    return `<tr>
      <td><strong>${new Date(r.date).toLocaleDateString("fr-FR")}</strong></td>
      ${plainNumTd(c.gold_spot_price)}${plainNumTd(c.silver_spot_price)}
      ${c.zscore_spot_20j != null ? zscoreScaleCell(Number(c.zscore_spot_20j).toFixed(2)) : "<td>Indisponible</td>"}
      ${signedNumTd(c.distance_moyenne_20j)}
      ${xlsTd(c.signal_silver)}
    </tr>`;
  }).join("") : emptyHistoryRow(6);
}

async function renderAnalyse() {
  const meta = document.getElementById("analysisMeta");
  if (meta) meta.textContent = `Actif : ${currentAnalyseAsset}`;
  await Promise.all([renderTendanceTable(), renderConfirmTable()]);
}

// ---------------------------------------------------------------------------
// Saisie Spot : import direct du fichier Excel/CSV que l'utilisateur télécharge lui-même
// depuis Investing.com (bouton "Download Data" sur l'onglet "Historical Data" — bloqué pour
// un robot/serveur, jamais pour un humain qui consulte la page et clique "download"). Un
// seul écran : une liste déroulante pour choisir l'actif (les 4 "spot réel" qui n'ont aucune
// source automatique gratuite, + 5 tickers déjà alimentés par fetch-yahoo/gold-api.com, pour
// pouvoir corriger/backfiller leur historique avec la vraie donnée Investing.com au besoin)
// et un fichier à charger. Parsé côté client avec SheetJS (xlsx.full.min.js, voir index.html)
// puis envoyé à l'edge function ingest-manual-spot, qui écrit dans price_history avec
// source="investing.com (saisie manuelle)". Jamais de valeur devinée : une ligne dont la
// date ou le prix de clôture ne se parse pas est simplement ignorée, jamais approximée.
// Un même fichier peut être rechargé plusieurs fois (ex. tous les jours avec les 5 derniers
// jours) : l'upsert (ticker,timeframe,ts) écrase proprement l'ancienne valeur d'un jour par
// la nouvelle, ce qui permet de corriger le dernier jour d'un import une fois le marché
// fermé et sa vraie clôture connue, sans jamais créer de doublon.
// ---------------------------------------------------------------------------

// Essaie plusieurs formats de date : Investing.com varie selon la langue du compte
// ("Sep 23, 2026" en anglais, "23/09/2026" ou "23.09.2026" en français, "09/23/2026" dans
// certains exports CSV US, ou un objet Date natif si le fichier Excel stocke une vraie date
// de cellule). Retourne "YYYY-MM-DD" ou null — jamais une date devinée au hasard.
function parseSaisieDate(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
  }
  const s = String(raw || "").trim().replace(/"/g, "");
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (m) {
    let [, a, b, y] = m;
    a = Number(a); b = Number(b);
    let day, month;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { day = b; month = a; }
    else { day = a; month = b; } // ambigu réel (les deux <=12) : on suppose DD/MM (Investing.com FR)
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

function parseSaisieNumber(raw) {
  if (raw == null) return null;
  // SheetJS (cellules Excel numériques) ou JSON natif : déjà un nombre, aucune conversion à faire.
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().replace(/"/g, "").replace(/\s/g, "");
  if (!s || s === "-" || s === "–") return null;
  // Format Investing.com (export FR) : "," = séparateur décimal, "." = séparateur de milliers
  // (ex. "89,17" -> 89.17 ; "2.345,67" -> 2345.67). Si pas de virgule, on suppose déjà un point
  // décimal standard (ex. valeur venant d'un JSON en texte "89.17").
  const cleaned = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Colonnes/clés attendues dans l'ordre Investing.com : Date, Dernier(Close), Ouv(Open),
// Plus Haut(High), Plus Bas(Low), [Vol.], [Variation %] — les deux dernières sont ignorées.
// `records` vient soit de SheetJS pour un fichier Excel/CSV (XLSX.utils.sheet_to_json(sheet,
// {header:1}) : un tableau de tableaux, cellules déjà typées Date/number/string), soit d'un
// fichier JSON (souvent utilisé par Investing.com et les API similaires) : un tableau
// d'objets aux clés variables ("Price"/"Dernier"/"close"/"Close", etc.) — voir
// SAISIE_KEY_ALIASES/pickAliasField ci-dessous, qui cherchent la bonne clé quelle que soit
// sa casse ou sa langue. La 1ère ligne d'un tableau-de-tableaux, si elle ne parse pas comme
// une date valide (cas normal : c'est l'en-tête "Date","Dernier",...), est ignorée
// silencieusement sans compter dans "ignorees" — un objet JSON n'a pas cette notion d'en-tête
// (ses clés en tiennent déjà lieu), donc une ligne JSON sans date valide est toujours comptée.
// Une ligne dont la date ou la clôture ne se parse pas est ignorée ET comptée : jamais de
// valeur devinée.
const SAISIE_KEY_ALIASES = {
  date: ["date", "jour", "time", "day", "datetime"],
  close: ["close", "price", "dernier", "last", "value", "valeur", "cours", "cloture"],
  open: ["open", "ouv", "ouverture"],
  high: ["high", "plushaut", "haut", "max"],
  low: ["low", "plusbas", "bas", "min"],
};
function normalizeKeyName(k) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function pickAliasField(obj, aliasList) {
  const keys = Object.keys(obj);
  for (const alias of aliasList) {
    const found = keys.find((k) => normalizeKeyName(k) === alias);
    if (found !== undefined && obj[found] !== undefined) return obj[found];
  }
  return undefined;
}
function parseSaisieRows(records) {
  const rows = [];
  let ignorees = 0;
  records.forEach((rec, i) => {
    if (rec == null) { ignorees++; return; }
    const isArrayRec = Array.isArray(rec);
    if (isArrayRec && rec.length < 2) { if (i > 0) ignorees++; return; }
    const rawDate = isArrayRec ? rec[0] : pickAliasField(rec, SAISIE_KEY_ALIASES.date);
    const rawClose = isArrayRec ? rec[1] : pickAliasField(rec, SAISIE_KEY_ALIASES.close);
    const rawOpen = isArrayRec ? rec[2] : pickAliasField(rec, SAISIE_KEY_ALIASES.open);
    const rawHigh = isArrayRec ? rec[3] : pickAliasField(rec, SAISIE_KEY_ALIASES.high);
    const rawLow = isArrayRec ? rec[4] : pickAliasField(rec, SAISIE_KEY_ALIASES.low);
    const date = parseSaisieDate(rawDate);
    if (!date) {
      if (isArrayRec && i === 0) return; // ligne d'en-tête d'un tableau Excel/CSV : silencieux
      ignorees++;
      return;
    }
    const close = parseSaisieNumber(rawClose);
    if (close == null) { ignorees++; return; }
    rows.push({ date, open: parseSaisieNumber(rawOpen), high: parseSaisieNumber(rawHigh), low: parseSaisieNumber(rawLow), close });
  });
  return { rows, ignorees };
}

// Lit un fichier .xlsx/.xls/.csv choisi par l'utilisateur et retourne son 1er onglet sous
// forme de tableau de tableaux (SheetJS gère les 3 formats de façon identique).
function readWorkbookFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
    reader.onload = (e) => {
      try {
        // IMPORTANT : cellDates:true + raw:true laissait SheetJS deviner lui-meme le type de
        // chaque cellule pour un CSV/Excel — et sa devinette est fausse dans 2 cas reels et
        // frequents avec les exports Investing.com (FR) : (1) un nombre a virgule decimale
        // comme "101,26" est interprete comme un entier a virgule de milliers -> 10126 (x100) ;
        // (2) une date ambigue (jour <= 12, ex. "11/09/2026") est interpretee au format
        // americain MM/JJ -> 9 novembre au lieu du 11 septembre (dates dans le futur). Constate
        // et reproduit le 23/09/2026 sur un vrai fichier Brent Future : 962/962 lignes
        // corrompues de cette façon. Le correctif : raw:true + cellText:true + cellDates:false
        // force SheetJS a rendre CHAQUE cellule en texte brut, exactement comme affiche dans le
        // fichier source, sans aucune interpretation — parseSaisieDate/parseSaisieNumber
        // (ci-dessus) sont deja ecrits pour gerer ce texte brut correctement (virgule
        // decimale FR, format JJ/MM/AAAA) ; les laisser faire tout le travail est le seul moyen
        // fiable d'eviter que SheetJS ne "corrige" les valeurs a notre place, silencieusement,
        // avant meme que notre propre code ne les voie.
        const wb = XLSX.read(e.target.result, { type: "array", raw: true, cellText: true, cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows2D = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
        resolve(rows2D);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Lit un fichier .json (format fréquent des exports Investing.com/API similaires). Le JSON
// racine peut être directement un tableau, ou un objet enveloppe ({"data":[...]},
// {"historical":[...]}, ...) — on essaie les clés d'enveloppe les plus courantes avant
// d'abandonner (tableau vide, jamais une donnée devinée).
function normalizeJsonRecords(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const wrapperKeys = ["data", "historical", "rows", "result", "results", "history", "prices"];
    for (const key of wrapperKeys) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
  }
  return [];
}
function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
    reader.onload = (e) => {
      try {
        resolve(normalizeJsonRecords(JSON.parse(e.target.result)));
      } catch (err) {
        reject(new Error("JSON invalide : " + err.message));
      }
    };
    reader.readAsText(file);
  });
}

const SAISIE_URL_HINTS = {
  "BRENT_SPOT_REAL": "investing.com/commodities/brent-oil-historical-data",
  "WTI_SPOT_REAL": "investing.com/commodities/crude-oil-historical-data",
  "BRENT_FUTURE": "investing.com/commodities/brent-oil-historical-data",
  "WTI_FUTURE": "investing.com/commodities/crude-oil-historical-data",
  "XAUUSD_SPOT": "investing.com/currencies/xau-usd-historical-data",
  "GOLD_FUTURE": "investing.com/commodities/gold-historical-data",
  "XAGUSD_SPOT": "investing.com/currencies/xag-usd-historical-data",
  "SILVER_FUTURE": "investing.com/commodities/silver-historical-data",
  "USD_CNH": "investing.com/currencies/usd-cnh-historical-data",
  "SP500": "investing.com/indices/us-spx-500-historical-data",
};

async function submitSaisieFile() {
  const select = document.getElementById("saisieAssetSelect");
  const fileInput = document.getElementById("saisieFile");
  const statusEl = document.getElementById("saisieStatus");
  if (!select || !fileInput || !statusEl || !supabaseClient) return;

  const ticker = select.value;
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    statusEl.textContent = "Choisis d'abord un fichier Excel/CSV téléchargé depuis Investing.com.";
    statusEl.style.color = "var(--red)";
    return;
  }

  statusEl.textContent = "Lecture du fichier...";
  statusEl.style.color = "var(--sub)";
  try {
    const records = /\.json$/i.test(file.name) ? await readJsonFile(file) : await readWorkbookFile(file);
    const { rows, ignorees } = parseSaisieRows(records);
    if (!rows.length) {
      statusEl.textContent = "Aucune ligne reconnue dans ce fichier — vérifie qu'il vient bien de l'export Investing.com (Date, Dernier, Ouv, Plus Haut, Plus Bas).";
      statusEl.style.color = "var(--red)";
      return;
    }
    statusEl.textContent = `Envoi de ${rows.length} jour(s)...`;
    const { data, error } = await supabaseClient.functions.invoke("ingest-manual-spot", {
      body: { ticker, rows, filename: file.name },
    });
    if (error) throw error;
    if (!data || !data.ok) throw new Error((data && data.erreur) || (data && data.error) || "réponse invalide");
    const ignoreesMsg = ignorees > 0 ? ` (${ignorees} ligne(s) non reconnue(s) ignorée(s))` : "";
    // 24/09/2026 : ingest-manual-spot relance désormais compute-signals elle-même (voir cette
    // fonction côté serveur) — on reflète honnêtement le résultat de CE recalcul ici, pour ne
    // jamais dire "à jour" si Analyse/Dashboard n'ont en réalité pas pu être rafraîchis.
    if (data.signalsRefreshed) {
      statusEl.textContent = `✓ ${data.upserted} jour(s) enregistré(s) pour ${ticker}${ignoreesMsg}. Analyse et Dashboard sont à jour.`;
      statusEl.style.color = "var(--green)";
    } else {
      statusEl.textContent = `⚠ ${data.upserted} jour(s) enregistré(s) pour ${ticker}${ignoreesMsg}, mais le recalcul automatique (Analyse/Dashboard) a échoué : ${data.signalsError || "raison inconnue"}. Les prix sont bien enregistrés ; réessaie dans quelques minutes pour rafraîchir Analyse/Dashboard.`;
      statusEl.style.color = "var(--red)";
    }
    fileInput.value = "";
    loadImportHistory();
  } catch (e) {
    statusEl.textContent = `Erreur : ${e.message || e}`;
    statusEl.style.color = "var(--red)";
  }
}

// Affiche, dans la page Saisie Spot, la liste des fichiers déjà importés et leur date
// d'import — alimentée par la table import_log, elle-même écrite par l'edge function
// ingest-manual-spot à chaque import réussi (voir supabase/functions/ingest-manual-spot).
// Sert aussi de traçabilité pour vérifier après coup quel fichier exact a été chargé,
// quand, et combien de lignes en sont réellement ressorties.
async function loadImportHistory() {
  const tbody = document.querySelector("#importLogTable tbody");
  if (!tbody || !supabaseClient) return;
  tbody.innerHTML = `<tr><td colspan="6" class="sub">Chargement...</td></tr>`;
  try {
    const { data, error } = await supabaseClient
      .from("import_log")
      .select("*")
      .order("imported_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    if (!data || !data.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="sub">Aucun import enregistré pour l'instant.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((r) => {
      const d = new Date(r.imported_at);
      const dateStr = d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      // Repousser un ancien import réapplique ses valeurs sauvegardées (rows_snapshot) sur les
      // dates qu'il couvre, même si un import plus récent les a écrasées depuis — sans effacer
      // ni l'un ni l'autre import de l'historique. Supprimer retire l'import de la liste ET,
      // via ON DELETE CASCADE côté base, uniquement les lignes de prix qui lui appartiennent
      // encore à cet instant. Pour vider complètement un actif : supprimer tous ses imports.
      return `<tr>
        <td>${dateStr}</td>
        <td>${r.ticker}</td>
        <td>${r.filename || "Indisponible"}</td>
        <td>${r.lignes_recues != null ? r.lignes_recues : "Indisponible"}</td>
        <td>${r.lignes_enregistrees != null ? r.lignes_enregistrees : "Indisponible"}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" onclick='reactivateImportEntry(${r.id}, ${JSON.stringify(r.ticker)})' title="Repousser cet import dans les calculs, même si un import plus récent l'a recouvert depuis">Prioriser</button>
          <button class="btn btn-sm btn-danger" onclick='deleteImportEntry(${r.id}, ${JSON.stringify(r.ticker)})' title="Supprimer définitivement cet import et les données de prix qui lui appartiennent encore">Supprimer</button>
        </td>
      </tr>`;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="sub">Erreur de chargement : ${e.message || e}</td></tr>`;
  }
}

// Supprime définitivement un import de l'historique — voir l'edge function delete-import :
// la contrainte ON DELETE CASCADE (price_history.import_id -> import_log.id) supprime en même
// temps, côté base, toutes les lignes de prix encore rattachées à cet import précis (celles
// qu'un import plus récent n'a pas déjà remplacées pour les mêmes dates). Pour vider
// complètement l'historique d'un ticker : répéter cette suppression sur tous ses imports.
async function deleteImportEntry(importId, ticker) {
  if (!supabaseClient) return;
  if (!confirm(`Supprimer définitivement cet import (${ticker}) ?\n\nLes données de prix qui lui appartiennent encore seront supprimées avec lui. Cette action est irréversible.`)) return;
  try {
    const { data, error } = await supabaseClient.functions.invoke("delete-import", { body: { importId } });
    if (error) throw error;
    if (!data || !data.ok) throw new Error((data && data.error) || "réponse invalide");
    // 24/09/2026 : delete-import relance aussi compute-signals — on prévient honnêtement si ce
    // recalcul a échoué (la suppression, elle, a bien eu lieu).
    if (!data.signalsRefreshed) {
      alert(`Import supprimé, mais le recalcul automatique (Analyse/Dashboard) a échoué : ${data.signalsError || "raison inconnue"}. Réessaie dans quelques minutes.`);
    }
    loadImportHistory();
  } catch (e) {
    alert("Erreur lors de la suppression : " + (e.message || e));
  }
}

// "Repousse" un import antérieur en priorité dans les calculs : réapplique exactement ses
// valeurs d'origine (sauvegardées lors de cet import, voir rows_snapshot) sur les dates qu'il
// couvre — même si un import plus récent les avait écrasées depuis. Voir l'edge function
// reactivate-import. N'efface aucun import, ne touche à aucune autre date que celles de cet
// import précis (upsert par date, jamais un remplacement global du ticker).
async function reactivateImportEntry(importId, ticker) {
  if (!supabaseClient) return;
  if (!confirm(`Repousser cet import (${ticker}) en priorité dans les calculs ?\n\nSes valeurs vont remplacer, pour les mêmes dates uniquement, ce qu'un import plus récent aurait pu écrire depuis.`)) return;
  try {
    const { data, error } = await supabaseClient.functions.invoke("reactivate-import", { body: { importId } });
    if (error) throw error;
    if (!data || !data.ok) throw new Error((data && data.error) || "réponse invalide");
    // 24/09/2026 : reactivate-import relance aussi compute-signals — on prévient honnêtement si
    // ce recalcul a échoué (la réactivation, elle, a bien eu lieu).
    if (data.signalsRefreshed) {
      alert(`✓ ${data.upserted} jour(s) de ${ticker} repoussé(s) en priorité dans les calculs. Analyse et Dashboard sont à jour.`);
    } else {
      alert(`${data.upserted} jour(s) de ${ticker} repoussé(s), mais le recalcul automatique (Analyse/Dashboard) a échoué : ${data.signalsError || "raison inconnue"}. Réessaie dans quelques minutes.`);
    }
    loadImportHistory();
  } catch (e) {
    alert("Erreur lors de la réactivation : " + (e.message || e));
  }
}

function initSaisie() {
  const select = document.getElementById("saisieAssetSelect");
  const hint = document.getElementById("saisieUrlHint");
  const btn = document.getElementById("saisieChargerBtn");
  const updateHint = () => {
    if (!select || !hint) return;
    const url = SAISIE_URL_HINTS[select.value] || "";
    hint.textContent = url ? `Page Investing.com pour cet actif : ${url}` : "";
  };
  if (select) {
    select.addEventListener("change", updateHint);
    updateHint();
  }
  if (btn) btn.addEventListener("click", submitSaisieFile);
  loadImportHistory();
}

function initAnalyse() {
  document.querySelectorAll("#assetTabs [data-asset]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#assetTabs [data-asset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentAnalyseAsset = btn.dataset.asset;
      renderAnalyse();
    };
  });

  document.querySelectorAll("#analysisTabs [data-analysistab]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#analysisTabs [data-analysistab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentAnalysisTab = btn.dataset.analysistab;
      document.getElementById("tendanceSection").style.display = currentAnalysisTab === "tendance" ? "block" : "none";
      document.getElementById("confirmSection").style.display = currentAnalysisTab === "confirmation" ? "block" : "none";
    };
  });

  const quickFilter = document.getElementById("tendanceQuickFilter");
  if (quickFilter) quickFilter.addEventListener("input", applyTendanceQuickFilter);
}

// ---------------- Calculateur ----------------
const ASSET_PRESETS = {
  GOLD: { pip: 10, stop: 45 },
  SILVER: { pip: 5, stop: 60 },
  BRENT: { pip: 10, stop: 40 },
  WTI: { pip: 10, stop: 40 },
};

function initCalculateur() {
  document.querySelectorAll("[data-calctab]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-calctab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.calctab;
      document.getElementById("calcTabCalc").style.display = tab === "calc" ? "block" : "none";
      document.getElementById("calcTabPlan").style.display = tab === "plan" ? "block" : "none";
    };
  });

  const ids = ["calcCapital", "calcRiskPct", "calcStopPips", "calcPipValue", "calcEntry", "calcSl", "calcTp"];
  ids.forEach((id) => document.getElementById(id).addEventListener("input", updateCalculator));
  updateCalculator();

  document.getElementById("calcAsset").addEventListener("change", (e) => {
    const preset = ASSET_PRESETS[e.target.value];
    if (preset) {
      document.getElementById("calcPipValue").value = preset.pip;
      document.getElementById("calcStopPips").value = preset.stop;
      updateCalculator();
    }
  });

  document.getElementById("saveRiskPlan").onclick = saveRiskPlan;
}

function updateCalculator() {
  const capital = parseFloat(document.getElementById("calcCapital").value) || 0;
  const riskPct = parseFloat(document.getElementById("calcRiskPct").value) || 0;
  const stopPips = parseFloat(document.getElementById("calcStopPips").value) || 0;
  const pipValue = parseFloat(document.getElementById("calcPipValue").value) || 0;
  const entry = parseFloat(document.getElementById("calcEntry").value);
  const sl = parseFloat(document.getElementById("calcSl").value);
  const tp = parseFloat(document.getElementById("calcTp").value);

  const riskAmount = (capital * riskPct) / 100;
  const lotSize = stopPips && pipValue ? riskAmount / (stopPips * pipValue) : 0;

  document.getElementById("calcRiskAmount").textContent = riskAmount.toFixed(2) + " €";
  document.getElementById("calcLotSize").textContent = lotSize.toFixed(2) + " lot";

  const rrEl = document.getElementById("calcRR");
  const rrCard = document.getElementById("calcRRCard");
  if (entry && sl && tp) {
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    const rr = risk ? reward / risk : null;
    if (rr !== null) {
      rrEl.textContent = `1 : ${rr.toFixed(2)}`;
      const tone = rr >= 2 ? "green" : rr >= 1 ? "amber" : "red";
      const colors = { green: "#34d399", amber: "#f59e0b", red: "#fb7185" };
      rrCard.style.borderColor = colors[tone];
      rrEl.style.color = colors[tone];
    }
  } else {
    rrEl.textContent = "–";
    rrEl.style.color = "";
    rrCard.style.borderColor = "";
  }
}

async function saveRiskPlan() {
  const plan = {
    account_size: parseFloat(document.getElementById("planAccountSize").value) || 10000,
    risk_per_trade_pct: parseFloat(document.getElementById("planRiskPerTrade").value) || 0.5,
    total_risk_pct: parseFloat(document.getElementById("planTotalRisk").value) || 5,
    daily_risk_pct: parseFloat(document.getElementById("planDailyRisk").value) || 2,
    max_trades_per_day: parseInt(document.getElementById("planMaxTrades").value) || 5,
  };

  if (supabaseClient) {
    const { data: userData } = await supabaseClient.auth.getUser();
    if (userData?.user) {
      await supabaseClient.from("risk_plans").upsert({ user_id: userData.user.id, ...plan });
    } else {
      alert("Connecte-toi (Supabase Auth) pour sauvegarder ton plan. Pour l'instant, ceci reste local.");
    }
  }

  document.getElementById("calcCapital").value = plan.account_size;
  document.getElementById("calcRiskPct").value = plan.risk_per_trade_pct;
  updateCalculator();

  const flash = document.getElementById("planSavedFlash");
  flash.style.display = "inline";
  setTimeout(() => (flash.style.display = "none"), 2000);
}

// ---------------- Journal ----------------
// Le calendrier suit le mois réel en cours (plus de mois d'août 2026 codé en dur).
// Aucun résultat de PnL n'est affiché sur les jours : aucune remontée MT5 réelle n'est
// branchée pour l'instant (voir renderPortfolioPerfCard) — afficher un chiffre ici serait
// fabriqué. Seule l'analyse pré-trade que l'utilisateur saisit lui-même est réelle et
// persistée dans Supabase (journal_entries).
const MONTH_LABELS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function currentJournalMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() }; // month: 0-11
}

function renderJournalCalendar() {
  const head = document.getElementById("journalCalendarHead");
  head.innerHTML = ["L", "M", "M", "J", "V", "S", "D"].map((d) => `<div class="cal-head">${d}</div>`).join("");

  const { year, month } = currentJournalMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = lundi

  const grid = document.getElementById("journalCalendar");
  let html = "";
  for (let i = 0; i < firstWeekday; i++) html += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    html += `<div class="cal-day" onclick="openDayModal(${d})">${d}</div>`;
  }
  grid.innerHTML = html;

  const titleEl = document.getElementById("journalMonthLabel");
  if (titleEl) titleEl.textContent = `${MONTH_LABELS_FR[month].toUpperCase()} ${year}`;
}

// État local des saisies "Analyse du jour" — rechargé depuis Supabase au démarrage
// (loadJournalEntries) pour que les notes réellement enregistrées ne disparaissent pas
// au rechargement de la page.
const journalEntries = {};

async function loadJournalEntries() {
  if (!supabaseClient) return;
  try {
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData?.user) return;
    const { year, month } = currentJournalMonth();
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`;
    const { data, error } = await supabaseClient
      .from("journal_entries")
      .select("*")
      .eq("user_id", userData.user.id)
      .gte("entry_date", from)
      .lte("entry_date", to);
    if (error || !data) return;
    data.forEach((row) => {
      const day = Number(row.entry_date.slice(-2));
      journalEntries[`${day}-${row.session}`] = { actif: row.actif || "", sens: row.sens || "Acheteur", zone: row.zone || "", note: row.note || "" };
    });
  } catch (e) {
    console.warn("[Journal] entrées indisponibles —", e.message);
  }
}

const SESSIONS = [
  { id: "pre", label: "Analyse du jour" },
  { id: "asie", label: "Session Asiatique" },
  { id: "londres", label: "Session Londres" },
  { id: "ny", label: "Session New York" },
];

function openDayModal(day) {
  let activeSession = "pre";
  const overlay = document.getElementById("dayModalOverlay");
  const box = document.getElementById("dayModalBox");
  const { month } = currentJournalMonth();

  function render() {
    const key = `${day}-${activeSession}`;
    const entry = journalEntries[key] || { actif: "", sens: "Acheteur", zone: "", note: "" };

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
        <h2 style="margin:0;">Fiche du ${day} ${MONTH_LABELS_FR[month]}</h2>
        <span id="modalSavedFlash" style="display:none;color:var(--green);font-size:12px;">✓ Enregistré</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
        ${SESSIONS.map((s) => `<button class="btn ${s.id === activeSession ? "btn-primary" : "btn-secondary"}" data-session="${s.id}" style="font-size:11px;">${s.label}</button>`).join("")}
      </div>
      <div class="grid grid-2">
        <div class="field"><label>Actif</label><input id="modalActif" value="${entry.actif}" placeholder="Silver, Brent, Gold..." /></div>
        <div class="field"><label>Sens</label>
          <select id="modalSens"><option ${entry.sens === "Acheteur" ? "selected" : ""}>Acheteur</option><option ${entry.sens === "Vendeur" ? "selected" : ""}>Vendeur</option></select>
        </div>
      </div>
      <div class="field"><label>Zone d'analyse</label><input id="modalZone" value="${entry.zone}" placeholder="ex: 28.20 – 28.60" /></div>
      <div class="field"><label>Mon analyse</label><textarea id="modalNote" rows="3">${entry.note}</textarea></div>

      <div class="card" style="margin-top:10px;">
        <p class="sub" style="margin:0 0 8px;">COMPARAISON AVEC LE RÉSULTAT RÉEL</p>
        <p class="sub" style="margin:0;">Aucune remontée de PnL MT5 réelle n'est branchée pour l'instant — comparaison indisponible (voir Dashboard, carte Performance).</p>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="btn btn-secondary" onclick="closeDayModal()">Fermer</button>
        <button class="btn btn-primary" id="saveJournalEntry">Enregistrer</button>
      </div>
    `;

    box.querySelectorAll("[data-session]").forEach((btn) => {
      btn.onclick = () => { activeSession = btn.dataset.session; render(); };
    });
    document.getElementById("saveJournalEntry").onclick = () => saveJournalEntry(day, activeSession);
  }

  window.saveJournalEntry = async (day, session) => {
    const key = `${day}-${session}`;
    const entryData = {
      actif: document.getElementById("modalActif").value,
      sens: document.getElementById("modalSens").value,
      zone: document.getElementById("modalZone").value,
      note: document.getElementById("modalNote").value,
    };
    journalEntries[key] = entryData;

    if (supabaseClient) {
      const { data: userData } = await supabaseClient.auth.getUser();
      if (userData?.user) {
        const { year, month } = currentJournalMonth();
        await supabaseClient.from("journal_entries").upsert({
          user_id: userData.user.id,
          entry_date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          session, ...entryData,
        });
      }
    }
    const flash = document.getElementById("modalSavedFlash");
    if (flash) { flash.style.display = "inline"; setTimeout(() => (flash.style.display = "none"), 2000); }
  };

  window.closeDayModal = () => overlay.classList.remove("active");

  render();
  overlay.classList.add("active");
}

// ---------------- Performance ----------------
// Aucun objectif/résultat n'est encore fabriqué ici : il faudrait un vrai compte
// (prop firm ou MT5) avec des règles réelles et une remontée de PnL réelle, ce qui n'est
// pas encore branché sur le SaaS. On l'affiche honnêtement plutôt que d'inventer des
// chiffres de progression.
function renderPerformance() {
  // Solde/Equity/PnL réel : aucune remontée MT5 n'est encore branchée (voir README, feuille
  // de route). On ne fabrique jamais ces chiffres — état honnête tant que ce n'est pas relié.
  const soldeEl = document.getElementById("perfSolde");
  const equityEl = document.getElementById("perfEquity");
  const pnlEl = document.getElementById("perfPnl");
  if (soldeEl) soldeEl.textContent = "Indisponible";
  if (equityEl) equityEl.textContent = "Indisponible";
  if (pnlEl) pnlEl.textContent = "Indisponible";

  document.getElementById("objectivesList").innerHTML = `
    <p class="sub" style="margin:0;">Aucun objectif de trading réel n'est encore branché.
    Connecte un compte MT5 (Paramètres) et une source de PnL réelle pour suivre ici tes
    objectifs (jours de trading, pertes max, objectif de profit).</p>`;
}

// ---------------- Paramètres ----------------
let mt5Accounts = []; // Plus aucun compte fictif pré-rempli : réel uniquement, ajouté par l'utilisateur (ou relu depuis Supabase).
let webhooks = []; // état local (pas encore persisté/relu depuis Supabase — execution_webhooks existe côté schema).

// Statut honnête dans la sidebar : "connecté" seulement si un vrai compte MT5 existe.
// Jamais affiché comme connecté par défaut — cf. directive "interdire les infos fictives".
function updateMt5SidebarStatus() {
  const statusEl = document.getElementById("mt5StatusText");
  const subEl = document.getElementById("mt5StatusSub");
  if (!statusEl || !subEl) return;
  const hasAccounts = Array.isArray(mt5Accounts) && mt5Accounts.length > 0;
  if (hasAccounts) {
    statusEl.textContent = `MT5 : ${mt5Accounts.length} compte${mt5Accounts.length > 1 ? "s" : ""} connecté${mt5Accounts.length > 1 ? "s" : ""}`;
    subEl.textContent = "Lecture seule · read-only";
  } else {
    statusEl.textContent = "MT5 : aucun compte connecté";
    subEl.textContent = "Ajoute un compte dans Paramètres pour l'activer";
  }
}

// Recharge les comptes réellement enregistrés (Supabase) au démarrage, pour que le statut
// reste honnête après un rechargement de page (et non remis à zéro en mémoire uniquement).
async function loadMt5Accounts() {
  if (!supabaseClient) { updateMt5SidebarStatus(); return; }
  try {
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData?.user) { updateMt5SidebarStatus(); return; }
    const { data, error } = await supabaseClient
      .from("mt5_accounts")
      .select("*")
      .eq("user_id", userData.user.id);
    if (!error && Array.isArray(data)) mt5Accounts = data;
  } catch (e) {
    console.warn("[MT5] comptes indisponibles —", e.message);
  }
  renderAccounts();
}

function renderAccounts() {
  document.getElementById("accountsList").innerHTML = mt5Accounts.map((a) => `
    <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px;">
      <div><strong style="font-size:13px;">Login ${a.login}</strong><p class="sub" style="margin:2px 0 0;">${a.server}</p></div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="pill green">Connecté · lecture seule</span>
        <button class="btn btn-secondary" onclick="removeAccount(${a.id})">✕</button>
      </div>
    </div>`).join("");
  updateMt5SidebarStatus();
}
function removeAccount(id) {
  mt5Accounts = mt5Accounts.filter((a) => a.id !== id);
  renderAccounts();
  if (supabaseClient) supabaseClient.from("mt5_accounts").delete().eq("id", id).then(() => {});
}

function renderWebhooks() {
  document.getElementById("webhooksList").innerHTML = webhooks.map((h) => `
    <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:8px;">
      <div><strong style="font-size:13px;">${h.label}</strong><p class="sub" style="margin:2px 0 0;">${h.url}</p></div>
      <button class="btn btn-secondary" onclick="removeWebhook(${h.id})">✕</button>
    </div>`).join("");
}
function removeWebhook(id) { webhooks = webhooks.filter((h) => h.id !== id); renderWebhooks(); }

function initParametres() {
  renderAccounts();
  renderWebhooks();

  document.getElementById("toggleAddAccount").onclick = () => {
    const form = document.getElementById("addAccountForm");
    form.style.display = form.style.display === "none" ? "block" : "none";
  };
  document.getElementById("confirmAddAccount").onclick = async () => {
    const login = document.getElementById("newLogin").value;
    const server = document.getElementById("newServer").value;
    if (!login || !server) return;

    let saved = null;
    if (supabaseClient) {
      const { data: userData } = await supabaseClient.auth.getUser();
      if (userData?.user) {
        const { data, error } = await supabaseClient
          .from("mt5_accounts")
          .insert({ user_id: userData.user.id, login, server })
          .select()
          .single();
        if (!error && data) saved = data;
      }
    }
    // Repli local uniquement si Supabase n'est pas configuré/joignable — pas de compte fictif,
    // c'est bien le compte réel que l'utilisateur vient de saisir, juste non persisté.
    mt5Accounts.push(saved || { id: Date.now(), login, server });

    document.getElementById("newLogin").value = "";
    document.getElementById("newServer").value = "";
    document.getElementById("newPassword").value = "";
    renderAccounts();
  };

  document.getElementById("addWebhook").onclick = () => {
    const label = document.getElementById("newHookLabel").value;
    const url = document.getElementById("newHookUrl").value;
    if (!label || !url) return;
    webhooks.push({ id: Date.now(), label, url });
    document.getElementById("newHookLabel").value = "";
    document.getElementById("newHookUrl").value = "";
    renderWebhooks();
  };
}

// ---------------- Profil (Paramètres) ----------------
function initProfil() {
  const profile = getProfile();
  const prenomEl = document.getElementById("profilPrenom");
  const emailEl = document.getElementById("profilEmail");
  const pwdEl = document.getElementById("profilPassword");
  const statusEl = document.getElementById("profilStatus");
  if (!prenomEl || !emailEl || !pwdEl) return;

  prenomEl.value = profile.prenom;
  emailEl.value = profile.email;

  document.getElementById("saveProfilBtn").onclick = async () => {
    const prenom = prenomEl.value.trim();
    const email = emailEl.value.trim();
    const newPassword = pwdEl.value;

    saveProfile({ prenom, email });
    // Reflète immédiatement le prénom dans l'en-tête du Dashboard.
    switchSection(currentSection);

    let statusMsg = "Profil enregistré (prénom et email, en local).";

    if (newPassword) {
      if (supabaseClient) {
        const { data: userData } = await supabaseClient.auth.getUser();
        if (userData && userData.user) {
          const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
          statusMsg += error
            ? ` Échec du changement de mot de passe : ${error.message}`
            : " Mot de passe mis à jour via Supabase Auth.";
        } else {
          statusMsg += " Connecte-toi (Supabase Auth) pour pouvoir changer ton mot de passe.";
        }
      } else {
        statusMsg += " Supabase Auth n'est pas configuré — aucun mot de passe réel à changer ici.";
      }
      pwdEl.value = "";
    }

    statusEl.textContent = statusMsg;
  };
}

// ---------------- Init ----------------
// Actualisation automatique toutes les 1 minute — relit juste Supabase (léger, pas de
// limite tierce), ne re-déclenche jamais fetch-yahoo/gold-api/compute-signals depuis le
// navigateur (ça, ça reste sur le cron serveur, voir sql/schedule.sql, pour ne pas cogner
// les limites de taux des API externes). Donc les nombres ne changent réellement qu'au
// rythme du cron (toutes les 15 min) — cette boucle sert juste à les afficher dès qu'ils
// sont en base, sans que l'utilisateur ait à recharger la page.
const AUTO_REFRESH_MS = 60 * 1000;
function startAutoRefresh() {
  setInterval(() => {
    renderDashboard();
    renderAnalyse();
    renderPerformance();
  }, AUTO_REFRESH_MS);
}

// Barre latérale repliable : libère la largeur pour les grands tableaux Tendance/Confirmation.
// État mémorisé en local (par navigateur) — ne modifie aucune donnée métier.
function initSidebarToggle() {
  const app = document.querySelector(".app");
  const btn = document.getElementById("sidebarToggleBtn");
  if (!app || !btn) return;
  let collapsed = false;
  try { collapsed = localStorage.getItem("fst_sidebar_collapsed") === "1"; } catch (e) {}
  if (collapsed) app.classList.add("sidebar-collapsed");
  btn.textContent = collapsed ? "\u203a" : "\u2039";
  btn.addEventListener("click", () => {
    const isCollapsed = app.classList.toggle("sidebar-collapsed");
    btn.textContent = isCollapsed ? "\u203a" : "\u2039";
    try { localStorage.setItem("fst_sidebar_collapsed", isCollapsed ? "1" : "0"); } catch (e) {}
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSidebarToggle();
  renderNav();
  switchSection("dashboard");
  renderDashboard();
  initAnalyse();
  renderAnalyse();
  initSaisie();
  initCalculateur();
  renderJournalCalendar();
  loadJournalEntries();
  renderPerformance();
  initParametres();
  loadMt5Accounts();
  initProfil();
  startAutoRefresh();
});
