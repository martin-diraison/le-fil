import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { contrastText } from '../../lib/palette';
import { computeUrgency } from '../../types/models';
import { DATE_CHOICES, REPEAT_CHOICES, type DateChoiceKey } from '../../state/dateShortcuts';
import type { Repeat } from '../../types/models';
import { formatShortDate } from '../../lib/format';
import { copyToClipboard, formatLotTasksAsText } from '../../lib/exportTasks';
import './LotDetail.css';

/** `drawer` : en Calendrier et Gantt, le volet 3 est un tiroir fixe de 336 px (§3.1). */
export default function LotDetail({ drawer = false }: { drawer?: boolean }) {
  const openLotId = useStore((s) => s.openLotId);
  const lots = useStore((s) => s.lots);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const moveMenuOpen = useStore((s) => s.moveMenuOpen);
  const confirmDeleteLot = useStore((s) => s.confirmDeleteLot);
  const taskDraft = useStore((s) => s.taskDraft);
  const taskDatePickerId = useStore((s) => s.taskDatePickerId);

  const openLot = useStore((s) => s.openLot);
  const updateLotTitle = useStore((s) => s.updateLotTitle);
  const updateLotBody = useStore((s) => s.updateLotBody);
  const setLotDue = useStore((s) => s.setLotDue);
  const toggleLotDone = useStore((s) => s.toggleLotDone);
  const moveLotToProject = useStore((s) => s.moveLotToProject);
  const requestDeleteLot = useStore((s) => s.requestDeleteLot);
  const confirmDeleteLotNow = useStore((s) => s.confirmDeleteLotNow);
  const toggleMoveMenu = useStore((s) => s.toggleMoveMenu);
  const addTask = useStore((s) => s.addTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const setTaskDue = useStore((s) => s.setTaskDue);
  const deleteTask = useStore((s) => s.deleteTask);
  const openTaskDatePicker = useStore((s) => s.openTaskDatePicker);
  const setTaskDueDate = useStore((s) => s.setTaskDueDate);
  const setLotDueDate = useStore((s) => s.setLotDueDate);
  const setLotStartDate = useStore((s) => s.setLotStartDate);
  const setLotRepeat = useStore((s) => s.setLotRepeat);
  const setTaskStartDate = useStore((s) => s.setTaskStartDate);
  const flash = useStore((s) => s.flash);

  const [taskDraftLocal, setTaskDraftLocal] = useState(taskDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lot = lots.find((l) => l.id === openLotId) ?? null;
  const project = lot?.projectId ? projects.find((p) => p.id === lot.projectId) : null;
  const color = project?.color ?? 'var(--text-tertiary)';
  const lotTasks = lot ? tasks.filter((t) => t.lotId === lot.id) : [];

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [lot?.body, lot?.id]);

  // Fermer le menu "..." et l'état d'édition quand aucun lot n'est ouvert (rien à faire ici,
  // openLot() réinitialise déjà ces états — voir state/store.ts).

  if (!lot) return null;

  const urgency = computeUrgency(lot);
  const dueFg = urgency === 'late' ? 'var(--red)' : '#c9c9c4';
  const dueLabel = urgency === 'late' ? `retard ${Math.abs(daysLate(lot.due))} J` : lot.due ? formatShortDate(lot.due) : 'SANS DATE';
  const doneCount = lotTasks.filter((t) => t.done).length;

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
            onClick={() => toggleLotDone(lot.id)}
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
                style={{
                  background: confirmDeleteLot ? 'var(--red)' : 'transparent',
                  color: confirmDeleteLot ? 'var(--paper)' : 'var(--red)',
                }}
                onClick={() => (confirmDeleteLot ? confirmDeleteLotNow() : requestDeleteLot())}
              >
                {confirmDeleteLot ? 'confirmer ✕' : 'supprimer'}
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
            <div className="lotDetail__dueShortcuts">
              <span className="lotDetail__dueShortcutsLabel">échéance</span>
              {DATE_CHOICES.map((c) => {
                const current =
                  c.key === 'none' ? !lot.due : lot.due && daysFromToday(lot.due) === c.offset;
                return (
                  <button
                    key={c.key}
                    className="lotDetail__shortcutBtn"
                    style={{
                      background: current ? 'var(--yellow)' : 'transparent',
                      color: current ? 'var(--ink)' : '#d4d4d0',
                      borderColor: current ? 'var(--yellow)' : '#5a5a57',
                    }}
                    onClick={() => setLotDue(lot.id, c.key as DateChoiceKey)}
                  >
                    {c.label}
                  </button>
                );
              })}
              <input
                type="date"
                className="lotDetail__dateInput"
                title="date précise"
                aria-label="échéance précise du lot"
                value={lot.due ?? ''}
                onChange={(e) => setLotDueDate(lot.id, e.target.value || null)}
              />
            </div>

            <div className="lotDetail__dueShortcuts">
              <span className="lotDetail__dueShortcutsLabel">début (optionnel)</span>
              <input
                type="date"
                className="lotDetail__dateInput"
                title="début de la fourchette"
                aria-label="début de la fourchette du lot"
                value={lot.startDate ?? ''}
                onChange={(e) => setLotStartDate(lot.id, e.target.value || null)}
              />
              {lot.due && (
                <>
                  <span className="lotDetail__dueShortcutsLabel">répétition</span>
                  {REPEAT_CHOICES.map((c) => (
                    <button
                      key={c.key}
                      className="lotDetail__shortcutBtn"
                      style={{
                        background: lot.repeat === c.key ? 'var(--yellow)' : 'transparent',
                        color: lot.repeat === c.key ? 'var(--ink)' : '#d4d4d0',
                        borderColor: lot.repeat === c.key ? 'var(--yellow)' : '#5a5a57',
                      }}
                      onClick={() => setLotRepeat(lot.id, c.key as Repeat)}
                    >
                      {c.label}
                    </button>
                  ))}
                </>
              )}
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

            {lotTasks.map((t) => {
              const late = t.due ? daysFromToday(t.due) < 0 && !t.done : false;
              const picking = taskDatePickerId === t.id;
              return (
                <div key={t.id} className="taskRow">
                  <div className="taskRow__main">
                    <button className="taskRow__toggle" onClick={() => toggleTask(t.id)}>
                      <span
                        className="taskRow__box"
                        style={{
                          borderColor: t.done ? 'var(--yellow)' : late ? 'var(--red)' : '#6f6f6c',
                          background: t.done ? 'var(--yellow)' : 'transparent',
                        }}
                      >
                        {t.done ? '✓' : ''}
                      </span>
                      <span
                        className="taskRow__label"
                        style={{
                          color: t.done ? '#9c9c98' : 'var(--paper)',
                          textDecoration: t.done ? 'line-through' : 'none',
                        }}
                      >
                        {t.label}
                      </span>
                    </button>
                    <button
                      className="taskRow__due"
                      title="échéance de la tâche"
                      style={{ color: late ? 'var(--red)' : '#9c9c98' }}
                      onClick={() => openTaskDatePicker(t.id)}
                    >
                      {t.due ? (late ? `retard ${Math.abs(daysFromToday(t.due))}J` : formatShortDate(t.due)) : '+ date'}
                    </button>
                  </div>
                  {picking && (
                    <div className="taskRow__picker">
                      {DATE_CHOICES.map((c) => {
                        const current = c.key === 'none' ? !t.due : t.due && daysFromToday(t.due) === c.offset;
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
                      <button className="taskRow__pickerRemove" onClick={() => deleteTask(t.id)}>
                        supprimer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <input
              className="lotDetail__addTask"
              value={taskDraftLocal}
              onChange={(e) => setTaskDraftLocal(e.target.value)}
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
