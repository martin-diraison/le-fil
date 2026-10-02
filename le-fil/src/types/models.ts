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

/** Récurrence d'une échéance de lot (anniversaires, tâches périodiques…). */
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Anciennement « note » dans le code des prototypes. */
export type Lot = {
  id: string;
  userId: string;
  projectId: string | null; // null = « sans projet »
  title: string;
  body: string; // texte libre
  startDate: string | null; // début de la fourchette (optionnel) — YYYY-MM-DD
  due: string | null; // échéance / fin de fourchette (jour, sans heure) — YYYY-MM-DD
  repeat: Repeat; // 'none' sauf échéance récurrente (voir lib/recurrence.ts)
  startTime: string | null; // heure de début (optionnelle) — HH:MM, rattachée au jour « due »
  endTime: string | null; // heure de fin (optionnelle) — HH:MM
  location: string; // lieu du rdv (texte libre, optionnel)
  done: boolean;
  position: number | null; // ordre manuel dans le volet 2 (tri « manuel »)
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type Task = {
  id: string;
  lotId: string;
  label: string;
  startDate: string | null; // début de la fourchette (optionnel) — YYYY-MM-DD
  due: string | null; // YYYY-MM-DD
  startTime: string | null; // heure de début (optionnelle) — HH:MM, rattachée au jour « due »
  endTime: string | null; // heure de fin (optionnelle) — HH:MM
  location: string; // lieu du rdv (texte libre, optionnel)
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
 * (retard · aujourd'hui · dans les 7 prochains jours · dans les 30 prochains jours · plus
 * tard · sans date · terminés).
 * On suit le code du prototype, qui fait foi en cas de contradiction avec le texte.
 * `week` = du lendemain à J+7 ; `month` = J+8 à J+30 ; `soon` = tout ce qui dépasse J+30 (pas
 * de plafond : un lot lointain reste visible sous « plus tard » plutôt que d'être caché,
 * décision utilisateur).
 */
export type Urgency = 'late' | 'today' | 'week' | 'month' | 'soon' | 'none' | 'done';

export function computeUrgency(lot: Pick<Lot, 'done' | 'due'>, today: Date = new Date()): Urgency {
  if (lot.done) return 'done';
  if (!lot.due) return 'none';
  const dueDate = new Date(lot.due + 'T00:00:00');
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((dueDate.getTime() - todayMidnight.getTime()) / 86_400_000);
  if (diffDays < 0) return 'late';
  if (diffDays === 0) return 'today';
  if (diffDays <= 7) return 'week';
  if (diffDays <= 30) return 'month';
  return 'soon';
}

const URGENCY_ORDER: Record<Urgency, number> = {
  late: 0,
  today: 1,
  week: 2,
  month: 3,
  soon: 4,
  none: 5,
  done: 6,
};

export function compareUrgency(a: Urgency, b: Urgency): number {
  return URGENCY_ORDER[a] - URGENCY_ORDER[b];
}

/**
 * Échéance « effective » d'un lot pour le Fil : la plus pressante entre la sienne et celle de ses
 * tâches ouvertes. `task` = la tâche qui fait remonter le lot (null si c'est l'échéance du lot).
 * Un lot sans date dont une tâche est due demain apparaît ainsi dans « 7 prochains jours ».
 */
export function lotFocus(lot: Lot, lotTasks: Task[]): { due: string | null; task: Task | null } {
  if (lot.done) return { due: lot.due, task: null };
  let task: Task | null = null;
  for (const t of lotTasks) {
    if (!t.done && t.due && (!task || t.due < task.due!)) task = t;
  }
  if (task && (!lot.due || task.due! < lot.due)) return { due: task.due, task };
  return { due: lot.due, task: null };
}

/** Lots terminés depuis plus de 30 jours : cachés des listes et du calendrier (rien n'est supprimé).
 * `updatedAt` sert de date de fin — « terminer » le met à jour. */
export const ARCHIVE_AFTER_DAYS = 30;
export function isArchived(lot: Pick<Lot, 'done' | 'updatedAt'>, now: Date = new Date()): boolean {
  return lot.done && now.getTime() - new Date(lot.updatedAt).getTime() > ARCHIVE_AFTER_DAYS * 86_400_000;
}
