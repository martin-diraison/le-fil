import { useRef } from 'react';
import { taskMatchesSearch, useStore } from '../../state/store';
import { DAYS_SHORT, MONTHS_SHORT, formatTime } from '../../lib/format';
import { isDayInRange, parseDay, shiftDays, toDay } from '../../lib/dates';
import { DAY_GRID_HOURS, layoutDayGrid, type DayGridEntry } from '../../lib/dayGrid';
import { contrastText } from '../../lib/palette';
import { projectColor } from './labels';
import type { MobileNav } from './MobileShell';

// Vue journalière mobile (grille horaire type agenda, façon widget calendrier smartphone) —
// cadrage utilisateur du 2026-09-29 : ouverte en tapant une case du mois, swipe gauche/droite
// pour changer de jour, superposition si chevauchement.

const SWIPE_THRESHOLD = 50;

type Entry = DayGridEntry & {
  label: string;
  color: string;
  done: boolean;
  lotId: string;
};

export default function DayScreen({
  nav,
  day,
  setDay,
  onBack,
}: {
  nav: MobileNav;
  day: string;
  setDay: (d: string) => void;
  onBack: () => void;
}) {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const showTasks = useStore((s) => s.showTasksInCalendar);
  const search = useStore((s) => s.search);

  const touchX = useRef<number | null>(null);

  const dayDate = parseDay(day);
  const title = `${DAYS_SHORT[dayDate.getDay()]} ${dayDate.getDate()} ${MONTHS_SHORT[dayDate.getMonth()]}`;

  const goDay = (delta: number) => setDay(toDay(shiftDays(dayDate, delta)));

  const timed: Entry[] = [];
  const allDay: Entry[] = [];
  for (const lot of lots) {
    if (!lot.due || !isDayInRange(lot.startDate, lot.due, day)) continue;
    const entry: Entry = {
      id: lot.id,
      startTime: lot.startTime ?? '',
      endTime: lot.endTime,
      label: lot.title,
      color: projectColor(projects, lot.projectId),
      done: lot.done,
      lotId: lot.id,
    };
    (lot.startTime ? timed : allDay).push(entry);
  }
  if (showTasks) {
    for (const lot of lots) {
      for (const t of tasks) {
        if (t.lotId !== lot.id || !t.due || !isDayInRange(t.startDate, t.due, day)) continue;
        if (!taskMatchesSearch(lot, t, search)) continue;
        const entry: Entry = {
          id: t.id,
          startTime: t.startTime ?? '',
          endTime: t.endTime,
          label: '↳ ' + t.label,
          color: projectColor(projects, lot.projectId),
          done: t.done,
          lotId: lot.id,
        };
        (t.startTime ? timed : allDay).push(entry);
      }
    }
  }
  const positioned = layoutDayGrid(timed);

  return (
    <div
      className="m__col"
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(delta) < SWIPE_THRESHOLD) return;
        goDay(delta > 0 ? -1 : 1);
      }}
    >
      <div className="m__topbar">
        <button className="m__back" onClick={onBack}>
          ← mois
        </button>
        <button className="m__dayNav" onClick={() => goDay(-1)} aria-label="jour précédent">
          ‹
        </button>
        <span className="m__topTitle m__dayTitleBar">{title}</span>
        <button className="m__dayNav" onClick={() => goDay(1)} aria-label="jour suivant">
          ›
        </button>
      </div>

      {allDay.length > 0 && (
        <div className="m__dayAllDay">
          {allDay.map((e) => (
            <button
              key={e.id}
              className={`m__dayAllDayItem ${e.done ? 'm__dayAllDayItem--done' : ''}`}
              style={{ borderLeftColor: e.color }}
              onClick={() => nav.openLot(e.lotId, 'day')}
            >
              {e.label}
            </button>
          ))}
        </div>
      )}

      <div className="m__scroll m__dayGrid">
        <div className="m__dayHours">
          {DAY_GRID_HOURS.map((h) => (
            <div key={h} className="m__dayHour">
              {String(h).padStart(2, '0')}h
            </div>
          ))}
        </div>
        <div className="m__dayLanes">
          {DAY_GRID_HOURS.map((h) => (
            <div key={h} className="m__dayHourLine" style={{ top: `${(h / 24) * 100}%` }} />
          ))}
          {positioned.map((e) => (
            <button
              key={e.id}
              className={`m__dayBlock ${e.done ? 'm__dayBlock--done' : ''}`}
              style={{
                top: `${e.topPct}%`,
                height: `${e.heightPct}%`,
                left: `${(e.col / e.cols) * 100}%`,
                width: `${100 / e.cols}%`,
                background: e.color,
                color: contrastText(e.color),
              }}
              onClick={() => nav.openLot(e.lotId, 'day')}
            >
              <span className="m__dayBlockTime">{formatTime(e.startTime)}</span> {e.label}
            </button>
          ))}
          {timed.length === 0 && allDay.length === 0 && (
            <div className="m__empty m__dayEmpty">aucune échéance ce jour</div>
          )}
        </div>
      </div>
    </div>
  );
}
