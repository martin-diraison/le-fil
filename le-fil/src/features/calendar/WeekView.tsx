import { useEffect, useRef, useState } from 'react';
import { filterLots, useStore } from '../../state/store';
import { NO_PROJECT_COLOR } from '../../lib/palette';
import { DAYS_SHORT, MONTHS_SHORT, formatTime } from '../../lib/format';
import { shiftDays, toDay } from '../../lib/dates';
import { formatShortDate } from '../../lib/format';
import { DAY_GRID_HOURS, layoutDayGrid } from '../../lib/dayGrid';
import { blockColors, buildDayEntries } from './dayEntries';
import './WeekView.css';

// Vue semaine desktop façon agenda : sept colonnes (lun → dim) sur une grille horaire commune ;
// les éléments horodatés sont rangés selon leur heure, ceux sans heure en bandeau « journée ».
// Cliquer l'en-tête d'un jour ouvre la vue journalière.

export default function WeekView({ weekStart, todayKey }: { weekStart: Date; todayKey: string }) {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const selected = useStore((s) => s.selected);
  const lateOnly = useStore((s) => s.lateOnly);
  const search = useStore((s) => s.search);
  const showTasks = useStore((s) => s.showTasksInCalendar);
  const openLotId = useStore((s) => s.openLotId);
  const toggleOpenLot = useStore((s) => s.toggleOpenLot);
  const openCalDay = useStore((s) => s.openCalDay);
  const setLotDueDate = useStore((s) => s.setLotDueDate);
  const setTaskDueDate = useStore((s) => s.setTaskDueDate);
  const flash = useStore((s) => s.flash);

  // Glisser un élément sur un autre jour change son échéance (comme en vue mois).
  const [drag, setDrag] = useState<{ kind: 'lot' | 'task'; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dragProps = (e: { kind: 'lot' | 'task'; id: string }) => ({
    draggable: true,
    onDragStart: (ev: React.DragEvent) => {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', e.kind);
      setDrag({ kind: e.kind, id: e.id });
    },
    onDragEnd: () => {
      setDrag(null);
      setOver(null);
    },
  });
  const dropProps = (day: string) => ({
    onDragOver: (ev: React.DragEvent) => {
      ev.preventDefault();
      if (over !== day) setOver(day);
    },
    onDrop: (ev: React.DragEvent) => {
      ev.preventDefault();
      if (drag) {
        if (drag.kind === 'lot') setLotDueDate(drag.id, day);
        else setTaskDueDate(drag.id, day);
        flash('échéance → ' + formatShortDate(day));
      }
      setDrag(null);
      setOver(null);
    },
  });

  const colorOf = (projectId: string | null) =>
    projectId ? (projects.find((p) => p.id === projectId)?.color ?? NO_PROJECT_COLOR) : NO_PROJECT_COLOR;
  const vis = filterLots({ lots, tasks, selected, lateOnly, search, view: 'cal' });

  const days = Array.from({ length: 7 }, (_, i) => shiftDays(weekStart, i)).map((date) => {
    const key = toDay(date);
    return { date, key, ...buildDayEntries({ day: key, lots: vis, tasks, showTasks, search, colorOf }) };
  });

  // Ouvre la grille sur la matinée plutôt qu'à minuit.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * 48;
  }, []);

  return (
    <div className="weekView">
      <div className="weekView__head">
        <div className="weekView__gutter" />
        {days.map((d) => (
          <button
            key={d.key}
            className={`weekView__dayHead ${d.key === todayKey ? 'weekView__dayHead--today' : ''}`}
            title="ouvrir la vue journalière"
            onClick={() => openCalDay(d.key)}
          >
            {DAYS_SHORT[d.date.getDay()]} {d.date.getDate()} {MONTHS_SHORT[d.date.getMonth()]}
          </button>
        ))}
      </div>

      {days.some((d) => d.allDay.length > 0) && (
        <div className="weekView__allDay">
          <div className="weekView__gutter" />
          {days.map((d) => (
            <div
              key={d.key}
              className={`weekView__allDayCell ${over === d.key && drag ? 'weekView__over' : ''}`}
              {...dropProps(d.key)}
            >
              {d.allDay.map((e) => (
                <button
                  key={e.id}
                  className={`weekView__chip weekView__chip--${e.kind} ${e.done ? 'weekView__chip--done' : ''}`}
                  style={{ borderLeftColor: e.color }}
                  title={e.label}
                  onClick={() => toggleOpenLot(e.lotId)}
                  {...dragProps(e)}
                >
                  {e.kind === 'task' ? '↳ ' : ''}
                  {e.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="weekView__scroll" ref={scroller}>
        <div className="weekView__grid">
          <div className="weekView__hours">
            {DAY_GRID_HOURS.map((h) => (
              <div key={h} className="weekView__hour">
                {String(h).padStart(2, '0')}h
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d.key}
              className={`weekView__lane ${d.key === todayKey ? 'weekView__lane--today' : ''} ${
                over === d.key && drag ? 'weekView__over' : ''
              }`}
              {...dropProps(d.key)}
            >
              {DAY_GRID_HOURS.map((h) => (
                <div key={h} className="weekView__hourLine" style={{ top: `${(h / 24) * 100}%` }} />
              ))}
              {layoutDayGrid(d.timed).map((e) => (
                <button
                  key={e.id}
                  className={`weekView__block weekView__block--${e.kind} ${e.done ? 'weekView__block--done' : ''} ${
                    openLotId === e.lotId ? 'weekView__block--open' : ''
                  }`}
                  style={{
                    top: `${e.topPct}%`,
                    height: `${e.heightPct}%`,
                    left: `${(e.col / e.cols) * 100}%`,
                    width: `${100 / e.cols}%`,
                    ...blockColors(e),
                  }}
                  title={`${e.label} — ${formatTime(e.startTime)}${e.endTime ? '–' + formatTime(e.endTime) : ''}`}
                  onClick={() => toggleOpenLot(e.lotId)}
                  {...dragProps(e)}
                >
                  <span className="weekView__blockTime">{formatTime(e.startTime)}</span> {e.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
