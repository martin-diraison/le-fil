// Bascule des lots récurrents (anniversaires, etc.) sur leur prochaine occurrence.
// Les tâches du lot ne sont pas touchées (choix explicite : leur état d'une année sur
// l'autre reste géré à la main, voir STATUS.md).
import type { Lot, Repeat } from '../types/models';

function addInterval(d: Date, repeat: Repeat): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  switch (repeat) {
    case 'daily':
      return new Date(y, m, day + 1);
    case 'weekly':
      return new Date(y, m, day + 7);
    case 'monthly':
      return new Date(y, m + 1, day);
    case 'yearly':
      return new Date(y + 1, m, day);
    default:
      return d;
  }
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Avance `due` jusqu'à la prochaine occurrence ≥ aujourd'hui (identité si `repeat` = 'none'). */
export function nextOccurrence(due: string, repeat: Repeat, today: Date = new Date()): string {
  if (repeat === 'none') return due;
  let d = new Date(due + 'T00:00:00');
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let guard = 0;
  while (d.getTime() < todayMidnight.getTime() && guard++ < 1000) {
    d = addInterval(d, repeat);
  }
  return toISO(d);
}

/**
 * Fait basculer les lots récurrents dont l'échéance est dépassée sur leur prochaine
 * occurrence, et les rouvre (`done: false`). Renvoie la même référence de tableau si rien
 * n'a changé, pour ne pas déclencher de synchro inutile.
 */
export function advanceRecurringLots(lots: Lot[], today: Date = new Date()): Lot[] {
  let changed = false;
  const next = lots.map((l) => {
    if (l.repeat === 'none' || !l.due) return l;
    const advanced = nextOccurrence(l.due, l.repeat, today);
    if (advanced === l.due) return l;
    changed = true;
    return { ...l, due: advanced, done: false };
  });
  return changed ? next : lots;
}
