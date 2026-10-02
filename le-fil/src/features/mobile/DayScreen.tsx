import { useRef, useState } from 'react';
import { NO_PROJECT, taskMatchesSearch, useActiveLots, useStore } from '../../state/store';
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
  kind: 'lot' | 'task';
};

const HOUR_PX = 52; // doit rester égal à la hauteur d'une heure dans Mobile.css (.m__dayLanes)

const pad = (n: number) => String(n).padStart(2, '0');

// Feuille de création rapide : toucher un espace vide de la grille propose un nouveau lot ou une
// nouvelle tâche, daté du jour affiché et pré-rempli à l'heure touchée (durée 1 h par défaut).
function AddSheet({ day, hour, onClose }: { day: string; hour: number; onClose: () => void }) {
  const lots = useStore((s) => s.lots);
  const projects = useStore((s) => s.projects);
  const addLot = useStore((s) => s.addLot);
  const addTask = useStore((s) => s.addTask);
  const openLot = useStore((s) => s.openLot);
  const st = useStore.getState;

  const parents = lots.filter((l) => !l.done);
  const [kind, setKind] = useState<'lot' | 'task'>('lot');
  const [title, setTitle] = useState('');
  const [projectKey, setProjectKey] = useState<string>(NO_PROJECT);
  const [parentId, setParentId] = useState(parents[0]?.id ?? '');
  const [start, setStart] = useState(`${pad(hour)}:00`);
  const [end, setEnd] = useState(`${pad(Math.min(hour + 1, 23))}:${hour >= 23 ? '59' : '00'}`);
  const [location, setLocation] = useState('');

  const canSubmit = title.trim() !== '' && (kind === 'lot' || parentId !== '');

  const submit = () => {
    if (!canSubmit) return;
    const s = st();
    if (kind === 'lot') {
      const id = addLot(title, projectKey, { parse: false });
      openLot(null); // addLot ouvre le lot dans le store ; on reste sur la vue journalière
      if (!id) return;
      s.setLotStartDate(id, day);
      s.setLotDueDate(id, day);
      if (start) s.setLotStartTime(id, start);
      if (end) s.setLotEndTime(id, end);
      if (location.trim()) s.setLotLocation(id, location.trim());
    } else {
      const id = addTask(parentId, title, { parse: false });
      if (!id) return;
      s.setTaskStartDate(id, day);
      s.setTaskDueDate(id, day);
      if (start) s.setTaskStartTime(id, start);
      if (end) s.setTaskEndTime(id, end);
      if (location.trim()) s.setTaskLocation(id, location.trim());
    }
    onClose();
  };

  return (
    <div className="m__sheetBack" onClick={onClose}>
      <div className="m__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m__sheetKinds">
          <button className={`m__sheetKind ${kind === 'lot' ? 'm__sheetKind--on' : ''}`} onClick={() => setKind('lot')}>
            lot
          </button>
          <button
            className={`m__sheetKind ${kind === 'task' ? 'm__sheetKind--on' : ''}`}
            disabled={parents.length === 0}
            onClick={() => setKind('task')}
          >
            tâche
          </button>
        </div>
        <input
          className="m__sheetInput"
          autoFocus
          placeholder={kind === 'lot' ? 'titre du lot' : 'intitulé de la tâche'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {kind === 'lot' ? (
          <select className="m__sheetInput" value={projectKey} onChange={(e) => setProjectKey(e.target.value)}>
            <option value={NO_PROJECT}>sans projet</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <select className="m__sheetInput" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            {parents.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        )}
        <div className="m__sheetRow">
          <label>
            de <input type="time" className="m__sheetInput" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            à <input type="time" className="m__sheetInput" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <input className="m__sheetInput" placeholder="lieu" value={location} onChange={(e) => setLocation(e.target.value)} />
        <div className="m__sheetRow">
          <button className="m__sheetBtn" onClick={onClose}>
            annuler
          </button>
          <button className="m__sheetBtn m__sheetBtn--ok" disabled={!canSubmit} onClick={submit}>
            créer
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const lots = useActiveLots();
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const showTasks = useStore((s) => s.showTasksInCalendar);
  const search = useStore((s) => s.search);

  const touchX = useRef<number | null>(null);
  const [addHour, setAddHour] = useState<number | null>(null);

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
      kind: 'lot',
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
          label: t.label,
          color: projectColor(projects, lot.projectId),
          done: t.done,
          lotId: lot.id,
          kind: 'task',
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
              className={`m__dayAllDayItem m__dayAllDayItem--${e.kind} ${e.done ? 'm__dayAllDayItem--done' : ''}`}
              style={{ borderLeftColor: e.color }}
              onClick={() => nav.openLot(e.lotId, 'day')}
            >
              {e.kind === 'task' ? '↳ ' : ''}
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
        <div
          className="m__dayLanes"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return; // un bloc existant gère son propre tap
            const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
            setAddHour(Math.max(0, Math.min(23, Math.floor(y / HOUR_PX))));
          }}
        >
          {DAY_GRID_HOURS.map((h) => (
            <div key={h} className="m__dayHourLine" style={{ top: `${(h / 24) * 100}%` }} />
          ))}
          {positioned.map((e) => (
            <button
              key={e.id}
              className={`m__dayBlock m__dayBlock--${e.kind} ${e.done ? 'm__dayBlock--done' : ''}`}
              style={{
                top: `${e.topPct}%`,
                height: `${e.heightPct}%`,
                left: `${(e.col / e.cols) * 100}%`,
                width: `${100 / e.cols}%`,
                ...(e.kind === 'lot'
                  ? { background: e.color, color: contrastText(e.color) }
                  : { background: 'var(--paper)', color: 'var(--ink)', borderColor: e.color, borderLeft: `5px solid ${e.color}` }),
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
      {addHour !== null && <AddSheet day={day} hour={addHour} onClose={() => setAddHour(null)} />}
    </div>
  );
}
