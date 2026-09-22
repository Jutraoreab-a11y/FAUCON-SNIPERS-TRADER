// Nécessite le script CDN Supabase chargé avant ce fichier (voir index.html)
const supabaseReady = window.SUPABASE_URL && !window.SUPABASE_URL.includes("TON-PROJET");

const supabase = supabaseReady
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

if (!supabaseReady) {
  console.warn(
    "[Quant-Macro] Supabase non configuré — l'app tourne avec des données d'exemple. " +
    "Remplis js/config.js avec tes clés pour activer la vraie base de données."
  );
}
