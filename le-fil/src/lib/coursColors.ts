// Couleurs des éléments importés de l'app de cours : code couleur des semestres de cette app
// (SEMESTER_COLORS dans son app.js : S1 bleu, S2 ambre, S3 rouge, S4 vert). Le semestre est porté
// par le source_id (`cours:<sorte>:<promo>.<semestre>:<id>`, voir lib/cours.ts) ; ce qui concerne
// les deux classes (et les réunions) est gris. La synchro Google applique la même logique avec
// ses propres couleurs (fonction gcal, SEMESTER_GCOLOR).
import { NO_PROJECT_COLOR } from './palette';

export const SEMESTER_HEX: Record<string, string> = {
  S1: '#3a6ea5',
  S2: '#c08a12',
  S3: '#b0423f',
  S4: '#41874f',
};

/** Couleur d'un élément importé (null si ce n'est pas un élément de l'app de cours). */
export function coursColor(sourceId: string | null | undefined): string | null {
  const m = /^cours:[a-z]+:([^:]+):/.exec(sourceId ?? '');
  if (!m) return null;
  const sem = /\.(S[1-4])$/.exec(m[1]);
  return sem ? SEMESTER_HEX[sem[1]] : NO_PROJECT_COLOR;
}

/** Couleur d'une tâche ou d'un lot : celle du semestre pour les cours, sinon celle du projet. */
export function itemColor(projectColor: string, item: { sourceId?: string | null }): string {
  return coursColor(item.sourceId) ?? projectColor;
}

/** Lot de classe (GPN1, GPN2…) : couleur du semestre de sa prochaine séance (`focusTask`). */
export function lotColor(
  projectColor: string,
  lot: { sourceId?: string | null },
  focusTask?: { sourceId?: string | null } | null,
): string {
  if (!lot.sourceId?.startsWith('cours:')) return projectColor;
  return coursColor(focusTask?.sourceId) ?? coursColor(lot.sourceId) ?? projectColor;
}
