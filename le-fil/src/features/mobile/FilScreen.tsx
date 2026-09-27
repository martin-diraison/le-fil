import { useMemo, useState } from 'react';
import { sortLots, useStore } from '../../state/store';
import { computeUrgency, type Urgency } from '../../types/models';
import { DoneBox, DraftBar } from './parts';
import { lotMeta, projectColor, projectName } from './labels';
import type { MobileNav } from './MobileShell';

// Le Fil — tous les lots, groupés par urgence (README §4 « Fil »).
const GROUPS: { key: Urgency; label: string; tone?: 'late' | 'muted' }[] = [
  { key: 'late', label: 'en retard', tone: 'late' },
  { key: 'today', label: "aujourd'hui" },
  { key: 'week', label: 'dans les 7 prochains jours' },
  { key: 'month', label: 'dans les 30 prochains jours' },
  { key: 'soon', label: 'plus tard' },
  { key: 'none', label: 'sans date', tone: 'muted' },
  { key: 'done', label: 'terminés', tone: 'muted' },
];

// Groupes ouverts par défaut : on ne veut voir tout de suite que ce qui presse ;
// le reste se déplie au tap (état local, pas persisté — repart replié à chaque ouverture).
const DEFAULT_OPEN: Urgency[] = ['late', 'today', 'week'];

export default function FilScreen({ nav }: { nav: MobileNav }) {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const lateOnly = useStore((s) => s.lateOnly);
  const toggleLateOnly = useStore((s) => s.toggleLateOnly);
  const toggleLotDone = useStore((s) => s.toggleLotDone);
  const addLot = useStore((s) => s.addLot);
  const flash = useStore((s) => s.flash);

  const [open, setOpen] = useState<Set<Urgency>>(() => new Set(DEFAULT_OPEN));
  const toggleGroup = (key: Urgency) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const groups = useMemo(() => {
    const list = sortLots(
      lots.filter((l) => !lateOnly || computeUrgency(l) === 'late'),
      'urgence',
    );
    return GROUPS.map((g) => ({ ...g, lots: list.filter((l) => computeUrgency(l) === g.key) })).filter(
      (g) => g.lots.length > 0,
    );
  }, [lots, lateOnly]);

  const openCount = lots.filter((l) => !l.done).length;
  const lateCount = lots.filter((l) => computeUrgency(l) === 'late').length;

  return (
    <div className="m__col">
      <div className="m__head">
        <span className="m__headTitle">le fil</span>
        <span className="m__headCount">{openCount} lots ouverts</span>
        <button className={`m__lateBtn ${lateOnly ? 'm__lateBtn--on' : ''}`} onClick={toggleLateOnly}>
          retard {lateCount}
        </button>
      </div>
      <div className="m__scroll">
        {groups.map((g) => {
          const isOpen = open.has(g.key);
          return (
            <div key={g.key}>
              <button
                className={`m__groupHead ${g.tone ? 'm__groupHead--' + g.tone : ''}`}
                onClick={() => toggleGroup(g.key)}
              >
                {g.label} · {g.lots.length}
                <span className="m__groupMark">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen &&
                g.lots.map((lot) => {
                  const late = computeUrgency(lot) === 'late';
                  return (
                    <div key={lot.id} className="m__row">
                      <span className="m__edge" style={{ background: projectColor(projects, lot.projectId) }} />
                      <DoneBox
                        done={lot.done}
                        late={late}
                        onToggle={() => {
                          toggleLotDone(lot.id);
                          flash(lot.done ? 'remis dans le fil' : 'terminé');
                        }}
                      />
                      <button className="m__rowMain" onClick={() => nav.openLot(lot.id, 'fil')}>
                        <span className="m__rowProject">
                          <span
                            className="m__rowProjectDot"
                            style={{ background: projectColor(projects, lot.projectId) }}
                          />
                          {projectName(projects, lot.projectId)}
                        </span>
                        <span className={`m__rowTitle ${lot.done ? 'm__rowTitle--done' : ''}`}>{lot.title}</span>
                        <span className={`m__rowMeta ${late ? 'm__rowMeta--late' : ''}`}>
                          {lotMeta(
                            lot,
                            projects,
                            tasks.filter((t) => t.lotId === lot.id),
                            false,
                          )}
                        </span>
                      </button>
                    </div>
                  );
                })}
            </div>
          );
        })}
        {groups.length === 0 && <div className="m__empty">rien ici</div>}
      </div>
      <DraftBar
        placeholder="NOUVEAU LOT…"
        onCommit={(title) => {
          addLot(title, null);
          nav.openLot(useStore.getState().openLotId!, 'fil');
        }}
      />
    </div>
  );
}
