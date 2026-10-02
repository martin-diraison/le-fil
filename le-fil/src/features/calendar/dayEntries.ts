import { taskMatchesSearch } from '../../state/store';
import type { Lot, Task } from '../../types/models';
import { isDayInRange } from '../../lib/dates';
import { contrastText } from '../../lib/palette';
import type { DayGridEntry } from '../../lib/dayGrid';

// Éléments d'un jour (lots et tâches) pour les grilles horaires desktop (vue jour, vue semaine) :
// avec heure → grille ; sans heure → bandeau « toute la journée ».

export type DayEntry = DayGridEntry & {
  label: string;
  color: string;
  done: boolean;
  lotId: string;
  kind: 'lot' | 'task';
};

export function buildDayEntries(opts: {
  day: string;
  lots: Lot[]; // lots visibles (déjà filtrés)
  tasks: Task[];
  showTasks: boolean;
  search: string;
  colorOf: (projectId: string | null) => string;
}): { timed: DayEntry[]; allDay: DayEntry[] } {
  const { day, lots, tasks, showTasks, search, colorOf } = opts;
  const timed: DayEntry[] = [];
  const allDay: DayEntry[] = [];
  for (const lot of lots) {
    if (!lot.due || !isDayInRange(lot.startDate, lot.due, day)) continue;
    (lot.startTime ? timed : allDay).push({
      id: lot.id,
      startTime: lot.startTime ?? '',
      endTime: lot.endTime,
      label: lot.title,
      color: colorOf(lot.projectId),
      done: lot.done,
      lotId: lot.id,
      kind: 'lot',
    });
  }
  if (showTasks) {
    for (const lot of lots) {
      for (const t of tasks) {
        if (t.lotId !== lot.id || !t.due || !isDayInRange(t.startDate, t.due, day)) continue;
        if (!taskMatchesSearch(lot, t, search)) continue;
        (t.startTime ? timed : allDay).push({
          id: t.id,
          startTime: t.startTime ?? '',
          endTime: t.endTime,
          label: t.label,
          color: colorOf(lot.projectId),
          done: t.done,
          lotId: lot.id,
          kind: 'task',
        });
      }
    }
  }
  return { timed, allDay };
}

/** Lot = bloc plein à la couleur du projet ; tâche = bloc clair, liseré épais à la couleur du projet. */
export function blockColors(e: DayEntry): { background: string; color: string; borderLeft?: string; borderColor?: string } {
  return e.kind === 'lot'
    ? { background: e.color, color: contrastText(e.color) }
    : { background: 'var(--paper)', color: 'var(--ink)', borderColor: e.color, borderLeft: `5px solid ${e.color}` };
}
