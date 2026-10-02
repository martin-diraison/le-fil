import { useEffect, useMemo, useState } from 'react';
import { NO_PROJECT, sortLots, useStore, type ProjectKey } from '../../state/store';
import { computeUrgency, isArchived } from '../../types/models';
import { contrastText, NO_PROJECT_COLOR, PALETTE } from '../../lib/palette';
import { dateSubLabel, formatShortDate } from '../../lib/format';
import { DoneBox, DraftBar } from './parts';
import type { MobileNav } from './MobileShell';

// Projet ouvert (README §4 « Projet ouvert »).
export default function ProjectScreen({ nav, projectKey }: { nav: MobileNav; projectKey: ProjectKey }) {
  const projects = useStore((s) => s.projects);
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const confirmId = useStore((s) => s.confirmDeleteProjectId);
  const renameProject = useStore((s) => s.renameProject);
  const setProjectColor = useStore((s) => s.setProjectColor);
  const requestDeleteProject = useStore((s) => s.requestDeleteProject);
  const cancelDeleteProject = useStore((s) => s.cancelDeleteProject);
  const confirmDeleteProject = useStore((s) => s.confirmDeleteProject);
  const toggleLotDone = useStore((s) => s.toggleLotDone);
  const addLot = useStore((s) => s.addLot);
  const flash = useStore((s) => s.flash);

  const [picker, setPicker] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const isNone = projectKey === NO_PROJECT;
  const project = isNone ? null : projects.find((p) => p.id === projectKey) ?? null;
  const color = project?.color ?? NO_PROJECT_COLOR;
  const on = contrastText(color);
  const name = project?.name ?? 'Sans projet';

  // Projet supprimé ailleurs (autre appareil, desktop) : retour à la grille.
  const missing = !isNone && !project;
  useEffect(() => {
    if (missing) nav.go('projets');
  }, [missing, nav]);

  const allProjLots = useMemo(() => lots.filter((l) => (l.projectId ?? NO_PROJECT) === projectKey), [lots, projectKey]);
  const archivedCount = allProjLots.filter((l) => isArchived(l)).length;
  const projLots = useMemo(
    () => sortLots(showArchived ? allProjLots : allProjLots.filter((l) => !isArchived(l)), 'urgence'),
    [allProjLots, showArchived],
  );
  if (missing) return null;

  const openCount = projLots.filter((l) => !l.done).length;
  const lateCount = projLots.filter((l) => computeUrgency(l) === 'late').length;
  // Le prototype accorde sur le total des lots (« 1 lots ») ; on accorde sur le nombre affiché.
  const meta = (openCount > 1 ? 'lots' : 'lot') + (lateCount ? ` · ${lateCount} en retard` : '');
  const confirming = confirmId === projectKey;

  return (
    <div className="m__col">
      <div className="m__topbar">
        <button
          className="m__back"
          onClick={() => {
            cancelDeleteProject();
            nav.go('projets');
          }}
        >
          ← projets
        </button>
        {!isNone && (
          <button
            className="m__topAction"
            onClick={() => {
              setPicker((v) => !v);
              cancelDeleteProject();
            }}
          >
            réglages {picker ? '▴' : '▾'}
          </button>
        )}
      </div>

      <div className="m__projHead" style={{ background: color, color: on }}>
        <span className="m__projName">{name}</span>
        <span className="m__projCount">
          <span className="m__tileNum">{openCount}</span>
          <span className="m__projMeta">{meta}</span>
        </span>
      </div>

      {picker && project && (
        <div className="m__picker">
          <input
            className="m__pickerName"
            value={project.name}
            placeholder="NOM DU PROJET"
            onChange={(e) => renameProject(project.id, e.target.value)}
          />
          <div className="m__swatches">
            {PALETTE.map((sw) => (
              <button
                key={sw.hex}
                title={sw.name}
                className={`m__swatch ${sw.hex === project.color ? 'm__swatch--on' : ''}`}
                style={{ background: sw.hex }}
                onClick={() => setProjectColor(project.id, sw.hex)}
              />
            ))}
          </div>
          <button
            className={`m__dangerBtn ${confirming ? 'm__dangerBtn--confirm' : ''}`}
            onClick={() => {
              if (!confirming) {
                requestDeleteProject(project.id);
                return;
              }
              confirmDeleteProject(project.id);
              flash('projet supprimé — lots sans projet');
              nav.go('projets');
            }}
          >
            {confirming ? 'confirmer la suppression ✕' : 'supprimer le projet'}
          </button>
        </div>
      )}

      <div className="m__scroll">
        {projLots.map((lot) => {
          const u = computeUrgency(lot);
          const lt = tasks.filter((t) => t.lotId === lot.id);
          return (
            <div key={lot.id} className="m__row">
              <span className="m__edge" style={{ background: color }} />
              <DoneBox
                done={lot.done}
                late={u === 'late'}
                onToggle={() => {
                  toggleLotDone(lot.id);
                  if (lot.done) flash('remis dans le fil');
                  else flash('terminé', () => toggleLotDone(lot.id));
                }}
              />
              <button className="m__rowMain m__rowMain--dated" onClick={() => nav.openLot(lot.id, 'projet')}>
                <span className={`m__date ${u === 'late' ? 'm__date--late' : ''}`}>
                  <span className="m__dateTop">{lot.due ? formatShortDate(lot.due) : '—'}</span>
                  <span className="m__dateSub">{dateSubLabel(lot.due, u)}</span>
                </span>
                <span className="m__rowText">
                  <span className={`m__rowTitle ${lot.done ? 'm__rowTitle--done' : ''}`}>{lot.title}</span>
                  <span className="m__rowMeta m__rowMeta--small">
                    {lt.length ? `${lt.filter((t) => t.done).length}/${lt.length} tâches` : 'aucune tâche'}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
        {projLots.length === 0 && <div className="m__empty">aucun lot — écris en bas</div>}
        {archivedCount > 0 && (
          <button className="m__archivesBtn" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'masquer les archives' : `voir les archives · ${archivedCount}`}
          </button>
        )}
      </div>

      <DraftBar
        placeholder={project ? `NOUVEAU LOT DANS ${project.name.toUpperCase()}…` : 'NOUVEAU LOT…'}
        buttonStyle={{ background: color, color: on }}
        onCommit={(title) => {
          addLot(title, projectKey);
          nav.openLot(useStore.getState().openLotId!, 'projet');
        }}
      />
    </div>
  );
}
