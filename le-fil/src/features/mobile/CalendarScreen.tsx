import { useRef } from 'react';
import { useStore } from '../../state/store';
import { computeUrgency, type Lot, type Task } from '../../types/models';
import { contrastText } from '../../lib/palette';
import { formatTimeRange } from '../../lib/format';
import { MONTHS_LONG, WEEK_HEAD, isDayInRange, mondayOf, shiftDays, startOfDay, toDay } from '../../lib/dates';
import { projectColor, shortLabel } from './labels';
import type { MobileNav } from './MobileShell';

// Calendrier mobile (README §4 « Calendrier ») : grille du mois. Taper une case ouvre la vue
// journalière (DayScreen) — cadrage utilisateur du 2026-09-29.

type Month = { year: number; month: number };

export default function CalendarScreen({
  nav,
  month,
  setMonth,
  day,
  tall,
  toggleTall,
}: {
  nav: MobileNav;
  month: Month;
  setMonth: (m: Month) => void;
  day: string;
  tall: boolean;
  toggleTall: () => void;
}) {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const showTasks = useStore((s) => s.showTasksInCalendar);
  const toggleTasks = useStore((s) => s.toggleTasksInCalendar);

  const todayKey = toDay(startOfDay());
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const colorOf = (l: Lot) => projectColor(projects, l.projectId);

  // Sur plusieurs jours : le lot/la tâche reste visible dans chaque case de la fourchette, pas
  // seulement à l'échéance (décision utilisateur, retour du 2026-09-29).
  const lotsOn = (d: string) => lots.filter((l) => l.due && isDayInRange(l.startDate, l.due, d));
  const tasksOn = (d: string) =>
    showTasks
      ? (tasks.filter((t) => t.due && isDayInRange(t.startDate, t.due, d) && lotById.has(t.lotId)) as Task[])
      : ([] as Task[]);

  // 5 ou 6 rangées, lundi en premier.
  const gridStart = mondayOf(new Date(month.year, month.month, 1));
  const rows: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 7 }, (_, i) => shiftDays(gridStart, w * 7 + i));
    rows.push(row);
    if (w >= 4 && row[6].getMonth() !== month.month) break;
  }

  const step = (delta: number) => {
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const max = tall ? 8 : 3;

  // Swipe horizontal = mois suivant/précédent (ignoré si le geste est surtout vertical).
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="m__col"
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        step(dx > 0 ? -1 : 1);
      }}
    >
      <div className="m__calBar">
        <button className="m__calNav" onClick={() => step(-1)} aria-label="mois précédent">
          ‹
        </button>
        <span className="m__calTitle">
          {MONTHS_LONG[month.month]} {month.year}
        </span>
        <button className="m__calNav" onClick={() => step(1)} aria-label="mois suivant">
          ›
        </button>
        <button className={`m__calToggle ${showTasks ? 'm__calToggle--on' : ''}`} onClick={toggleTasks}>
          tâches
        </button>
        <button
          className={`m__calToggle m__calToggle--tall ${tall ? 'm__calToggle--on' : ''}`}
          title="agrandir les cases"
          onClick={toggleTall}
        >
          {tall ? '↑' : '↓'}
        </button>
      </div>
      <div className="m__calHead">
        {WEEK_HEAD.map((h) => (
          <div key={h} className="m__calHeadCell">
            {h}
          </div>
        ))}
      </div>

      <div className="m__scroll">
        <div className={`m__calGrid ${tall ? 'm__calGrid--tall' : ''}`}>
          {rows.map((row) => (
            <div key={toDay(row[0])} className="m__calRow">
              {row.map((date) => {
                const key = toDay(date);
                const sel = key === day;
                const chips = [
                  ...lotsOn(key).map((l) => {
                    const col = colorOf(l);
                    return {
                      id: l.id,
                      task: false,
                      time: l.startTime,
                      label: (l.startTime ? `${formatTimeRange(l.startTime, l.endTime)} ` : '') + shortLabel(l.title),
                      bg: sel ? 'var(--paper)' : col,
                      fg: sel ? 'var(--ink)' : contrastText(col),
                      edge: computeUrgency(l) === 'late' ? 'var(--red)' : col,
                    };
                  }),
                  ...tasksOn(key).map((t) => {
                    const col = colorOf(lotById.get(t.lotId)!);
                    return {
                      id: t.id,
                      task: true,
                      time: t.startTime,
                      label: (t.startTime ? `${formatTimeRange(t.startTime, t.endTime)} ` : '') + shortLabel(t.label),
                      bg: sel ? '#2a2a28' : 'transparent',
                      fg: sel ? 'var(--paper)' : t.done ? 'var(--text-secondary)' : 'var(--ink)',
                      edge: !t.done && key < todayKey ? 'var(--red)' : col,
                    };
                  }),
                ].sort((a, b) => (a.time ?? '24:60').localeCompare(b.time ?? '24:60'));
                const classes = [
                  'm__calCell',
                  date.getMonth() !== month.month ? 'm__calCell--out' : '',
                  key === todayKey ? 'm__calCell--today' : '',
                  sel ? 'm__calCell--sel' : '',
                ].join(' ');
                return (
                  <button
                    key={key}
                    className={classes}
                    onClick={() => {
                      if (date.getMonth() !== month.month) setMonth({ year: date.getFullYear(), month: date.getMonth() });
                      nav.openDay(key);
                    }}
                  >
                    <span className="m__calNum">{date.getDate()}</span>
                    {chips.slice(0, max).map((c) => (
                      <span
                        key={c.id}
                        className={`m__calChip ${c.task ? 'm__calChip--task' : ''}`}
                        style={{ background: c.bg, color: c.fg, borderLeftColor: c.edge }}
                      >
                        {c.label}
                      </span>
                    ))}
                    {chips.length > max && <span className="m__calMore">+{chips.length - max}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
