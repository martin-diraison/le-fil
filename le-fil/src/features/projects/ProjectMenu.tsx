import { useMemo, useState } from 'react';
import { NO_PROJECT, useStore } from '../../state/store';
import { PALETTE } from '../../lib/palette';
import { contrastText } from '../../lib/palette';
import { computeUrgency } from '../../types/models';
import { supabase } from '../../lib/supabase';
import './ProjectMenu.css';

const TODAY_LABEL = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
  .format(new Date())
  .toUpperCase()
  .replace('.', '');

type Props = {
  userEmail: string;
  onOpenAccount: () => void;
};

export default function ProjectMenu({ userEmail, onOpenAccount }: Props) {
  const projects = useStore((s) => s.projects);
  const lots = useStore((s) => s.lots);
  const selected = useStore((s) => s.selected);
  const lateOnly = useStore((s) => s.lateOnly);
  const search = useStore((s) => s.search);
  const projectFilter = useStore((s) => s.projectFilter);
  const colorPickerProjectId = useStore((s) => s.colorPickerProjectId);
  const confirmDeleteProjectId = useStore((s) => s.confirmDeleteProjectId);
  const dragProjectId = useStore((s) => s.dragProjectId);
  const overProjectId = useStore((s) => s.overProjectId);

  const toggleSelected = useStore((s) => s.toggleSelected);
  const selectOnly = useStore((s) => s.selectOnly);
  const clearSelected = useStore((s) => s.clearSelected);
  const toggleLateOnly = useStore((s) => s.toggleLateOnly);
  const setSearch = useStore((s) => s.setSearch);
  const setProjectFilter = useStore((s) => s.setProjectFilter);
  const addProjectAction = useStore((s) => s.addProject);
  const toggleProjectPicker = useStore((s) => s.toggleProjectPicker);
  const renameProject = useStore((s) => s.renameProject);
  const setProjectColor = useStore((s) => s.setProjectColor);
  const requestDeleteProject = useStore((s) => s.requestDeleteProject);
  const confirmDeleteProject = useStore((s) => s.confirmDeleteProject);
  const cancelDeleteProject = useStore((s) => s.cancelDeleteProject);
  const reorderProjects = useStore((s) => s.reorderProjects);
  const setDragProject = useStore((s) => s.setDragProject);
  const setOverProject = useStore((s) => s.setOverProject);

  const [projectDraftLocal, setProjectDraftLocal] = useState('');
  const [acctOpen, setAcctOpen] = useState(false);

  const matchesQuery = (title: string, body: string) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (title + ' ' + body).toLowerCase().includes(q);
  };

  const lateCount = useMemo(
    () => lots.filter((l) => matchesQuery(l.title, l.body) && computeUrgency(l) === 'late').length,
    [lots, search],
  );
  const noProjectCount = useMemo(
    () => lots.filter((l) => l.projectId === null && matchesQuery(l.title, l.body)).length,
    [lots, search],
  );

  const orderedProjects = useMemo(
    () => projects.slice().sort((a, b) => a.position - b.position),
    [projects],
  );
  const visibleProjects = useMemo(
    () =>
      projectFilter
        ? orderedProjects.filter((p) => p.name.toLowerCase().includes(projectFilter.toLowerCase()))
        : orderedProjects,
    [orderedProjects, projectFilter],
  );

  function statsFor(projectId: string) {
    const ls = lots.filter((l) => l.projectId === projectId && matchesQuery(l.title, l.body));
    return {
      open: ls.filter((l) => !l.done).length,
      late: ls.filter((l) => computeUrgency(l) === 'late').length,
    };
  }

  const hasSel = selected.length > 0;

  return (
    <div className="menu">
      <div className="menu__header">
        <span className="menu__brand">le fil</span>
        <span className="menu__date">{TODAY_LABEL}</span>
      </div>

      <input
        className="menu__search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="CHERCHER"
      />

      <button
        className={`menu__lateToggle ${lateOnly ? 'menu__lateToggle--active' : ''}`}
        onClick={toggleLateOnly}
      >
        retard uniquement
        <span>{lateCount}</span>
      </button>

      <button
        className={`menu__noProjToggle ${selected.includes(NO_PROJECT) ? 'menu__noProjToggle--active' : ''}`}
        onClick={() => selectOnly(NO_PROJECT)}
      >
        sans projet
        <span>{noProjectCount}</span>
      </button>

      <div className="menu__projHead">
        <span className="menu__projHeadLabel">projets</span>
        <span className="menu__projHeadCount">{projects.length}</span>
        <input
          className="menu__projFilter"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          placeholder="FILTRER"
        />
      </div>

      <div className="menu__list">
        {visibleProjects.map((p) => {
          const isSel = selected.includes(p.id);
          // Dès qu'une sélection existe, les projets non sélectionnés pâlissent ; les sélectionnés
          // gardent leur aplat et s'ouvrent vers le volet 2 (onglet, voir .projectRow__main--selected).
          const faded = selected.length > 0 && !isSel;
          const fg = faded ? 'var(--ink)' : contrastText(p.color);
          const stats = statsFor(p.id);
          const picking = colorPickerProjectId === p.id;
          return (
            <div
              key={p.id}
              className={[
                'projectRow',
                overProjectId === p.id ? 'projectRow--over' : '',
                dragProjectId === p.id ? 'projectRow--dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable
              title="glisser pour réordonner"
              onDragStart={() => setDragProject(p.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overProjectId !== p.id) setOverProject(p.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                reorderProjects(dragProjectId ?? '', p.id);
              }}
              onDragEnd={() => {
                setDragProject(null);
                setOverProject(null);
              }}
            >
              <div
                className={`projectRow__main ${isSel ? 'projectRow__main--selected' : ''}`}
                style={{
                  background: faded ? `color-mix(in srgb, ${p.color} 22%, var(--paper))` : p.color,
                  // Liseré intérieur de 4 px : signal de sélection (README §3.2), pas sur toutes les lignes.
                  boxShadow: isSel ? `inset 4px 0 0 ${fg}` : 'none',
                }}
              >
                {/* Case : ajoute / retire ce projet de la sélection (plusieurs projets à la suite). */}
                <button
                  className="projectRow__check"
                  title={isSel ? 'retirer de la sélection' : 'ajouter à la sélection'}
                  style={{ color: fg }}
                  onClick={() => toggleSelected(p.id)}
                >
                  <span
                    className="projectRow__mark"
                    style={{
                      borderColor: fg,
                      background: isSel ? fg : 'transparent',
                      color: isSel ? p.color : fg,
                    }}
                  >
                    {isSel ? '×' : ''}
                  </span>
                </button>
                {/* Nom : n'affiche que ce projet. */}
                <button className="projectRow__select" style={{ color: fg }} onClick={() => selectOnly(p.id)}>
                  <span
                    className="projectRow__name"
                    style={{ fontWeight: isSel ? 800 : 600, fontSize: 11 }}
                  >
                    {p.name}
                  </span>
                  <span className="projectRow__count" style={{ color: fg }}>
                    {stats.late ? `${stats.late} ⚑` : stats.open ? String(stats.open) : '—'}
                  </span>
                </button>
                <button
                  className="projectRow__colorBtn"
                  title="couleur du projet"
                  style={{ color: fg }}
                  onClick={() => toggleProjectPicker(p.id)}
                >
                  {picking ? '▴' : '▾'}
                </button>
              </div>

              {picking && (
                <div className="projectRow__picker">
                  <input
                    className="projectRow__renameInput"
                    value={p.name}
                    onChange={(e) => renameProject(p.id, e.target.value)}
                    placeholder="NOM DU PROJET"
                  />
                  <div className="projectRow__swatches">
                    {PALETTE.map((sw) => (
                      <button
                        key={sw.hex}
                        className={`projectRow__swatch ${sw.hex === p.color ? 'projectRow__swatch--active' : ''}`}
                        title={sw.name}
                        style={{ background: sw.hex }}
                        onClick={() => setProjectColor(p.id, sw.hex)}
                      />
                    ))}
                  </div>
                  <button
                    className={`projectRow__delete ${
                      confirmDeleteProjectId === p.id ? 'projectRow__delete--confirm' : ''
                    }`}
                    onClick={() =>
                      confirmDeleteProjectId === p.id
                        ? confirmDeleteProject(p.id)
                        : requestDeleteProject(p.id)
                    }
                    onBlur={() => confirmDeleteProjectId === p.id && cancelDeleteProject()}
                  >
                    {confirmDeleteProjectId === p.id ? 'confirmer ✕' : 'supprimer'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {visibleProjects.length === 0 && <div className="menu__empty">aucun projet</div>}
      </div>

      <div className="menu__newProject">
        <input
          className="menu__newProjectInput"
          value={projectDraftLocal}
          onChange={(e) => setProjectDraftLocal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              addProjectAction(projectDraftLocal);
              setProjectDraftLocal('');
            }
          }}
          placeholder="+ NOUVEAU PROJET"
        />
        {projectDraftLocal.trim() && (
          <button
            className="menu__newProjectSubmit"
            onClick={() => {
              addProjectAction(projectDraftLocal);
              setProjectDraftLocal('');
            }}
          >
            ↵
          </button>
        )}
      </div>

      {hasSel && (
        <button className="menu__clearSel" onClick={clearSelected}>
          vider la sélection ✕
        </button>
      )}

      <div className="menu__footer">
        {acctOpen && (
          <div className="menu__acctPanel">
            <span className="menu__acctEmail">{userEmail}</span>
            <button
              className="menu__acctBtn"
              onClick={() => {
                setAcctOpen(false);
                onOpenAccount();
              }}
            >
              compte &amp; sécurité
            </button>
            <button
              className="menu__acctBtn menu__acctBtn--danger"
              onClick={() => supabase.auth.signOut()}
            >
              se déconnecter
            </button>
          </div>
        )}
        <button className="menu__syncBtn" title="compte et synchronisation" onClick={() => setAcctOpen((v) => !v)}>
          <span className="menu__syncDot" style={{ background: 'var(--green)' }} />
          <span className="menu__syncLabel" style={{ color: 'var(--text-secondary)' }}>
            synchronisé
          </span>
          <span className="menu__syncAccount">compte</span>
        </button>
      </div>
    </div>
  );
}
