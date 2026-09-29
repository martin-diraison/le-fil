// Positionnement des lots/tâches horodatés sur une grille journalière de 24h (vue journalière
// façon agenda), avec répartition en colonnes pour les chevauchements.

export type DayGridEntry = {
  id: string;
  startTime: string; // HH:MM
  endTime: string | null;
};

export type PositionedEntry<T> = T & {
  topPct: number;
  heightPct: number;
  col: number;
  cols: number;
};

const DEFAULT_DURATION_MIN = 30; // quand une fin n'est pas renseignée
const MIN_DURATION_MIN = 10; // évite une fin ≤ début si l'utilisateur saisit une fin absurde

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Positionne des entrées horaires sur une grille 24h (0–1440 min) en pourcentage
 * (`topPct`/`heightPct`), avec répartition en colonnes (`col`/`cols`) pour les entrées qui se
 * chevauchent — algorithme glouton classique : on regroupe d'abord les entrées en « clusters »
 * d'événements liés par chevauchement en chaîne, puis dans chaque cluster on attribue à chaque
 * entrée la première colonne libre.
 */
export function layoutDayGrid<T extends DayGridEntry>(entries: T[]): PositionedEntry<T>[] {
  type Timed = { e: T; start: number; end: number };
  const withMinutes: Timed[] = entries
    .map((e) => {
      const start = toMinutes(e.startTime);
      const end = e.endTime ? Math.max(toMinutes(e.endTime), start + MIN_DURATION_MIN) : start + DEFAULT_DURATION_MIN;
      return { e, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const clusters: Timed[][] = [];
  let current: Timed[] = [];
  let clusterEnd = -1;
  for (const item of withMinutes) {
    if (current.length && item.start >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -1;
    }
    current.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (current.length) clusters.push(current);

  const out: PositionedEntry<T>[] = [];
  for (const cluster of clusters) {
    const colEnds: number[] = []; // fin courante de chaque colonne déjà attribuée
    const assigned: { item: Timed; col: number }[] = [];
    for (const item of cluster) {
      let col = colEnds.findIndex((end) => end <= item.start);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(item.end);
      } else {
        colEnds[col] = item.end;
      }
      assigned.push({ item, col });
    }
    const cols = colEnds.length;
    for (const { item, col } of assigned) {
      out.push({
        ...item.e,
        topPct: (item.start / 1440) * 100,
        heightPct: ((item.end - item.start) / 1440) * 100,
        col,
        cols,
      });
    }
  }
  return out;
}

export const DAY_GRID_HOURS = Array.from({ length: 24 }, (_, h) => h);
