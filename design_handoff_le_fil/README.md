# Transmission : Le Fil — gestionnaire de projets personnels

## Vue d'ensemble
Le Fil est un outil personnel d'organisation à trois niveaux : **Projets › Lots › Tâches**. Il existe en deux formats qui partagent les mêmes données :
- **Desktop** : trois volets (projets · lots · lot ouvert) et trois vues (Liste, Calendrier, Gantt).
- **Mobile** : navigation par onglets (Fil · Projets · Calendrier) et écrans empilés.

Il y a un compte e-mail + mot de passe et une synchronisation entre appareils.

## À propos des fichiers
Les fichiers `.dc.html` de ce dossier sont des **références de design réalisées en HTML** : des prototypes qui montrent l'apparence et le comportement attendus, **pas du code de production à reprendre tel quel**. La tâche consiste à **recréer ces écrans dans l'environnement cible** en suivant ses conventions. Si rien n'existe encore, choisir une pile adaptée. Suggestion : une application web responsive (React + TypeScript), une API et une base (Postgres), une PWA pour le mobile.

Pour ouvrir les prototypes, servir le dossier en local (`support.js` doit être à côté des fichiers) et ouvrir chaque `.dc.html` dans un navigateur.

## Fidélité
**Haute fidélité.** Couleurs, typographie, grille, filets et interactions sont définitifs. Reproduire au pixel près.

---

## 1. Modèle de données

```ts
type User    = { id: string; email: string; passwordHash: string; createdAt: Date };

type Project = {
  id: string; userId: string;
  name: string;
  color: string;        // hex, choisi dans la palette (§5)
  position: number;     // ordre manuel (glisser-déposer)
};

type Lot = {            // anciennement « note » dans le code des prototypes
  id: string; userId: string;
  projectId: string | null;   // null = « sans projet »
  title: string;
  body: string;               // texte libre
  due: Date | null;           // échéance (jour, sans heure)
  done: boolean;
  position: number | null;    // ordre manuel dans le volet 2 (tri « manuel »)
  createdAt: Date; updatedAt: Date;
};

type Task = {
  id: string; lotId: string;
  label: string;
  due: Date | null;
  done: boolean;
  position: number;
};

type UserPrefs = {      // état d'interface à persister par utilisateur
  selectedProjects: string[];         // sélection du menu gauche (desktop)
  view: 'liste' | 'cal' | 'gantt';
  sort: 'urgence' | 'récent' | 'manuel';
  calMode: 'mois' | 'semaine';
  showTasksInGantt: boolean;
  showTasksInCalendar: boolean;
};
```

### Règles métier
- **Urgence d'un lot** (calculée, jamais stockée) : `done` › `late` (échéance passée) › `today` › `week` (≤ 6 jours) › `soon` › `none` (sans date). Le tri « urgence » suit cet ordre, puis la date d'échéance.
- **Supprimer un projet** : ses lots passent en « sans projet » (`projectId = null`), ils ne sont **jamais supprimés en cascade**. La couleur est libérée.
- **Nouveau projet** : on lui attribue la première couleur de la ligne « vifs + pastels » de la palette qui n'est pas déjà utilisée.
- **Nouveau lot** : il est créé dans le projet sélectionné. Sur desktop, si plusieurs projets sont sélectionnés, il va dans le premier. Le nouveau lot s'ouvre aussitôt.
- **Glisser un lot** dans le volet 2 fait passer le tri en `manuel` et réécrit les `position`.
- **Glisser un lot ou une tâche** dans le calendrier remplace son `due` par le jour de dépôt.
- La recherche porte sur le titre et le corps des lots et sur le libellé des tâches. Dans le Gantt et le calendrier, une tâche reste visible si son lot correspond ou si son propre libellé correspond.

---

## 2. Authentification et synchronisation (à construire côté serveur)

**Ce qui est simulé dans les prototypes** : les comptes sont en `localStorage` (`lefil.auth.v1`), le mot de passe n'y est protégé que par un brouillage simple (hash djb2, pas un vrai hachage), la synchronisation est un simple délai et l'e-mail de réinitialisation n'est pas envoyé. **Rien de cela ne doit partir en production.**

À implémenter :
- **Inscription** : e-mail valide, mot de passe de **8 caractères minimum**, confirmation identique. Erreur si l'adresse est déjà utilisée.
- **Connexion** : e-mail + mot de passe. Message d'erreur unique : « e-mail ou mot de passe incorrect », sans révéler si le compte existe.
- **Mot de passe oublié** : envoi d'un lien à usage unique valable **30 min**. L'écran de confirmation s'affiche même si l'adresse est inconnue.
- **Changer le mot de passe** (écran Compte) : mot de passe actuel + nouveau + confirmation.
- **Hachage** : argon2id ou bcrypt. Sessions par cookie httpOnly ou jeton de rafraîchissement. Limiter le nombre de tentatives de connexion.
- **Appareils connectés** : une liste des sessions (appareil · navigateur · dernière activité) et une action « déconnecter les autres appareils ».
- **Export** : télécharger un JSON des projets (avec leur couleur), de l'ordre, des lots et des tâches, avec les dates au format `YYYY-MM-DD`.
- **Synchronisation** : le client garde une copie locale (IndexedDB), fonctionne hors ligne et renvoie les modifications en file d'attente au retour du réseau. En cas de conflit, la dernière écriture l'emporte, champ par champ.
- **Indicateur de synchro** (toujours visible une fois connecté) :
  - vert `#2f6f5e` : « synchronisé » ;
  - jaune `#f2c015` : « synchronisation… » ;
  - rouge `#e8402a` : « hors ligne · N en attente ».

---

## 3. Écrans — Desktop (`Le Fil - Grille 3 volets.dc.html`, conçu pour 1440 × 900)

### 3.0 Connexion
- **Mise en page** : deux colonnes.
  - À gauche (flex 1), un panneau encre `#0a0a0a` avec « LE FIL » en haut, l'accroche « Projets, / lots, / tâches. » (Archivo 800, `clamp(40px, 6vw, 76px)`, interligne .95, espacement -0.045em), une bande de 8 carrés de couleur (27 × 9 px, écart 3 px) et, en bas, la mention « un seul compte · tous tes écrans ».
  - À droite, un formulaire de 460 px séparé par un filet de 1 px.
- **Modes** : `login`, `signup`, `forgot` et `sent` (écran « Vérifie ta boîte »).
- **Champs** : hauteur 40 px, bord 1 px encre, sans arrondi. Au focus, le fond passe en `#fdf4d6`. Le mot de passe a un bouton accolé « afficher / masquer ».
- **Erreur** : bandeau `#e8402a` en texte clair majuscule.
- **Bouton principal** : pleine largeur, 44 px, fond encre ; au survol, fond jaune et texte encre.
- La touche Entrée valide le formulaire.

### 3.1 Structure générale
- `[menu gauche 232 px] | [volet principal flexible] | [volet 3 : lot ouvert]`, séparés par des filets encre de 1 px.
- Le volet 3 n'existe **que si un lot est ouvert**. En vue Liste, il se partage l'espace avec le volet 2 (`flex: 1 1 0`). En Calendrier et en Gantt, c'est un tiroir latéral de 336 px, refermable par ✕.
- Cliquer sur une entrée du calendrier ou du Gantt ouvre ou referme le volet 3 **sans changer de vue**. En repassant en Liste avec un lot ouvert, son projet est ajouté à la sélection.

### 3.2 Menu gauche (projets)
- **En-tête** : « LE FIL », la date du jour et le lien « réinit. » (propre à la démo, à retirer en production).
- **Recherche** « CHERCHER », puis la bascule de vue (liste / calendrier / gantt) et le filtre « retard N ».
- **Liste des projets** :
  - **Fond** : chaque ligne a en permanence la couleur du projet, avec un texte en contraste automatique (§5).
  - **Sélection** : trois signaux, un liseré intérieur de 4 px dans la couleur de contraste, une case pleine avec « × » et le nom en 800 (600 sinon).
  - **Réglages** : le chevron ▾ à droite ouvre un panneau avec le champ de nom (renommer), une palette de 28 teintes en grille de 8 colonnes (pastilles de 18 px, la teinte active cerclée de 2 px encre) et le bouton « supprimer ». La suppression demande un second clic de confirmation (« confirmer ✕ » sur fond rouge).
  - **Ordre** : glisser-déposer. Pendant le glissement, la ligne passe à une opacité de .35 et un trait encre de 3 px signale le point de dépôt.
  - **Sans sélection** : Calendrier et Gantt montrent **tous** les projets. La Liste demande une sélection.
- **Pied du menu** :
  - le champ « + NOUVEAU PROJET » (Entrée pour créer) ;
  - « tout désélectionner » quand une sélection existe ;
  - la ligne de synchro (carré de 7 px + libellé + « compte »). Un clic ouvre : l'e-mail, « compte & sécurité », « simuler hors ligne » (démo uniquement) et « se déconnecter ».

### 3.3 Vue Liste — volet 2 (lots)
- **En-tête** : le nom de la sélection, le nombre de lots et le bouton de tri qui passe en boucle de « tri · urgence » à « tri · récent » puis « tri · manuel ».
- **Création** : champ en haut du volet, Entrée pour créer.
- **Ligne de lot** :
  - **Liseré** : 7 px dans la couleur du projet.
  - **Colonne date** (64 px) : la date en 800 et la ligne d'état (−N J, CE JOUR, jour de la semaine, SANS DATE). En cas de retard, fond rouge.
  - **Texte** : le titre, puis une méta avec le nom du projet **écrit dans sa couleur** et le compte de tâches.
  - **Survol** : `#f1f1ec`. Lot sélectionné : titre en 800.
  - **Ordre** : glisser-déposer (le tri passe en manuel).

### 3.4 Volet 3 — lot ouvert (fond encre)
- **Haut** : une bande de 8 px dans la couleur du projet, puis l'en-tête.
- **En-tête** : projet · échéance (le texte se coupe avec des points de suspension), puis les boutons **⋯**, **terminer** et **✕**, qui ne rétrécissent jamais. **⋯** ouvre une rangée « déplacer vers » (pastilles des projets) et le bouton « supprimer » (confirmation en deux temps).
- **Corps** :
  - titre éditable (Archivo 800, 24 px) ;
  - texte éditable qui s'agrandit automatiquement (15 px / 1.6, largeur max 66ch) ;
  - raccourcis d'échéance : `auj.`, `demain`, `+7 j`, `+30 j`, `sans date`.
- **Colonne tâches** :
  - **Repères** : bordure gauche de 4 px et pastille de 10 px, toutes deux dans la couleur du projet.
  - **Ligne** : case à cocher et libellé, avec à droite un bouton date (« + date » si elle est vide, « retard NJ » en rouge). Ce bouton ouvre les raccourcis d'échéance et « supprimer ».
  - **Ajout** : champ « + AJOUTER UNE TÂCHE ».

### 3.5 Vue Calendrier
- **Barre d'outils** (passe à la ligne si la place manque) : ‹ titre ›, l'aide « clic = ouvrir · glisser = changer la date », la bascule `mois / semaine` et « tâches ✓ / – ».
- **Grille** : lundi en premier. Jour hors mois : `#f4f4ef`. Aujourd'hui : fond `#fdf4d6` et numéro rouge suivi de ●.
- **Mois** : 5 ou 6 rangées. **Semaine** : 7 colonnes sur toute la hauteur, intitulés plus grands, en-tête de case « 5 OCT ».
- **Entrées** :
  - **Lot** : sur fond de couleur du projet, texte en contraste, bord gauche de 3 px (rouge en cas de retard). Lot ouvert : fond jaune.
  - **Tâche** : « ↳ libellé », fond papier, plus petite, bord gauche dans la couleur du projet.
- **Glisser-déposer** : l'entrée glissée passe à une opacité de .35. La case visée passe en `#fdf4d6` avec un contour intérieur encre de 2 px.

### 3.6 Vue Gantt
- **Structure** : une colonne de libellés de 148 px, puis une frise horizontale.
- **Rangées** : une rangée d'en-tête par projet (pastille de 8 px + nom en majuscules), puis une rangée par lot avec une barre de 12 px dans la couleur du projet (grise si le lot est terminé).
- **Tâches datées** : sous-rangées indentées de 26 px, barre de 7 px (rouge en cas de retard). Bouton « tâches ✓ / – » dans l'en-tête.

### 3.7 Compte & sécurité
Tiroir de droite de 420 px, sur un fond assombri (`rgba(10,10,10,.45)`), avec un en-tête encre. Sections, séparées par des filets encre :
1. **Adresse e-mail**, avec les compteurs projets · lots · tâches.
2. **Changer le mot de passe** : champs « actuel », « nouveau » et « confirmer », bouton « enregistrer ». Message de succès sur fond `#2f6f5e`, erreur sur fond rouge.
3. **Appareils connectés** : l'appareil courant (« Mac · Chrome — cet appareil ») et « déconnecter les autres appareils ».
4. **Données** : « exporter mes données » (JSON).
5. **Se déconnecter** (bouton rouge au trait).

---

## 4. Écrans — Mobile (`Le Fil - Mobile.dc.html`, 390 × 844)

- **Barre d'état** : l'heure et la date, puis à droite le bouton de synchro (carré + libellé court). Un tap ouvre un tiroir : e-mail, **compte**, simuler hors ligne, se déconnecter.
- **Onglets** (en bas, 3 × 1/3) : **fil**, **projets**, **calendrier**. L'onglet actif est sur fond encre.
- **Connexion** : un bloc encre (« LE FIL », l'accroche en 40 px, la bande de couleurs), puis le formulaire. Mêmes règles que sur desktop, avec des champs de 46 px.
- **Fil** :
  - **Groupes** : en retard (titre rouge), aujourd'hui, cette semaine, plus tard, sans date, terminés.
  - **Ligne** : liseré de 7 px + case de 46 px (terminer) + titre et méta.
  - **Filtres et ajout** : filtre « retard N » en haut, champ « NOUVEAU LOT… » en bas.
- **Projets** : une grille de **pavés colorés sur 2 colonnes** séparés par des filets encre de 1 px, de 108 px de haut minimum. Chaque pavé ne montre que le nom et le nombre de lots (27 px, 800). Un pavé « sans projet » sur fond `#f1f1ec` termine la grille, puis le champ « NOUVEAU PROJET… ».
- **Projet ouvert** :
  - **En haut** : barre « ← projets » et « réglages ▾ » (renommer, palette de 28 teintes en pastilles de 26 px, supprimer en deux temps).
  - **En-tête** : sur la couleur du projet, avec le nom, le nombre de lots et le nombre de retards.
  - **Lots** : colonne date de 66 px et liseré. Champ « NOUVEAU LOT DANS X… » en bas.
- **Lot ouvert** :
  - **Haut** : bande de 9 px dans la couleur du projet, puis un bloc encre avec le titre éditable, le projet et l'échéance.
  - **Corps** : texte, puis raccourcis d'échéance.
  - **Tâches** : case de 19 px, bouton date, et un menu qui propose des dates et « supprimer ». Champ « + AJOUTER UNE TÂCHE ».
  - **« Déplacer vers… »** : **replié par défaut** (fonction peu utilisée).
  - **Pied** : « terminer le lot » et « +1 j ».
  - **Retour** : « ← projet », « ← le fil » ou « ← calendrier » selon l'écran d'origine.
- **Calendrier** :
  - **Barre d'outils** : ‹ mois ›, puis « tâches » et ↓ / ↑ (agrandir les cases).
  - **Cases** : 74 px de haut minimum, 112 px une fois agrandies. Elles affichent jusqu'à 3 intitulés courts (8 une fois agrandies), puis « +N ».
  - **Intitulés courts** : on coupe au premier « — », « : », « ( » ou « , » ; on retire les mots vides (le, la, les, de, des, du, un, une, l', d', à, au, aux, et, en, pour, sur, avec) ; on garde 2 mots, puis on tronque à 10 caractères suivis d'un point.
  - **Défilement** : le calendrier s'allonge vers le bas et défile avec la liste du jour sélectionné, qui montre les lots puis les tâches.
- **Compte** : les mêmes sections que sur desktop, en pleine page, avec « ← retour ».

---

## 5. Tokens de design

### Couleurs d'interface
| rôle | hex |
|---|---|
| encre (texte, filets principaux, fonds sombres) | `#0a0a0a` |
| papier (fond) | `#fbfbf9` |
| fond secondaire / survol | `#f1f1ec` |
| hors mois | `#f4f4ef` |
| filet secondaire | `#e0e0d9` |
| bord discret | `#cfcfc8` |
| texte secondaire | `#6b6b66` |
| texte tertiaire | `#9c9c98` |
| texte sur encre (secondaire) | `#c9c9c4`, `#e4e4e0` |
| filet sur encre | `#3a3a38` |
| **rouge (retard, erreur, suppression)** | `#e8402a` |
| **jaune (sélection, survol, focus)** | `#f2c015` |
| jaune pâle (aujourd'hui, focus de champ, cible de dépôt) | `#fdf4d6` |
| vert (synchronisé, succès) | `#2f6f5e` |

### Palette des projets (28 teintes, grille de 8 colonnes)
- **Profonds** : `#8f1d10` brique · `#9a5a10` ambre foncé · `#7a6a12` olive · `#1f5140` sapin · `#14555f` sarcelle foncé · `#1e3a7a` outremer · `#4d2f73` aubergine · `#6e2f52` prune.
- **Vifs** : `#e8402a` rouge · `#e07f23` orange · `#f2c015` jaune · `#2f6f5e` vert · `#2a8a97` sarcelle · `#2f4f9e` bleu · `#7a4fa3` violet · `#b0466f` framboise.
- **Pastels** : `#f3a79b` rose pâle · `#f5c48f` abricot · `#f7e08a` paille · `#9fc9ba` menthe · `#9fd0d8` ciel · `#a3b4e2` bleu pâle · `#c3aada` lilas · `#e8adc1` dragée.
- **Neutres** : `#0a0a0a` encre · `#4a4a46` ardoise · `#8a6a3a` brun · `#9c9c98` gris (également la couleur de « sans projet »).

**Contraste automatique** : luminance `0.299 R + 0.587 G + 0.114 B`. Au-dessus de 150, texte encre ; sinon, texte papier.

### Où apparaît la couleur du projet
- **Aplat** : ligne du menu gauche, pavé mobile, en-tête du projet ouvert (mobile), entrée de lot dans le calendrier.
- **Liseré de 7 px** : lignes de lot (desktop et mobile).
- **Bande** : 8 px en haut du volet 3, 9 px en haut du lot mobile.
- **Bordure de 4 à 5 px et pastille de 10 px** : en-tête des tâches.
- **Texte** : nom du projet dans la méta d'un lot.
- **Barres** : Gantt, 12 px pour un lot et 7 px pour une tâche.

### Typographie
- **Archivo** (400, 500, 600, 800) pour l'interface ; **Archivo Narrow** (400, 600) pour les titres de lots, les tâches et les noms de projets.
- **Libellés d'interface** : MAJUSCULES, 8 à 10 px, graisse 600 ou 800, espacement de .12 à .2em.
- **Tailles** :
  - titre du lot ouvert : 24 px, 800, -0.028em ;
  - titre de lot en liste : 13,5 à 15 px ;
  - corps : 14 à 15 px, interligne 1.5 à 1.6 ;
  - compteurs de pavé : 26 à 27 px, 800, -0.02em.

### Grille et forme
- **Formes** : aucun arrondi et aucune ombre. Les éléments sont séparés par des filets de 1 px, encre pour la structure, `#e0e0d9` à l'intérieur des listes.
- **Espacements courants** :
  - marges intérieures de 7 à 14 px ;
  - lignes de 7 à 12 px de marge verticale ;
  - zones tactiles d'au moins 44 px sur mobile.
- **Transitions** : fond seulement, `.12s linear`. Pas d'autre animation.

### Confirmations et retours
- **Actions destructives** (supprimer un projet, un lot, réinitialiser) : confirmation en deux temps. Le premier clic change le libellé (« confirmer ✕ ») et passe le fond en rouge ; le second clic exécute.
- **Toast** : en bas, fond encre, texte papier majuscule. Il disparaît après environ 2 s.

---

## 6. Stockage local actuel (prototypes)
- `lefil.grille3.v1` : données et préférences, **partagées par les deux prototypes**.
- `lefil.auth.v1` : `{ accounts: { email: hash }, session: email | null }`.

En production, remplacer ces deux clés par l'API et un cache IndexedDB propre à chaque utilisateur.

## Fichiers
- `Le Fil - Grille 3 volets.dc.html` : prototype desktop (toute la logique est dans la classe `Component`).
- `Le Fil - Mobile.dc.html` : prototype mobile.
- `support.js` : le moteur d'exécution des prototypes, nécessaire uniquement pour les ouvrir. Il ne sert pas à l'implémentation.
