import { createClient } from '@supabase/supabase-js';
import type { Lot, Project, Task } from '../types/models';
import { nextProjectColor } from './palette';
import { toDay } from './dates';
import { useStore } from '../state/store';

// Import (lecture seule) de l'app « organisation-cours », qui vit dans un autre projet Supabase
// (« portail », tables oc_*). Le Fil se connecte à ce projet avec un second client, sous le compte
// enseignant de l'utilisateur, et écrit dans le store, tout dans le projet « BTS GPN » : un lot
// par classe (GPN1, GPN2) + « Commun », dont les tâches sont les séances placées, les périodes
// (semaine thématique, examen, sortie, événement…) et les réunions (voir plus bas).
// L'identité d'un élément importé est son `sourceId`, de la forme `cours:<sorte>:<promo>:<id>`
// (promo = GPN1, GPN2 ou « tous ») : la synchro Google s'en sert pour la couleur par classe.
// Relancer l'import met à jour sans doublon (une séance cochée le reste) ; ce qui a disparu de l'app de
// cours est retiré. Ces éléments sont des rendez-vous, jamais « en retard » (voir isAgenda).

const url = import.meta.env.VITE_COURS_SUPABASE_URL;
const anonKey = import.meta.env.VITE_COURS_SUPABASE_ANON_KEY;

export const isCoursConfigured = Boolean(url && anonKey);

const client = isCoursConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'le-fil-cours-auth' } })
  : null;

const PROJECT_SOURCE = 'cours:projet';
const PROJECT_NAME = 'BTS GPN';
const SOURCE_PREFIX = 'cours:';

// Types de périodes importés (choix de l'utilisateur) : pas les vacances, stages, fériés, absences.
const PERIOD_TYPES = new Set(['Semaine thématique', 'Examen / CCF', 'Sortie / terrain', 'Événement établissement', 'Autre']);

// Bornes (minutes depuis minuit) des 9 créneaux de la grille de l'app de cours (SLOT_BOUNDS_MIN
// dans son app.js ; l'index 4 est le repas, 12h10–13h25).
const SLOT_BOUNDS: [number, number][] = [
  [8 * 60 + 15, 9 * 60 + 10],
  [9 * 60 + 10, 10 * 60 + 5],
  [10 * 60 + 20, 11 * 60 + 15],
  [11 * 60 + 15, 12 * 60 + 10],
  [12 * 60 + 10, 13 * 60 + 25],
  [13 * 60 + 25, 14 * 60 + 20],
  [14 * 60 + 20, 15 * 60 + 15],
  [15 * 60 + 30, 16 * 60 + 25],
  [16 * 60 + 25, 17 * 60 + 20],
];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Lundi de la semaine ISO `week` de l'année `year`. */
function isoMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return monday;
}

/**
 * Identifiant stable d'un élément importé, dérivé du compte et de sa source : deux appareils qui
 * importent la même nouvelle séance en même temps produisent le même id (sinon l'index unique sur
 * source_id refuserait le second envoi et bloquerait la synchro). Format uuid (SHA-256 tronqué).
 */
async function stableId(userId: string, src: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}|${src}`));
  const h = [...new Uint8Array(buf).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** « GPN1 » / « GPN2 » si une seule promo est concernée, sinon « tous ». */
function promoKey(promos: (string | null | undefined)[]): string {
  const set = new Set(promos.filter((p): p is string => !!p));
  return set.size === 1 ? [...set][0] : 'tous';
}

type SessionRow = {
  id: string;
  title: string;
  ue_id: string | null;
  promotion: string;
  week_id: string;
  day: number;
  start_slot: number;
  end_slot: number | null;
  room: string | null;
};
type UeRow = { id: string; code: string; title: string; promotion: string };
type WeekRow = { id: string; week_number: number; iso_year: number };
type PeriodRow = { id: string; label: string; type: string; date_debut: string; date_fin: string; promotions: string[] };
type MeetingRow = { id: string; date: string | null; lieu: string | null; sujets: string | null };

export async function coursSignedInEmail(): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function coursSignIn(email: string, password: string): Promise<string | null> {
  if (!client) return 'import des cours non configuré';
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function coursSignOut() {
  await client?.auth.signOut();
}

export type ImportReport = { sessions: number; periods: number; meetings: number; created: number; updated: number; removed: number };

let current: Promise<ImportReport> | null = null;

/** Lit l'app de cours et met à jour le store (donc, via la synchro, Le Fil et Google Agenda).
 * Un seul import à la fois : un appel pendant qu'un autre tourne reçoit le même résultat. */
export function importCours(opts: { all: boolean }): Promise<ImportReport> {
  current ??= runImport(opts).finally(() => {
    current = null;
  });
  return current;
}

async function runImport(opts: { all: boolean }): Promise<ImportReport> {
  if (!client) throw new Error('import des cours non configuré');
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('non connecté à l’app de cours');

  // ---------------------------------------------------------------- lecture
  const cols = 'id,title,ue_id,promotion,week_id,day,start_slot,end_slot,room';
  let q = opts.all
    ? client.from('oc_sessions').select(cols)
    : client
        .from('oc_sessions')
        .select(`${cols},oc_session_enseignants!inner(enseignant_id)`)
        .eq('oc_session_enseignants.enseignant_id', auth.user.id);
  q = q.not('week_id', 'is', null).not('day', 'is', null).not('start_slot', 'is', null);
  const [sess, per, meet] = await Promise.all([
    q,
    client.from('oc_constraints').select('id,label,type,date_debut,date_fin,promotions'),
    // RLS : seulement les réunions créées par l'utilisateur ou où il est tagué.
    client.from('oc_reunions').select('id,date,lieu,sujets').not('date', 'is', null),
  ]);
  if (sess.error) throw new Error(sess.error.message);
  if (per.error) throw new Error(per.error.message);
  if (meet.error) throw new Error(meet.error.message);
  const sessions = (sess.data ?? []) as unknown as SessionRow[];
  const periods = ((per.data ?? []) as PeriodRow[]).filter((p) => PERIOD_TYPES.has(p.type) && p.date_debut);
  const meetings = (meet.data ?? []) as MeetingRow[];
  // Garde-fou : une réponse vide (compte non relié aux séances, droits…) ne doit pas effacer l'import précédent.
  if (sessions.length === 0) throw new Error('aucune séance placée trouvée pour ce compte');

  const ueIds = [...new Set(sessions.map((s) => s.ue_id).filter((x): x is string => !!x))];
  const weekIds = [...new Set(sessions.map((s) => s.week_id))];
  const [ues, weeks] = await Promise.all([
    ueIds.length ? client.from('oc_ues').select('id,code,title,promotion').in('id', ueIds) : { data: [], error: null },
    weekIds.length ? client.from('oc_weeks').select('id,week_number,iso_year').in('id', weekIds) : { data: [], error: null },
  ]);
  if (ues.error) throw new Error(ues.error.message);
  if (weeks.error) throw new Error(weeks.error.message);
  const ueById = new Map(((ues.data ?? []) as UeRow[]).map((u) => [u.id, u]));
  const weekById = new Map(((weeks.data ?? []) as WeekRow[]).map((w) => [w.id, w]));

  // ---------------------------------------------------------------- écriture dans le store
  const st = useStore.getState();
  const now = new Date().toISOString();
  const today = toDay(new Date());
  const userId = st.projects[0]?.userId ?? st.lots[0]?.userId ?? 'local';

  let projects = st.projects;
  let project = projects.find((p) => p.sourceId === PROJECT_SOURCE);
  if (!project) {
    project = {
      id: await stableId(userId, PROJECT_SOURCE),
      userId,
      name: PROJECT_NAME,
      color: nextProjectColor(projects.map((p) => p.color)),
      position: projects.reduce((m, p) => Math.max(m, p.position + 1), 0),
      sourceId: PROJECT_SOURCE,
    } satisfies Project;
    projects = [...projects, project];
  }
  const projectId = project.id;

  let lots = st.lots;
  let tasks = st.tasks;
  let created = 0;
  let updated = 0;
  const seenLots = new Set<string>();
  const seenTasks = new Set<string>();

  /** Crée ou met à jour le lot importé `src` ; renvoie son id. `done` suit l'app de cours (tout est passé). */
  function upsertLot(src: string, fields: Pick<Lot, 'title' | 'body' | 'startDate' | 'due'> & { done?: boolean }): string {
    seenLots.add(src);
    const found = lots.find((l) => l.sourceId === src);
    if (found) {
      const next = { ...found, ...fields, done: !!fields.done };
      const changed = (Object.keys(fields) as (keyof typeof fields)[]).some((k) => found[k] !== next[k]);
      if (changed) {
        lots = lots.map((l) => (l.id === found.id ? { ...next, updatedAt: now } : l));
        updated++;
      }
      return found.id;
    }
    const lot: Lot = {
      id: ids.get(src)!,
      userId,
      projectId,
      repeat: 'none',
      startTime: null,
      endTime: null,
      location: '',
      position: null,
      createdAt: now,
      updatedAt: now,
      sourceId: src,
      ...fields,
      done: !!fields.done,
    };
    lots = [lot, ...lots];
    created++;
    return lot.id;
  }

  function upsertTask(src: string, lotId: string, fields: Pick<Task, 'label' | 'startDate' | 'due' | 'startTime' | 'endTime' | 'location'>) {
    seenTasks.add(src);
    const all = { lotId, ...fields };
    const found = tasks.find((t) => t.sourceId === src);
    if (found) {
      if ((Object.keys(all) as (keyof typeof all)[]).some((k) => found[k] !== all[k])) {
        tasks = tasks.map((t) => (t.id === found.id ? { ...t, ...all } : t));
        updated++;
      }
      return;
    }
    tasks = [
      ...tasks,
      { id: ids.get(src)!, ...all, done: false, position: tasks.filter((t) => t.lotId === lotId).length, sourceId: src },
    ];
    created++;
  }

  // Organisation : un lot par classe (GPN1, GPN2) + un lot « Commun » (périodes des deux classes,
  // réunions). Tout le reste est tâche : séance (« UE 1.1 · titre », horaire + salle), période
  // (fourchette début → fin, journée entière), réunion (journée entière). Un lot est « terminé »
  // quand tout ce qu'il contient est passé.
  type Item = { src: string; promo: string; fields: Pick<Task, 'label' | 'startDate' | 'due' | 'startTime' | 'endTime' | 'location'> };
  const items: Item[] = [];
  let sessionCount = 0;

  for (const s of sessions) {
    const week = weekById.get(s.week_id);
    const a = SLOT_BOUNDS[s.start_slot];
    const b = SLOT_BOUNDS[s.end_slot ?? s.start_slot];
    if (!week || !a || !b) continue;
    const date = isoMonday(week.iso_year, week.week_number);
    date.setDate(date.getDate() + s.day); // 0 = lundi … 5 = samedi
    const day = toDay(date);
    const ue = s.ue_id ? ueById.get(s.ue_id) : undefined;
    const promo = ue?.promotion ?? s.promotion;
    sessionCount++;
    items.push({
      src: `${SOURCE_PREFIX}seance:${promo}:${s.id}`,
      promo,
      fields: {
        label: ue ? `${ue.code} · ${s.title}` : s.title,
        startDate: day,
        due: day,
        startTime: hhmm(a[0]),
        endTime: hhmm(b[1]),
        location: s.room ?? '',
      },
    });
  }
  for (const p of periods) {
    const end = p.date_fin || p.date_debut;
    const promo = promoKey(p.promotions ?? []);
    items.push({
      src: `${SOURCE_PREFIX}periode:${promo}:${p.id}`,
      promo,
      fields: {
        label: p.label,
        startDate: end > p.date_debut ? p.date_debut : null,
        due: end,
        startTime: null,
        endTime: null,
        location: '',
      },
    });
  }
  for (const r of meetings) {
    const subject = (r.sujets ?? '').split('\n')[0].trim();
    items.push({
      src: `${SOURCE_PREFIX}reunion:tous:${r.id}`,
      promo: 'tous',
      fields: {
        label: subject ? `Réunion · ${subject.length > 60 ? subject.slice(0, 59) + '…' : subject}` : 'Réunion',
        startDate: r.date,
        due: r.date,
        startTime: null,
        endTime: null,
        location: r.lieu ?? '',
      },
    });
  }

  const promos = [...new Set(items.map((i) => i.promo))].sort();
  const classSrc = (promo: string) => `${SOURCE_PREFIX}classe:${promo}:-`;
  const allSrc = [...promos.map(classSrc), ...items.map((i) => i.src)];
  const ids = new Map(await Promise.all(allSrc.map(async (src) => [src, await stableId(userId, src)] as const)));

  const lotIdByPromo = new Map<string, string>();
  for (const promo of promos) {
    const last = items.filter((i) => i.promo === promo).reduce((m, i) => (i.fields.due! > m ? i.fields.due! : m), '');
    lotIdByPromo.set(
      promo,
      upsertLot(classSrc(promo), {
        title: promo === 'tous' ? 'Commun' : promo,
        body: '',
        startDate: null,
        due: null,
        done: last < today,
      }),
    );
  }
  for (const i of items) upsertTask(i.src, lotIdByPromo.get(i.promo)!, i.fields);

  // Ce qui a disparu de l'app de cours (séance remise « à placer », supprimée, période retirée…).
  const goneLots = new Set(lots.filter((l) => l.sourceId?.startsWith(SOURCE_PREFIX) && !seenLots.has(l.sourceId)).map((l) => l.id));
  const before = lots.length + tasks.length;
  lots = lots.filter((l) => !goneLots.has(l.id));
  tasks = tasks.filter(
    (t) => !goneLots.has(t.lotId) && (!t.sourceId?.startsWith(SOURCE_PREFIX) || seenTasks.has(t.sourceId)),
  );
  const removed = before - lots.length - tasks.length;

  useStore.setState({ projects, lots, tasks });
  return { sessions: sessionCount, periods: periods.length, meetings: meetings.length, created, updated, removed };
}

// ------------------------------------------------------------ import automatique
// Préférences de l'appareil (localStorage) : option « toutes les séances » et heure du dernier
// import réussi. Le bouton du panneau Compte reste là pour forcer une mise à jour.
const ALL_KEY = 'lefil:cours:all';
const LAST_KEY = 'lefil:cours:last';
const STALE_AFTER = 15 * 60_000; // retour sur l'appli : ré-import si le dernier date de plus de 15 min
const EVERY = 30 * 60_000; // appli ouverte et visible : toutes les 30 min
const FIRST_DELAY = 5_000; // au démarrage, laisser la synchro Le Fil relire le serveur d'abord

export function coursAllPref(): boolean {
  try {
    return localStorage.getItem(ALL_KEY) === '1';
  } catch {
    return false;
  }
}
export function setCoursAllPref(all: boolean) {
  try {
    localStorage.setItem(ALL_KEY, all ? '1' : '0');
  } catch {
    /* stockage indisponible : l'option vaudra pour la session */
  }
}
export function lastCoursImport(): Date | null {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v ? new Date(Number(v)) : null;
  } catch {
    return null;
  }
}
function markImported() {
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    /* sans gravité */
  }
}

/** Import manuel (bouton) : même chemin que l'automatique, et mémorise l'heure. */
export async function importCoursNow(): Promise<ImportReport> {
  const r = await importCours({ all: coursAllPref() });
  markImported();
  return r;
}

/**
 * Lance l'import automatique (à appeler une fois les données de Le Fil chargées) : au démarrage,
 * au retour sur l'appli si le dernier import a plus de 15 min, puis toutes les 30 min tant que
 * l'appli est visible. Sans effet si l'appareil n'est pas connecté à l'app de cours. Silencieux :
 * une erreur est seulement notée dans la console (le bouton du panneau Compte l'affiche).
 */
export function startCoursAutoImport(): () => void {
  if (!client) return () => {};
  const run = async () => {
    if (!navigator.onLine || document.visibilityState !== 'visible') return;
    if (!(await coursSignedInEmail())) return;
    try {
      await importCoursNow();
    } catch (e) {
      console.warn('Import automatique des cours :', e);
    }
  };
  const runIfStale = () => {
    const last = lastCoursImport();
    if (!last || Date.now() - last.getTime() > STALE_AFTER) void run();
  };
  const first = setTimeout(runIfStale, FIRST_DELAY);
  const every = setInterval(() => void run(), EVERY);
  const onVisible = () => document.visibilityState === 'visible' && runIfStale();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(first);
    clearInterval(every);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
