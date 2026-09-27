# Le Fil — état d'avancement

Dernière session : 2026-09-27 — **l'appli est en ligne, installée et fonctionnelle** :
https://martin-diraison.github.io/le-fil/ (déployée via GitHub Actions, connexion testée avec
succès, PWA installée sur smartphone Samsung — icône dédiée, ouverture en plein écran).

Dépôt public : https://github.com/martin-diraison/le-fil (branche `main`). Les commits
utilisent l'adresse anonyme GitHub (config locale du dépôt) — ne jamais publier de données
personnelles ni de clés (`.env.local` est ignoré par git). Pour reprendre, il suffit de redemander à Claude Code
de continuer — ce fichier + les commentaires du code portent tout le contexte nécessaire.

## Contenu du dossier
- `design_handoff_le_fil/` — transmission de design originale (prototypes `.dc.html`,
  `README.md` = spec de référence, `support.js` = moteur des prototypes).
  Pour visualiser un prototype : `npx serve design_handoff_le_fil` puis ouvrir le `.dc.html`.
- `le-fil/` — l'application en cours de construction.

## Décisions prises (voir aussi la conversation)
- **Stack** : React + TypeScript + Vite, PWA (installable mobile/PC), état local avec
  Zustand, backend **Supabase** prévu (Postgres + Auth + Realtime) — pas encore branché.
- **Pourquoi Supabase plutôt que Google Sheets/Drive** : pas de vraie gestion de comptes
  utilisateurs ni de sync temps réel côté Sheets ; Supabase fait ça nativement et reste
  gratuit pour un usage perso.
- **Mode démo local** : tant que Supabase n'est pas configuré (`.env.local` absent),
  `App.tsx` contourne l'authentification et démarre directement avec des données
  factices (`src/state/seed.ts`). Aucune donnée n'est envoyée nulle part dans ce mode.

## Ce qui est fait (vérifié visuellement contre le prototype desktop)
- Écran de connexion (login/signup/forgot/sent) — branché sur Supabase Auth, fidèle au
  pixel près au prototype (desktop + responsive mobile).
- Coquille desktop 3 volets (`src/features/shell/DesktopShell.tsx`) :
  - Menu projets : sélection, couleurs (28 teintes), renommage, suppression à
    confirmation double, glisser-déposer, recherche, filtre « retard ».
  - Volet Liste des lots : tri (urgence/récent/manuel), création, glisser-déposer.
  - Volet lot ouvert : titre/texte éditables, raccourcis d'échéance, tâches (ajout,
    complétion, échéance, suppression), déplacer vers un autre projet.
  - Tiroir « Compte & sécurité » : changement de mot de passe (via Supabase, avec
    ré-authentification), appareils connectés (`signOut({scope:'others'})`), export
    JSON, déconnexion.
- **Vue Calendrier** (`src/features/calendar/`) : mois (5-6 rangées) / semaine, lundi en
  premier, navigation ‹ ›, lots + tâches (bascule « tâches ✓ / – »), clic = ouvre/ferme le
  volet 3, glisser-déposer = nouvelle échéance (+ toast).
- **Vue Gantt** (`src/features/gantt/`) : fenêtre de 3 mois (mois précédent · courant ·
  suivant — le prototype fige SEPT–NOV 2026, on la calcule depuis aujourd'hui), rangée par
  projet, barres lot 12 px / tâche 7 px, trait rouge « aujourd'hui », bascule tâches.
- En Calendrier/Gantt, le volet 3 est un tiroir de 336 px ; sans sélection, tous les projets
  sont affichés ; repasser en Liste avec un lot ouvert ajoute son projet à la sélection.
- **Interface mobile** (`src/features/mobile/`, sous 760 px de large — même seuil que l'écran
  de connexion) : barre d'état + synchro, onglets fil · projets · calendrier, Fil groupé par
  urgence, grille des projets, projet ouvert (réglages : nom, palette, suppression en deux
  temps), lot ouvert (échéance, tâches, « déplacer vers… » replié, terminer, +1 j), calendrier
  du mois avec intitulés courts, cases agrandissables et liste du jour, page Compte.
  Les sections du compte sont partagées avec le tiroir desktop (`AccountPanel.tsx`).
- Filtre partagé `filterLots()` (store) : la recherche couvre aussi les libellés de tâches.
- Correctif : les dates « jour » étaient calculées via `toISOString()` (UTC) → décalage d'un
  jour en heure de Paris. Tout passe désormais par `src/lib/dates.ts` (heure locale).
- Modèle de données TypeScript fidèle au README (`src/types/models.ts`).
- Palette de couleurs + contraste automatique (`src/lib/palette.ts`).

## Écarts documentés entre le README (texte) et le prototype (code réel)
Le code du prototype fait foi en cas de contradiction :
1. **Ordre d'urgence** : le README dit *« done › late › today › week › soon › none »*
   mais le code trie *late* en premier et *done* en dernier (cohérent avec les groupes
   du Fil mobile). Voir commentaire dans `src/types/models.ts`.
2. **Raccourcis d'échéance** : le README dit *« auj. / demain / +7j / +30j / sans date »*
   mais le code utilise *hier(-1) / aujourd'hui(0) / cette semaine(+4) / bientôt(+18) /
   sans date*. Le prototype **mobile**, lui, suit bien le README (`MOBILE_DATE_CHOICES`).
   Voir `src/state/dateShortcuts.ts`.
3. **Pluriel de l'en-tête du projet ouvert (mobile)** : le prototype affiche « 1 lots » (il
   accorde sur le total des lots, terminés compris) ; on accorde sur le nombre affiché.

## Choix de l'utilisateur qui s'écartent du prototype
- **Sélection des projets (menu gauche)** : dans le prototype, un clic n'importe où sur la ligne
  ajoute/retire le projet de la sélection. Désormais : clic sur le **nom** = n'afficher que ce
  projet (remplace la sélection) ; clic sur la **case** à gauche = ajouter/retirer (compiler
  plusieurs projets dans le volet 2). « Sans projet » (pas de case) sélectionne seul.
  Le lot ouvert se referme s'il ne fait plus partie de la sélection. Voir `selectOnly()` /
  `toggleSelected()` dans `src/state/store.ts`.
- **Nom de la sélection** : dans le prototype, il est dans la rangée des onglets de vue (liste ·
  calendrier · gantt), avec le même style que les boutons — ambigu. Il est maintenant en tête du
  volet 2 (`LotList.tsx`) : pastille(s) de couleur, nom en Archivo Narrow 17 px, nombre de lots,
  et le bouton de tri. La rangée du haut ne contient plus que les onglets de vue.
- **Projets sélectionnés plus visibles** : dès qu'une sélection existe, les projets non
  sélectionnés pâlissent (22 % de leur couleur) ; les sélectionnés gardent leur aplat et
  passent par-dessus le filet du menu (filet dessiné en `.menu::after`), comme un onglet ouvert
  vers le volet 2. Le liseré intérieur de 4 px n'est plus que sur les projets sélectionnés
  (il était auparavant affiché sur toutes les lignes, contrairement au README §3.2).

## Supabase (branché et testé le 2026-09-26)
- Un seul projet Supabase pour plusieurs applis : Le Fil a son **schéma Postgres `le_fil`**
  (exposé dans Data API › Exposed schemas). SQL dans `le-fil/supabase/` : `schema.sql` (état
  final), migrations `02_prefs_selected_text.sql` et `03_fix_check_same_owner.sql` (exécutées).
  RLS `user_id = auth.uid()` sur toutes les tables.
- `src/lib/supabase.ts` : client sur le schéma `le_fil`. `src/state/sync.ts` : charge les données
  au login puis envoie les différences du store (debounce 600 ms, file + retry). Les actions du
  store restent inchangées. Ids = UUID générés côté client. `App.tsx` gère chargement/erreur.
- Compte créé, persistance vérifiée par l'utilisateur en local (`npm run dev`).
- Ajout : sélecteur de date précis (`<input type="date">`) pour les tâches et les lots
  (desktop `LotDetail.tsx`, mobile `LotScreen.tsx`).
- Commité (2026-09-27, `03bebc4`).

## Déploiement GitHub Pages — ✅ en ligne (2026-09-27)
URL : **https://martin-diraison.github.io/le-fil/**, installable en PWA (mobile/PC).
- Code : `base: '/le-fil/'` en production dans `vite.config.ts` (racine en dev),
  `start_url`/`scope`/icônes du manifeste répercutés, `.github/workflows/deploy.yml` (build de
  `le-fil/` — le dépôt git est à la racine `perso/` — puis `actions/deploy-pages`), copie
  `index.html` → `404.html` pour servir l'app sur une route inconnue.
- GitHub : Pages en source « GitHub Actions » ; variables Actions `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` réglées.
- Supabase : Authentication › URL Configuration → Site URL + Redirect URLs incluent
  `https://martin-diraison.github.io/le-fil/` (localhost:5173 conservé pour le dev).
- **Bug corrigé** : coquille `.com` au lieu de `.co` dans la variable Actions
  `VITE_SUPABASE_URL` → échec CORS silencieux sur `auth/v1/token`, masqué par un message
  d'erreur de connexion trop générique. Corrigés (`b4bf2c6`) : le message de connexion
  n'affiche « e-mail ou mot de passe incorrect » que pour ce cas précis (sinon le message réel
  de Supabase s'affiche) ; le lien « mot de passe oublié » suit désormais
  `import.meta.env.BASE_URL` (il sortait du site Pages, `/reinitialiser` au lieu de `/le-fil/`).
- Connexion testée avec succès par l'utilisateur sur l'URL en ligne.
- Inscriptions publiques désactivées côté Supabase (Authentication › Sign In / Providers) : les
  nouveaux comptes se créent désormais via Authentication › Users (« Invite user » ou
  « Add user »), la connexion/synchro du compte existant n'est pas affectée.

## Icônes PWA — ✅ refaites (2026-09-27)
Jeu complet fourni par l'utilisateur (« encre sur jaune », voir
`le-fil/public/icons/README-icones.md`) : `icon-192/512.png`, `icon-maskable-192/512.png`,
`apple-touch-icon.png`, `favicon.ico`/`favicon.svg`/`favicon-16/32/48.png`,
`icon-1024-macos.png` et `icon-256-windows.png` en réserve pour un futur usage desktop natif.
`index.html` et `vite.config.ts` mis à jour en conséquence (`theme-color` → `#f2c015`). Le
`manifest.webmanifest` statique fourni dans ce dossier n'est pas utilisé (vite-plugin-pwa génère
et injecte le sien, avec le bon chemin `/le-fil/`) — laissé en place pour référence seulement.
PWA installée et testée avec succès par l'utilisateur (Samsung Internet, Android) : icône
correcte, ouverture en plein écran.

## Installation PWA — ✅ testée
- Android/Samsung Internet : menu ⋮ → « Installer en tant qu'application web » → fonctionne.
- Pistes non testées à ce jour : Chrome Android, Safari iOS (bouton Partager › Sur l'écran
  d'accueil), Chrome/Edge desktop (icône d'installation dans la barre d'adresse). Firefox
  desktop ne propose pas l'installation de PWA (fonctionnalité retirée du navigateur).

## Prochaines étapes (sans urgence)
Realtime multi-appareils ; hors-ligne (IndexedDB + file d'attente de synchro).

## Pas encore fait
- Préférences (vue, mode calendrier, bascules tâches, sélection) non persistées : elles
  seront stockées avec Supabase (`UserPrefs`).
- Sync hors-ligne / cache IndexedDB / file d'attente de synchro.
- « Simuler hors ligne » (démo uniquement dans les prototypes) : volontairement non repris ;
  l'indicateur de synchro affiche « synchronisé » en attendant la vraie synchro.

## Pour relancer le serveur de dev
```bash
cd le-fil
npm install   # si besoin
npm run dev
```
Node est installé via `nvm` (pas installé globalement sur le système) :
```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

## Prochaines étapes proposées (au choix, à la reprise)
1. **Branchement Supabase** — en cours côté utilisateur : il fait le ménage dans son compte
   Supabase et ouvre un nouveau projet. À la reprise : copier `le-fil/.env.example` en
   `le-fil/.env.local` (URL + clé « anon »), puis écrire le schéma SQL (projects/lots/tasks +
   préférences), les règles RLS par utilisateur, et remplacer les données de démo par la
   lecture/écriture Supabase. Penser à désactiver les inscriptions une fois le compte créé.
2. **Déploiement** — reporté volontairement. Piste retenue : GitHub Pages (gratuit, dépôt
   public, URL `https://martin-diraison.github.io/le-fil/`) via GitHub Actions ; il faudra
   régler `base: '/le-fil/'` dans Vite et le scope/start_url du manifeste PWA. Une URL HTTPS
   est indispensable pour installer la PWA sur téléphone.
3. Hors ligne : cache IndexedDB + file d'attente de synchro
