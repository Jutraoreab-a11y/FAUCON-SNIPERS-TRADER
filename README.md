# Faucon Snipers Trader — Projet VS Code (dossier technique : quant-macro-saas)

Application HTML/CSS/JS connectée à Supabase, avec un pipeline de données Yahoo Finance (gratuit, usage personnel) prêt à être branché.

## Structure du dossier

```
quant-macro-saas/
├── index.html
├── css/style.css
├── js/
│   ├── config.js          <- tes clés Supabase (à remplir)
│   ├── supabaseClient.js
│   ├── mockData.js         <- repli automatique tant que Supabase est vide
│   └── app.js               <- lit les vraies données Supabase si dispo, sinon mockData.js
├── sql/
│   ├── schema.sql            <- tables (inclut price_history, nouveau)
│   └── schedule.sql           <- planification automatique (cron)
└── supabase/functions/
    ├── fetch-yahoo/            <- récupère les prix Yahoo Finance
    └── compute-signals/         <- calcule Basis Spread, Z-Score, Percentile, corrélations
```

## Étape 1 — Voir l'app tourner (sans base de données)

Ouvre `index.html` avec l'extension **Live Server** dans VS Code. L'app tourne avec les données d'exemple (`js/mockData.js`).

## Étape 2 — Connecter Supabase

1. Crée un projet sur [supabase.com](https://supabase.com), copie `Project URL` et clé `anon public` dans `js/config.js`.
2. Dans **SQL Editor**, exécute `sql/schema.sql` (crée toutes les tables, dont `price_history`, nouvelle pour stocker les prix Yahoo).
3. Recharge la page — plus d'avertissement "Supabase non configuré" dans la console (F12).

À ce stade, l'app lit déjà les vraies tables Supabase (`js/app.js` a été mis à jour), mais elles sont vides — donc elle continue d'afficher les données d'exemple en repli, automatiquement, jusqu'à ce que le pipeline ci-dessous tourne au moins une fois.

## Étape 3 — Brancher Yahoo Finance (le pipeline de données)

Il faut le [Supabase CLI](https://supabase.com/docs/guides/cli) installé sur ta machine.

```bash
supabase login
supabase link --project-ref TON_PROJECT_REF
supabase functions deploy fetch-yahoo
supabase functions deploy compute-signals
supabase functions deploy backfill-history
```

**D'abord, rattrape l'historique (une seule fois) :**
```bash
supabase functions invoke backfill-history
```
Ça peut prendre plusieurs minutes — récupère 2 ans en quotidien (D1) + 60 jours en 15 minutes (le maximum que Yahoo permette gratuitement en intraday) pour chaque actif.

Test manuel du reste :
```bash
supabase functions invoke fetch-yahoo
supabase functions invoke compute-signals
```

Vérifie ensuite dans Supabase > Table Editor que `price_history` (colonne `timeframe` = `D1` ou `15m`) puis `signals` et `economic_indicators` se remplissent.

## Étape 4 — Automatiser (cron)

Ouvre `sql/schedule.sql`, remplace `<PROJECT_REF>` et `<SERVICE_ROLE_KEY>` (Project Settings > API > service_role — **gardée secrète, jamais dans le frontend**) par tes vraies valeurs, puis exécute-le dans le SQL Editor. Trois tâches se lancent :
- `fetch-yahoo-15m` : une bougie 15 minutes toutes les 15 min, en continu → construit ton propre historique intraday réel au fil du temps
- `fetch-yahoo-daily` : la clôture propre du jour, une fois par jour
- `compute-signals-daily` : recalcule les indicateurs après la clôture

## Important — sur l'historique et la granularité

- **2 ans en quotidien (D1)** : disponibles gratuitement via Yahoo, backfillés en une fois avec `backfill-history`. Suffisant pour comparer des périodes, calculer Z-Score/Percentile sur longue durée.
- **15 minutes** : Yahoo ne conserve cette granularité que sur **~60 jours en arrière**, pas plus — c'est une limite de Yahoo lui-même, pas quelque chose de contournable gratuitement. `backfill-history` récupère ces 60 jours une fois, puis `fetch-yahoo-15m` accumule une vraie bougie toutes les 15 min à partir de maintenant. Dans quelques mois, tu auras un historique 15min réel et grandissant.
- **Si tu as besoin de 2 ans complets en 15 minutes** (ou moins) un jour, il faudra une source payante (Databento) — pas faisable gratuitement, quelle que soit la méthode utilisée.

## Important — sur la source de données

`fetch-yahoo` utilise l'endpoint non-officiel de Yahoo Finance. C'est gratuit et suffisant pour un usage **personnel**, mais :
- pas de garantie de stabilité (Yahoo peut changer l'endpoint sans préavis) ;
- pas de SLA, pas de support ;
- **à ne jamais utiliser comme base d'un produit revendu à des tiers** — si ce projet devient commercial un jour, il faudra migrer vers une source sous licence commerciale (Twelve Data, Databento — détaillé dans la feuille de route business fournie séparément).

Le "Basis Spread" pétrole (Spot vs Futur) n'est pas calculable avec Yahoo gratuitement (pas de vraie donnée spot pétrole distincte des futures) — le `Spread WTI-Brent` est utilisé comme proxy en attendant une vraie source. Pour Gold et Silver en revanche, le vrai Basis (Spot réel − Futur réel) est calculé, Yahoo fournissant les deux séries.

## Note pour la reprise en Claude Cowork

Voici l'état exact du projet et ce qu'il reste à faire, pour repartir sans perdre de contexte :

**Déjà fait et fonctionnel :**
- Interface complète (6 sections), navigation desktop + mobile
- Calculateur de position + simulateur Monte-Carlo (100% côté client, aucune donnée requise)
- Journal (sessions multiples, comparaison au résultat réel) — écrit dans Supabase si connecté
- Paramètres (comptes MT5 lecture seule, webhooks d'exécution externe) — état local, pas encore persisté en base
- `js/app.js` lit déjà `signals`, `economic_indicators`, `news` depuis Supabase avec repli automatique sur données d'exemple
- Edge Functions `fetch-yahoo` et `compute-signals` écrites et prêtes à déployer (voir Étape 3 ci-dessus)
- Schéma de base de données complet, y compris `price_history` pour les prix bruts

**À faire ensuite, par ordre logique :**
1. Déployer les 3 Edge Functions et lancer `backfill-history` une fois (Étape 3)
2. Exécuter `sql/schedule.sql` pour automatiser la suite (Étape 4)
3. Laisser tourner — le Z-Score/Percentile D1 fonctionnent dès le backfill (2 ans dispo), l'intraday 15min s'enrichit au fil du temps au-delà des 60 jours déjà récupérés
4. Brancher la table `news` (actuellement vide, aucune source configurée)
5. Ajouter l'authentification (Supabase Auth) si l'usage doit un jour dépasser une seule personne
6. Reconsidérer l'intégration MT5 réelle (MetaApi, lecture seule) une fois la fiabilité des signaux validée sur l'historique accumulé
# FAUCON-SNIPERS-TRADER
