// ============================================================
// QUANT-MACRO — APP.JS
// Navigation + rendu des sections + intégration Supabase.
// Tant que Supabase n'est pas configuré (js/config.js), tout
// tourne avec les données d'exemple de js/mockData.js.
// ============================================================

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "analyse", label: "Analyse" },
  { id: "calculateur", label: "Calculateur de position" },
  { id: "journal", label: "Journal" },
  { id: "performance", label: "Performance / MT5" },
  { id: "parametres", label: "Paramètres" },
];

const USER_NAME = "Alex"; // TODO: remplacer par supabase.auth.getUser()

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
    title.textContent = `${g} ${USER_NAME} 👋`;
    sub.textContent = "Voici ta vue du jour — mise à jour continue";
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
  return "slate";
}
function pill(text) {
  return `<span class="pill ${statusTone(text)}">${text}</span>`;
}

// ---------------- Dashboard ----------------
async function loadAssets() {
  if (!supabase) return MOCK_ASSETS;
  try {
    const { data, error } = await supabase
      .from("signals")
      .select("*")
      .in("asset_id", ["GOLD", "SILVER", "BRENT", "WTI"])
      .order("date", { ascending: false })
      .limit(4);
    if (error || !data || data.length === 0) return MOCK_ASSETS;

    // Fusionne les vraies lignes avec le libellé/description statique de MOCK_ASSETS
    return data.map((row) => {
      const base = MOCK_ASSETS.find((m) => m.id === row.asset_id) || {};
      return {
        ...base,
        id: row.asset_id,
        name: row.asset_id,
        signal: row.signal_label || base.signal,
        tone: row.tone || base.tone,
        pressure: row.pressure || base.pressure,
        supply: row.supply || base.supply,
        institutionalNote: row.institutional_note || base.institutionalNote,
        metrics: [
          ["Basis / Spread", row.basis_spread != null ? row.basis_spread.toFixed(3) : "—"],
          ["Z-Score (60j)", row.zscore_60j != null ? row.zscore_60j.toFixed(2) : "—"],
          ["Percentile", row.percentile_10j != null ? `${row.percentile_10j.toFixed(0)}%` : "—"],
        ],
      };
    });
  } catch (e) {
    console.warn("loadAssets: repli sur mock —", e.message);
    return MOCK_ASSETS;
  }
}

async function loadEconomy() {
  if (!supabase) return MOCK_ECONOMY;
  try {
    const codes = ["USDCNH", "EURUSD", "DXY", "US500"];
    const results = [];
    for (const code of codes) {
      const { data } = await supabase
        .from("economic_indicators")
        .select("*")
        .eq("code", code)
        .order("ts", { ascending: false })
        .limit(1);
      if (data && data.length) {
        const r = data[0];
        results.push({
          label: code, value: r.value, tone: r.change_pct >= 0 ? "green" : "red",
          change: `${r.change_pct >= 0 ? "+" : ""}${Number(r.change_pct).toFixed(2)}%`,
        });
      }
    }
    return results.length === 4 ? results : MOCK_ECONOMY;
  } catch (e) {
    console.warn("loadEconomy: repli sur mock —", e.message);
    return MOCK_ECONOMY;
  }
}

async function loadNews() {
  if (!supabase) return MOCK_NEWS;
  try {
    const { data, error } = await supabase.from("news").select("*").order("published_at", { ascending: false }).limit(5);
    if (error || !data || data.length === 0) return MOCK_NEWS;
    return data.map((n) => ({
      time: new Date(n.published_at).toLocaleString("fr-FR"), tag: n.impact_level, asset: n.asset_tag, title: n.title,
    }));
  } catch (e) {
    console.warn("loadNews: repli sur mock —", e.message);
    return MOCK_NEWS;
  }
}

async function renderDashboard() {
  const assets = await loadAssets();
  document.getElementById("assetCards").innerHTML = assets.map((a) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:13px;">${a.name}</strong>
      </div>
      <span class="badge ${a.tone}">${a.signal}</span>
      <p style="font-size:13px;font-weight:600;margin:10px 0 2px;">${a.sub}</p>
      <p class="sub" style="margin:0 0 10px;">${a.desc}</p>
      <div style="border-top:1px solid var(--border);padding-top:10px;font-size:11px;">
        <p class="sub" style="margin:0;">PRESSION</p><p style="margin:2px 0 8px;">${a.pressure}</p>
        <p class="sub" style="margin:0;">APPROVISIONNEMENT</p><p style="margin:2px 0 8px;">${a.supply}</p>
        <p class="sub" style="margin:0;">SUIVI INSTITUTIONNEL · ${a.institutionalDriver}</p><p style="margin:2px 0 8px;">${a.institutionalNote}</p>
        <div style="display:flex;justify-content:space-between;background:rgba(2,6,23,0.6);border-radius:6px;padding:6px 10px;">
          <span class="sub">${a.econLabel}</span><strong>${a.econValue}</strong>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;">
        ${a.metrics.map(([k, v]) => `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span class="sub">${k}</span><strong>${v}</strong></div>`).join("")}
      </div>
    </div>
  `).join("");

  const economy = await loadEconomy();
  document.getElementById("economyCards").innerHTML = economy.map((e) => `
    <div class="card">
      <p class="sub" style="margin:0;">${e.label}</p>
      <p style="font-size:18px;font-weight:700;margin:4px 0;">${e.value} <span style="font-size:12px;color:${e.tone === "green" ? "var(--green)" : "var(--red)"};">${e.change}</span></p>
    </div>
  `).join("");

  const news = await loadNews();
  document.getElementById("newsList").innerHTML = news.map((n) => `
    <div style="border-bottom:1px solid rgba(30,41,59,0.5);padding:8px 0;">
      <span class="badge slate" style="font-size:10px;">${n.tag}</span>
      <p style="font-size:12px;margin:6px 0 2px;">${n.title}</p>
      <p class="sub" style="margin:0;">${n.time} · ${n.asset}</p>
    </div>
  `).join("");
}

// ---------------- Analyse ----------------
function renderAnalyse() {
  const tbody1 = document.querySelector("#tendanceTable tbody");
  tbody1.innerHTML = MOCK_TENDANCE_ROWS.map((r) => `
    <tr>
      <td><strong>${r.date}</strong></td>
      <td>${r.spread}</td><td>${pill(r.spreadEtat)}</td>
      <td>${r.basisBrent}</td><td>${pill(r.basisBrentEtat)}</td>
      <td>${r.basisSilver}</td><td>${pill(r.basisSilverEtat)}</td>
      <td>${r.basisGold}</td><td>${pill(r.basisGoldEtat)}</td>
    </tr>`).join("");

  const tbody2 = document.querySelector("#confirmTable tbody");
  tbody2.innerHTML = MOCK_CONFIRM_ROWS.map((r) => `
    <tr>
      <td><strong>${r.date}</strong></td><td>${r.spot}</td><td>${r.usdcnh}</td>
      <td>${r.zscore}</td><td>${r.percentile}</td><td>${r.corr20}</td><td>${r.corr60}</td>
      <td>${pill(r.signal)}</td><td>${pill(r.structure)}</td><td>${pill(r.chine)}</td>
    </tr>`).join("");
}

// ---------------- Calculateur ----------------
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

  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase.from("risk_plans").upsert({ user_id: userData.user.id, ...plan });
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
function renderJournalCalendar() {
  const head = document.getElementById("journalCalendarHead");
  head.innerHTML = ["L", "M", "M", "J", "V", "S", "D"].map((d) => `<div class="cal-head">${d}</div>`).join("");

  const grid = document.getElementById("journalCalendar");
  let html = "";
  for (let i = 0; i < 5; i++) html += `<div></div>`; // padding avant le 1er (ajuster selon le mois réel)
  for (let d = 1; d <= 31; d++) {
    const result = MOCK_DAILY_RESULTS[d];
    let cls = "cal-day";
    if (result) cls += result.pnl >= 0 ? " win" : " loss";
    html += `<div class="${cls}" onclick="openDayModal(${d})">${d}${result ? `<br><span style="font-size:9px;">${result.pnl >= 0 ? "+" : ""}${result.pnl.toFixed(0)}$</span>` : ""}</div>`;
  }
  grid.innerHTML = html;
}

const journalEntries = {}; // état local — TODO: remplacer par lecture Supabase journal_entries
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

  function render() {
    const key = `${day}-${activeSession}`;
    const entry = journalEntries[key] || { actif: "", sens: "Acheteur", zone: "", note: "" };
    const real = MOCK_DAILY_RESULTS[day];

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
        <h2 style="margin:0;">Fiche du ${day} août</h2>
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
        ${real
          ? `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
               <div>
                 <p class="sub" style="margin:0;">PnL réel · ${real.tradesCount} trade(s) · ${real.winRate}% réussite</p>
                 <p style="font-size:18px;font-weight:700;margin:2px 0;color:${real.pnl >= 0 ? "var(--green)" : "var(--red)"};">${real.pnl >= 0 ? "+" : ""}${real.pnl.toFixed(2)} $</p>
               </div>
               <span id="concordanceBadge"></span>
             </div>`
          : `<p class="sub" style="margin:0;">Aucune donnée de performance MT5 pour ce jour.</p>`}
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
    updateConcordance(day);
  }

  function updateConcordance(day) {
    const badge = document.getElementById("concordanceBadge");
    if (!badge) return;
    const pre = journalEntries[`${day}-pre`];
    const real = MOCK_DAILY_RESULTS[day];
    if (!pre?.sens || !real) { badge.textContent = ""; return; }
    const predictedBullish = pre.sens === "Acheteur";
    const actualBullish = real.pnl >= 0;
    const concordant = predictedBullish === actualBullish;
    badge.innerHTML = `<span class="pill ${concordant ? "green" : "red"}">${concordant ? "✓ En phase" : "✗ Écart"}</span>`;
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

    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await supabase.from("journal_entries").upsert({
          user_id: userData.user.id,
          entry_date: `2026-08-${String(day).padStart(2, "0")}`,
          session, ...entryData,
        });
      }
    }
    const flash = document.getElementById("modalSavedFlash");
    if (flash) { flash.style.display = "inline"; setTimeout(() => (flash.style.display = "none"), 2000); }
    updateConcordance(day);
  };

  window.closeDayModal = () => overlay.classList.remove("active");

  render();
  overlay.classList.add("active");
}

// ---------------- Performance ----------------
function renderPerformance() {
  document.getElementById("objectivesList").innerHTML = MOCK_OBJECTIVES.map((o) => `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(30,41,59,0.5);padding:8px 0;">
      <div><p style="margin:0;font-size:12px;color:var(--blue);">${o.label}</p><p class="sub" style="margin:0;">${o.result}</p></div>
      <span style="font-size:16px;">${o.pass ? "✅" : "❌"}</span>
    </div>`).join("");
}

// ---------------- Paramètres ----------------
let mt5Accounts = [
  { id: 1, login: "1234567", server: "FTMO-Server" },
  { id: 2, login: "7654321", server: "IC-Markets-Live" },
];
let webhooks = [];

function renderAccounts() {
  document.getElementById("accountsList").innerHTML = mt5Accounts.map((a) => `
    <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px;">
      <div><strong style="font-size:13px;">Login ${a.login}</strong><p class="sub" style="margin:2px 0 0;">${a.server}</p></div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="pill green">Connecté · lecture seule</span>
        <button class="btn btn-secondary" onclick="removeAccount(${a.id})">✕</button>
      </div>
    </div>`).join("");
}
function removeAccount(id) { mt5Accounts = mt5Accounts.filter((a) => a.id !== id); renderAccounts(); }

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
    mt5Accounts.push({ id: Date.now(), login, server });

    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await supabase.from("mt5_accounts").insert({ user_id: userData.user.id, login, server });
      }
    }
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

// ---------------- Init ----------------
document.addEventListener("DOMContentLoaded", () => {
  renderNav();
  switchSection("dashboard");
  renderDashboard();
  renderAnalyse();
  initCalculateur();
  renderJournalCalendar();
  renderPerformance();
  initParametres();
});
