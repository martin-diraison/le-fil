// Raccourcis d'échéance de tâche (desktop). Volontairement réduits à 3 (hier / aujourd'hui /
// cette semaine) — « bientôt » et « sans date » retirés à la demande de l'utilisateur : la date
// précise (champ « fin » à côté) couvre déjà ces cas, et « sans date » se fait en vidant ce champ.
// Le prototype MOBILE utilise ses propres raccourcis : voir MOBILE_DATE_CHOICES plus bas.
import { shiftDays, toDay } from '../lib/dates';

export const DATE_CHOICES = [
  { key: 'late', label: 'hier', offset: -1 },
  { key: 'today', label: "aujourd'hui", offset: 0 },
  { key: 'week', label: 'cette semaine', offset: 4 },
] as const;

export type DateChoiceKey = (typeof DATE_CHOICES)[number]['key'];

export function addDays(base: Date, days: number): string {
  return toDay(shiftDays(base, days));
}

export function dueFromChoice(key: DateChoiceKey, today: Date = new Date()): string | null {
  const choice = DATE_CHOICES.find((c) => c.key === key);
  if (!choice) return null;
  return addDays(today, choice.offset);
}

/** Raccourcis d'échéance du prototype mobile (constante DATE_CHOICES de « Le Fil - Mobile.dc.html »).
 * « sans date » retiré : se fait en vidant le champ date à côté. */
export const MOBILE_DATE_CHOICES = [
  { key: 'today', label: 'auj.', offset: 0 },
  { key: 'tom', label: 'demain', offset: 1 },
  { key: 'week', label: '+7 j', offset: 7 },
  { key: 'month', label: '+30 j', offset: 30 },
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
