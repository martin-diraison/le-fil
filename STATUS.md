# Le Fil — état d'avancement

Session mise en pause le 2026-09-23. Pour reprendre, il suffit de redemander à Claude Code
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
- Modèle de données TypeScript fidèle au README (`src/types/models.ts`).
- Palette de couleurs + contraste automatique (`src/lib/palette.ts`).

## Écarts documentés entre le README (texte) et le prototype (code réel)
Le code du prototype fait foi en cas de contradiction — deux cas trouvés et corrigés :
1. **Ordre d'urgence** : le README dit *« done › late › today › week › soon › none »*
   mais le code trie *late* en premier et *done* en dernier (cohérent avec les groupes
   du Fil mobile). Voir commentaire dans `src/types/models.ts`.
2. **Raccourcis d'échéance** : le README dit *« auj. / demain / +7j / +30j / sans date »*
   mais le code utilise *hier(-1) / aujourd'hui(0) / cette semaine(+4) / bientôt(+18) /
   sans date*. Voir `src/state/dateShortcuts.ts`.

## Pas encore fait
- Vues **Calendrier** et **Gantt** (desktop) — actuellement des placeholders dans
  `DesktopShell.tsx`.
- **Interface mobile** complète (onglets fil/projets/calendrier, écrans empilés) — voir
  README §4. `App.tsx` affiche pour l'instant le shell desktop à toutes les tailles.
- **Branchement Supabase réel** : il faut créer un projet Supabase (gratuit), renseigner
  `le-fil/.env.local` (copier `.env.example`), et écrire le schéma SQL (tables
  projects/lots/tasks + RLS) — pas encore fait.
- Sync hors-ligne / cache IndexedDB / file d'attente de synchro.
- Écran « réglages ▾ » du projet ouvert côté mobile, calendrier mobile, etc.

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
1. Vues Calendrier + Gantt desktop
2. Interface mobile
3. Branchement Supabase réel (compte à créer, schéma SQL, RLS)
