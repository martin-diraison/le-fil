// Export d'une liste de tâches en texte simple (ex. copier-coller les tâches d'un lot
// « Bugs » dans un message). Pas de format riche : une ligne par tâche, case à cocher ASCII.
import type { Lot, Task } from '../types/models';
import { daysUntil, formatShortDate } from './format';

function taskLine(t: Task): string {
  const box = t.done ? '[x]' : '[ ]';
  if (!t.due) return `${box} ${t.label}`;
  const dd = daysUntil(t.due)!;
  const when = dd < 0 ? `retard ${Math.abs(dd)} j` : formatShortDate(t.due);
  return `${box} ${t.label} (${when})`;
}

/** Titre du lot suivi d'une ligne par tâche, triées comme à l'écran. */
export function formatLotTasksAsText(lot: Lot, tasks: Task[]): string {
  return [lot.title, ...tasks.map(taskLine)].join('\n');
}

/** Écrit dans le presse-papiers ; renvoie false si l'API est indisponible/refusée. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
