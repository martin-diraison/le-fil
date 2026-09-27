// Raccourcis d'échéance (lot et tâche).
// NB : le README §3.4/§4 décrit ces raccourcis en texte comme « auj. / demain / +7 j / +30 j / sans date »,
// mais la logique réelle du prototype (constante DATE_CHOICES, Grille 3 volets.dc.html ~L512) utilise
// des libellés et décalages différents : hier(-1) / aujourd'hui(0) / cette semaine(+4) / bientôt(+18) / sans date.
// On suit le code, qui fait foi (voir aussi la note dans src/types/models.ts sur l'ordre d'urgence).
// Le prototype MOBILE, lui, utilise bien les raccourcis du README : voir MOBILE_DATE_CHOICES plus bas.
import { shiftDays, toDay } from '../lib/dates';

export const DATE_CHOICES = [
  { key: 'late', label: 'hier', offset: -1 },
  { key: 'today', label: "aujourd'hui", offset: 0 },
  { key: 'week', label: 'cette semaine', offset: 4 },
  { key: 'soon', label: 'bientôt', offset: 18 },
  { key: 'none', label: 'sans date', offset: null },
] as const;

export type DateChoiceKey = (typeof DATE_CHOICES)[number]['key'];

export function addDays(base: Date, days: number): string {
  return toDay(shiftDays(base, days));
}

export function dueFromChoice(key: DateChoiceKey, today: Date = new Date()): string | null {
  const choice = DATE_CHOICES.find((c) => c.key === key);
  if (!choice || choice.offset === null) return null;
  return addDays(today, choice.offset);
}

/** Raccourcis d'échéance du prototype mobile (constante DATE_CHOICES de « Le Fil - Mobile.dc.html »). */
export const MOBILE_DATE_CHOICES = [
  { key: 'today', label: 'auj.', offset: 0 },
  { key: 'tom', label: 'demain', offset: 1 },
  { key: 'week', label: '+7 j', offset: 7 },
  { key: 'month', label: '+30 j', offset: 30 },
  { key: 'none', label: 'sans date', offset: null },
] as const;

export function dueFromOffset(offset: number | null, today: Date = new Date()): string | null {
  return offset === null ? null : addDays(today, offset);
}

/** Choix de récurrence pour un lot (échéance requise, voir lib/recurrence.ts). */
export const REPEAT_CHOICES = [
  { key: 'none', label: 'aucune' },
  { key: 'daily', label: 'jour' },
  { key: 'weekly', label: 'semaine' },
  { key: 'monthly', label: 'mois' },
  { key: 'yearly', label: 'année' },
] as const;
