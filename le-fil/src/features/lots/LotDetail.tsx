import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { contrastText } from '../../lib/palette';
import { computeUrgency, isAgenda, type Task } from '../../types/models';
import { DATE_CHOICES, REPEAT_CHOICES, type DateChoiceKey } from '../../state/dateShortcuts';
import type { Repeat } from '../../types/models';
import { DAYS_SHORT, formatShortDate, formatTimeRange } from '../../lib/format';
import { mondayOf, parseDay, shiftDays, toDay } from '../../lib/dates';
import { copyToClipboard, formatLotTasksAsText } from '../../lib/exportTasks';
import { handleTaskPaste } from '../../lib/paste';
import './LotDetail.css';

/** `drawer` : en Calendrier et Gantt, le volet 3 est un tiroir fixe de 336 px (§3.1). */
export default function LotDetail({ drawer = false }: { drawer?: boolean }) {
  const openLotId = useStore((s) => s.openLotId);
  const lots = useStore((s) => s.lots);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const moveMenuOpen = useStore((s) => s.moveMenuOpen);
  const taskDraft = useStore((s) => s.taskDraft);
  const taskDatePickerId = useStore((s) => s.taskDatePickerId);

  const openLot = useStore((s) => s.openLot);
  const updateLotTitle = useStore((s) => s.updateLotTitle);
  const updateLotBody = useStore((s) => s.updateLotBody);
  const toggleLotDone = useStore((s) => s.toggleLotDone);
  const moveLotToProject = useStore((s) => s.moveLotToProject);
  const deleteLot = useStore((s) => s.deleteLot);
  const toggleMoveMenu = useStore((s) => s.toggleMoveMenu);
  const addTask = useStore((s) => s.addTask);
  const addTasks = useStore((s) => s.addTasks);
  const toggleTask = useStore((s) => s.toggleTask);
  const updateTaskLabel = useStore((s) => s.updateTaskLabel);
  const setTaskDue = useStore((s) => s.setTaskDue);
  const deleteTask = useStore((s) => s.deleteTask);
  const openTaskDatePicker = useStore((s) => s.openTaskDatePicker);
  const setTaskDueDate = useStore((s) => s.setTaskDueDate);
  const setLotDueDate = useStore((s) => s.setLotDueDate);
  const setLotStartDate = useStore((s) => s.setLotStartDate);
  const setLotRepeat = useStore((s) => s.setLotRepeat);
  const setLotStartTime = useStore((s) => s.setLotStartTime);
  const setLotEndTime = useStore((s) => s.setLotEndTime);
  const setLotLocation = useStore((s) => s.setLotLocation);
  const setTaskStartDate = useStore((s) => s.setTaskStartDate);
  const setTaskStartTime = useStore((s) => s.setTaskStartTime);
  const setTaskEndTime = useStore((s) => s.setTaskEndTime);
  const setTaskLocation = useStore((s) => s.setTaskLocation);
  const flash = useStore((s) => s.flash);

  const [taskDraftLocal, setTaskDraftLocal] = useState(taskDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lot = lots.find((l) => l.id === openLotId) ?? null;
  const project = lot?.projectId ? projects.find((p) => p.id === lot.projectId) : null;
  const color = project?.color ?? 'var(--text-tertiary)';
  const lotTasks = lot ? tasks.filter((t) => t.lotId === lot.id) : [];
  // Lot de cours : séances rangées par semaine, passées repliées (état local, replié d'office).
  const [pastOpen, setPastOpen] = useState(false);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [lot?.body, lot?.id]);

  // Fermer le menu "..." et l'état d'édition quand aucun lot n'est ouvert (rien à faire ici,
  // openLot() réinitialise déjà ces états — voir state/store.ts).

  if (!lot) return null;

  const agenda = isAgenda(lot);
  const urgency = computeUrgency(lot);
  const dueFg = urgency === 'late' ? 'var(--red)' : '#c9c9c4';
  const dueLabel = urgency === 'late' ? `retard ${Math.abs(daysLate(lot.due))} J` : lot.due ? formatShortDate(lot.due) : 'SANS DATE';
  const doneCount = lotTasks.filter((t) => t.done).length;

  // Ligne de tâche modifiable (libellé, date, suppression).
  const renderTask = (t: Task) => {
    const late = t.due ? daysFromToday(t.due) < 0 && !t.done : false;
    const picking = taskDatePickerId === t.id;
    return (
      <div key={t.id} className="taskRow">
        <div className="taskRow__main">
          <button
            className="taskRow__box"
            title={t.done ? 'rouvrir la tâche' : 'terminer la tâche'}
            onClick={() => toggleTask(t.id)}
            style={{
              borderColor: t.done ? 'var(--yellow)' : late ? 'var(--red)' : '#6f6f6c',
              background: t.done ? 'var(--yellow)' : 'transparent',
            }}
          >
            {t.done ? '✓' : ''}
          </button>
          <input
            className="taskRow__label"
            value={t.label}
            onChange={(e) => updateTaskLabel(t.id, e.target.value)}
            style={{
              color: t.done ? '#9c9c98' : 'var(--paper)',
              textDecoration: t.done ? 'line-through' : 'none',
            }}
          />
          <button
            className="taskRow__due"
            title="échéance de la tâche"
            style={{ color: late ? 'var(--red)' : '#9c9c98' }}
            onClick={() => openTaskDatePicker(t.id)}
          >
            {t.due ? (late ? `retard ${Math.abs(daysFromToday(t.due))}J` : formatShortDate(t.due)) : '+ date'}
          </button>
          <button className="taskRow__delete" title="supprimer la tâche" onClick={() => deleteTask(t.id)}>
            ✕
          </button>
        </div>
        {picking && (
          <div className="taskRow__picker">
            <span className="taskRow__pickerLabel">début</span>
            <input
              type="date"
              className="taskRow__pickerDate"
              title="début de la fourchette (optionnel)"
              aria-label="début de la fourchette de la tâche"
              value={t.startDate ?? ''}
              onChange={(e) => setTaskStartDate(t.id, e.target.value || null)}
            />
            <span className="taskRow__pickerLabel">fin</span>
            <input
              type="date"
              className="taskRow__pickerDate"
              title="date précise"
              aria-label="échéance précise de la tâche"
              value={t.due ?? ''}
              onChange={(e) => setTaskDueDate(t.id, e.target.value || null)}
            />
            {DATE_CHOICES.map((c) => {
              const current = t.due && daysFromToday(t.due) === c.offset;
              return (
                <button
                  key={c.key}
                  className="taskRow__pickerChoice"
                  style={{
                    background: current ? 'var(--yellow)' : 'transparent',
                    color: current ? 'var(--ink)' : '#e4e4e0',
                    borderColor: current ? 'var(--yellow)' : '#3a3a38',
                  }}
                  onClick={() => setTaskDue(t.id, c.key as DateChoiceKey)}
                >
                  {c.label}
                </button>
              );
            })}
            <span className="taskRow__pickerLabel">de</span>
            <input
              type="time"
              className="taskRow__pickerDate"
              aria-label="heure de début de la tâche"
              value={t.startTime ?? ''}
              onChange={(e) => setTaskStartTime(t.id, e.target.value || null)}
            />
            <span className="taskRow__pickerLabel">à</span>
            <input
              type="time"
              className="taskRow__pickerDate"
              aria-label="heure de fin de la tâche"
              value={t.endTime ?? ''}
              onChange={(e) => setTaskEndTime(t.id, e.target.value || null)}
            />
            <input
              type="text"
              className="taskRow__pickerDate taskRow__pickerLocation"
              aria-label="lieu de la tâche"
              placeholder="lieu (optionnel)"
              value={t.location}
              onChange={(e) => setTaskLocation(t.id, e.target.value)}
            />
          </div>
        )}
      </div>
    );
  };

  const moveTargets: { id: string | null; name: string }[] = [
    { id: null, name: 'Sans projet' },
    ...projects.map((p) => ({ id: p.id, name: p.name })),
  ];

  return (
    <div className={`lotDetail ${drawer ? 'lotDetail--drawer' : ''}`}>
      <div className="lotDetail__inner">
        <div className="lotDetail__band" style={{ background: color }} />

        <div className="lotDetail__header">
          <span className="lotDetail__headerInfo">
            <span className="lotDetail__project">{project ? project.name : 'sans projet'}</span>
            <span className="lotDetail__due" style={{ color: dueFg }}>
              {dueLabel}
            </span>
          </span>
          <button
            className="lotDetail__headerBtn lotDetail__moreBtn"
            title="déplacer / supprimer"
            onClick={toggleMoveMenu}
          >
            ⋯
          </button>
          <button
            className="lotDetail__headerBtn lotDetail__doneBtn"
            style={{ color: lot.done ? 'var(--yellow)' : '#d4d4d0' }}
            onClick={() => {
              toggleLotDone(lot.id);
              if (!lot.done) flash('lot terminé', () => toggleLotDone(lot.id));
            }}
          >
            {lot.done ? 'rouvrir' : 'terminer'}
          </button>
          <button className="lotDetail__headerBtn" title="fermer le lot" onClick={() => openLot(null)}>
            ✕
          </button>
        </div>

        {moveMenuOpen && (
          <div className="lotDetail__moveRow">
            <span className="lotDetail__moveLabel">
              déplacer vers
              <button
                className="lotDetail__deleteBtn"
                style={{ background: 'transparent', color: 'var(--red)' }}
                onClick={() => deleteLot(lot.id)}
              >
                supprimer
              </button>
            </span>
            {moveTargets.map((m) => {
              const on = (lot.projectId ?? null) === m.id;
              const targetColor = m.id ? projects.find((p) => p.id === m.id)!.color : '#9c9c98';
              const fg = on ? contrastText(targetColor) : '#e4e4e0';
              return (
                <button
                  key={m.id ?? 'none'}
                  className="lotDetail__moveTarget"
                  style={{
                    background: on ? targetColor : 'transparent',
                    color: fg,
                    borderColor: targetColor,
                  }}
                  onClick={() => moveLotToProject(lot.id, m.id)}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="lotDetail__body">
          <div className="lotDetail__main">
            <input
              className="lotDetail__title"
              value={lot.title}
              onChange={(e) => updateLotTitle(lot.id, e.target.value)}
            />
            <textarea
              ref={textareaRef}
              className="lotDetail__textarea"
              value={lot.body}
              onChange={(e) => updateLotBody(lot.id, e.target.value)}
              rows={1}
              placeholder="…"
            />
            <div className="lotDetail__period">
              <span className="lotDetail__periodLabel">du</span>
              <input
                type="date"
                className="lotDetail__dateInput"
                aria-label="début du lot"
                value={lot.startDate ?? ''}
                onChange={(e) => setLotStartDate(lot.id, e.target.value || null)}
              />
              <span className="lotDetail__periodLabel">au</span>
              <input
                type="date"
                className="lotDetail__dateInput"
                aria-label="échéance du lot"
                value={lot.due ?? ''}
                onChange={(e) => setLotDueDate(lot.id, e.target.value || null)}
              />
              <span className="lotDetail__periodLabel">répétition</span>
              <select
                className="lotDetail__repeatSelect"
                value={lot.repeat}
                onChange={(e) => setLotRepeat(lot.id, e.target.value as Repeat)}
              >
                {REPEAT_CHOICES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span className="lotDetail__periodLabel">de</span>
              <input
                type="time"
                className="lotDetail__dateInput"
                aria-label="heure de début du lot"
                value={lot.startTime ?? ''}
                onChange={(e) => setLotStartTime(lot.id, e.target.value || null)}
              />
              <span className="lotDetail__periodLabel">à</span>
              <input
                type="time"
                className="lotDetail__dateInput"
                aria-label="heure de fin du lot"
                value={lot.endTime ?? ''}
                onChange={(e) => setLotEndTime(lot.id, e.target.value || null)}
              />
              <span className="lotDetail__periodLabel">lieu</span>
              <input
                type="text"
                className="lotDetail__dateInput"
                aria-label="lieu du lot"
                placeholder="optionnel"
                value={lot.location}
                onChange={(e) => setLotLocation(lot.id, e.target.value)}
              />
            </div>
          </div>

          <div className="lotDetail__tasks" style={{ borderLeft: `4px solid ${color}` }}>
            <div className="lotDetail__tasksHeader">
              <span className="lotDetail__tasksDot" style={{ background: color }} />
              <span className="lotDetail__tasksLabel">tâches</span>
              <span className="lotDetail__tasksCount">
                {lotTasks.length ? `${doneCount}/${lotTasks.length}` : '0'}
              </span>
              {lotTasks.length > 0 && (
                <button
                  className="lotDetail__tasksExport"
                  title="copier la liste des tâches en texte"
                  onClick={async () => {
                    const ok = await copyToClipboard(formatLotTasksAsText(lot, lotTasks));
                    flash(ok ? 'tâches copiées' : 'copie impossible');
                  }}
                >
                  copier
                </button>
              )}
            </div>

            {agenda ? (
              <AgendaTasks
                tasks={lotTasks}
                pastOpen={pastOpen}
                onTogglePast={() => setPastOpen((o) => !o)}
                onToggle={toggleTask}
                renderTask={renderTask}
              />
            ) : (
              lotTasks.map(renderTask)
            )}

            <input
              className="lotDetail__addTask"
              value={taskDraftLocal}
              onChange={(e) => setTaskDraftLocal(e.target.value)}
              onPaste={(e) =>
                handleTaskPaste(e, (labels) => flash(`${addTasks(lot.id, labels)} tâches ajoutées`))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addTask(lot.id, taskDraftLocal);
                  setTaskDraftLocal('');
                }
              }}
              placeholder="+ AJOUTER UNE TÂCHE"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function daysFromToday(due: string): number {
  const d = new Date(due + 'T00:00:00');
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

function daysLate(due: string | null): number {
  if (!due) return 0;
  return Math.abs(daysFromToday(due));
}

/**
 * Tâches d'un lot de cours (GPN1, GPN2, Commun) : par semaine, dans l'ordre chronologique. Les
 * séances importées sont en lecture seule (réécrites à chaque import, on les modifie dans l'app
 * cours) : seule la case « fait » reste. Passées (séances passées, tâches faites passées) repliées
 * en tête ; tâches ajoutées à la main sans date à la fin, modifiables comme ailleurs.
 */
function AgendaTasks({
  tasks,
  pastOpen,
  onTogglePast,
  onToggle,
  renderTask,
}: {
  tasks: Task[];
  pastOpen: boolean;
  onTogglePast: () => void;
  onToggle: (id: string) => void;
  renderTask: (t: Task) => React.ReactNode;
}) {
  const today = toDay(new Date());
  const thisMonday = toDay(mondayOf(new Date()));
  const nextMonday = toDay(shiftDays(mondayOf(new Date()), 7));
  const dated = tasks
    .filter((t) => t.due)
    .sort(
      (a, b) =>
        a.due!.localeCompare(b.due!) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.position - b.position,
    );
  const isPast = (t: Task) => t.due! < today && (isAgenda(t) || t.done);
  const past = dated.filter(isPast);
  const weeks = new Map<string, Task[]>();
  for (const t of dated) {
    if (isPast(t)) continue;
    // Période (fourchette) : rangée à la semaine où elle commence, ou à celle-ci si elle a déjà commencé.
    const from = t.startDate && t.startDate < t.due! ? (t.startDate > today ? t.startDate : today) : t.due!;
    const w = toDay(mondayOf(parseDay(from)));
    const list = weeks.get(w);
    if (list) list.push(t);
    else weeks.set(w, [t]);
  }
  const weekLabel = (w: string) =>
    w === thisMonday
      ? 'cette semaine'
      : w === nextMonday
        ? 'semaine prochaine'
        : w < thisMonday
          ? `en retard · semaine du ${formatShortDate(w)}`
          : `semaine du ${formatShortDate(w)}`;
  const row = (t: Task) =>
    isAgenda(t) ? <SessionRow key={t.id} t={t} past={isPast(t)} onToggle={onToggle} /> : renderTask(t);
  return (
    <>
      {past.length > 0 && (
        <button className="agendaTasks__head agendaTasks__head--past" onClick={onTogglePast}>
          {pastOpen ? '▾' : '▸'} passées · {past.length}
        </button>
      )}
      {pastOpen && past.map(row)}
      {[...weeks].map(([w, ts]) => (
        <div key={w}>
          <div className="agendaTasks__head">{weekLabel(w)}</div>
          {ts.map(row)}
        </div>
      ))}
      {tasks.filter((t) => !t.due).map(renderTask)}
    </>
  );
}

/** Séance / période / réunion importée : jour, horaire, libellé, salle — lecture seule sauf « fait ». */
function SessionRow({ t, past, onToggle }: { t: Task; past: boolean; onToggle: (id: string) => void }) {
  const d = parseDay(t.due!);
  const range = t.startDate && t.startDate !== t.due;
  const day = range
    ? `${formatShortDate(t.startDate)} → ${formatShortDate(t.due)}`
    : past
      ? formatShortDate(t.due) // pas d'intitulé de semaine dans les passées : date complète
      : `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`;
  return (
    <div className="taskRow sessionRow">
      <div className="taskRow__main">
        <button
          className="taskRow__box"
          title={t.done ? 'rouvrir' : 'marquer comme fait'}
          onClick={() => onToggle(t.id)}
          style={{
            borderColor: t.done ? 'var(--yellow)' : '#6f6f6c',
            background: t.done ? 'var(--yellow)' : 'transparent',
          }}
        >
          {t.done ? '✓' : ''}
        </button>
        <span className={`sessionRow__day ${range ? 'sessionRow__day--range' : ''}`}>{day}</span>
        {!range && <span className="sessionRow__time">{formatTimeRange(t.startTime, t.endTime)}</span>}
        <span
          className="sessionRow__label"
          title={t.label}
          style={{ color: t.done ? '#9c9c98' : 'var(--paper)', textDecoration: t.done ? 'line-through' : 'none' }}
        >
          {t.label}
        </span>
        {t.location && <span className="sessionRow__place">{t.location}</span>}
      </div>
    </div>
  );
}
