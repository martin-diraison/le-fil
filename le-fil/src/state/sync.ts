import { supabase } from '../lib/supabase';
import type { CalMode, Lot, Project, SortMode, Task, ViewMode } from '../types/models';
import { advanceRecurringLots } from '../lib/recurrence';
import { NO_PROJECT, useStore, type SyncStatus } from './store';
import {
  forgetUser,
  loadCache,
  loadQueue,
  saveCache,
  saveQueue,
  type CachedData,
  type SavedQueue,
} from '../lib/localCache';

// Synchro Supabase. Le store reste la source de vérité de l'interface (mises à jour
// optimistes) ; ce module (1) charge les données au démarrage, puis (2) compare chaque
// changement du store à l'état précédent et envoie seulement les lignes modifiées, après un
// court délai pour regrouper la frappe. Les actions du store n'ont donc rien à savoir de
// Supabase. En cas d'échec, les changements restent en file et sont retentés.
// L'état réel (synchronisé / envoi / hors ligne / échec) est publié dans `syncStatus` du store.
// Au retour au premier plan, les données sont rechargées (pas de Realtime pour l'instant) :
// sinon un appareil resté ouvert renverrait des lignes périmées par-dessus celles d'un autre.
// Hors ligne : les données et la file d'envoi sont copiées en local (lib/localCache.ts) ; au
// démarrage, la copie locale s'affiche aussitôt et le serveur est consulté en arrière-plan.

const FLUSH_DELAY = 600;
const RETRY_DELAY = 5000;
/** Délai minimal entre deux rechargements au retour au premier plan. */
const REFRESH_MIN_GAP = 30_000;
/** Délai de regroupement avant de réécrire la copie locale des données. */
const SAVE_DELAY = 300;

type Row = Record<string, unknown>;

/** Postgres renvoie une colonne `time` en "HH:MM:SS" ; le state local (et <input type=time>)
 * veut "HH:MM". */
function fromPgTime(v: unknown): string | null {
  const s = v as string | null;
  return s ? s.slice(0, 5) : null;
}

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
  startDate: (r.start_date as string | null) ?? null,
  due: (r.due as string | null) ?? null,
  repeat: (r.repeat as Lot['repeat']) ?? 'none',
  startTime: fromPgTime(r.start_time),
  endTime: fromPgTime(r.end_time),
  location: (r.location as string | null) ?? '',
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
  start_date: l.startDate,
  due: l.due,
  repeat: l.repeat,
  start_time: l.startTime,
  end_time: l.endTime,
  location: l.location,
  done: l.done,
  position: l.position,
  created_at: l.createdAt,
});

const fromTask = (r: Row): Task => ({
  id: r.id as string,
  lotId: r.lot_id as string,
  label: r.label as string,
  startDate: (r.start_date as string | null) ?? null,
  due: (r.due as string | null) ?? null,
  startTime: fromPgTime(r.start_time),
  endTime: fromPgTime(r.end_time),
  location: (r.location as string | null) ?? '',
  done: r.done as boolean,
  position: r.position as number,
});
const toTask = (t: Task): Row => ({
  id: t.id,
  lot_id: t.lotId,
  label: t.label,
  start_date: t.startDate,
  due: t.due,
  start_time: t.startTime,
  end_time: t.endTime,
  location: t.location,
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
type PrefsSlice = CachedData['prefs'];
type StoreState = ReturnType<typeof useStore.getState>;

const pickPrefs = (s: StoreState): PrefsSlice => ({
  selected: s.selected,
  view: s.view,
  sort: s.sort,
  calMode: s.calMode,
  showTasksInGantt: s.showTasksInGantt,
  showTasksInCalendar: s.showTasksInCalendar,
});
const dataChanged = (a: StoreState, b: StoreState) =>
  a.projects !== b.projects || a.lots !== b.lots || a.tasks !== b.tasks;
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
    syncStatus: 'ok',
  });
}

/** Lit projets, lots et tâches du compte (RLS : seulement les siens). */
async function fetchData() {
  const [pr, lo, ta] = await Promise.all([
    supabase.from('projects').select('*').order('position'),
    supabase.from('lots').select('*'),
    supabase.from('tasks').select('*').order('position'),
  ]);
  if (pr.error) fail('Chargement des projets', pr.error);
  if (lo.error) fail('Chargement des lots', lo.error);
  if (ta.error) fail('Chargement des tâches', ta.error);
  return { projects: pr.data.map(fromProject), lots: lo.data.map(fromLot), tasks: ta.data.map(fromTask) };
}

/** Préférences telles que renvoyées par Supabase → état du store. */
function prefsFromRow(p: Row, known: Set<string>): PrefsSlice {
  return {
    selected: ((p.selected_projects as string[]) ?? []).filter((k) => known.has(k)),
    view: p.view as ViewMode,
    sort: p.sort as SortMode,
    calMode: p.cal_mode as CalMode,
    showTasksInGantt: p.show_tasks_in_gantt as boolean,
    showTasksInCalendar: p.show_tasks_in_calendar as boolean,
  };
}

function queueFromSaved<T extends { id: string }>(part: SavedQueue['lots'] | undefined): Queue<T> {
  const q = newQueue<T>();
  for (const x of (part?.upserts ?? []) as unknown as T[]) q.upserts.set(x.id, x);
  for (const id of part?.deletes ?? []) q.deletes.add(id);
  return q;
}
const queueToSaved = <T>(q: Queue<T>) => ({ upserts: [...q.upserts.values()], deletes: [...q.deletes] });

/**
 * Charge les données de `userId` dans le store puis démarre la synchro.
 * Avec une copie locale, résout aussitôt (serveur consulté ensuite, en arrière-plan) ; sinon
 * attend le serveur et rejette si le chargement échoue. Renvoie la fonction d'arrêt.
 */
export async function startSync(userId: string): Promise<(forget?: boolean) => void> {
  const cached = loadCache(userId);
  const saved = loadQueue(userId);

  if (cached) {
    useStore.setState({
      projects: cached.projects,
      lots: cached.lots,
      tasks: cached.tasks,
      openLotId: null,
      syncStatus: 'ok',
      ...cached.prefs,
    });
  } else {
    const [data, pf] = await Promise.all([fetchData(), supabase.from('user_prefs').select('*').maybeSingle()]);
    if (pf.error) fail('Chargement des préférences', pf.error);
    const known = new Set<string>([NO_PROJECT, ...data.projects.map((p) => p.id)]);
    const p = pf.data as Row | null;
    useStore.setState({ ...data, openLotId: null, syncStatus: 'ok', ...(p && prefsFromRow(p, known)) });
    saveCache(userId, { ...data, prefs: pickPrefs(useStore.getState()) });
  }

  // Modifications faites hors ligne lors d'une session précédente : elles repartent d'ici.
  const qProjects = queueFromSaved<Project>(saved?.projects as SavedQueue['lots'] | undefined);
  const qLots = queueFromSaved<Lot>(saved?.lots);
  const qTasks = queueFromSaved<Task>(saved?.tasks as SavedQueue['lots'] | undefined);
  let prefsDirty = saved?.prefsDirty ?? false;
  let lastLoad = cached ? 0 : Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  let again = false;
  let stopped = false;
  let failing = false; // évite de répéter le toast d'échec à chaque nouvelle tentative
  let applyingRemote = false; // rechargement en cours d'application : pas à renvoyer au serveur
  let refreshAfterFlush = !!cached; // copie locale affichée : vérifier le serveur dès que possible

  const queued = () =>
    qProjects.upserts.size + qProjects.deletes.size + qLots.upserts.size + qLots.deletes.size +
      qTasks.upserts.size + qTasks.deletes.size > 0 || prefsDirty;
  const setStatus = (syncStatus: SyncStatus) => {
    if (useStore.getState().syncStatus !== syncStatus) useStore.setState({ syncStatus });
  };
  const persistQueue = () =>
    saveQueue(userId, {
      projects: queueToSaved(qProjects),
      lots: queueToSaved(qLots),
      tasks: queueToSaved(qTasks),
      prefsDirty,
    });
  const persistData = () => {
    clearTimeout(saveTimer);
    const s = useStore.getState();
    saveCache(userId, { projects: s.projects, lots: s.lots, tasks: s.tasks, prefs: pickPrefs(s) });
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistData, SAVE_DELAY);
  };

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
    // Clé étrangère manquante (23503) : le parent a été supprimé depuis un autre appareil pendant
    // qu'on était hors ligne. Réessayer ne servirait à rien et bloquerait toute la file : on abandonne.
    if (error?.code === '23503') {
      console.warn(`Synchro Le Fil : ${table} rattachés à un élément supprimé ailleurs, abandonnés`, sent);
      useStore.getState().flash('modifs perdues : élément supprimé sur un autre appareil');
    } else if (error) fail(table, error);
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
    let ok = false;
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
      failing = false;
      ok = true;
      if (!queued()) setStatus('ok');
    } catch (e) {
      console.error('Synchro Le Fil :', e);
      const offline = !navigator.onLine;
      setStatus(offline ? 'offline' : 'error');
      if (!failing && !offline) useStore.getState().flash('Synchronisation impossible — nouvelle tentative…');
      failing = true;
      // Hors ligne : on attend l'événement « online » plutôt que de marteler le réseau.
      if (!offline) schedule(RETRY_DELAY);
    } finally {
      flushing = false;
      persistQueue(); // ce qui a été envoyé sort de la copie locale de la file
      if (again) {
        again = false;
        schedule(0);
      } else if (ok && refreshAfterFlush && !queued()) {
        refreshAfterFlush = false;
        void refresh(true);
      }
    }
  }

  const unsubscribe = useStore.subscribe((s, prev) => {
    // Seuls les changements de données / préférences comptent (pas le toast, ni syncStatus lui-même).
    if (!dataChanged(s, prev) && !prefsChanged(s, prev)) return;
    scheduleSave(); // copie locale, y compris pour ce qui vient du serveur
    if (applyingRemote) return;
    enqueue(qProjects, prev.projects, s.projects);
    enqueue(qLots, prev.lots, s.lots);
    enqueue(qTasks, prev.tasks, s.tasks);
    if (prefsChanged(s, prev)) prefsDirty = true;
    if (queued()) {
      persistQueue();
      if (useStore.getState().syncStatus !== 'offline') setStatus('pending');
      schedule();
    }
  });

  /** Recharge les données du serveur — seulement si rien n'attend d'être envoyé, avant comme
   * après la requête (une édition faite pendant le chargement ne doit pas être écrasée). */
  async function refresh(force = false) {
    if (stopped || flushing || queued()) return;
    if (!force && Date.now() - lastLoad < REFRESH_MIN_GAP) return;
    lastLoad = Date.now();
    let data;
    try {
      data = await fetchData();
    } catch (e) {
      console.error('Rechargement Le Fil :', e);
      if (!navigator.onLine) setStatus('offline');
      refreshAfterFlush = true; // réessayer au retour du réseau
      return;
    }
    if (stopped || flushing || queued()) return;
    const s = useStore.getState();
    applyingRemote = true;
    try {
      useStore.setState({
        ...data,
        openLotId: s.openLotId && data.lots.some((l) => l.id === s.openLotId) ? s.openLotId : null,
        selected: s.selected.filter((k) => k === NO_PROJECT || data.projects.some((p) => p.id === k)),
      });
    } finally {
      applyingRemote = false;
    }
    setStatus('ok');
    advanceRecurring(); // l'appli a pu rester ouverte d'un jour sur l'autre
  }

  // Anniversaires & Cie : lots récurrents en retard → prochaine occurrence. Après l'abonnement
  // ci-dessus, pour que le changement soit détecté comme un diff et renvoyé à Supabase.
  const advanceRecurring = () => {
    const rolled = advanceRecurringLots(useStore.getState().lots);
    if (rolled !== useStore.getState().lots) useStore.setState({ lots: rolled });
  };
  advanceRecurring();

  // Arrière-plan / fermeture : dernière chance d'envoyer et d'écrire la copie locale.
  // Retour au premier plan : recharger.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      persistData();
      void flush();
    } else void refresh();
  };
  document.addEventListener('visibilitychange', onVisibility);
  // Retour du réseau : on renvoie tout de suite ce qui attendait, puis on relit le serveur.
  const onOnline = () => {
    refreshAfterFlush = true;
    setStatus(queued() ? 'pending' : 'ok');
    schedule(0);
  };
  const onOffline = () => setStatus('offline');
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  // Premier passage : envoie la file héritée (s'il y en a), puis relit le serveur si on est
  // parti de la copie locale.
  if (!navigator.onLine) setStatus('offline');
  else if (queued() || refreshAfterFlush) {
    if (queued()) setStatus('pending');
    schedule(0);
  }

  // `forget` : déconnexion volontaire — la copie des données est effacée, la file est gardée.
  return (forget = false) => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(saveTimer);
    if (forget) forgetUser(userId);
    else persistData();
    persistQueue();
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
