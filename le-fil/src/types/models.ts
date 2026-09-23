// Le Fil — modèle de données
// Source : design_handoff_le_fil/README.md §1

export type User = {
  id: string;
  email: string;
  createdAt: string; // ISO
};

export type Project = {
  id: string;
  userId: string;
  name: string;
  color: string; // hex, choisi dans la palette (voir src/lib/palette.ts)
  position: number; // ordre manuel (glisser-déposer)
};

/** Anciennement « note » dans le code des prototypes. */
export type Lot = {
  id: string;
  userId: string;
  projectId: string | null; // null = « sans projet »
  title: string;
  body: string; // texte libre
  due: string | null; // échéance (jour, sans heure) — YYYY-MM-DD
  done: boolean;
  position: number | null; // ordre manuel dans le volet 2 (tri « manuel »)
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type Task = {
  id: string;
  lotId: string;
  label: string;
  due: string | null; // YYYY-MM-DD
  done: boolean;
  position: number;
};

export type SortMode = 'urgence' | 'récent' | 'manuel';
export type ViewMode = 'liste' | 'cal' | 'gantt';
export type CalMode = 'mois' | 'semaine';

/** État d'interface à persister par utilisateur. */
export type UserPrefs = {
  selectedProjects: string[]; // sélection du menu gauche (desktop)
  view: ViewMode;
  sort: SortMode;
  calMode: CalMode;
  showTasksInGantt: boolean;
  showTasksInCalendar: boolean;
};

/**
 * Urgence d'un lot — calculée, jamais stockée.
 * NB : le README §1 liste l'ordre en texte comme « done › late › today › week › soon › none »,
 * mais la logique réelle du prototype (Grille 3 volets, `urgency()`/`sorted()`) classe
 * `late` en premier et `done` en dernier — cohérent avec les groupes du Fil mobile
 * (retard · aujourd'hui · cette semaine · plus tard · sans date · terminés).
 * On suit le code du prototype, qui fait foi en cas de contradiction avec le texte.
 */
export type Urgency = 'late' | 'today' | 'week' | 'soon' | 'none' | 'done';

export function computeUrgency(lot: Pick<Lot, 'done' | 'due'>, today: Date = new Date()): Urgency {
  if (lot.done) return 'done';
  if (!lot.due) return 'none';
  const dueDate = new Date(lot.due + 'T00:00:00');
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((dueDate.getTime() - todayMidnight.getTime()) / 86_400_000);
  if (diffDays < 0) return 'late';
  if (diffDays === 0) return 'today';
  if (diffDays <= 6) return 'week';
  return 'soon';
}

const URGENCY_ORDER: Record<Urgency, number> = {
  late: 0,
  today: 1,
  week: 2,
  soon: 3,
  none: 4,
  done: 5,
};

export function compareUrgency(a: Urgency, b: Urgency): number {
  return URGENCY_ORDER[a] - URGENCY_ORDER[b];
}
