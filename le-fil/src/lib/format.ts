// Aides de formatage — fidèles au prototype (Grille 3 volets.dc.html).
import type { Urgency } from '../types/models';

export const MONTHS_SHORT = [
  'JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC',
];

export const DAYS_SHORT = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];

/** Nombre de jours entre aujourd'hui et une date YYYY-MM-DD (peut être négatif). */
export function daysUntil(due: string | null, today: Date = new Date()): number | null {
  if (!due) return null;
  const d = new Date(due + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

/** "5 OCT" */
export function formatShortDate(due: string | null): string {
  if (!due) return '';
  const d = new Date(due + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Colonne date d'une ligne de lot : "−N J" / "CE JOUR" / jour de semaine / "SANS DATE". */
export function dateSubLabel(due: string | null, urgency: Urgency): string {
  if (urgency === 'late') {
    const dd = daysUntil(due)!;
    return `−${Math.abs(dd)} J`;
  }
  if (urgency === 'today') return 'CE JOUR';
  if (!due) return 'SANS DATE';
  const d = new Date(due + 'T00:00:00');
  return DAYS_SHORT[d.getDay()];
}

/** Libellé de retard/échéance pour un bouton date ("retard NJ" / "5 OCT" / "+ date"). */
export function dueButtonLabel(due: string | null, placeholderWhenEmpty = '+ date'): string {
  if (!due) return placeholderWhenEmpty;
  const dd = daysUntil(due)!;
  if (dd < 0) return `retard ${Math.abs(dd)}J`;
  return formatShortDate(due);
}
