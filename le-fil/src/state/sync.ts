import { supabase } from '../lib/supabase';
import type { CalMode, Lot, Project, SortMode, Task, ViewMode } from '../types/models';
import { NO_PROJECT, useStore } from './store';

// Synchro Supabase. Le store reste la source de vérité de l'interface (mises à jour
// optimistes) ; ce module (1) charge les données au démarrage, puis (2) compare chaque
// changement du store à l'état précédent et envoie seulement les lignes modifiées, après un
// court délai pour regrouper la frappe. Les actions du store n'ont donc rien à savoir de
// Supabase. En cas d'échec, les changements restent en file et sont retentés.

const FLUSH_DELAY = 600;
const RETRY_DELAY = 5000;

type Row = Record<string, unknown>;

// ---------------------------------------------------------------- mapping
const fromProject = (r: Row): Project => ({
  id: r.id as string,
  userId: r.user_id as string,
  name: r.name as string,
  color: r.color as string,
  position: r.position as number,
});
const toProject = (p: Project): Row => ({ id: p.id, name: p.name, color: p.color, position: p.position });

const fromLot = (r: Row): Lot => ({
  id: r.id as string,
  userId: r.user_id as string,
  projectId: (r.project_id as string | null) ?? null,
  title: r.title as string,
  body: r.body as string,
  due: (r.due as string | null) ?? null,
  done: r.done as boolean,
  position: (r.position as number | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const toLot = (l: Lot): Row => ({
  id: l.id,
  project_id: l.projectId,
  title: l.title,
  body: l.body,
  due: l.due,
  done: l.done,
  position: l.position,
  created_at: l.createdAt,
});

const fromTask = (r: Row): Task => ({
  id: r.id as string,
  lotId: r.lot_id as string,
  label: r.label as string,
  due: (r.due as string | null) ?? null,
  done: r.done as boolean,
  position: r.position as number,
});
const toTask = (t: Task): Row => ({
  id: t.id,
  lot_id: t.lotId,
  label: t.label,
  due: t.due,
  done: t.done,
  position: t.position,
});

// ------------------------------------------------------------ diff / file
function shallowSame(a: object, b: object): boolean {
  const ka = Object.keys(a) as (keyof typeof a)[];
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Lignes créées/modifiées et ids supprimés entre deux listes. */
function diff<T extends { id: string }>(prev: T[], next: T[]) {
  const before = new Map(prev.map((x) => [x.id, x]));
  const upserts: T[] = [];
  for (const x of next) {
    const old = before.get(x.id);
    if (!old || !shallowSame(old, x)) upserts.push(x);
    before.delete(x.id);
  }
  return { upserts, deletes: [...before.keys()] };
}

interface Queue<T> {
  upserts: Map<string, T>;
  deletes: Set<string>;
}
const newQueue = <T>(): Queue<T> => ({ upserts: new Map(), deletes: new Set() });

function enqueue<T extends { id: string }>(q: Queue<T>, prev: T[], next: T[]) {
  if (prev === next) return;
  const d = diff(prev, next);
  for (const x of d.upserts) {
    q.upserts.set(x.id, x);
    q.deletes.delete(x.id);
  }
  for (const id of d.deletes) {
    q.deletes.add(id);
    q.upserts.delete(id);
  }
}

// ------------------------------------------------------------ préférences
type PrefsSlice = {
  selected: string[];
  view: ViewMode;
  sort: SortMode;
  calMode: CalMode;
  showTasksInGantt: boolean;
  showTasksInCalendar: boolean;
};
type StoreState = ReturnType<typeof useStore.getState>;

const pickPrefs = (s: StoreState): PrefsSlice => ({
  selected: s.selected,
  view: s.view,
  sort: s.sort,
  calMode: s.calMode,
  showTasksInGantt: s.showTasksInGantt,
  showTasksInCalendar: s.showTasksInCalendar,
});
const prefsChanged = (a: StoreState, b: StoreState) =>
  a.selected !== b.selected ||
  a.view !== b.view ||
  a.sort !== b.sort ||
  a.calMode !== b.calMode ||
  a.showTasksInGantt !== b.showTasksInGantt ||
  a.showTasksInCalendar !== b.showTasksInCalendar;

// ---------------------------------------------------------------- démarrage
function fail(what: string, error: { message: string }): never {
  throw new Error(`${what} : ${error.message}`);
}

/** Vide les données en mémoire (déconnexion / changement de compte). */
export function resetStore() {
  useStore.setState({
    projects: [],
    lots: [],
    tasks: [],
    selected: [],
    openLotId: null,
    search: '',
    lateOnly: false,
    view: 'liste',
    sort: 'urgence',
    calMode: 'mois',
    showTasksInCalendar: true,
    showTasksInGantt: true,
  });
}

/**
 * Charge les données de `userId` dans le store puis démarre la synchro.
 * Rejette si le chargement échoue (rien n'est alors synchronisé). Renvoie la fonction d'arrêt.
 */
export async function startSync(userId: string): Promise<() => void> {
  const [pr, lo, ta, pf] = await Promise.all([
    supabase.from('projects').select('*').order('position'),
    supabase.from('lots').select('*'),
    supabase.from('tasks').select('*').order('position'),
    supabase.from('user_prefs').select('*').maybeSingle(),
  ]);
  if (pr.error) fail('Chargement des projets', pr.error);
  if (lo.error) fail('Chargement des lots', lo.error);
  if (ta.error) fail('Chargement des tâches', ta.error);
  if (pf.error) fail('Chargement des préférences', pf.error);

  const projects = pr.data.map(fromProject);
  const known = new Set<string>([NO_PROJECT, ...projects.map((p) => p.id)]);
  const p = pf.data as Row | null;
  useStore.setState({
    projects,
    lots: lo.data.map(fromLot),
    tasks: ta.data.map(fromTask),
    openLotId: null,
    ...(p && {
      selected: ((p.selected_projects as string[]) ?? []).filter((k) => known.has(k)),
      view: p.view as ViewMode,
      sort: p.sort as SortMode,
      calMode: p.cal_mode as CalMode,
      showTasksInGantt: p.show_tasks_in_gantt as boolean,
      showTasksInCalendar: p.show_tasks_in_calendar as boolean,
    }),
  });

  const qProjects = newQueue<Project>();
  const qLots = newQueue<Lot>();
  const qTasks = newQueue<Task>();
  let prefsDirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  let again = false;
  let stopped = false;

  const schedule = (delay = FLUSH_DELAY) => {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };

  async function upsertGroup<T extends { id: string }>(
    table: string,
    q: Queue<T>,
    toRow: (x: T) => Row,
  ) {
    if (!q.upserts.size) return;
    const sent = [...q.upserts.values()];
    const { error } = await supabase.from(table).upsert(sent.map(toRow));
    if (error) fail(table, error);
    // Ne retire de la file que ce qui a été envoyé tel quel (une édition plus récente reste en attente).
    for (const x of sent) if (q.upserts.get(x.id) === x) q.upserts.delete(x.id);
  }

  async function deleteGroup(table: string, q: Queue<unknown>) {
    if (!q.deletes.size) return;
    const ids = [...q.deletes];
    const { error } = await supabase.from(table).delete().in('id', ids);
    if (error) fail(table, error);
    for (const id of ids) q.deletes.delete(id);
  }

  async function flush() {
    if (stopped) return;
    if (flushing) {
      again = true;
      return;
    }
    flushing = true;
    try {
      // Ordre imposé par les clés étrangères : parents avant enfants, enfants avant parents à la suppression.
      await upsertGroup('projects', qProjects, toProject);
      await upsertGroup('lots', qLots, toLot);
      await upsertGroup('tasks', qTasks, toTask);
      await deleteGroup('tasks', qTasks);
      await deleteGroup('lots', qLots);
      await deleteGroup('projects', qProjects);
      if (prefsDirty) {
        prefsDirty = false;
        const s = pickPrefs(useStore.getState());
        const { error } = await supabase.from('user_prefs').upsert({
          user_id: userId,
          selected_projects: s.selected,
          view: s.view,
          sort: s.sort,
          cal_mode: s.calMode,
          show_tasks_in_gantt: s.showTasksInGantt,
          show_tasks_in_calendar: s.showTasksInCalendar,
        });
        if (error) {
          prefsDirty = true;
          fail('Préférences', error);
        }
      }
    } catch (e) {
      console.error('Synchro Le Fil :', e);
      useStore.getState().flash('Synchronisation impossible — nouvelle tentative…');
      schedule(RETRY_DELAY);
    } finally {
      flushing = false;
      if (again) {
        again = false;
        schedule(0);
      }
    }
  }

  const unsubscribe = useStore.subscribe((s, prev) => {
    enqueue(qProjects, prev.projects, s.projects);
    enqueue(qLots, prev.lots, s.lots);
    enqueue(qTasks, prev.tasks, s.tasks);
    if (prefsChanged(s, prev)) prefsDirty = true;
    if (
      qProjects.upserts.size + qProjects.deletes.size + qLots.upserts.size + qLots.deletes.size +
        qTasks.upserts.size + qTasks.deletes.size > 0 ||
      prefsDirty
    ) {
      schedule();
    }
  });

  // Dernière chance quand l'onglet passe en arrière-plan / se ferme.
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  document.addEventListener('visibilitychange', onHide);

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onHide);
  };
}
