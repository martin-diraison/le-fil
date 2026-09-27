import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, type ProjectKey } from '../../state/store';
import { computeUrgency } from '../../types/models';
import { contrastText, NO_PROJECT_COLOR } from '../../lib/palette';
import { daysUntil, dueButtonLabel, formatShortDate } from '../../lib/format';
import { parseDay, shiftDays, startOfDay, toDay } from '../../lib/dates';
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
  const setTaskStartDate = useStore((s) => s.setTaskStartDate);
  const toggleLotDone = useStore((s) => s.toggleLotDone);
  const moveLotToProject = useStore((s) => s.moveLotToProject);
  const requestDeleteLot = useStore((s) => s.requestDeleteLot);
  const confirmDeleteLotNow = useStore((s) => s.confirmDeleteLotNow);
  const addTask = useStore((s) => s.addTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const setTaskDueDate = useStore((s) => s.setTaskDueDate);
  const deleteTask = useStore((s) => s.deleteTask);
  const openTaskDatePicker = useStore((s) => s.openTaskDatePicker);
  const flash = useStore((s) => s.flash);

  const [moveOpen, setMoveOpen] = useState(false);
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
      : from === 'cal'
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

  const moveTargets = [{ id: null as string | null, name: 'sans projet', color: NO_PROJECT_COLOR }].concat(
    projects
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id as string | null, name: p.name, color: p.color })),
  );

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

        <div className="m__choices">
          <span className="m__choicesLabel">échéance du lot</span>
          <span className="m__choicesInline">du</span>
          <input
            type="date"
            className="m__dateInput"
            aria-label="début du lot"
            value={lot.startDate ?? ''}
            onChange={(e) => setLotStartDate(lot.id, e.target.value || null)}
          />
          <span className="m__choicesInline">au</span>
          <input
            type="date"
            className="m__dateInput"
            aria-label="échéance du lot"
            value={lot.due ?? ''}
            onChange={(e) => setLotDueDate(lot.id, e.target.value || null)}
          />
          <span className="m__choicesInline">répétition</span>
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
        </div>

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
                <button className="m__taskMain" onClick={() => toggleTask(t.id)}>
                  <span className={`m__tbox ${t.done ? 'm__tbox--done' : ''} ${late ? 'm__tbox--late' : ''}`}>
                    {t.done ? '✓' : ''}
                  </span>
                  <span className={`m__taskLabel ${t.done ? 'm__taskLabel--done' : ''}`}>{t.label}</span>
                </button>
                <button
                  className={`m__taskDue ${late ? 'm__taskDue--late' : ''}`}
                  title="échéance de la tâche"
                  onClick={() => openTaskDatePicker(t.id)}
                >
                  {dueButtonLabel(t.due)}
                </button>
              </div>
              {picking && (
                <div className="m__taskPicker">
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
                  <button className="m__chip m__chip--small m__chip--danger" onClick={() => deleteTask(t.id)}>
                    supprimer
                  </button>
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

        {/* « Déplacer vers… » : replié par défaut (fonction peu utilisée). */}
        <button className="m__moveToggle" onClick={() => setMoveOpen((v) => !v)}>
          déplacer vers…<span className="m__moveMark">{moveOpen ? '▴' : '▾'}</span>
        </button>
        {moveOpen && (
          <div className="m__moveTargets">
            {moveTargets.map((p) => {
              const on = lot.projectId === p.id;
              return (
                <button
                  key={p.id ?? 'none'}
                  className="m__moveTarget"
                  style={{
                    background: on ? p.color : 'var(--paper)',
                    color: on ? contrastText(p.color) : 'var(--ink)',
                    borderColor: p.color,
                  }}
                  onClick={() => {
                    moveLotToProject(lot.id, p.id);
                    flash('déplacé vers ' + p.name);
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="m__lotFoot">
        <button
          className={`m__lotDone ${lot.done ? 'm__lotDone--reopen' : ''}`}
          onClick={() => {
            toggleLotDone(lot.id);
            flash(lot.done ? 'remis dans le fil' : 'terminé');
          }}
        >
          {lot.done ? 'remettre dans le fil' : 'terminer le lot'}
        </button>
        <button
          className="m__plusDay"
          onClick={() => {
            const base = lot.due ? parseDay(lot.due) : startOfDay();
            const due = toDay(shiftDays(base, 1));
            setLotDueDate(lot.id, due);
            flash('repoussé au ' + formatShortDate(due));
          }}
        >
          +1 j
        </button>
      </div>
    </div>
  );
}
