# Le Fil — état d'avancement

Dernière session : 2026-09-29 — traitement du backlog de retours utilisateur (lot « Liste
d'amélioration », projet Bugs d'appli, voir section dédiée plus bas). Appli en ligne, installée :
https://martin-diraison.github.io/le-fil/ (déployée via GitHub Actions, connexion testée, PWA
installée sur smartphone Samsung). **Tout est commité et poussé** — déploiement GitHub Pages à
confirmer par l'utilisateur après coup (pas re-testé en ligne cette session, seulement en local).

## Gantt : ne lister que les lots avec échéance (2026-09-29, suite)
Demande de l'utilisateur après la session précédente : un lot sans échéance n'a de toute façon
pas de barre à tracer (voir `bar: lot.due ? ... : null`), donc inutile de le lister dans la
colonne de gauche — pareil pour un projet dont aucun lot n'a de date (la rangée d'en-tête
disparaît aussi). `GanttView.tsx` : `ls` filtre désormais sur `l.due` avant de construire les
rangées. Les tâches étaient déjà filtrées sur leur propre échéance (inchangé). Vérifié en local
(mode démo) : « Trier les photos de vacances » (sans date) n'apparaît plus, seul « Anniversaire
de Julie » reste sous « Sans projet ».

## Backlog de retours utilisateur traité (2026-09-29)
Repris depuis le lot « Liste d'amélioration » (projet Bugs d'appli, dans l'appli elle-même) : 9
points triés avec l'utilisateur (plusieurs rounds d'`AskUserQuestion` pour clarifier chaque point
ambigu) avant tout code. Décisions + implémentation :
1. **Fourchette de date tâche/lot/projet** : déjà couvert pour lot+tâche (session précédente) —
   confirmé avec l'utilisateur qu'un **projet** n'a pas besoin de dates (reste une simple
   catégorie colorée).
2. **Suppression tâche rapide** : bouton « ✕ » direct sur la ligne de tâche (desktop
   `.taskRow__delete`, mobile `.m__taskDelete`), sorti du menu date où il était auparavant
   enterré (`.taskRow__pickerRemove` retiré) — c'était la vraie gêne signalée.
3. **Raccourcis date tâche simplifiés** : « bientôt »/« sans date » retirés de `DATE_CHOICES`
   (desktop, 5→3 choix) ; « sans date » retiré de `MOBILE_DATE_CHOICES`. Champs début/fin
   repositionnés en premier dans le picker (« calendrier en premier »), raccourcis ensuite.
4. **Édition d'une tâche en place** : nouvelle action store `updateTaskLabel` ; le libellé de
   tâche est désormais un `<input>` contrôlé (desktop et mobile), plus besoin de
   supprimer/retaper pour corriger un intitulé.
5. **Onglet Fil « en vrac »** : écarté par l'utilisateur — retour obsolète, déjà traité par la
   refonte de la session précédente (groupes par urgence).
6. **Calendrier/Gantt « tout afficher » par défaut** : bug réel trouvé — `filterLots` filtrait
   aussi Calendrier et Gantt par la sélection de projets laissée par la vue Liste (`scopeAll` ne
   valait `true` que si `selected` était vide). Corrigé : `scopeAll = view !== 'liste'`, ces deux
   vues ignorent maintenant totalement la sélection (qui ne concerne plus que la vue Liste). Même
   bug trouvé indépendamment dans `GanttView.tsx` (le regroupement des rangées par projet limitait
   aussi aux `selected`) — corrigé en même temps.
7. **Échéance du lot (repli)** : desktop compacté sans cacher (padding/gap réduits) — décision de
   ne pas re-tenter un repli/dépli desktop déjà essayé et rejeté une fois la session précédente ;
   mobile repliée par défaut (`periodOpen`, fermé à l'ouverture d'un lot) avec un bouton
   `.m__periodToggle` résumant échéance + récurrence.
8. **« Au » = « Du » par défaut** : `setLotStartDate`/`setTaskStartDate` remplissent l'échéance
   avec la date de début si elle est encore vide. Bug trouvé en testant : la saisie clavier d'une
   date native déclenche `onChange` sur des états intermédiaires (ex. année « 0002 » pendant la
   frappe de « 2026 » chiffre par chiffre), qui se propageaient tels quels → garde
   `isPlausibleDate` (année ≥ 1900) ajoutée avant de propager vers l'échéance.
9. **Chantier « type Google Calendar »** (rdv, horaires, lieu) : cadré avec l'utilisateur,
   **pas implémenté** — mis en attente comme les notifications (voir périmètre ci-dessous).

### Périmètre retenu pour le futur chantier RDV/agenda (non démarré)
- Tâches ET lots pourraient porter un horaire (début + fin/durée) et un lieu (texte libre).
- Vue mensuelle conservée comme entrée principale ; dans une case jour, les éléments avec horaire
  s'afficheraient à la suite entre eux.
- Nouvelle vue journalière (tap/clic sur un jour) : grille horaire type agenda, superposition si
  chevauchement, navigation par swipe gauche/droite pour changer de jour (comme un widget agenda
  smartphone).
- Comparable aux notifications en ampleur (modèle de données + nouvelle vue + gestes tactiles) —
  nécessite une session dédiée, pas un ajout incrémental.

Fichiers touchés : `state/store.ts`, `state/dateShortcuts.ts`, `features/lots/LotDetail.tsx`/
`.css`, `features/mobile/LotScreen.tsx`, `features/mobile/Mobile.css`, `features/gantt/
GanttView.tsx`. `tsc --noEmit` et `npm run build` passent. **Vérifié visuellement en local**
(desktop + mobile 390×800 via Chrome) en mode démo temporaire — `.env.local` déplacé puis
restauré immédiatement après le test, aucune donnée réelle Supabase touchée. Pas re-testé contre
le compte réel ni contre le déploiement en ligne : à confirmer par l'utilisateur à l'usage.

## Refonte de l'onglet mobile « Fil » (2026-09-27)
Discuté avant tout code (4 directions proposées avec maquettes ASCII via AskUserQuestion) :
l'utilisateur a choisi « Focus + repli », avec un ajout explicite — pouvoir identifier le
projet d'un lot sans ambiguïté. Réalisé (`FilScreen.tsx`, `Mobile.css`, `labels.ts`,
`types/models.ts`), puis affiné à trois reprises suite aux retours de l'utilisateur :
- Groupes dépliés par défaut : « retard », « aujourd'hui », « dans les 7 prochains jours »,
  « dans les 30 prochains jours ». Repliés par défaut : « plus tard », « sans date »,
  « terminés » (chevron ▸/▾, état local `useState`, non persisté — repart replié à chaque
  ouverture de l'onglet). Chaque groupe reste cliquable dans les deux sens.
- **Urgence à 4 paliers temporels** (`computeUrgency` dans `types/models.ts`) : `late` (< J),
  `today` (= J), `week` J+1..J+7 (« dans les 7 prochains jours »), `month` J+8..J+30 (« dans les
  30 prochains jours »), `soon` au-delà de J+30 (« plus tard », **sans plafond** — un lot très
  lointain y reste visible plutôt que d'être caché, décision explicite de l'utilisateur après
  clarification via AskUserQuestion). `URGENCY_ORDER` mis à jour en conséquence ; les autres
  usages de `computeUrgency` dans l'appli ne testent que `=== 'late'`/`'today'`, donc non
  affectés par l'ajout du palier `month`.
- Badge coloré + nom de projet sur chaque ligne de lot (`.m__rowProject`), en plus de la barre
  de couleur `.m__edge` déjà existante mais sans libellé. `lotMeta()` gagne un 4ᵉ paramètre
  `showProject` (défaut `true`, inchangé pour `CalendarScreen`) pour ne pas dupliquer le nom du
  projet dans la ligne de méta sous le titre côté Fil.
- Vérifié visuellement en mobile (390×800, via un nouvel onglet Chrome redimensionné avant
  navigation — contourne le bug de `resize_window` sur un onglet déjà chargé, noté la session
  précédente ; **le contournement marche de façon fiable**, à réutiliser directement la
  prochaine fois plutôt que de retenter `resize_window` sur un onglet existant). Au passage,
  confirme que l'alignement `du`/`au`/`répétition` en grille (commit `25390e7`) est correct en
  mobile. `tsc --noEmit` et `npm run build` passent à chaque étape.
- L'ouverture par défaut sur « projets » (plutôt que « fil ») peut être reconsidérée maintenant
  que l'onglet Fil est plus utilisable — à voir à l'usage.
- Commits : `bd17fea` (repli + badge), `6b4f724` (fenêtre 7 jours), `8de2f38` (palier 30
  jours), `2390f70` (30 jours déplié par défaut). Poussés et déployés.

## Reprise des chantiers d'usage (2026-09-27, suite)
- **Échéance / début / répétition du lot (desktop + mobile)** : plusieurs allers-retours cette
  session (rangée surchargée → paragraphe d'explication, rejeté, faisait fuir les tâches hors
  du tiroir → repli/dépli, rejeté, ne réglait rien pour un lot déjà récurrent) avant la
  consigne finale de l'utilisateur, appliquée telle quelle : **trois contrôles fixes, sans
  exception** — `du [date] au [date] répétition [menu déroulant]`, plus aucun bouton de
  raccourci (hier/aujourd'hui/…) ni mention du mot « Gantt » à ce niveau. Les raccourcis
  restent inchangés pour les tâches (popup par tâche, non concerné). `LotDetail.tsx`/`.css`
  (desktop), `LotScreen.tsx` + `Mobile.css` (mobile).
- **Onglet Projets mobile : grille 3 colonnes** au lieu de la liste à une colonne, pavés
  compacts (nom + nombre de lots centrés). Nombre de colonnes réglable dans `Mobile.css`
  (`.m__tiles`, `grid-template-columns`) si 4 s'avère préférable à l'usage.
- **Gantt : bouton « période · 3 mois / tout »** — en mode « tout », la fenêtre s'étend du
  plus ancien au plus récent jour utile parmi les lots (et tâches si affichées) actuellement
  visibles, au lieu de rester figée sur 3 mois autour d'aujourd'hui. État non persisté
  (`ganttFullRange` dans `state/store.ts`, simple choix d'affichage).
- **Alignement** : `du`/`au`/`répétition` en grille CSS deux colonnes (label · contrôle,
  largeur uniforme) plutôt qu'un flex qui retombait en désordre selon la largeur du volet.
- Vérifié visuellement (desktop confirmé ; mobile probable mais pas re-confirmé après le tout
  dernier correctif d'alignement, l'outil de capture mobile a eu un souci en fin de session —
  **à vérifier en priorité à la reprise**). `tsc --noEmit` et `npm run build` passent partout.
  Commité (`25390e7`, historique intermédiaire `b3836ff`..`daa44ea`), pas encore
  poussé/redéployé.
- Lot « Liste d'amélioration » (projet Bugs d'appli, dans l'appli elle-même) : backlog de
  retours utilisateur à consulter en priorité à la reprise, avant de reproposer une liste —
  évite de resignaler des points déjà traités (ex. retour à la ligne des intitulés de tâche
  mobile, déjà fait, voir plus bas).

## Premiers ajustements d'usage (2026-09-27)
- Mobile : ouverture par défaut sur « projets » (le « fil » reste à repenser, voir plus bas).
- Export d'une liste de tâches en texte simple (bouton « copier », desktop + mobile) — pratique
  pour un projet « Bugs » à transmettre.
- Intitulés de tâche longs : retour à la ligne au lieu d'être tronqués.
- Volet 3 desktop : partie tâches élargie (rappel du lot capé à 300px, tâches absorbent le
  reste).
- Listes de projets compactées : lignes fines desktop ; mobile, voir plus haut (grille 3
  colonnes, remplace la liste à une colonne de cette session-ci).
- **Fourchettes de dates** : champ « début (optionnel) » à côté de l'échéance, sur lots et
  tâches (desktop + mobile). Le Gantt étire la barre entre les deux dates quand disponibles.
- **Récurrence des lots** (anniversaires, etc.) : sélecteur aucune/jour/semaine/mois/année ;
  un lot en retard bascule automatiquement sur sa prochaine occurrence et se rouvre (`lib/
  recurrence.ts`). Les tâches ne sont **pas** remises à zéro (choix explicite de l'utilisateur).
  Modèle : `Lot.startDate`, `Lot.repeat`, `Task.startDate` — migration
  `supabase/04_date_ranges_and_repeat.sql` **exécutée**.
- Usage prévu : projet « Anniversaires », un lot par personne (récurrence annuelle), les tâches
  du lot = organisation (cadeau, resto…), état non réinitialisé d'une année sur l'autre.
- Tout est commité et poussé (dernier commit `4ebf19b`), déployé et vérifié en ligne.

## Chantiers plus conséquents — à traiter dans une prochaine session dédiée
1. **Notifications** — possible techniquement (Web Push), mais demande un vrai backend :
   abonnements par appareil, clés VAPID, tâche planifiée côté serveur (ex. Edge Function
   Supabase + `pg_cron`) qui vérifie les échéances. Fonctionne bien sur Android ; sur iPhone
   seulement depuis iOS 16.4 et uniquement pour l'appli installée. Mis en veille faute de
   priorité claire — à rediscuter.
2. ~~Onglet mobile « Fil » à repenser~~ — fait le 2026-09-27, voir section dédiée plus haut.

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
  Zustand, backend **Supabase** (Postgres + Auth ; Realtime pas encore utilisé — voir
  « Prochaines étapes »).
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
  urgence avec repli/dépli par groupe et badge de projet par lot (voir section dédiée
  ci-dessus), grille des projets, projet ouvert (réglages : nom, palette, suppression en deux
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

## Pas encore fait
- Sync hors-ligne / cache IndexedDB / file d'attente de synchro (l'indicateur affiche
  « synchronisé » en permanence en attendant).
- Realtime multi-appareils (deux appareils ouverts en même temps ne se voient pas en direct ;
  il faut recharger).
- Voir aussi « Chantiers plus conséquents » en haut de ce fichier (notifications, onglet
  mobile « Fil »).

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
