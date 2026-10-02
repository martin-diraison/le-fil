import { useMemo } from 'react';
import { create } from 'zustand';
import type { CalMode, Lot, Project, Repeat, SortMode, Task, ViewMode } from '../types/models';
import { computeUrgency, compareUrgency, isArchived } from '../types/models';
import { nextProjectColor } from '../lib/palette';
import { dueFromChoice, type DateChoiceKey } from './dateShortcuts';
import { SEED_LOTS, SEED_PROJECTS, SEED_TASKS } from './seed';
import { isSupabaseConfigured } from '../lib/supabase';
import { describeParse, quickParse, type QuickParse } from '../lib/quickParse';
import { formatShortDate } from '../lib/format';

/** Une saisie clavier dans un <input type=date> déclenche onChange à chaque segment rempli,
 * y compris avec une année encore partielle (ex. « 0002 » en tapant « 2026 » chiffre par
 * chiffre) — on ne propage vers « au » que sur une date déjà plausible, pour ne pas y écrire
 * une valeur intermédiaire invalide. */
function isPlausibleDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900;
}

/** Sentinel pour la sélection "sans projet" dans le menu gauche (§3.2, §3.6). */
export const NO_PROJECT = '__no_project__' as const;
export type ProjectKey = string | typeof NO_PROJECT;

/** UUID v4 : les identifiants sont créés côté client et stockés tels quels dans Supabase. */
function uid(_prefix: string): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); // contexte non sécurisé (http hors localhost)
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

/** Champs datés issus de la saisie rapide (voir lib/quickParse.ts). */
function parsedFields(p: QuickParse) {
  return { due: p.due, startTime: p.startTime, endTime: p.endTime, location: p.location };
}
const UNPARSED = { due: null, startTime: null, endTime: null, location: '' };

interface State {
  // Données
  projects: Project[];
  lots: Lot[];
  tasks: Task[];

  // État d'interface (persisté par utilisateur — UserPrefs — + éphémère local)
  selected: ProjectKey[];
  lateOnly: boolean;
  search: string;
  projectFilter: string;
  openLotId: string | null;
  sort: SortMode;
  view: ViewMode;
  calMode: CalMode;
  calMonth: { year: number; month: number }; // mois affiché (vue mois)
  calWeek: number; // décalage en semaines depuis la semaine courante (vue semaine)
  calOpenDay: string | null; // YYYY-MM-DD : vue journalière ouverte (desktop), sinon fermée
  showTasksInCalendar: boolean;
  showTasksInGantt: boolean;
  /** Fenêtre Gantt : 3 mois autour d'aujourd'hui (défaut) ou étendue à tout ce qui est affiché.
   *  Éphémère (non persisté) : simple choix d'affichage, pas une donnée utilisateur. */
  ganttFullRange: boolean;
  /** Afficher les lots archivés (terminés depuis plus de 30 j) dans la vue Liste. Éphémère. */
  showArchived: boolean;
  toast: string | null;
  /** Action « annuler » proposée dans le toast courant (suppression, lot terminé…), sinon null. */
  toastUndo: (() => void) | null;
  /** État réel de la synchro Supabase (alimenté par sync.ts) — 'ok' en mode démo. */
  syncStatus: SyncStatus;

  // Édition / interactions
  colorPickerProjectId: string | null;
  projectRenameDraft: string;
  projectDraft: string;
  lotDraft: string;
  taskDraft: string;
  confirmDeleteProjectId: string | null;
  moveMenuOpen: boolean;
  taskDatePickerId: string | null;
  dragProjectId: string | null;
  overProjectId: string | null;
  dragLotId: string | null;
  overLotId: string | null;

  // Actions — projets
  /** Renvoie l'id du projet créé (null si le nom est vide). */
  addProject: (name: string) => string | null;
  renameProject: (id: string, name: string) => void;
  setProjectColor: (id: string, color: string) => void;
  requestDeleteProject: (id: string) => void;
  confirmDeleteProject: (id: string) => void;
  cancelDeleteProject: () => void;
  reorderProjects: (fromId: string, toId: string) => void;
  toggleProjectPicker: (id: string) => void;
  /** Case à cocher : ajoute / retire le projet de la sélection (compilation de plusieurs projets). */
  toggleSelected: (key: ProjectKey) => void;
  /** Clic sur le nom : n'affiche que ce projet (remplace la sélection). */
  selectOnly: (key: ProjectKey) => void;
  clearSelected: () => void;

  // Actions — lots
  /**
   * Crée un lot et l'ouvre. Sans `projectKey`, il va dans le premier projet sélectionné (desktop) ;
   * sinon dans le projet indiqué (mobile : projet ouvert, ou `null` / NO_PROJECT = sans projet).
   */
  addLot: (title: string, projectKey?: ProjectKey | null, opts?: CreateOpts) => string | null;
  openLot: (id: string | null) => void;
  /** Calendrier / Gantt : ouvre le lot, ou le referme s'il est déjà ouvert (§3.1). */
  toggleOpenLot: (id: string) => void;
  setLotDueDate: (id: string, due: string | null) => void;
  setLotStartDate: (id: string, startDate: string | null) => void;
  setLotRepeat: (id: string, repeat: Repeat) => void;
  setLotStartTime: (id: string, startTime: string | null) => void;
  setLotEndTime: (id: string, endTime: string | null) => void;
  setLotLocation: (id: string, location: string) => void;
  updateLotTitle: (id: string, title: string) => void;
  updateLotBody: (id: string, body: string) => void;
  setLotDue: (id: string, key: DateChoiceKey) => void;
  toggleLotDone: (id: string) => void;
  moveLotToProject: (id: string, projectId: string | null) => void;
  /** Supprime le lot et ses tâches, avec « annuler » dans le toast. */
  deleteLot: (id: string) => void;
  reorderLots: (fromId: string, toId: string) => void;
  toggleMoveMenu: () => void;

  // Actions — tâches
  addTask: (lotId: string, label: string, opts?: CreateOpts) => string | null;
  /** Ajout groupé (collage de plusieurs lignes) — renvoie le nombre de tâches créées. */
  addTasks: (lotId: string, labels: string[]) => number;
  toggleTask: (id: string) => void;
  updateTaskLabel: (id: string, label: string) => void;
  setTaskDue: (id: string, key: DateChoiceKey) => void;
  setTaskDueDate: (id: string, due: string | null) => void;
  setTaskStartDate: (id: string, startDate: string | null) => void;
  setTaskStartTime: (id: string, startTime: string | null) => void;
  setTaskEndTime: (id: string, endTime: string | null) => void;
  setTaskLocation: (id: string, location: string) => void;
  deleteTask: (id: string) => void;
  openTaskDatePicker: (id: string | null) => void;

  // Actions — recherche / tri / filtre
  setSearch: (q: string) => void;
  setProjectFilter: (q: string) => void;
  toggleLateOnly: () => void;
  cycleSort: () => void;
  setView: (v: ViewMode) => void;

  // Actions — calendrier / gantt
  setCalMode: (m: CalMode) => void;
  calStep: (delta: 1 | -1) => void;
  /** Vue journalière desktop : ouvre/change de jour, ou referme si `day` est déjà ouvert. */
  openCalDay: (day: string) => void;
  closeCalDay: () => void;
  toggleTasksInCalendar: () => void;
  toggleTasksInGantt: () => void;
  toggleGanttFullRange: () => void;
  toggleShowArchived: () => void;
  /** Toast ~2 s ; avec `undo`, il reste 5 s et propose « annuler ». */
  flash: (msg: string, undo?: () => void) => void;
  undoToast: () => void;

  // Drag state setters (menu projets)
  setDragProject: (id: string | null) => void;
  setOverProject: (id: string | null) => void;
  setDragLot: (id: string | null) => void;
  setOverLot: (id: string | null) => void;
}

/** Le lot ouvert reste ouvert seulement si son projet fait encore partie de la sélection. */
function openLotIfStillVisible(s: State, selected: ProjectKey[]): string | null {
  if (!s.openLotId) return null;
  if (selected.length === 0 && s.view !== 'liste') return s.openLotId; // Calendrier/Gantt : tout est visible
  const lot = s.lots.find((l) => l.id === s.openLotId);
  return lot && selected.includes(lot.projectId ?? NO_PROJECT) ? s.openLotId : null;
}

/** `parse: false` : pas de saisie rapide (date/heure/lieu fixés par l'appelant, ex. vue jour). */
type CreateOpts = { parse?: boolean };

export type SyncStatus = 'ok' | 'pending' | 'offline' | 'error';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const SORT_CYCLE: SortMode[] = ['urgence', 'récent', 'manuel'];

export const useStore = create<State>((set, get) => ({
  // Données factices en mode démo uniquement ; avec Supabase, elles sont chargées par sync.ts.
  projects: isSupabaseConfigured ? [] : SEED_PROJECTS,
  lots: isSupabaseConfigured ? [] : SEED_LOTS,
  tasks: isSupabaseConfigured ? [] : SEED_TASKS,

  selected: [],
  lateOnly: false,
  search: '',
  projectFilter: '',
  openLotId: null,
  sort: 'urgence',
  view: 'liste',
  calMode: 'mois',
  calMonth: { year: new Date().getFullYear(), month: new Date().getMonth() },
  calWeek: 0,
  calOpenDay: null,
  showTasksInCalendar: true,
  showTasksInGantt: true,
  ganttFullRange: false,
  showArchived: false,
  toast: null,
  toastUndo: null,
  syncStatus: 'ok',

  colorPickerProjectId: null,
  projectRenameDraft: '',
  projectDraft: '',
  lotDraft: '',
  taskDraft: '',
  confirmDeleteProjectId: null,
  moveMenuOpen: false,
  taskDatePickerId: null,
  dragProjectId: null,
  overProjectId: null,
  dragLotId: null,
  overLotId: null,

  addProject: (rawName) => {
    const name = rawName.trim();
    if (!name) return null;
    const { projects } = get();
    const id = uid('proj');
    const color = nextProjectColor(projects.map((p) => p.color));
    const position = projects.length ? Math.max(...projects.map((p) => p.position)) + 1 : 0;
    set((s) => ({
      projects: s.projects.concat([{ id, userId: 'local', name, color, position }]),
      selected: s.selected.concat([id]),
      projectDraft: '',
      colorPickerProjectId: id,
      view: 'liste',
    }));
    return id;
  },

  renameProject: (id, name) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
  },

  setProjectColor: (id, color) => {
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, color } : p)) }));
  },

  requestDeleteProject: (id) => set({ confirmDeleteProjectId: id }),
  cancelDeleteProject: () => set({ confirmDeleteProjectId: null }),

  // Suppression d'un projet : ses lots passent en "sans projet" (jamais de cascade) — README §1.
  confirmDeleteProject: (id) => {
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      lots: s.lots.map((l) => (l.projectId === id ? { ...l, projectId: null, updatedAt: nowIso() } : l)),
      selected: s.selected.filter((k) => k !== id),
      confirmDeleteProjectId: null,
      colorPickerProjectId: null,
    }));
  },

  reorderProjects: (fromId, toId) => {
    if (!fromId || fromId === toId) return;
    set((s) => {
      const order = s.projects.slice().sort((a, b) => a.position - b.position);
      const from = order.findIndex((p) => p.id === fromId);
      const to = order.findIndex((p) => p.id === toId);
      if (from < 0 || to < 0) return {};
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      const repositioned = order.map((p, i) => ({ ...p, position: i }));
      return {
        projects: s.projects.map((p) => repositioned.find((r) => r.id === p.id) ?? p),
        dragProjectId: null,
        overProjectId: null,
      };
    });
  },

  toggleProjectPicker: (id) => {
    set((s) => ({
      colorPickerProjectId: s.colorPickerProjectId === id ? null : id,
      confirmDeleteProjectId: null,
    }));
  },

  toggleSelected: (key) => {
    set((s) => {
      const selected = s.selected.includes(key) ? s.selected.filter((k) => k !== key) : s.selected.concat([key]);
      return { selected, openLotId: openLotIfStillVisible(s, selected) };
    });
  },

  selectOnly: (key) => {
    set((s) => ({ selected: [key], openLotId: openLotIfStillVisible(s, [key]) }));
  },

  clearSelected: () => set({ selected: [] }),

  addLot: (rawTitle, projectKey, opts) => {
    const raw = rawTitle.trim();
    if (!raw) return null;
    const parsed = opts?.parse === false ? { title: raw, ...UNPARSED } : quickParse(raw);
    const title = parsed.title;
    const target =
      projectKey === undefined
        ? (get().selected.find((k) => k !== NO_PROJECT) as string | undefined)
        : projectKey === NO_PROJECT
          ? null
          : projectKey;
    const id = uid('lot');
    const now = nowIso();
    set((s) => ({
      lots: [
        {
          id,
          userId: 'local',
          projectId: target ?? null,
          title,
          body: '',
          startDate: null,
          repeat: 'none',
          ...parsedFields(parsed),
          done: false,
          position: null,
          createdAt: now,
          updatedAt: now,
        },
        ...s.lots,
      ],
      lotDraft: '',
      openLotId: id,
      lateOnly: false,
    }));
    const understood = describeParse(parsed, formatShortDate);
    if (understood)
      get().flash(`compris : ${understood}`, () =>
        set((s) => ({
          lots: s.lots.map((l) => (l.id === id ? { ...l, title: raw, ...UNPARSED, updatedAt: nowIso() } : l)),
        })),
      );
    return id;
  },

  openLot: (id) => set({ openLotId: id, moveMenuOpen: false, taskDatePickerId: null }),

  toggleOpenLot: (id) => {
    const { openLotId, openLot } = get();
    openLot(openLotId === id ? null : id);
  },

  setLotDueDate: (id, due) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, due, updatedAt: nowIso() } : l)) }));
  },

  // Saisir « du » remplit « au » avec la même date si elle est encore vide (saisie rapide
  // d'une tâche/rdv sur une seule journée) — sans écraser une échéance déjà choisie.
  setLotStartDate: (id, startDate) => {
    set((s) => ({
      lots: s.lots.map((l) =>
        l.id === id
          ? { ...l, startDate, due: startDate && isPlausibleDate(startDate) && !l.due ? startDate : l.due, updatedAt: nowIso() }
          : l,
      ),
    }));
  },

  setLotRepeat: (id, repeat) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, repeat, updatedAt: nowIso() } : l)) }));
  },

  setLotStartTime: (id, startTime) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, startTime, updatedAt: nowIso() } : l)) }));
  },

  setLotEndTime: (id, endTime) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, endTime, updatedAt: nowIso() } : l)) }));
  },

  setLotLocation: (id, location) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, location, updatedAt: nowIso() } : l)) }));
  },

  updateLotTitle: (id, title) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, title, updatedAt: nowIso() } : l)) }));
  },

  updateLotBody: (id, body) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, body, updatedAt: nowIso() } : l)) }));
  },

  setLotDue: (id, key) => {
    const due = dueFromChoice(key);
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, due, updatedAt: nowIso() } : l)) }));
  },

  toggleLotDone: (id) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, done: !l.done, updatedAt: nowIso() } : l)) }));
  },

  moveLotToProject: (id, projectId) => {
    set((s) => ({
      lots: s.lots.map((l) => (l.id === id ? { ...l, projectId, updatedAt: nowIso() } : l)),
      moveMenuOpen: false,
    }));
  },

  toggleMoveMenu: () => set((s) => ({ moveMenuOpen: !s.moveMenuOpen })),

  // Plus de confirmation en deux temps : suppression immédiate, « annuler » dans le toast
  // remet le lot et ses tâches tels quels (mêmes ids, donc la synchro les recrée à l'identique).
  deleteLot: (id) => {
    const s0 = get();
    const lot = s0.lots.find((l) => l.id === id);
    if (!lot) return;
    const tasks = s0.tasks.filter((t) => t.lotId === id);
    set((s) => ({
      lots: s.lots.filter((l) => l.id !== id),
      tasks: s.tasks.filter((t) => t.lotId !== id),
      openLotId: s.openLotId === id ? null : s.openLotId,
      moveMenuOpen: false,
    }));
    get().flash('lot supprimé', () =>
      set((s) => ({ lots: [lot, ...s.lots], tasks: s.tasks.concat(tasks) })),
    );
  },

  reorderLots: (fromId, toId) => {
    if (!fromId || fromId === toId) return;
    set((s) => {
      const visible = s.lots.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const from = visible.findIndex((l) => l.id === fromId);
      const to = visible.findIndex((l) => l.id === toId);
      if (from < 0 || to < 0) return {};
      const [moved] = visible.splice(from, 1);
      visible.splice(to, 0, moved);
      const repositioned = visible.map((l, i) => ({ ...l, position: i }));
      return {
        lots: s.lots.map((l) => repositioned.find((r) => r.id === l.id) ?? l),
        sort: 'manuel' as SortMode,
        dragLotId: null,
        overLotId: null,
      };
    });
  },

  addTask: (lotId, rawLabel, opts) => {
    const raw = rawLabel.trim();
    if (!raw) return null;
    const parsed = opts?.parse === false ? { title: raw, ...UNPARSED } : quickParse(raw);
    const label = parsed.title;
    const id = uid('task');
    set((s) => {
      const count = s.tasks.filter((t) => t.lotId === lotId).length;
      return {
        tasks: s.tasks.concat([
          {
            id,
            lotId,
            label,
            startDate: null,
            ...parsedFields(parsed),
            done: false,
            position: count,
          },
        ]),
        taskDraft: '',
      };
    });
    const understood = describeParse(parsed, formatShortDate);
    if (understood)
      get().flash(`compris : ${understood}`, () =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, label: raw, ...UNPARSED } : t)) })),
      );
    return id;
  },

  addTasks: (lotId, labels) => {
    let n = 0;
    for (const label of labels) if (get().addTask(lotId, label)) n++;
    return n;
  },

  toggleTask: (id) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  },

  updateTaskLabel: (id, label) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, label } : t)) }));
  },

  setTaskDue: (id, key) => {
    const due = dueFromChoice(key);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, due } : t)), taskDatePickerId: null }));
  },

  setTaskDueDate: (id, due) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, due } : t)) }));
  },

  // Même règle que pour le lot : « au » (due) prend la date de « du » si elle est encore vide.
  setTaskStartDate: (id, startDate) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, startDate, due: startDate && isPlausibleDate(startDate) && !t.due ? startDate : t.due }
          : t,
      ),
    }));
  },

  setTaskStartTime: (id, startTime) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, startTime } : t)) }));
  },

  setTaskEndTime: (id, endTime) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, endTime } : t)) }));
  },

  setTaskLocation: (id, location) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, location } : t)) }));
  },

  deleteTask: (id) => {
    const index = get().tasks.findIndex((t) => t.id === id);
    if (index < 0) return;
    const task = get().tasks[index];
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), taskDatePickerId: null }));
    // Remise à sa place d'origine ; le lot a pu être supprimé entre-temps : pas de tâche orpheline.
    get().flash('tâche supprimée', () =>
      set((s) =>
        s.lots.some((l) => l.id === task.lotId)
          ? { tasks: [...s.tasks.slice(0, index), task, ...s.tasks.slice(index)] }
          : {},
      ),
    );
  },

  openTaskDatePicker: (id) => set((s) => ({ taskDatePickerId: s.taskDatePickerId === id ? null : id })),

  setSearch: (q) => set({ search: q }),
  setProjectFilter: (q) => set({ projectFilter: q }),
  toggleLateOnly: () => set((s) => ({ lateOnly: !s.lateOnly })),

  cycleSort: () => {
    set((s) => {
      const i = SORT_CYCLE.indexOf(s.sort);
      return { sort: SORT_CYCLE[(i + 1) % SORT_CYCLE.length] };
    });
  },

  // En repassant en Liste avec un lot ouvert, son projet est ajouté à la sélection (§3.1).
  setView: (v) => {
    set((s) => {
      if (v !== 'liste' || !s.openLotId) return { view: v };
      const lot = s.lots.find((l) => l.id === s.openLotId);
      const key = lot ? (lot.projectId ?? NO_PROJECT) : null;
      if (!key || s.selected.includes(key)) return { view: v };
      return { view: v, selected: s.selected.concat([key]) };
    });
  },

  // Changer de mode ramène à la période courante, comme dans le prototype.
  setCalMode: (m) => {
    const now = new Date();
    set({ calMode: m, calWeek: 0, calMonth: { year: now.getFullYear(), month: now.getMonth() } });
  },

  calStep: (delta) => {
    set((s) => {
      if (s.calMode === 'semaine') return { calWeek: s.calWeek + delta };
      const d = new Date(s.calMonth.year, s.calMonth.month + delta, 1);
      return { calMonth: { year: d.getFullYear(), month: d.getMonth() } };
    });
  },

  openCalDay: (day) => set({ calOpenDay: day }),
  closeCalDay: () => set({ calOpenDay: null }),

  toggleTasksInCalendar: () => set((s) => ({ showTasksInCalendar: !s.showTasksInCalendar })),
  toggleTasksInGantt: () => set((s) => ({ showTasksInGantt: !s.showTasksInGantt })),
  toggleGanttFullRange: () => set((s) => ({ ganttFullRange: !s.ganttFullRange })),
  toggleShowArchived: () => set((s) => ({ showArchived: !s.showArchived })),

  // Toast : disparaît après ~2 s (§5 « Confirmations et retours ») ; 5 s s'il propose « annuler ».
  flash: (msg, undo) => {
    clearTimeout(toastTimer);
    set({ toast: msg, toastUndo: undo ?? null });
    toastTimer = setTimeout(() => set({ toast: null, toastUndo: null }), undo ? 5000 : 2200);
  },

  undoToast: () => {
    const undo = get().toastUndo;
    clearTimeout(toastTimer);
    set({ toast: null, toastUndo: null });
    undo?.();
  },

  setDragProject: (id) => set({ dragProjectId: id }),
  setOverProject: (id) => set({ overProjectId: id }),
  setDragLot: (id) => set({ dragLotId: id }),
  setOverLot: (id) => set({ overLotId: id }),
}));

/** Urgence + tri d'une liste de lots, cf. règles métier README §1 (voir note sur l'ordre dans types/models.ts). */
export function sortLots(lots: Lot[], mode: SortMode): Lot[] {
  const list = lots.slice();
  if (mode === 'manuel') {
    return list.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
  }
  if (mode === 'récent') {
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }
  return list.sort((a, b) => {
    const ua = computeUrgency(a);
    const ub = computeUrgency(b);
    const byUrgency = compareUrgency(ua, ub);
    if (byUrgency !== 0) return byUrgency;
    return (a.due ?? '').localeCompare(b.due ?? '');
  });
}

/** Recherche (§1) : titre, corps et libellés de tâches du lot. `q` déjà en minuscules. */
export function lotMatches(lot: Lot, tasks: Task[], q: string): boolean {
  if (!q) return true;
  const labels = tasks.filter((t) => t.lotId === lot.id).map((t) => t.label);
  return [lot.title, lot.body, ...labels].join(' ').toLowerCase().includes(q);
}

/** Lots hors archives (mobile : calendrier, vue jour…). */
export function useActiveLots(): Lot[] {
  const lots = useStore((s) => s.lots);
  return useMemo(() => lots.filter((l) => !isArchived(l)), [lots]);
}

/**
 * Lots visibles selon la sélection, le filtre « retard » et la recherche (prototype `visible()`).
 * Sans sélection, Calendrier et Gantt montrent tous les projets ; la Liste n'en montre aucun (§3.2).
 * La recherche porte sur le titre, le corps et les libellés de tâches (§1).
 * Les lots archivés n'apparaissent qu'avec une recherche ou `showArchived`.
 */
export function filterLots(
  s: Pick<State, 'lots' | 'tasks' | 'selected' | 'lateOnly' | 'search' | 'view'> & { showArchived?: boolean },
): Lot[] {
  const q = s.search.toLowerCase();
  // Calendrier et Gantt affichent toujours tous les projets/sans-projet par défaut, quelle que
  // soit la sélection laissée par la vue Liste (qui, elle, respecte la sélection). Décision
  // explicite de l'utilisateur : la sélection ne doit pas filtrer silencieusement ces deux vues.
  const scopeAll = s.view !== 'liste';
  return s.lots.filter((l) => {
    if (!scopeAll && !s.selected.includes(l.projectId ?? NO_PROJECT)) return false;
    if (s.lateOnly && computeUrgency(l) !== 'late') return false;
    if (!q && !s.showArchived && isArchived(l)) return false;
    return lotMatches(l, s.tasks, q);
  });
}

/** Dans le Gantt et le calendrier, une tâche reste visible si son lot correspond ou si son libellé correspond (§1). */
export function taskMatchesSearch(lot: Lot, task: Task, search: string): boolean {
  const q = search.toLowerCase();
  if (!q) return true;
  return (lot.title + ' ' + lot.body).toLowerCase().includes(q) || task.label.toLowerCase().includes(q);
}
