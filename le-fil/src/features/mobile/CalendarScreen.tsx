import { useStore } from '../../state/store';
import { computeUrgency, type Lot, type Task } from '../../types/models';
import { contrastText } from '../../lib/palette';
import { DAYS_SHORT, MONTHS_SHORT } from '../../lib/format';
import { MONTHS_LONG, WEEK_HEAD, mondayOf, parseDay, shiftDays, startOfDay, toDay } from '../../lib/dates';
import { lotMeta, projectColor, shortLabel } from './labels';
import type { MobileNav } from './MobileShell';

// Calendrier mobile (README §4 « Calendrier ») : grille du mois, puis la liste du jour sélectionné.

type Month = { year: number; month: number };

export default function CalendarScreen({
  nav,
  month,
  setMonth,
  day,
  setDay,
  tall,
  toggleTall,
}: {
  nav: MobileNav;
  month: Month;
  setMonth: (m: Month) => void;
  day: string;
  setDay: (d: string) => void;
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

  const lotsOn = (d: string) => lots.filter((l) => l.due === d);
  const tasksOn = (d: string) =>
    showTasks ? tasks.filter((t) => t.due === d && lotById.has(t.lotId)) : ([] as Task[]);

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
  const dayDate = parseDay(day);
  const dayLots = lotsOn(day);
  const dayTasks = tasksOn(day);
  const dayTitle =
    `${DAYS_SHORT[dayDate.getDay()]} ${dayDate.getDate()} ${MONTHS_SHORT[dayDate.getMonth()]}` +
    ` · ${dayLots.length} ${dayLots.length > 1 ? 'lots' : 'lot'}` +
    (dayTasks.length ? ` · ${dayTasks.length} ${dayTasks.length > 1 ? 'tâches' : 'tâche'}` : '');

  return (
    <div className="m__col">
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

      {/* Le calendrier s'allonge vers le bas et défile avec la liste du jour. */}
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
                      label: shortLabel(l.title),
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
                      label: shortLabel(t.label),
                      bg: sel ? '#2a2a28' : 'transparent',
                      fg: sel ? 'var(--paper)' : t.done ? 'var(--text-secondary)' : 'var(--ink)',
                      edge: !t.done && key < todayKey ? 'var(--red)' : col,
                    };
                  }),
                ];
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
                      setDay(key);
                      if (date.getMonth() !== month.month) setMonth({ year: date.getFullYear(), month: date.getMonth() });
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

        <div className="m__dayTitle">{dayTitle}</div>
        {dayLots.map((l) => (
          <div key={l.id} className="m__row">
            <span className="m__edge" style={{ background: colorOf(l) }} />
            <button className="m__rowMain m__rowMain--plain" onClick={() => nav.openLot(l.id, 'cal')}>
              <span className={`m__rowTitle ${l.done ? 'm__rowTitle--done' : ''}`}>{l.title}</span>
              <span className={`m__rowMeta ${computeUrgency(l) === 'late' ? 'm__rowMeta--late' : ''}`}>
                {lotMeta(
                  l,
                  projects,
                  tasks.filter((t) => t.lotId === l.id),
                )}
              </span>
            </button>
          </div>
        ))}
        {dayTasks.map((t) => {
          const lot = lotById.get(t.lotId)!;
          return (
            <div key={t.id} className="m__row">
              <span className="m__edge" style={{ background: colorOf(lot) }} />
              <button className="m__rowMain m__rowMain--plain" onClick={() => nav.openLot(lot.id, 'cal')}>
                <span className={`m__rowTitle ${t.done ? 'm__rowTitle--done' : ''}`}>↳ {t.label}</span>
                <span className={`m__rowMeta ${!t.done && day < todayKey ? 'm__rowMeta--late' : ''}`}>
                  tâche · {lot.title}
                </span>
              </button>
            </div>
          );
        })}
        {dayLots.length + dayTasks.length === 0 && <div className="m__empty">aucune échéance ce jour</div>}
      </div>
    </div>
  );
}
