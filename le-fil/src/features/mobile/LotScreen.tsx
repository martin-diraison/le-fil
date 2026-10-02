import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, type ProjectKey } from '../../state/store';
import { computeUrgency } from '../../types/models';
import { daysUntil, dueButtonLabel, formatShortDate } from '../../lib/format';
import { MOBILE_DATE_CHOICES, REPEAT_CHOICES, dueFromOffset } from '../../state/dateShortcuts';
import { copyToClipboard, formatLotTasksAsText } from '../../lib/exportTasks';
import { projectColor, projectName } from './labels';
import type { Repeat } from '../../types/models';
import type { LotOrigin, MobileNav } from './MobileShell';

// Lot ouvert (README §4 « Lot ouvert »).
export default function LotScreen({
  nav,
  from,
  projectKey,
}: {
  nav: MobileNav;
  from: LotOrigin;
  projectKey: ProjectKey | null;
}) {
  const lotId = useStore((s) => s.openLotId);
  const lots = useStore((s) => s.lots);
  const allTasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const confirmDelete = useStore((s) => s.confirmDeleteLot);
  const pickerTaskId = useStore((s) => s.taskDatePickerId);

  const updateLotTitle = useStore((s) => s.updateLotTitle);
  const updateLotBody = useStore((s) => s.updateLotBody);
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
  const toggleLotDone = useStore((s) => s.toggleLotDone);
  const requestDeleteLot = useStore((s) => s.requestDeleteLot);
  const confirmDeleteLotNow = useStore((s) => s.confirmDeleteLotNow);
  const addTask = useStore((s) => s.addTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const updateTaskLabel = useStore((s) => s.updateTaskLabel);
  const setTaskDueDate = useStore((s) => s.setTaskDueDate);
  const deleteTask = useStore((s) => s.deleteTask);
  const openTaskDatePicker = useStore((s) => s.openTaskDatePicker);
  const flash = useStore((s) => s.flash);

  const [confirmDone, setConfirmDone] = useState(false);
  // Replié par défaut pour laisser plus de place aux tâches (demande explicite de
  // l'utilisateur — contrairement au desktop, où la place manque moins).
  const [periodOpen, setPeriodOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const lot = lots.find((l) => l.id === lotId) ?? null;

  // Texte qui s'agrandit avec son contenu.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [lot?.body]);

  // Lot supprimé (ou jamais trouvé) : retour à l'écran d'origine.
  const missing = !lot;
  useEffect(() => {
    if (missing) nav.go(from);
  }, [missing, from, nav]);
  if (!lot) return null;

  const tasks = allTasks.filter((t) => t.lotId === lot.id).sort((a, b) => a.position - b.position);
  const color = projectColor(projects, lot.projectId);
  const u = computeUrgency(lot);
  const dueLabel =
    u === 'late' ? `retard ${Math.abs(daysUntil(lot.due)!)} j` : lot.due ? formatShortDate(lot.due) : 'sans date';

  const backProject = from === 'projet' && projectKey ? projects.find((p) => p.id === projectKey) : null;
  const backLabel =
    from === 'projet'
      ? '← ' + (backProject ? backProject.name.toLowerCase() : projectKey ? 'sans projet' : 'projet')
      : from === 'cal' || from === 'day'
        ? '← calendrier'
        : '← le fil';

  const isCurrent = (due: string | null, offset: number | null) =>
    offset === null ? due === null : due !== null && daysUntil(due) === offset;

  const back = () => nav.go(from);

  function commitTask() {
    if (!taskDraft.trim()) return;
    addTask(lot!.id, taskDraft);
    setTaskDraft('');
  }

  return (
    <div className="m__col">
      <div className="m__topbar">
        <button className="m__back" onClick={back}>
          {backLabel}
        </button>
        <button
          className={`m__topDanger ${confirmDelete ? 'm__topDanger--confirm' : ''}`}
          onClick={() => {
            if (!confirmDelete) {
              requestDeleteLot();
              return;
            }
            confirmDeleteLotNow();
            flash('lot supprimé');
          }}
        >
          {confirmDelete ? 'confirmer ✕' : 'supprimer'}
        </button>
      </div>
      <div className="m__band" style={{ background: color }} />

      <div className="m__scroll">
        <div className="m__lotHead">
          <input
            className="m__lotTitle"
            value={lot.title}
            onChange={(e) => updateLotTitle(lot.id, e.target.value)}
          />
          <span className="m__lotMeta">
            <span className="m__lotProj">{projectName(projects, lot.projectId)}</span>
            <span className={`m__lotDue ${u === 'late' ? 'm__lotDue--late' : ''}`}>{dueLabel}</span>
          </span>
        </div>
        <textarea
          ref={bodyRef}
          className="m__lotBody"
          value={lot.body}
          placeholder="…"
          rows={4}
          onChange={(e) => updateLotBody(lot.id, e.target.value)}
        />

        {/* Échéance : repliée par défaut sur mobile pour laisser plus de place aux tâches. */}
        <button className="m__periodToggle" onClick={() => setPeriodOpen((v) => !v)}>
          échéance du lot · {dueLabel}
          {lot.repeat !== 'none' && ` · ${REPEAT_CHOICES.find((c) => c.key === lot.repeat)?.label}`}
          <span className="m__periodMark">{periodOpen ? '▴' : '▾'}</span>
        </button>
        {periodOpen && (
          <div className="m__period">
            <span className="m__periodLabel">du</span>
            <input
              type="date"
              className="m__dateInput"
              aria-label="début du lot"
              value={lot.startDate ?? ''}
              onChange={(e) => setLotStartDate(lot.id, e.target.value || null)}
            />
            <span className="m__periodLabel">au</span>
            <input
              type="date"
              className="m__dateInput"
              aria-label="échéance du lot"
              value={lot.due ?? ''}
              onChange={(e) => setLotDueDate(lot.id, e.target.value || null)}
            />
            <span className="m__periodLabel">répétition</span>
            <select
              className="m__repeatSelect"
              value={lot.repeat}
              onChange={(e) => setLotRepeat(lot.id, e.target.value as Repeat)}
            >
              {REPEAT_CHOICES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="m__periodLabel">de</span>
            <input
              type="time"
              className="m__dateInput"
              aria-label="heure de début du lot"
              value={lot.startTime ?? ''}
              onChange={(e) => setLotStartTime(lot.id, e.target.value || null)}
            />
            <span className="m__periodLabel">à</span>
            <input
              type="time"
              className="m__dateInput"
              aria-label="heure de fin du lot"
              value={lot.endTime ?? ''}
              onChange={(e) => setLotEndTime(lot.id, e.target.value || null)}
            />
            <span className="m__periodLabel">lieu</span>
            <input
              type="text"
              className="m__dateInput"
              aria-label="lieu du lot"
              placeholder="optionnel"
              value={lot.location}
              onChange={(e) => setLotLocation(lot.id, e.target.value)}
            />
          </div>
        )}

        <div className="m__tasksHead" style={{ borderLeftColor: color }}>
          <span className="m__tasksDot" style={{ background: color }} />
          <span className="m__tasksTitle">tâches</span>
          <span className="m__tasksCount">
            {tasks.length ? `${tasks.filter((t) => t.done).length} / ${tasks.length}` : '0'}
          </span>
          {tasks.length > 0 && (
            <button
              className="m__tasksExport"
              title="copier la liste des tâches en texte"
              onClick={async () => {
                const ok = await copyToClipboard(formatLotTasksAsText(lot, tasks));
                flash(ok ? 'tâches copiées' : 'copie impossible');
              }}
            >
              copier
            </button>
          )}
        </div>
        {tasks.map((t) => {
          const late = !t.done && t.due !== null && daysUntil(t.due)! < 0;
          const picking = pickerTaskId === t.id;
          return (
            <div key={t.id} className="m__task">
              <div className="m__taskRow">
                <button
                  className={`m__tbox ${t.done ? 'm__tbox--done' : ''} ${late ? 'm__tbox--late' : ''}`}
                  title={t.done ? 'rouvrir la tâche' : 'terminer la tâche'}
                  onClick={() => toggleTask(t.id)}
                >
                  {t.done ? '✓' : ''}
                </button>
                <input
                  className={`m__taskLabel ${t.done ? 'm__taskLabel--done' : ''}`}
                  value={t.label}
                  onChange={(e) => updateTaskLabel(t.id, e.target.value)}
                />
                <button
                  className={`m__taskDue ${late ? 'm__taskDue--late' : ''}`}
                  title="échéance de la tâche"
                  onClick={() => openTaskDatePicker(t.id)}
                >
                  {dueButtonLabel(t.due)}
                </button>
                <button className="m__taskDelete" title="supprimer la tâche" onClick={() => deleteTask(t.id)}>
                  ✕
                </button>
              </div>
              {picking && (
                <div className="m__taskPicker">
                  <span className="m__pickerLabel">début</span>
                  <input
                    type="date"
                    className="m__dateInput m__dateInput--small"
                    aria-label="début de la fourchette de la tâche"
                    value={t.startDate ?? ''}
                    onChange={(e) => setTaskStartDate(t.id, e.target.value || null)}
                  />
                  <span className="m__pickerLabel">fin</span>
                  <input
                    type="date"
                    className="m__dateInput m__dateInput--small"
                    aria-label="échéance précise de la tâche"
                    value={t.due ?? ''}
                    onChange={(e) => setTaskDueDate(t.id, e.target.value || null)}
                  />
                  {MOBILE_DATE_CHOICES.map((c) => (
                    <button
                      key={c.key}
                      className={`m__chip m__chip--small ${isCurrent(t.due, c.offset) ? 'm__chip--on' : ''}`}
                      onClick={() => {
                        setTaskDueDate(t.id, dueFromOffset(c.offset));
                        openTaskDatePicker(null);
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                  <span className="m__pickerLabel">de</span>
                  <input
                    type="time"
                    className="m__dateInput m__dateInput--small"
                    aria-label="heure de début de la tâche"
                    value={t.startTime ?? ''}
                    onChange={(e) => setTaskStartTime(t.id, e.target.value || null)}
                  />
                  <span className="m__pickerLabel">à</span>
                  <input
                    type="time"
                    className="m__dateInput m__dateInput--small"
                    aria-label="heure de fin de la tâche"
                    value={t.endTime ?? ''}
                    onChange={(e) => setTaskEndTime(t.id, e.target.value || null)}
                  />
                  <input
                    type="text"
                    className="m__dateInput m__dateInput--small m__pickerLocation"
                    aria-label="lieu de la tâche"
                    placeholder="lieu (optionnel)"
                    value={t.location}
                    onChange={(e) => setTaskLocation(t.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
        <div className="m__taskAdd">
          <input
            className="m__taskAddInput"
            value={taskDraft}
            placeholder="+ AJOUTER UNE TÂCHE"
            enterKeyHint="done"
            onChange={(e) => setTaskDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitTask()}
          />
        </div>

        {/* « Terminer le lot » : discret et en deux temps (action rare, pas à faire par mégarde). */}
        <button
          className={`m__quietBtn ${confirmDone ? 'm__quietBtn--confirm' : ''}`}
          onClick={() => {
            if (!lot.done && !confirmDone) {
              setConfirmDone(true);
              return;
            }
            toggleLotDone(lot.id);
            setConfirmDone(false);
            flash(lot.done ? 'remis dans le fil' : 'terminé');
          }}
        >
          {lot.done ? 'remettre dans le fil' : confirmDone ? 'confirmer : terminer le lot' : 'terminer le lot…'}
        </button>
      </div>
    </div>
  );
}
