import { useMemo, useState } from 'react';
import { NO_PROJECT, sortLots, useStore } from '../../state/store';
import { computeUrgency } from '../../types/models';
import { dateSubLabel, formatShortDate } from '../../lib/format';
import './LotList.css';

export default function LotList() {
  const lots = useStore((s) => s.lots);
  const projects = useStore((s) => s.projects);
  const selected = useStore((s) => s.selected);
  const lateOnly = useStore((s) => s.lateOnly);
  const search = useStore((s) => s.search);
  const sort = useStore((s) => s.sort);
  const openLotId = useStore((s) => s.openLotId);
  const lotDraft = useStore((s) => s.lotDraft);
  const dragLotId = useStore((s) => s.dragLotId);
  const overLotId = useStore((s) => s.overLotId);

  const addLot = useStore((s) => s.addLot);
  const openLot = useStore((s) => s.openLot);
  const reorderLots = useStore((s) => s.reorderLots);
  const setDragLot = useStore((s) => s.setDragLot);
  const setOverLot = useStore((s) => s.setOverLot);

  const [draftLocal, setDraftLocal] = useState(lotDraft);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return lots.filter((l) => {
      const key = l.projectId ?? NO_PROJECT;
      if (!selected.includes(key)) return false;
      if (lateOnly && computeUrgency(l) !== 'late') return false;
      if (q && !(l.title + ' ' + l.body).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lots, selected, lateOnly, search]);

  const sorted = useMemo(() => sortLots(filtered, sort), [filtered, sort]);

  const draftHint =
    selected.length === 1 && selected[0] !== NO_PROJECT ? 'LOT DANS CE PROJET…' : 'ÉCRIS, ON TRIE APRÈS…';
  const emptyHint = lateOnly ? 'aucun retard ici' : search ? 'essaie un autre mot' : 'écris en haut';

  function commit() {
    addLot(draftLocal);
    setDraftLocal('');
  }

  return (
    <div className="lotPane">
      <div className="lotPane__new">
        <button className="lotPane__newIcon" title="nouveau lot" tabIndex={-1}>
          +
        </button>
        <input
          className="lotPane__newInput"
          value={draftLocal}
          onChange={(e) => setDraftLocal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder={draftHint}
        />
        {draftLocal.trim() && (
          <button className="lotPane__newSubmit" onClick={commit}>
            garder ⏎
          </button>
        )}
      </div>

      <div className="lotPane__list">
        {sorted.map((lot) => {
          const urgency = computeUrgency(lot);
          const project = lot.projectId ? projectById.get(lot.projectId) : null;
          const color = project?.color ?? 'var(--text-tertiary)';
          const isSelected = openLotId === lot.id;
          const classes = [
            'lotRow',
            isSelected ? 'lotRow--selected' : '',
            overLotId === lot.id ? 'lotRow--over' : '',
            dragLotId === lot.id ? 'lotRow--dragging' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={lot.id}
              className={classes}
              draggable
              title="glisser pour réordonner"
              onClick={() => openLot(lot.id)}
              onDragStart={() => setDragLot(lot.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overLotId !== lot.id) setOverLot(lot.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                reorderLots(dragLotId ?? '', lot.id);
              }}
              onDragEnd={() => {
                setDragLot(null);
                setOverLot(null);
              }}
            >
              <span className="lotRow__edge" style={{ background: color }} />
              <span
                className="lotRow__date"
                style={{
                  background: !isSelected && urgency === 'late' ? 'var(--red)' : 'transparent',
                }}
              >
                <span
                  className="lotRow__dateTop"
                  style={{
                    color:
                      urgency === 'late'
                        ? isSelected
                          ? 'var(--red)'
                          : 'var(--paper)'
                        : isSelected
                        ? 'var(--paper)'
                        : 'var(--ink)',
                  }}
                >
                  {lot.due ? formatShortDate(lot.due) : '—'}
                </span>
                <span
                  className="lotRow__dateSub"
                  style={{
                    color:
                      urgency === 'late'
                        ? isSelected
                          ? 'var(--red)'
                          : 'var(--paper)'
                        : isSelected
                        ? '#c9c9c4'
                        : 'var(--text-secondary)',
                  }}
                >
                  {dateSubLabel(lot.due, urgency)}
                </span>
              </span>
              <span className="lotRow__body">
                <span
                  className="lotRow__title"
                  style={{
                    font: isSelected ? '800 13.5px var(--font-ui)' : '500 13.5px var(--font-ui)',
                    color: isSelected ? 'var(--paper)' : lot.done ? 'var(--text-secondary)' : 'var(--ink)',
                    textDecoration: lot.done ? 'line-through' : 'none',
                  }}
                >
                  {lot.title}
                </span>
                <span className="lotRow__metaRow">
                  <span
                    className="lotRow__project"
                    style={{ color: isSelected ? '#c9c9c4' : color }}
                  >
                    {project ? project.name : 'sans projet'}
                  </span>
                  <TaskCount lotId={lot.id} selected={isSelected} />
                </span>
              </span>
            </button>
          );
        })}
        {sorted.length === 0 && <div className="lotPane__empty">rien ici — {emptyHint}</div>}
      </div>
    </div>
  );
}

function TaskCount({ lotId, selected }: { lotId: string; selected: boolean }) {
  // Sélectionner le tableau complet (référence stable tant que rien ne change) plutôt que
  // de filtrer dans le sélecteur : un .filter() y renverrait un nouveau tableau à chaque
  // rendu et déclencherait une boucle de mise à jour infinie avec Zustand.
  const allTasks = useStore((s) => s.tasks);
  const tasks = useMemo(() => allTasks.filter((t) => t.lotId === lotId), [allTasks, lotId]);
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.done).length;
  return (
    <span className="lotRow__taskCount" style={{ color: selected ? '#c9c9c4' : 'var(--text-secondary)' }}>
      {done}/{tasks.length}
    </span>
  );
}
