import { useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { NO_PROJECT, filterLots, useStore } from '../../state/store';
import ProjectMenu from '../projects/ProjectMenu';
import LotList from '../lots/LotList';
import LotDetail from '../lots/LotDetail';
import AccountDrawer from '../account/AccountDrawer';
import CalendarView from '../calendar/CalendarView';
import GanttView from '../gantt/GanttView';
import './DesktopShell.css';

const VIEW_TABS: { key: 'liste' | 'cal' | 'gantt'; label: string }[] = [
  { key: 'liste', label: 'liste' },
  { key: 'cal', label: 'calendrier' },
  { key: 'gantt', label: 'gantt' },
];

const SORT_LABELS: Record<string, string> = {
  urgence: 'tri · urgence',
  récent: 'tri · récent',
  manuel: 'tri · manuel',
};

export default function DesktopShell({ session }: { session: Session }) {
  const view = useStore((s) => s.view);
  const sort = useStore((s) => s.sort);
  const selected = useStore((s) => s.selected);
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const search = useStore((s) => s.search);
  const lateOnly = useStore((s) => s.lateOnly);
  const projects = useStore((s) => s.projects);
  const openLotId = useStore((s) => s.openLotId);
  const toast = useStore((s) => s.toast);

  const setView = useStore((s) => s.setView);
  const cycleSort = useStore((s) => s.cycleSort);

  const [accountOpen, setAccountOpen] = useState(false);

  const visibleCount = useMemo(
    () => filterLots({ lots, tasks, selected, lateOnly, search, view: 'liste' }).length,
    [lots, tasks, selected, search, lateOnly],
  );

  const selNames = selected.map((k) =>
    k === NO_PROJECT ? 'Sans projet' : projects.find((p) => p.id === k)?.name ?? '',
  );
  const selLabel =
    selected.length === 0 ? 'aucune sélection' : selNames.length > 2 ? `${selNames.length} projets` : selNames.join(' + ');
  const selCount = `${visibleCount} ${visibleCount > 1 ? 'lots' : 'lot'}`;

  const showV3 = !!openLotId;

  return (
    <div className="shell">
      <ProjectMenu userEmail={session.user.email ?? ''} onOpenAccount={() => setAccountOpen(true)} />

      <div className="shell__main">
        <div className="shell__headerRow">
          {VIEW_TABS.map((v) => (
            <button
              key={v.key}
              className="shell__viewTab"
              style={{
                background: view === v.key ? 'var(--ink)' : 'var(--paper)',
                color: view === v.key ? 'var(--paper)' : 'var(--ink)',
              }}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
          <div className="shell__selection">
            <span className="shell__selLabel">{selLabel}</span>
            {view === 'liste' && <span className="shell__selCount">{selCount}</span>}
          </div>
          {view === 'liste' && (
            <button className="shell__sortBtn" onClick={cycleSort}>
              {SORT_LABELS[sort]}
            </button>
          )}
        </div>

        <div className="shell__content">
          {view === 'liste' &&
            (selected.length === 0 ? (
              <div className="shell__placeholder">
                volet 2 — les lots
                <br />
                sélectionne un projet
                <br />
                ou « sans projet »
              </div>
            ) : (
              <LotList />
            ))}
          {view === 'cal' && <CalendarView />}
          {view === 'gantt' && <GanttView />}

          {showV3 && <LotDetail drawer={view !== 'liste'} />}
        </div>
      </div>

      {toast && <div className="shell__toast">{toast}</div>}

      {accountOpen && <AccountDrawer session={session} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
