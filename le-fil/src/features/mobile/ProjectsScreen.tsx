import { NO_PROJECT, useStore } from '../../state/store';
import { contrastText } from '../../lib/palette';
import { DraftBar } from './parts';
import type { MobileNav } from './MobileShell';

// Projets — grille de pavés colorés sur 2 colonnes (README §4 « Projets »).
export default function ProjectsScreen({ nav }: { nav: MobileNav }) {
  const projects = useStore((s) => s.projects);
  const lots = useStore((s) => s.lots);
  const addProject = useStore((s) => s.addProject);
  const flash = useStore((s) => s.flash);

  const ordered = projects.slice().sort((a, b) => a.position - b.position);
  const openCount = (projectId: string | null) => lots.filter((l) => l.projectId === projectId && !l.done).length;
  const noProjCount = openCount(null);

  return (
    <div className="m__col">
      <div className="m__head m__head--baseline">
        <span className="m__headTitle">projets</span>
        <span className="m__headNum">{projects.length}</span>
        <span className="m__headHint">appui = ouvrir</span>
      </div>
      <div className="m__scroll">
        <div className="m__tiles">
          {ordered.map((p) => {
            const n = openCount(p.id);
            return (
              <button
                key={p.id}
                className="m__tile"
                style={{ background: p.color, color: contrastText(p.color) }}
                onClick={() => nav.openProject(p.id)}
              >
                <span className="m__tileName">{p.name}</span>
                <span className="m__tileCount">
                  <span className="m__tileNum">{n}</span>
                  <span className="m__tileUnit">{n > 1 ? 'lots' : 'lot'}</span>
                </span>
              </button>
            );
          })}
          <button className="m__tile m__tile--none" onClick={() => nav.openProject(NO_PROJECT)}>
            <span className="m__tileName">sans projet</span>
            <span className="m__tileCount">
              <span className="m__tileNum">{noProjCount}</span>
              <span className="m__tileUnit">{noProjCount > 1 ? 'lots' : 'lot'}</span>
            </span>
          </button>
        </div>
      </div>
      <DraftBar
        placeholder="NOUVEAU PROJET…"
        onCommit={(name) => {
          const id = addProject(name);
          if (!id) return;
          // addProject ouvre les réglages du projet côté desktop ; inutile ici.
          useStore.setState({ colorPickerProjectId: null });
          flash('projet créé');
          nav.openProject(id);
        }}
      />
    </div>
  );
}
