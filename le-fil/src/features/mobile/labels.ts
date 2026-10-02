// Libellés du prototype mobile (« Le Fil - Mobile.dc.html » : lotMeta(), short()).
import type { Lot, Project, Task } from '../../types/models';
import { computeUrgency } from '../../types/models';
import { daysUntil, formatShortDate } from '../../lib/format';
import { NO_PROJECT_COLOR } from '../../lib/palette';

export function projectColor(projects: Project[], projectId: string | null): string {
  if (!projectId) return NO_PROJECT_COLOR;
  return projects.find((p) => p.id === projectId)?.color ?? NO_PROJECT_COLOR;
}

export function projectName(projects: Project[], projectId: string | null): string {
  if (!projectId) return 'sans projet';
  return projects.find((p) => p.id === projectId)?.name ?? 'sans projet';
}

/**
 * « 3 j de retard · Maison · 1/2 tâches » — `showProject: false` omet le projet
 * (utile quand il est déjà affiché ailleurs sur la ligne, ex. badge dans Le Fil).
 */
export function lotMeta(lot: Lot, projects: Project[], lotTasks: Task[], showProject = true): string {
  const u = computeUrgency(lot);
  const date =
    u === 'late'
      ? `${Math.abs(daysUntil(lot.due)!)} j de retard`
      : u === 'today'
        ? "aujourd'hui"
        : lot.due
          ? formatShortDate(lot.due)
          : 'sans date';
  const tasks = lotTasks.length ? ` · ${lotTasks.filter((t) => t.done).length}/${lotTasks.length} tâches` : '';
  const project = showProject ? ` · ${projectName(projects, lot.projectId)}` : '';
  return `${date}${project}${tasks}`;
}

/** Ligne de méta quand une tâche fait remonter le lot dans le Fil :
 * « tâche : Appeler le plombier · demain · 1/3 tâches ». */
export function taskFocusLabel(task: Task, lotTasks: Task[]): string {
  const d = daysUntil(task.due)!;
  const when = d < 0 ? `${-d} j de retard` : d === 0 ? "aujourd'hui" : d === 1 ? 'demain' : formatShortDate(task.due);
  const count = `${lotTasks.filter((t) => t.done).length}/${lotTasks.length} tâches`;
  return `tâche : ${task.label} · ${when} · ${count}`;
}

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', "l'", "d'", 'à', 'au', 'aux', 'et', 'en', 'pour', 'sur', 'avec',
]);

/**
 * Intitulé court des cases du calendrier mobile (README §4) : coupe au premier « — », « : », « ( »
 * ou « , », retire les mots vides, garde 2 mots, puis tronque à 10 caractères + « . ».
 */
export function shortLabel(title: string): string {
  let s = title.split(/ — | – | - |:|\(|,/)[0].trim();
  const words = s.split(/\s+/).filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  s = words.slice(0, 2).join(' ') || s;
  return s.length > 11 ? s.slice(0, 10).trimEnd() + '.' : s;
}
