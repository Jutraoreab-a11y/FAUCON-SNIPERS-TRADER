// Couche IA : palette de sources (Paramètres) + résultats cités. Autonome : n'altère pas app.js.
(function () {
  const db = typeof supabaseClient !== "undefined" ? supabaseClient : null;
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const link = (u, n) => (u && /^https?:\/\//i.test(u))
    ? ` · <a href="${esc(u)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;">Source : ${esc(n || new URL(u).hostname)}</a>` : "";

  async function sources() {
    if (!db) return [];
    const { data } = await db.from("sources").select("*").order("name");
    return data || [];
  }
  async function findings() {
    if (!db) return [];
    const { data } = await db.from("ai_findings").select("*").order("fetched_at", { ascending: false }).limit(10);
    return data || [];
  }

  async function render() {
    const box = document.getElementById("sourcesList"); if (!box) return;
    const list = await sources();
    box.innerHTML = list.length ? list.map((s) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(30,41,59,0.5);">
        <div style="min-width:0;"><strong style="font-size:12px;">${esc(s.name)}</strong>
          <p class="sub" style="margin:0;">${esc(s.domain)} · ${esc(s.type)}${s.last_fetch_at ? " · dernier passage " + new Date(s.last_fetch_at).toLocaleString("fr-FR") + " (" + esc(s.last_status) + ")" : ""}</p></div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn" data-t="${esc(s.domain)}">${s.active ? "Actif" : "Inactif"}</button>
          <button class="btn" data-d="${esc(s.domain)}">✕</button></div>
      </div>`).join("") : '<p class="sub">Palette vide (ou SQL ai_sources.sql pas encore exécuté).</p>';
    box.querySelectorAll("[data-t]").forEach((b) => b.onclick = async () => {
      const s = list.find((x) => x.domain === b.dataset.t);
      await db.from("sources").update({ active: !s.active }).eq("domain", s.domain); render();
    });
    box.querySelectorAll("[data-d]").forEach((b) => b.onclick = async () => {
      await db.from("sources").delete().eq("domain", b.dataset.d); render();
    });
    const f = await findings();
    document.getElementById("findingsList").innerHTML = f.length ? f.map((x) => `
      <div style="border-bottom:1px solid rgba(30,41,59,0.5);padding:8px 0;">
        <span class="badge slate" style="font-size:10px;">${esc(x.topic)}</span>
        <p style="font-size:12px;margin:6px 0 2px;">${esc(x.summary)}${x.value ? " — <strong>" + esc(x.value) + "</strong>" : ""}</p>
        <p class="sub" style="margin:0;">${new Date(x.fetched_at).toLocaleString("fr-FR")}${link(x.source_url, x.source_name)}</p>
      </div>`).join("") : "Aucun résultat pour l'instant.";
  }

  document.addEventListener("DOMContentLoaded", () => {
    render();
    document.getElementById("addSource").onclick = async () => {
      const name = document.getElementById("newSrcName").value.trim();
      const domain = document.getElementById("newSrcDomain").value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      if (!db || !name || !domain) return;
      await db.from("sources").insert({ name, domain });
      document.getElementById("newSrcName").value = ""; document.getElementById("newSrcDomain").value = ""; render();
    };
    document.getElementById("runAiBtn").onclick = async () => {
      const btn = document.getElementById("runAiBtn");
      if (!db) return;
      btn.disabled = true; btn.textContent = "Analyse en cours…";
      try {
        const { data, error } = await db.functions.invoke("ai-research");
        if (error) throw error;
        btn.textContent = data && data.ok ? `Terminé (${data.inserted} résultats)` : "Terminé avec erreurs";
      } catch (e) { btn.textContent = "Échec — voir README"; console.warn("ai-research:", e.message); }
      setTimeout(() => { btn.disabled = false; btn.textContent = "Lancer une analyse IA"; render(); }, 2500);
    };
  });
})();
