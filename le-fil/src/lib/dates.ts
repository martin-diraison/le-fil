// Dates « jour » (sans heure) au format YYYY-MM-DD, toujours en heure locale.
// NB : ne jamais passer par toISOString() — il convertit en UTC et décale d'un jour
// en heure de Paris pour une date construite à minuit local.

export const MONTHS_LONG = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
];

/** En-tête du calendrier : lundi en premier. */
export const WEEK_HEAD = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

export function toDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDay(s: string): Date {
  return new Date(s + 'T00:00:00');
}

export function startOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function shiftDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Lundi de la semaine contenant `d`. */
export function mondayOf(d: Date): Date {
  return shiftDays(startOfDay(d), -((d.getDay() + 6) % 7));
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
