import { useMemo, useState } from 'react';
import { filterLots, taskMatchesSearch, useStore } from '../../state/store';
import { computeUrgency } from '../../types/models';
import { contrastText, NO_PROJECT_COLOR } from '../../lib/palette';
import { formatShortDate, formatTimeRange, MONTHS_SHORT } from '../../lib/format';
import { MONTHS_LONG, WEEK_HEAD, daysInRange, mondayOf, shiftDays, startOfDay, toDay } from '../../lib/dates';
import DayView from './DayView';
import './CalendarView.css';

// Vue Calendrier desktop — README §3.5, prototype `buildCell()` / `dropOn()`.

type Drag = { kind: 'lot' | 'task'; id: string };

type Item = {
  key: string;
  drag: Drag;
  lotId: string;
  label: string;
  isTask: boolean;
  done: boolean;
  bg: string;
  fg: string;
  edge: string;
  time: string | null; // pour trier les cases par horaire, horodatés d'abord
};

export default function CalendarView() {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const selected = useStore((s) => s.selected);
  const lateOnly = useStore((s) => s.lateOnly);
  const search = useStore((s) => s.search);
  const openLotId = useStore((s) => s.openLotId);
  const calMode = useStore((s) => s.calMode);
  const calMonth = useStore((s) => s.calMonth);
  const calWeek = useStore((s) => s.calWeek);
  const showTasks = useStore((s) => s.showTasksInCalendar);

  const calOpenDay = useStore((s) => s.calOpenDay);

  const setCalMode = useStore((s) => s.setCalMode);
  const calStep = useStore((s) => s.calStep);
  const toggleTasks = useStore((s) => s.toggleTasksInCalendar);
  const toggleOpenLot = useStore((s) => s.toggleOpenLot);
  const setLotDueDate = useStore((s) => s.setLotDueDate);
  const setTaskDueDate = useStore((s) => s.setTaskDueDate);
  const openCalDay = useStore((s) => s.openCalDay);
  const closeCalDay = useStore((s) => s.closeCalDay);
  const flash = useStore((s) => s.flash);

  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const isWeek = calMode === 'semaine';
  const today = startOfDay();
  const todayKey = toDay(today);
  const weekStart = shiftDays(mondayOf(today), calWeek * 7);

  // Rangées de jours : 1 en semaine ; 5 ou 6 en mois (lundi en premier).
  const rows: Date[][] = [];
  if (isWeek) {
    rows.push(Array.from({ length: 7 }, (_, i) => shiftDays(weekStart, i)));
  } else {
    const first = new Date(calMonth.year, calMonth.month, 1);
    const gridStart = mondayOf(first);
    for (let w = 0; w < 6; w++) {
      const row = Array.from({ length: 7 }, (_, i) => shiftDays(gridStart, w * 7 + i));
      rows.push(row);
      if (w >= 4 && row[6].getMonth() !== calMonth.month) break;
    }
  }

  const itemsByDay = useMemo(() => {
    const colorOf = (projectId: string | null) =>
      projectId ? projects.find((p) => p.id === projectId)?.color ?? NO_PROJECT_COLOR : NO_PROJECT_COLOR;
    const vis = filterLots({ lots, tasks, selected, lateOnly, search, view: 'cal' });
    const map = new Map<string, Item[]>();
    const push = (day: string, item: Item) => {
      const list = map.get(day);
      if (list) list.push(item);
      else map.set(day, [item]);
    };
    // Les lots d'abord, puis les tâches, dans chaque case.
    for (const lot of vis) {
      if (!lot.due) continue;
      const col = colorOf(lot.projectId);
      const open = openLotId === lot.id;
      const item: Item = {
        key: lot.id,
        drag: { kind: 'lot', id: lot.id },
        lotId: lot.id,
        label: lot.startTime ? `${formatTimeRange(lot.startTime, lot.endTime)} ${lot.title}` : lot.title,
        isTask: false,
        done: lot.done,
        bg: open ? 'var(--yellow)' : col,
        fg: open ? 'var(--ink)' : contrastText(col),
        edge: computeUrgency(lot) === 'late' ? 'var(--red)' : open ? 'var(--ink)' : col,
        time: lot.startTime,
      };
      // Sur plusieurs jours : affiché dans chaque case de la fourchette, pas seulement à
      // l'échéance (décision utilisateur, retour du 2026-09-29).
      for (const day of daysInRange(lot.startDate, lot.due)) push(day, item);
    }
    if (showTasks) {
      for (const lot of vis) {
        const col = colorOf(lot.projectId);
        for (const t of tasks) {
          if (t.lotId !== lot.id || !t.due || !taskMatchesSearch(lot, t, search)) continue;
          const late = !t.done && t.due < todayKey;
          const item: Item = {
            key: t.id,
            drag: { kind: 'task', id: t.id },
            lotId: lot.id,
            label: '↳ ' + (t.startTime ? `${formatTimeRange(t.startTime, t.endTime)} ${t.label}` : t.label),
            isTask: true,
            done: t.done,
            bg: openLotId === lot.id ? 'var(--yellow-pale)' : 'var(--paper)',
            fg: t.done ? 'var(--text-secondary)' : 'var(--ink)',
            edge: late ? 'var(--red)' : col,
            time: t.startTime,
          };
          for (const day of daysInRange(t.startDate, t.due)) push(day, item);
        }
      }
    }
    // Éléments horodatés d'abord, triés par heure ; les autres (sans heure) restent à la suite.
    for (const list of map.values()) list.sort((a, b) => (a.time ?? '24:60').localeCompare(b.time ?? '24:60'));
    return map;
  }, [lots, tasks, projects, selected, lateOnly, search, openLotId, showTasks, todayKey]);

  function dropOn(day: string) {
    if (!drag) return;
    if (drag.kind === 'lot') setLotDueDate(drag.id, day);
    else setTaskDueDate(drag.id, day);
    setDrag(null);
    setOver(null);
    flash('échéance → ' + formatShortDate(day));
  }

  const title = isWeek
    ? `semaine du ${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]}`
    : `${MONTHS_LONG[calMonth.month]} ${calMonth.year}`;

  return (
    <div className={`cal ${isWeek ? 'cal--week' : ''}`}>
      <div className="cal__toolbar">
        <button className="cal__nav" onClick={() => calStep(-1)} aria-label="période précédente">
          ‹
        </button>
        <span className="cal__title">{title}</span>
        <button className="cal__nav" onClick={() => calStep(1)} aria-label="période suivante">
          ›
        </button>
        <span className="cal__hint">clic = ouvrir · glisser = changer la date</span>
        <div className="cal__modes">
          {(['mois', 'semaine'] as const).map((m) => (
            <button
              key={m}
              className={`cal__mode ${calMode === m ? 'cal__mode--on' : ''}`}
              onClick={() => setCalMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <button className={`cal__tasksBtn ${showTasks ? 'cal__tasksBtn--on' : ''}`} onClick={toggleTasks}>
          {showTasks ? 'tâches ✓' : 'tâches –'}
        </button>
      </div>

      {calOpenDay ? (
        <DayView day={calOpenDay} onClose={closeCalDay} onNavigate={openCalDay} />
      ) : (
        <>
      <div className="cal__head">
        {WEEK_HEAD.map((h) => (
          <div key={h} className="cal__headCell">
            {h}
          </div>
        ))}
      </div>

      <div className="cal__grid">
        {rows.map((row) => (
          <div key={toDay(row[0])} className="cal__row">
            {row.map((date) => {
              const key = toDay(date);
              const inMonth = isWeek || date.getMonth() === calMonth.month;
              const isToday = key === todayKey;
              const isOver = over === key && drag !== null;
              const classes = [
                'cal__cell',
                !inMonth ? 'cal__cell--out' : '',
                isToday ? 'cal__cell--today' : '',
                isOver ? 'cal__cell--over' : '',
              ].join(' ');
              return (
                <div
                  key={key}
                  className={classes}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (over !== key) setOver(key);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOn(key);
                  }}
                >
                  <div className="cal__cellHead">
                    <button
                      className="cal__num"
                      title="ouvrir la vue journalière"
                      onClick={() => openCalDay(key)}
                    >
                      {isWeek ? `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}` : date.getDate()}
                    </button>
                    {isToday && <span className="cal__flag">●</span>}
                  </div>
                  <div className="cal__items">
                    {(itemsByDay.get(key) ?? []).map((it) => (
                      <button
                        key={it.key}
                        draggable
                        className={`cal__item ${it.isTask ? 'cal__item--task' : ''} ${it.done ? 'cal__item--done' : ''}`}
                        style={{
                          background: it.bg,
                          color: it.fg,
                          borderLeftColor: it.edge,
                          opacity: drag && drag.kind === it.drag.kind && drag.id === it.drag.id ? 0.35 : 1,
                        }}
                        title={it.label}
                        onClick={() => toggleOpenLot(it.lotId)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', it.drag.kind);
                          setDrag(it.drag);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver(null);
                        }}
                      >
                        {it.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}
