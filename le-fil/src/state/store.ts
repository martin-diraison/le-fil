import { create } from 'zustand';
import type { CalMode, Lot, Project, SortMode, Task, ViewMode } from '../types/models';
import { computeUrgency, compareUrgency } from '../types/models';
import { nextProjectColor } from '../lib/palette';
import { dueFromChoice, type DateChoiceKey } from './dateShortcuts';
import { SEED_LOTS, SEED_PROJECTS, SEED_TASKS } from './seed';

/** Sentinel pour la sélection "sans projet" dans le menu gauche (§3.2, §3.6). */
export const NO_PROJECT = '__no_project__' as const;
export type ProjectKey = string | typeof NO_PROJECT;

function uid(prefix: string): string {
  return prefix + '_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
}

function nowIso() {
  return new Date().toISOString();
}

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
  showTasksInCalendar: boolean;
  showTasksInGantt: boolean;
  toast: string | null;

  // Édition / interactions
  colorPickerProjectId: string | null;
  projectRenameDraft: string;
  projectDraft: string;
  lotDraft: string;
  taskDraft: string;
  confirmDeleteProjectId: string | null;
  confirmDeleteLot: boolean;
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
  toggleSelected: (key: ProjectKey) => void;
  clearSelected: () => void;

  // Actions — lots
  /**
   * Crée un lot et l'ouvre. Sans `projectKey`, il va dans le premier projet sélectionné (desktop) ;
   * sinon dans le projet indiqué (mobile : projet ouvert, ou `null` / NO_PROJECT = sans projet).
   */
  addLot: (title: string, projectKey?: ProjectKey | null) => void;
  openLot: (id: string | null) => void;
  /** Calendrier / Gantt : ouvre le lot, ou le referme s'il est déjà ouvert (§3.1). */
  toggleOpenLot: (id: string) => void;
  setLotDueDate: (id: string, due: string | null) => void;
  updateLotTitle: (id: string, title: string) => void;
  updateLotBody: (id: string, body: string) => void;
  setLotDue: (id: string, key: DateChoiceKey) => void;
  toggleLotDone: (id: string) => void;
  moveLotToProject: (id: string, projectId: string | null) => void;
  requestDeleteLot: () => void;
  cancelDeleteLot: () => void;
  confirmDeleteLotNow: () => void;
  reorderLots: (fromId: string, toId: string) => void;
  toggleMoveMenu: () => void;

  // Actions — tâches
  addTask: (lotId: string, label: string) => void;
  toggleTask: (id: string) => void;
  setTaskDue: (id: string, key: DateChoiceKey) => void;
  setTaskDueDate: (id: string, due: string | null) => void;
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
  toggleTasksInCalendar: () => void;
  toggleTasksInGantt: () => void;
  flash: (msg: string) => void;

  // Drag state setters (menu projets)
  setDragProject: (id: string | null) => void;
  setOverProject: (id: string | null) => void;
  setDragLot: (id: string | null) => void;
  setOverLot: (id: string | null) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const SORT_CYCLE: SortMode[] = ['urgence', 'récent', 'manuel'];

export const useStore = create<State>((set, get) => ({
  projects: SEED_PROJECTS,
  lots: SEED_LOTS,
  tasks: SEED_TASKS,

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
  showTasksInCalendar: true,
  showTasksInGantt: true,
  toast: null,

  colorPickerProjectId: null,
  projectRenameDraft: '',
  projectDraft: '',
  lotDraft: '',
  taskDraft: '',
  confirmDeleteProjectId: null,
  confirmDeleteLot: false,
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
    set((s) => ({
      selected: s.selected.includes(key) ? s.selected.filter((k) => k !== key) : s.selected.concat([key]),
    }));
  },

  clearSelected: () => set({ selected: [] }),

  addLot: (rawTitle, projectKey) => {
    const title = rawTitle.trim();
    if (!title) return;
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
          due: null,
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
  },

  openLot: (id) => set({ openLotId: id, moveMenuOpen: false, confirmDeleteLot: false, taskDatePickerId: null }),

  toggleOpenLot: (id) => {
    const { openLotId, openLot } = get();
    openLot(openLotId === id ? null : id);
  },

  setLotDueDate: (id, due) => {
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, due, updatedAt: nowIso() } : l)) }));
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

  requestDeleteLot: () => set({ confirmDeleteLot: true }),
  cancelDeleteLot: () => set({ confirmDeleteLot: false }),
  toggleMoveMenu: () => set((s) => ({ moveMenuOpen: !s.moveMenuOpen })),

  confirmDeleteLotNow: () => {
    const { openLotId } = get();
    if (!openLotId) return;
    set((s) => ({
      lots: s.lots.filter((l) => l.id !== openLotId),
      tasks: s.tasks.filter((t) => t.lotId !== openLotId),
      openLotId: null,
      confirmDeleteLot: false,
      moveMenuOpen: false,
    }));
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

  addTask: (lotId, rawLabel) => {
    const label = rawLabel.trim();
    if (!label) return;
    set((s) => {
      const count = s.tasks.filter((t) => t.lotId === lotId).length;
      return {
        tasks: s.tasks.concat([{ id: uid('task'), lotId, label, due: null, done: false, position: count }]),
        taskDraft: '',
      };
    });
  },

  toggleTask: (id) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  },

  setTaskDue: (id, key) => {
    const due = dueFromChoice(key);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, due } : t)), taskDatePickerId: null }));
  },

  setTaskDueDate: (id, due) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, due } : t)) }));
  },

  deleteTask: (id) => {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), taskDatePickerId: null }));
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

  toggleTasksInCalendar: () => set((s) => ({ showTasksInCalendar: !s.showTasksInCalendar })),
  toggleTasksInGantt: () => set((s) => ({ showTasksInGantt: !s.showTasksInGantt })),

  // Toast : disparaît après ~2 s (§5 « Confirmations et retours »).
  flash: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
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

/**
 * Lots visibles selon la sélection, le filtre « retard » et la recherche (prototype `visible()`).
 * Sans sélection, Calendrier et Gantt montrent tous les projets ; la Liste n'en montre aucun (§3.2).
 * La recherche porte sur le titre, le corps et les libellés de tâches (§1).
 */
export function filterLots(
  s: Pick<State, 'lots' | 'tasks' | 'selected' | 'lateOnly' | 'search' | 'view'>,
): Lot[] {
  const q = s.search.toLowerCase();
  const scopeAll = s.selected.length === 0 && s.view !== 'liste';
  return s.lots.filter((l) => {
    if (!scopeAll && !s.selected.includes(l.projectId ?? NO_PROJECT)) return false;
    if (s.lateOnly && computeUrgency(l) !== 'late') return false;
    if (q) {
      const labels = s.tasks.filter((t) => t.lotId === l.id).map((t) => t.label);
      if (![l.title, l.body, ...labels].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/** Dans le Gantt et le calendrier, une tâche reste visible si son lot correspond ou si son libellé correspond (§1). */
export function taskMatchesSearch(lot: Lot, task: Task, search: string): boolean {
  const q = search.toLowerCase();
  if (!q) return true;
  return (lot.title + ' ' + lot.body).toLowerCase().includes(q) || task.label.toLowerCase().includes(q);
}
