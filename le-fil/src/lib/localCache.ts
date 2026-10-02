import type { CalMode, Lot, Project, SortMode, Task, ViewMode } from '../types/models';

// Copie locale (localStorage) pour le hors ligne et le démarrage instantané :
// - les données du compte (projets, lots, tâches, préférences), réécrites après chaque changement ;
// - la file des modifications pas encore envoyées à Supabase, pour qu'elles survivent à la
//   fermeture de l'appli hors ligne ;
// - le dernier compte connecté, pour rouvrir l'appli hors ligne quand le jeton a expiré.
// Tout est rangé par identifiant de compte. localStorage peut être plein ou bloqué : chaque
// accès est protégé, l'appli fonctionne alors comme avant (en ligne seulement).

const PREFIX = 'lefil:';

export type CachedPrefs = {
  selected: string[];
  view: ViewMode;
  sort: SortMode;
  calMode: CalMode;
  showTasksInGantt: boolean;
  showTasksInCalendar: boolean;
};
export type CachedData = { projects: Project[]; lots: Lot[]; tasks: Task[]; prefs: CachedPrefs };

type QueuePart<T> = { upserts: T[]; deletes: string[] };
export type SavedQueue = {
  projects: QueuePart<Project>;
  lots: QueuePart<Lot>;
  tasks: QueuePart<Task>;
  prefsDirty: boolean;
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Le Fil : copie locale impossible', e);
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* rien à faire */
  }
}

export type LastUser = { id: string; email: string };
export const readLastUser = () => read<LastUser>('lastUser');
export const saveLastUser = (u: LastUser) => write('lastUser', u);

export const loadCache = (userId: string) => read<CachedData>(`data:${userId}`);
export const saveCache = (userId: string, data: CachedData) => write(`data:${userId}`, data);

export const loadQueue = (userId: string) => read<SavedQueue>(`queue:${userId}`);
export const saveQueue = (userId: string, q: SavedQueue) => write(`queue:${userId}`, q);

/**
 * Déconnexion volontaire : on efface la copie des données (appareil partagé…). La file des
 * modifications non envoyées est gardée : elle partira à la prochaine connexion du même compte.
 */
export function forgetUser(userId: string) {
  remove(`data:${userId}`);
  if (readLastUser()?.id === userId) remove('lastUser');
}
