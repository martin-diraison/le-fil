// Raccourcis d'échéance (lot et tâche).
// NB : le README §3.4/§4 décrit ces raccourcis en texte comme « auj. / demain / +7 j / +30 j / sans date »,
// mais la logique réelle du prototype (constante DATE_CHOICES, Grille 3 volets.dc.html ~L512) utilise
// des libellés et décalages différents : hier(-1) / aujourd'hui(0) / cette semaine(+4) / bientôt(+18) / sans date.
// On suit le code, qui fait foi (voir aussi la note dans src/types/models.ts sur l'ordre d'urgence).
export const DATE_CHOICES = [
  { key: 'late', label: 'hier', offset: -1 },
  { key: 'today', label: "aujourd'hui", offset: 0 },
  { key: 'week', label: 'cette semaine', offset: 4 },
  { key: 'soon', label: 'bientôt', offset: 18 },
  { key: 'none', label: 'sans date', offset: null },
] as const;

export type DateChoiceKey = (typeof DATE_CHOICES)[number]['key'];

export function addDays(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dueFromChoice(key: DateChoiceKey, today: Date = new Date()): string | null {
  const choice = DATE_CHOICES.find((c) => c.key === key);
  if (!choice || choice.offset === null) return null;
  return addDays(today, choice.offset);
}
