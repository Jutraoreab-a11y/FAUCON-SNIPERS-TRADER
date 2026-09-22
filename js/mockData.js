// Données d'exemple utilisées tant que Supabase n'est pas configuré (js/config.js)
// ou tant que les tables sont vides. Remplacer par de vraies requêtes Supabase
// une fois le pipeline de données (Twelve Data -> Supabase) branché.

const MOCK_ASSETS = [
  {
    id: "GOLD", name: "GOLD", signal: "BIAIS HAUSSIER", tone: "blue",
    sub: "Pression hors Chine", desc: "L'or monte malgré un Yuan faible",
    pressure: "Achats refuge soutenus", supply: "Stable — pas de tension physique",
    institutionalDriver: "Banques centrales",
    institutionalNote: "Achats nets rapportés par le World Gold Council, 4e mois consécutif.",
    econLabel: "Taux réel US 10 ans", econValue: "1.82%",
    metrics: [["Zscore Gold", "+1.05"], ["Gold/Silver Ratio", "88.4"], ["S&P 500", "stagne"]],
  },
  {
    id: "SILVER", name: "SILVER", signal: "BIAIS BAISSIER", tone: "red",
    sub: "Capitulation", desc: "Basis futures en effondrement",
    pressure: "Backwardation critique", supply: "Rare — tension physique COMEX",
    institutionalDriver: "Demande industrielle (Chine)",
    institutionalNote: "Ralentissement des commandes manufacturières chinoises ce trimestre.",
    econLabel: "PMI manufacturier Chine", econValue: "49.1 (contraction)",
    metrics: [["Basis Silver", "-0.87"], ["Percentile 10j", "97%"], ["Corr. 20j", "0.71"]],
  },
  {
    id: "BRENT", name: "BRENT", signal: "BIAIS HAUSSIER", tone: "green",
    sub: "Soutien Chine", desc: "Le Yuan se renforce, structure saine",
    pressure: "Contango léger, demande stable", supply: "Quotas OPEP+ inchangés",
    institutionalDriver: "Fed & USD/CNH",
    institutionalNote: "Taux Fed stable, Yuan en appréciation — soutien indirect à la demande.",
    econLabel: "Taux Fed (cible)", econValue: "4.50%",
    metrics: [["Basis Spread", "-0.42"], ["Z-Score (60j)", "+2.31"], ["Percentile 10j", "94%"]],
  },
  {
    id: "WTI", name: "WTI", signal: "BIAIS HAUSSIER", tone: "green",
    sub: "Marché domestique US stable", desc: "Inventaires proches de la moyenne saisonnière",
    pressure: "Léger contango, pas de tension", supply: "Stocks Cushing dans la norme",
    institutionalDriver: "Stocks EIA & USD",
    institutionalNote: "Rapport hebdomadaire EIA en ligne avec les attentes, dollar stable.",
    econLabel: "Stocks EIA (hebdo)", econValue: "+1.2M barils",
    metrics: [["Spread WTI-Brent", "-3.10"], ["Z-Score (60j)", "+1.85"], ["Percentile 10j", "88%"]],
  },
];

const MOCK_ECONOMY = [
  { label: "USD/CNH", value: "7.241", change: "-0.18%", tone: "green" },
  { label: "EUR/USD", value: "1.0862", change: "+0.05%", tone: "green" },
  { label: "DXY", value: "103.42", change: "-0.12%", tone: "red" },
  { label: "US500", value: "5 932", change: "+0.21%", tone: "green" },
];

const MOCK_NEWS = [
  { time: "08:41", tag: "Haute", asset: "USD/CNH", title: "La PBoC fixe un taux de référence plus fort que prévu, le Yuan se raffermit." },
  { time: "07:15", tag: "Haute", asset: "BRENT", title: "L'OPEP+ maintient ses quotas de production inchangés." },
  { time: "Hier 19:02", tag: "Moyenne", asset: "S&P 500", title: "Wall Street clôture proche de l'équilibre avant les minutes de la Fed." },
];

const MOCK_TENDANCE_ROWS = [
  { date: "17/08", spread: "-2.10", spreadEtat: "MOYEN", basisBrent: "-0.42", basisBrentEtat: "Backwardation Modérée", basisSilver: "-0.87", basisSilverEtat: "PANIQUE | Backwardation Critique", basisGold: "1.05", basisGoldEtat: "TENSION" },
  { date: "16/08", spread: "-1.85", spreadEtat: "MOYEN", basisBrent: "-0.38", basisBrentEtat: "Flat / Légère Back", basisSilver: "-0.79", basisSilverEtat: "PANIQUE | Backwardation Critique", basisGold: "0.92", basisGoldEtat: "TENSION" },
  { date: "15/08", spread: "-2.40", spreadEtat: "MOYEN", basisBrent: "-0.51", basisBrentEtat: "Backwardation Modérée", basisSilver: "-0.65", basisSilverEtat: "TENSION", basisGold: "0.80", basisGoldEtat: "TENSION" },
  { date: "14/08", spread: "4.20", spreadEtat: "BON", basisBrent: "0.85", basisBrentEtat: "Forte Backwardation", basisSilver: "-0.40", basisSilverEtat: "TENSION", basisGold: "0.60", basisGoldEtat: "ÉQUILIBRE" },
];

const MOCK_CONFIRM_ROWS = [
  { date: "17/08", spot: "72.40", usdcnh: "7.241", zscore: "+2.31", percentile: "94%", corr20: "0.71", corr60: "0.58", signal: "FORTE", structure: "TENDANCE HAUSSIÈRE", chine: "SOUTIEN CHINE (biais haussier)" },
  { date: "16/08", spot: "71.95", usdcnh: "7.245", zscore: "+2.05", percentile: "91%", corr20: "0.69", corr60: "0.57", signal: "FORTE", structure: "TENDANCE HAUSSIÈRE", chine: "SOUTIEN CHINE (biais haussier)" },
  { date: "15/08", spot: "71.20", usdcnh: "7.252", zscore: "+1.60", percentile: "85%", corr20: "0.64", corr60: "0.55", signal: "MODÉRÉE", structure: "TENDANCE HAUSSIÈRE", chine: "NEUTRE : Flux équilibrés" },
];

const MOCK_OBJECTIVES = [
  { label: "2 jours de Trading Minimum", result: "1 / 2", pass: false },
  { label: "Perte Maximum Journalière : -500 $", result: "-1,01 $ (0%)", pass: true },
  { label: "Perte Max : -1 000 $", result: "-1,01 $ (0%)", pass: true },
  { label: "Objectif de Profit : 500 $", result: "0,98 $ (0%)", pass: false },
];

// Résultats journaliers mock pour le calendrier Journal (clé = jour du mois)
const MOCK_DAILY_RESULTS = {
  12: { pnl: 42.92, winRate: 20.0, tradesCount: 5 },
  17: { pnl: 0.98, winRate: 100.0, tradesCount: 1 },
  9: { pnl: -18.4, winRate: 0, tradesCount: 2 },
};
