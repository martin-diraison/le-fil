// Urgence « effective » des lots, partagée par le Fil (mobile) et la Liste (desktop) : l'échéance
// d'un lot tient compte de ses tâches datées ouvertes (`lotFocus`), la plus pressante fait
// remonter le lot.
import { compareUrgency, computeUrgency, lotFocus, type Lot, type Task, type Urgency } from '../types/models';

export type LotFocusInfo = { urgency: Urgency; due: string | null; task: Task | null; tasks: Task[] };

export const URGENCY_GROUPS: { key: Urgency; label: string; tone?: 'late' | 'muted' }[] = [
  { key: 'late', label: 'en retard', tone: 'late' },
  { key: 'today', label: "aujourd'hui" },
  { key: 'week', label: 'dans les 7 prochains jours' },
  { key: 'month', label: 'dans les 30 prochains jours' },
  { key: 'soon', label: 'plus tard' },
  { key: 'none', label: 'sans date', tone: 'muted' },
  { key: 'done', label: 'terminés', tone: 'muted' },
];

/** Urgence effective + tâche qui fait remonter le lot, calculées une fois par lot. */
export function focusByLot(lots: Lot[], tasks: Task[]): Map<string, LotFocusInfo> {
  const byLot = new Map<string, Task[]>();
  for (const t of tasks) {
    const list = byLot.get(t.lotId);
    if (list) list.push(t);
    else byLot.set(t.lotId, [t]);
  }
  const m = new Map<string, LotFocusInfo>();
  for (const l of lots) {
    const lt = byLot.get(l.id) ?? [];
    const f = lotFocus(l, lt);
    m.set(l.id, { ...f, urgency: computeUrgency({ done: l.done, due: f.due }), tasks: lt });
  }
  return m;
}

/** Tri par urgence effective puis échéance la plus proche. */
export function byFocus(focus: Map<string, LotFocusInfo>) {
  return (a: Lot, b: Lot) => {
    const fa = focus.get(a.id)!;
    const fb = focus.get(b.id)!;
    return compareUrgency(fa.urgency, fb.urgency) || (fa.due ?? '').localeCompare(fb.due ?? '');
  };
}
