import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useStore } from '../../state/store';
import ProjectMenu from '../projects/ProjectMenu';
import LotList from '../lots/LotList';
import LotDetail from '../lots/LotDetail';
import AccountDrawer from '../account/AccountDrawer';
import CalendarView from '../calendar/CalendarView';
import GanttView from '../gantt/GanttView';
import Toast from './Toast';
import { useLaunchIntent } from '../../lib/useLaunchIntent';
import './DesktopShell.css';

const VIEW_TABS: { key: 'liste' | 'cal' | 'gantt'; label: string }[] = [
  { key: 'liste', label: 'liste' },
  { key: 'cal', label: 'calendrier' },
  { key: 'gantt', label: 'gantt' },
];

export default function DesktopShell({ session }: { session: Session }) {
  const view = useStore((s) => s.view);
  const selected = useStore((s) => s.selected);
  const openLotId = useStore((s) => s.openLotId);

  const setView = useStore((s) => s.setView);

  const [accountOpen, setAccountOpen] = useState(false);
  // Partage reçu : le lot est déjà ouvert par addLot (volet 3). « Nouveau lot » : rien de plus à faire.
  useLaunchIntent(
    () => {},
    () => {},
  );

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
          {/* Le nom de la sélection est en tête du volet 2 (LotList), pas ici : cette rangée ne
              contient que des boutons de vue. */}
          <div className="shell__headerFill" />
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

      <Toast className="shell__toast" />

      {accountOpen && <AccountDrawer session={session} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
