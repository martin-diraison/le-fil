import { useMemo, type ReactNode } from 'react';
import { filterLots, NO_PROJECT, taskMatchesSearch, useStore } from '../../state/store';
import { NO_PROJECT_COLOR } from '../../lib/palette';
import { formatShortDate, MONTHS_SHORT } from '../../lib/format';
import { MONTHS_LONG, daysBetween, parseDay, startOfDay, toDay } from '../../lib/dates';
import './GanttView.css';

// Vue Gantt desktop — README §3.6, prototype `ganttRows`.
// Le prototype fige la fenêtre sur SEPT — NOV 2026 (mois précédent · mois courant · mois suivant
// par rapport à sa date du jour) ; on garde cette même fenêtre de 3 mois, calculée depuis aujourd'hui.

/** Longueur d'une barre de lot, en jours ; une barre de tâche fait 1/1.8 de cette longueur. */
const BAR_DAYS = 8;

type Row =
  | { kind: 'project'; key: string; label: string; color: string }
  | {
      kind: 'lot' | 'task';
      key: string;
      lotId: string;
      label: string;
      muted: boolean;
      open: boolean;
      bar: { left: number; width: number; bg: string; title: string } | null;
    };

type GanttWindow = {
  start: Date;
  span: number;
  months: { key: string; label: string; days: number; offset: number }[];
  title: string;
};

/** Fenêtre mensuelle entre deux 1ers du mois (bornes exclusives sur `end`). */
function buildWindow(start: Date, end: Date): GanttWindow {
  const span = Math.max(daysBetween(start, end), 1);
  const monthCount = Math.max(
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
    1,
  );
  const months = Array.from({ length: monthCount }, (_, i) => {
    const m = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    return { key: toDay(m), label: MONTHS_LONG[m.getMonth()], days: daysBetween(m, next), offset: daysBetween(start, m) };
  });
  const last = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  const title =
    monthCount <= 1
      ? `${MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()}`
      : `${MONTHS_SHORT[start.getMonth()]} — ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
  return { start, span, months, title };
}

/** Fenêtre par défaut : mois précédent · courant · suivant, calculée depuis aujourd'hui. */
function threeMonthWindow(todayKey: string): GanttWindow {
  const t = parseDay(todayKey);
  const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const end = new Date(t.getFullYear(), t.getMonth() + 2, 1);
  return buildWindow(start, end);
}

export default function GanttView() {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const selected = useStore((s) => s.selected);
  const lateOnly = useStore((s) => s.lateOnly);
  const search = useStore((s) => s.search);
  const openLotId = useStore((s) => s.openLotId);
  const showTasks = useStore((s) => s.showTasksInGantt);
  const toggleTasks = useStore((s) => s.toggleTasksInGantt);
  const fullRange = useStore((s) => s.ganttFullRange);
  const toggleFullRange = useStore((s) => s.toggleGanttFullRange);
  const toggleOpenLot = useStore((s) => s.toggleOpenLot);

  const today = startOfDay();
  const todayKey = toDay(today);

  const vis = useMemo(
    () => filterLots({ lots, tasks, selected, lateOnly, search, view: 'gantt' }),
    [lots, tasks, selected, lateOnly, search],
  );

  const win = useMemo(() => {
    if (!fullRange) return threeMonthWindow(todayKey);
    // « tout afficher » : la fenêtre s'étend du plus ancien au plus récent jour utile
    // (échéances/débuts des lots visibles, + tâches si affichées), aujourd'hui toujours inclus.
    const days = [todayKey];
    for (const lot of vis) {
      if (lot.startDate) days.push(lot.startDate);
      if (lot.due) days.push(lot.due);
      if (showTasks) {
        for (const t of tasks) {
          if (t.lotId !== lot.id) continue;
          if (t.startDate) days.push(t.startDate);
          if (t.due) days.push(t.due);
        }
      }
    }
    const min = days.reduce((a, b) => (a < b ? a : b));
    const max = days.reduce((a, b) => (a > b ? a : b));
    const minD = parseDay(min);
    const maxD = parseDay(max);
    const start = new Date(minD.getFullYear(), minD.getMonth(), 1);
    const end = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 1);
    return buildWindow(start, end);
  }, [fullRange, vis, tasks, showTasks, todayKey]);

  const rows = useMemo(() => {
    const pct = (day: string) => pctIn(win, day);
    const barW = (BAR_DAYS / win.span) * 100;
    // Toujours toutes les rangées projet (+ « sans projet ») : le Gantt ne doit pas être filtré
    // silencieusement par une sélection laissée par la vue Liste (voir filterLots, même règle).
    const keys = projects
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => p.id as string)
      .concat([NO_PROJECT]);
    const out: Row[] = [];
    for (const key of keys) {
      const project = key === NO_PROJECT ? null : projects.find((p) => p.id === key);
      if (key !== NO_PROJECT && !project) continue;
      // Un lot sans échéance n'a pas de barre à tracer (voir plus bas) : inutile de le lister —
      // décision explicite de l'utilisateur pour ne pas encombrer la colonne de gauche.
      const ls = vis.filter((l) => (l.projectId ?? NO_PROJECT) === key && l.due);
      if (!ls.length) continue;
      const color = project?.color ?? NO_PROJECT_COLOR;
      out.push({ kind: 'project', key, label: project?.name ?? 'Sans projet', color });
      ls.sort((a, b) => a.due!.localeCompare(b.due!));
      for (const lot of ls) {
        const open = openLotId === lot.id;
        out.push({
          kind: 'lot',
          key: lot.id,
          lotId: lot.id,
          label: lot.title,
          muted: lot.done,
          open,
          // La fin de la barre tombe sur l'échéance ; avec un début renseigné, la barre
          // s'étend réellement sur la fourchette plutôt que d'utiliser la largeur par défaut.
          bar: lot.due
            ? lot.startDate
              ? {
                  left: pct(lot.startDate),
                  width: Math.max(pct(lot.due) - pct(lot.startDate), barW / 4),
                  bg: lot.done ? 'var(--border-quiet)' : color,
                  title: `${formatShortDate(lot.startDate)} → ${formatShortDate(lot.due)}`,
                }
              : {
                  left: Math.max(0, pct(lot.due) - barW),
                  width: barW,
                  bg: lot.done ? 'var(--border-quiet)' : color,
                  title: 'échéance ' + formatShortDate(lot.due),
                }
            : null,
        });
        if (!showTasks) continue;
        const lotTasks = tasks
          .filter((t) => t.lotId === lot.id && t.due && taskMatchesSearch(lot, t, search))
          .sort((a, b) => a.due!.localeCompare(b.due!));
        for (const t of lotTasks) {
          const late = !t.done && t.due! < todayKey;
          const taskBarW = barW / 1.8;
          out.push({
            kind: 'task',
            key: t.id,
            lotId: lot.id,
            label: '↳ ' + t.label,
            muted: t.done,
            open,
            bar: t.startDate
              ? {
                  left: pct(t.startDate),
                  width: Math.max(pct(t.due!) - pct(t.startDate), taskBarW / 4),
                  bg: t.done ? 'var(--rule)' : late ? 'var(--red)' : color,
                  title: `${t.label} — ${formatShortDate(t.startDate)} → ${formatShortDate(t.due)}`,
                }
              : {
                  left: pct(t.due!),
                  width: taskBarW,
                  bg: t.done ? 'var(--rule)' : late ? 'var(--red)' : color,
                  title: `${t.label} — ${formatShortDate(t.due)}`,
                },
          });
        }
      }
    }
    return out;
  }, [vis, tasks, projects, selected, search, openLotId, showTasks, todayKey, win]);

  const nowLeft = pctIn(win, todayKey);

  return (
    <div className="gantt">
      <div className="gantt__toolbar">
        <span className="gantt__title">{win.title}</span>
        <span className="gantt__hint">fin de barre = échéance · clic = ouvrir</span>
        <button
          className={`gantt__tasksBtn ${fullRange ? 'gantt__tasksBtn--on' : ''}`}
          title="étendre la fenêtre à tous les lots affichés, plutôt que 3 mois autour d'aujourd'hui"
          onClick={toggleFullRange}
        >
          {fullRange ? 'période · tout' : 'période · 3 mois'}
        </button>
        <button className={`gantt__tasksBtn ${showTasks ? 'gantt__tasksBtn--on' : ''}`} onClick={toggleTasks}>
          {showTasks ? 'tâches · visibles' : 'tâches · masquées'}
        </button>
      </div>

      <div className="gantt__months">
        <div className="gantt__labelCol" />
        <div className="gantt__monthTrack">
          {win.months.map((m) => (
            <div key={m.key} className="gantt__month" style={{ flexGrow: m.days }}>
              {m.label}
            </div>
          ))}
        </div>
      </div>

      <div className="gantt__body">
        {rows.length === 0 && <div className="gantt__empty">aucun lot à afficher</div>}
        {rows.map((r) => {
          if (r.kind === 'project') {
            return (
              <div key={'p_' + r.key} className="gantt__row gantt__row--project">
                <div className="gantt__label">
                  <span className="gantt__dot" style={{ background: r.color }} />
                  <span className="gantt__labelText">{r.label}</span>
                </div>
                <Track months={win.months} span={win.span} nowLeft={nowLeft} />
              </div>
            );
          }
          return (
            <div
              key={r.key}
              className={`gantt__row gantt__row--${r.kind} ${r.open ? 'gantt__row--open' : ''} ${r.muted ? 'gantt__row--muted' : ''}`}
            >
              <button className="gantt__label" onClick={() => toggleOpenLot(r.lotId)} title={r.label}>
                <span className="gantt__labelText">{r.label}</span>
              </button>
              <Track months={win.months} span={win.span} nowLeft={nowLeft}>
                {r.bar ? (
                  <div
                    className="gantt__bar"
                    title={r.bar.title}
                    style={{ marginLeft: r.bar.left + '%', width: r.bar.width + '%', background: r.bar.bg }}
                  />
                ) : (
                  <div className="gantt__noDate">sans date</div>
                )}
              </Track>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Position d'un jour dans la fenêtre, en % (bornée aux extrémités comme le prototype). */
function pctIn(win: { start: Date; span: number }, day: string): number {
  return Math.max(0, Math.min(100, (daysBetween(win.start, parseDay(day)) / win.span) * 100));
}

function Track({
  months,
  span,
  nowLeft,
  children,
}: {
  months: { key: string; offset: number }[];
  span: number;
  nowLeft: number;
  children?: ReactNode;
}) {
  return (
    <div className="gantt__track">
      {months.map((m) => (
        <div key={m.key} className="gantt__gridline" style={{ left: (m.offset / span) * 100 + '%' }} />
      ))}
      <div className="gantt__now" style={{ left: nowLeft + '%' }} />
      {children}
    </div>
  );
}
