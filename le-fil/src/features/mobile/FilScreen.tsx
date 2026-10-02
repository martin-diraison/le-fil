import { useMemo, useState } from 'react';
import { lotMatches, useStore } from '../../state/store';
import { compareUrgency, computeUrgency, isArchived, lotFocus, type Lot, type Task, type Urgency } from '../../types/models';
import { DoneBox, DraftBar } from './parts';
import { lotMeta, projectColor, projectName, taskFocusLabel } from './labels';
import type { MobileNav } from './MobileShell';

// Le Fil — tous les lots, groupés par urgence (README §4 « Fil »). L'urgence d'un lot tient
// compte de ses tâches datées (`lotFocus`) : la plus pressante fait remonter le lot.
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
const DEFAULT_OPEN: Urgency[] = ['late', 'today', 'week', 'month'];

export default function FilScreen({ nav, focusDraft = false }: { nav: MobileNav; focusDraft?: boolean }) {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const lateOnly = useStore((s) => s.lateOnly);
  const toggleLateOnly = useStore((s) => s.toggleLateOnly);
  const toggleLotDone = useStore((s) => s.toggleLotDone);
  const addLot = useStore((s) => s.addLot);
  const flash = useStore((s) => s.flash);

  const [open, setOpen] = useState<Set<Urgency>>(() => new Set(DEFAULT_OPEN));
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const q = searching ? query.trim().toLowerCase() : '';
  const toggleGroup = (key: Urgency) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Urgence effective + tâche qui fait remonter le lot, calculées une fois par lot.
  const focus = useMemo(() => {
    const byLot = new Map<string, Task[]>();
    for (const t of tasks) byLot.set(t.lotId, [...(byLot.get(t.lotId) ?? []), t]);
    const m = new Map<string, { urgency: Urgency; due: string | null; task: Task | null; tasks: Task[] }>();
    for (const l of lots) {
      const lt = byLot.get(l.id) ?? [];
      const f = lotFocus(l, lt);
      m.set(l.id, { ...f, urgency: computeUrgency({ done: l.done, due: f.due }), tasks: lt });
    }
    return m;
  }, [lots, tasks]);

  const archivedCount = useMemo(() => lots.filter((l) => isArchived(l)).length, [lots]);

  const groups = useMemo(() => {
    // La recherche couvre aussi les archives ; sinon elles n'apparaissent qu'à la demande.
    const list = lots
      .filter((l) => (q ? lotMatches(l, tasks, q) : showArchived || !isArchived(l)))
      .filter((l) => !lateOnly || focus.get(l.id)!.urgency === 'late')
      .sort((a, b) => {
        const fa = focus.get(a.id)!;
        const fb = focus.get(b.id)!;
        return compareUrgency(fa.urgency, fb.urgency) || (fa.due ?? '').localeCompare(fb.due ?? '');
      });
    // « terminés » reste affiché (même vide) s'il y a des archives, pour garder le lien vers elles.
    return GROUPS.map((g) => ({ ...g, lots: list.filter((l) => focus.get(l.id)!.urgency === g.key) })).filter(
      (g) => g.lots.length > 0 || (g.key === 'done' && !q && !lateOnly && archivedCount > 0),
    );
  }, [lots, tasks, lateOnly, focus, q, showArchived, archivedCount]);

  const openCount = lots.filter((l) => !l.done).length;
  const lateCount = lots.filter((l) => focus.get(l.id)?.urgency === 'late').length;
  const meta = (lot: Lot) => {
    const f = focus.get(lot.id)!;
    return f.task ? taskFocusLabel(f.task, f.tasks) : lotMeta(lot, projects, f.tasks, false);
  };

  return (
    <div className="m__col">
      <div className="m__head">
        <span className="m__headTitle">le fil</span>
        <span className="m__headCount">{openCount} lots ouverts</span>
        <button
          className={`m__lateBtn m__searchBtn ${searching ? 'm__searchBtn--on' : ''}`}
          aria-label="chercher"
          onClick={() => setSearching((v) => !v)}
        >
          chercher
        </button>
        <button className={`m__lateBtn ${lateOnly ? 'm__lateBtn--on' : ''}`} onClick={toggleLateOnly}>
          retard {lateCount}
        </button>
      </div>
      {searching && (
        <div className="m__searchRow">
          <input
            className="m__searchInput"
            autoFocus
            type="search"
            enterKeyHint="search"
            placeholder="titre, texte, tâche… (archives comprises)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div className="m__scroll">
        {groups.map((g) => {
          // Pendant une recherche, tous les groupes trouvés sont dépliés.
          const isOpen = q !== '' || open.has(g.key);
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
                  const late = focus.get(lot.id)!.urgency === 'late';
                  return (
                    <div key={lot.id} className="m__row">
                      <span className="m__edge" style={{ background: projectColor(projects, lot.projectId) }} />
                      <DoneBox
                        done={lot.done}
                        late={late}
                        onToggle={() => {
                          toggleLotDone(lot.id);
                          if (lot.done) flash('remis dans le fil');
                  else flash('terminé', () => toggleLotDone(lot.id));
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
                          {meta(lot)}
                        </span>
                      </button>
                    </div>
                  );
                })}
              {g.key === 'done' && isOpen && !q && archivedCount > 0 && (
                <button className="m__archivesBtn" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? 'masquer les archives' : `voir les archives · ${archivedCount}`}
                </button>
              )}
            </div>
          );
        })}
        {groups.length === 0 && <div className="m__empty">{q ? 'rien trouvé' : 'rien ici'}</div>}
      </div>
      <DraftBar
        autoFocus={focusDraft}
        placeholder="NOUVEAU LOT…"
        onCommit={(title) => {
          addLot(title, null);
          nav.openLot(useStore.getState().openLotId!, 'fil');
        }}
      />
    </div>
  );
}
