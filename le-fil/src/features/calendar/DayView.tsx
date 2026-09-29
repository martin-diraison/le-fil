import { filterLots, taskMatchesSearch, useStore } from '../../state/store';
import { contrastText, NO_PROJECT_COLOR } from '../../lib/palette';
import { DAYS_SHORT, MONTHS_SHORT, formatTime } from '../../lib/format';
import { isDayInRange, parseDay, shiftDays, toDay } from '../../lib/dates';
import { DAY_GRID_HOURS, layoutDayGrid, type DayGridEntry } from '../../lib/dayGrid';
import './DayView.css';

// Vue journalière desktop (grille horaire type agenda) — ouverte en cliquant sur un jour dans
// la vue Calendrier. Cadrage utilisateur du 2026-09-29 : vue mensuelle conservée comme entrée
// principale, superposition si chevauchement, navigation jour par jour.

type Entry = DayGridEntry & {
  label: string;
  color: string;
  done: boolean;
  lotId: string;
};

export default function DayView({
  day,
  onClose,
  onNavigate,
}: {
  day: string;
  onClose: () => void;
  onNavigate: (day: string) => void;
}) {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const selected = useStore((s) => s.selected);
  const lateOnly = useStore((s) => s.lateOnly);
  const search = useStore((s) => s.search);
  const showTasks = useStore((s) => s.showTasksInCalendar);
  const toggleOpenLot = useStore((s) => s.toggleOpenLot);

  const colorOf = (projectId: string | null) =>
    projectId ? (projects.find((p) => p.id === projectId)?.color ?? NO_PROJECT_COLOR) : NO_PROJECT_COLOR;

  const vis = filterLots({ lots, tasks, selected, lateOnly, search, view: 'cal' });
  const timed: Entry[] = [];
  const allDay: Entry[] = [];

  for (const lot of vis) {
    if (!lot.due || !isDayInRange(lot.startDate, lot.due, day)) continue;
    const entry: Entry = {
      id: lot.id,
      startTime: lot.startTime ?? '',
      endTime: lot.endTime,
      label: lot.title,
      color: colorOf(lot.projectId),
      done: lot.done,
      lotId: lot.id,
    };
    (lot.startTime ? timed : allDay).push(entry);
  }
  if (showTasks) {
    for (const lot of vis) {
      for (const t of tasks) {
        if (t.lotId !== lot.id || !t.due || !isDayInRange(t.startDate, t.due, day)) continue;
        if (!taskMatchesSearch(lot, t, search)) continue;
        const entry: Entry = {
          id: t.id,
          startTime: t.startTime ?? '',
          endTime: t.endTime,
          label: '↳ ' + t.label,
          color: colorOf(lot.projectId),
          done: t.done,
          lotId: lot.id,
        };
        (t.startTime ? timed : allDay).push(entry);
      }
    }
  }

  const positioned = layoutDayGrid(timed);
  const dayDate = parseDay(day);
  const title = `${DAYS_SHORT[dayDate.getDay()]} ${dayDate.getDate()} ${MONTHS_SHORT[dayDate.getMonth()]}`;

  return (
    <div className="dayView">
      <div className="dayView__toolbar">
        <button className="cal__nav" onClick={() => onNavigate(toDay(shiftDays(dayDate, -1)))} aria-label="jour précédent">
          ‹
        </button>
        <span className="cal__title">{title}</span>
        <button className="cal__nav" onClick={() => onNavigate(toDay(shiftDays(dayDate, 1)))} aria-label="jour suivant">
          ›
        </button>
        <button className="dayView__close" onClick={onClose}>
          ✕ retour au mois
        </button>
      </div>

      {allDay.length > 0 && (
        <div className="dayView__allDay">
          {allDay.map((e) => (
            <button
              key={e.id}
              className={`dayView__allDayItem ${e.done ? 'dayView__allDayItem--done' : ''}`}
              style={{ borderLeftColor: e.color }}
              onClick={() => toggleOpenLot(e.lotId)}
            >
              {e.label}
            </button>
          ))}
        </div>
      )}

      <div className="dayView__grid">
        <div className="dayView__hours">
          {DAY_GRID_HOURS.map((h) => (
            <div key={h} className="dayView__hour">
              {String(h).padStart(2, '0')}h
            </div>
          ))}
        </div>
        <div className="dayView__lanes">
          {DAY_GRID_HOURS.map((h) => (
            <div key={h} className="dayView__hourLine" style={{ top: `${(h / 24) * 100}%` }} />
          ))}
          {positioned.map((e) => (
            <button
              key={e.id}
              className={`dayView__block ${e.done ? 'dayView__block--done' : ''}`}
              style={{
                top: `${e.topPct}%`,
                height: `${e.heightPct}%`,
                left: `${(e.col / e.cols) * 100}%`,
                width: `${100 / e.cols}%`,
                background: e.color,
                color: contrastText(e.color),
              }}
              title={`${e.label} — ${formatTime(e.startTime)}${e.endTime ? '–' + formatTime(e.endTime) : ''}`}
              onClick={() => toggleOpenLot(e.lotId)}
            >
              <span className="dayView__blockTime">{formatTime(e.startTime)}</span> {e.label}
            </button>
          ))}
          {timed.length === 0 && allDay.length === 0 && (
            <div className="dayView__empty">aucune échéance ce jour</div>
          )}
        </div>
      </div>
    </div>
  );
}
