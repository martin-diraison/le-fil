import { Fragment, useMemo, useState } from 'react';
import { NO_PROJECT, filterLots, useStore, type ProjectKey } from '../../state/store';
import {
  compareUrgency,
  computeUrgency,
  isAgenda,
  isArchived,
  type Lot,
  type Task,
  type Urgency,
} from '../../types/models';
import { dateSubLabel, daysUntil, formatShortDate } from '../../lib/format';
import { NO_PROJECT_COLOR } from '../../lib/palette';
import { URGENCY_GROUPS, byFocus, focusByLot, type LotFocusInfo } from '../../lib/urgencyGroups';
import { lotColor } from '../../lib/coursColors';
import './LotList.css';

// Liste desktop : les lots de la sélection, en sections. Deux rangements :
// - « échéance » (par défaut) : mêmes sections que le Fil mobile, selon l'urgence effective
//   mais un lot est répété dans chaque section proche (retard → 30 j) où tombe une de ses tâches
//   ouvertes datées (ou sa propre échéance), avec sous son titre les tâches de cette section (`lotEntries`) ;
// - « projet » : un bloc par projet sélectionné, mêmes lignes, sous des intitulés d'échéance.
// Le choix est mémorisé sur l'appareil (préférence d'affichage, pas une donnée du compte).
type Grouping = 'echeance' | 'projet';
const GROUPING_KEY = 'lefil:listGroup';
function readGrouping(): Grouping {
  try {
    return localStorage.getItem(GROUPING_KEY) === 'projet' ? 'projet' : 'echeance';
  } catch {
    return 'echeance';
  }
}
function saveGrouping(g: Grouping) {
  try {
    localStorage.setItem(GROUPING_KEY, g);
  } catch {
    /* stockage indisponible : le choix vaudra pour la session */
  }
}

// Une ligne de la liste : un lot dans une section d'échéance, avec l'échéance et les tâches propres
// à cette section. `more` : séances de cours de la section non listées (voir `lotEntries`).
type Entry = { lot: Lot; urgency: Urgency; due: string | null; tasks: Task[]; more: number };
type Section = { key: string; label: string; color?: string; tone?: 'late' | 'muted'; entries: Entry[] };

const byDueThenTime = (a: Task, b: Task) =>
  a.due!.localeCompare(b.due!) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.position - b.position;

// Sections où un lot est répété : chaque tâche ouverte datée qui y tombe y est listée.
const NEAR: Urgency[] = ['late', 'today', 'week', 'month'];
const URGENCY_INFO = new Map(URGENCY_GROUPS.map((g) => [g.key, g]));

/**
 * Lignes d'un lot : une par section proche (retard, aujourd'hui, 7 j, 30 j) où tombe une de ses
 * tâches ouvertes datées ou sa propre échéance, avec les seules tâches de cette section. Sans rien
 * de proche : une ligne à son urgence effective (plus tard / sans date / terminé) avec la tâche qui
 * le fait remonter. Lots de cours : seule la prochaine séance de la section, les autres comptées.
 */
function lotEntries(lot: Lot, info: LotFocusInfo): Entry[] {
  const fallback: Entry = { lot, urgency: info.urgency, due: info.due, tasks: info.task ? [info.task] : [], more: 0 };
  if (lot.done) return [fallback];
  const by = new Map<Urgency, Task[]>();
  for (const t of info.tasks) {
    if (t.done || !t.due) continue;
    const u = computeUrgency({ done: false, due: t.due, sourceId: t.sourceId });
    if (!NEAR.includes(u)) continue; // séance passée (done) ou au-delà de 30 j
    const list = by.get(u);
    if (list) list.push(t);
    else by.set(u, [t]);
  }
  const lotU = lot.due ? computeUrgency(lot) : null;
  if (lotU && NEAR.includes(lotU) && !by.has(lotU)) by.set(lotU, []);
  if (by.size === 0) return [fallback];
  const agenda = isAgenda(lot);
  return [...by].map(([urgency, ts]) => {
    ts.sort(byDueThenTime);
    let due = ts[0]?.due ?? null;
    if (urgency === lotU && (!due || lot.due! < due)) due = lot.due;
    const shown = agenda ? ts.slice(0, 1) : ts;
    return { lot, urgency, due, tasks: shown, more: ts.length - shown.length };
  });
}

const byEntry = (a: Entry, b: Entry) =>
  compareUrgency(a.urgency, b.urgency) || (a.due ?? '').localeCompare(b.due ?? '');

export default function LotList() {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const selected = useStore((s) => s.selected);
  const lateOnly = useStore((s) => s.lateOnly);
  const search = useStore((s) => s.search);
  const openLotId = useStore((s) => s.openLotId);
  const lotDraft = useStore((s) => s.lotDraft);
  const showArchived = useStore((s) => s.showArchived);
  const toggleShowArchived = useStore((s) => s.toggleShowArchived);
  const addLot = useStore((s) => s.addLot);
  const openLot = useStore((s) => s.openLot);

  const [draftLocal, setDraftLocal] = useState(lotDraft);
  const [grouping, setGrouping] = useState<Grouping>(readGrouping);
  // Sections repliées (état local) : « terminés » l'est d'office.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['done']));

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const focus = useMemo(() => focusByLot(lots, tasks), [lots, tasks]);

  // Le filtre « retard » porte sur l'urgence effective (comme le Fil), pas sur la seule date du lot.
  const visible = useMemo(
    () =>
      filterLots({ lots, tasks, selected, lateOnly: false, search, view: 'liste', showArchived })
        .filter((l) => !lateOnly || focus.get(l.id)!.urgency === 'late')
        .sort(byFocus(focus)),
    [lots, tasks, selected, lateOnly, search, showArchived, focus],
  );
  // Archives de la sélection (terminés depuis plus de 30 j) — lien en bas de liste.
  const archivedCount = useMemo(
    () =>
      search || lateOnly
        ? 0
        : filterLots({ lots, tasks, selected, lateOnly: false, search, view: 'liste', showArchived: true }).filter(
            (l) => isArchived(l),
          ).length,
    [lots, tasks, selected, lateOnly, search],
  );

  // Toutes les lignes, triées par urgence puis échéance (le filtre « retard » ne garde que les retards).
  const allEntries = useMemo(
    () =>
      visible
        .flatMap((l) => lotEntries(l, focus.get(l.id)!))
        .filter((e) => !lateOnly || e.urgency === 'late')
        .sort(byEntry),
    [visible, focus, lateOnly],
  );

  const sections = useMemo<Section[]>(() => {
    if (grouping === 'echeance') {
      return URGENCY_GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        tone: g.tone,
        entries: allEntries.filter((e) => e.urgency === g.key),
      })).filter((g) => g.entries.length > 0);
    }
    const order: ProjectKey[] = [
      ...projects
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((p) => p.id)
        .filter((id) => selected.includes(id)),
      ...(selected.includes(NO_PROJECT) ? [NO_PROJECT] : []),
    ];
    return order
      .map((k) => ({
        key: k,
        label: k === NO_PROJECT ? 'sans projet' : (projectById.get(k)?.name ?? ''),
        color: k === NO_PROJECT ? NO_PROJECT_COLOR : projectById.get(k)?.color,
        entries: allEntries.filter((e) => (e.lot.projectId ?? NO_PROJECT) === k),
      }))
      .filter((g) => g.entries.length > 0);
  }, [grouping, allEntries, projects, projectById, selected]);

  const draftHint =
    selected.length === 1 && selected[0] !== NO_PROJECT ? 'LOT DANS CE PROJET…' : 'ÉCRIS, ON TRIE APRÈS…';
  const emptyHint = lateOnly ? 'aucun retard ici' : search ? 'essaie un autre mot' : 'écris en haut';

  // En-tête de la sélection : une pastille par projet, puis les noms (au-delà de 2 : « N projets »).
  const selItems = selected.map((k) =>
    k === NO_PROJECT
      ? { key: k, name: 'Sans projet', color: NO_PROJECT_COLOR }
      : { key: k, name: projectById.get(k)?.name ?? '', color: projectById.get(k)?.color ?? NO_PROJECT_COLOR },
  );
  const selLabel = selItems.length > 2 ? `${selItems.length} projets` : selItems.map((i) => i.name).join(' + ');

  function commit() {
    addLot(draftLocal);
    setDraftLocal('');
  }
  function chooseGrouping(g: Grouping) {
    setGrouping(g);
    saveGrouping(g);
  }
  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="lotPane">
      <div className="lotPane__head">
        <span className="lotPane__dots">
          {selItems.map((i) => (
            <span key={i.key} className="lotPane__dot" style={{ background: i.color }} />
          ))}
        </span>
        <span className="lotPane__title" title={selItems.map((i) => i.name).join(' + ')}>
          {selLabel}
        </span>
        <span className="lotPane__count">
          {visible.length} {visible.length > 1 ? 'lots' : 'lot'}
        </span>
        <span className="lotPane__grouping" role="group" aria-label="ranger par">
          {(['echeance', 'projet'] as Grouping[]).map((g) => (
            <button
              key={g}
              className={`lotPane__groupBtn ${grouping === g ? 'lotPane__groupBtn--on' : ''}`}
              onClick={() => chooseGrouping(g)}
            >
              {g === 'echeance' ? 'échéance' : 'projet'}
            </button>
          ))}
        </span>
      </div>
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
        {sections.map((sec) => {
          // Pendant une recherche, toutes les sections trouvées sont dépliées.
          const isOpen = search !== '' || !collapsed.has(sec.key);
          return (
            <div key={sec.key}>
              <button
                className={`lotPane__group ${sec.tone ? 'lotPane__group--' + sec.tone : ''}`}
                onClick={() => toggleSection(sec.key)}
              >
                {sec.color && <span className="lotPane__groupDot" style={{ background: sec.color }} />}
                {sec.label} · {sec.entries.length}
                <span className="lotPane__groupMark">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen &&
                sec.entries.map(({ lot, ...entry }, i) => (
                  <Fragment key={lot.id + ':' + entry.urgency}>
                    {/* Rangement « projet » : intitulé d'échéance quand elle change dans le projet. */}
                    {grouping === 'projet' && entry.urgency !== sec.entries[i - 1]?.urgency && (
                      <div
                        className={`lotPane__sub ${URGENCY_INFO.get(entry.urgency)?.tone ? 'lotPane__sub--' + URGENCY_INFO.get(entry.urgency)!.tone : ''}`}
                      >
                        {URGENCY_INFO.get(entry.urgency)?.label}
                      </div>
                    )}
                    <LotRow
                      lot={lot}
                      entry={entry}
                      allTasks={focus.get(lot.id)!.tasks}
                      project={lot.projectId ? projectById.get(lot.projectId) : undefined}
                      showProject={grouping === 'echeance'}
                      selected={openLotId === lot.id}
                      onOpen={() => openLot(lot.id)}
                    />
                  </Fragment>
                ))}
            </div>
          );
        })}
        {sections.length === 0 && <div className="lotPane__empty">rien ici — {emptyHint}</div>}
        {archivedCount > 0 && (
          <button className="lotPane__archives" onClick={toggleShowArchived}>
            {showArchived ? 'masquer les archives' : `voir les archives · ${archivedCount}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** « aujourd'hui » / « demain » / « 3 j de retard » / « 5 OCT » pour la tâche qui fait remonter un lot. */
function taskWhen(task: Task): string {
  const d = daysUntil(task.due)!;
  if (d < 0) return `${-d} j de retard`;
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'demain';
  return formatShortDate(task.due);
}

function LotRow({
  lot,
  entry,
  allTasks,
  project,
  showProject,
  selected,
  onOpen,
}: {
  lot: Lot;
  entry: Omit<Entry, 'lot'>;
  allTasks: Task[];
  project: { name: string; color: string } | undefined;
  showProject: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  const urgency: Urgency = entry.urgency;
  const late = urgency === 'late';
  const color = lotColor(project?.color ?? 'var(--text-tertiary)', lot, entry.tasks[0]);
  // Colonne date : l'échéance de la ligne (sa tâche la plus proche dans la section, ou celle du lot).
  const dateColor = late ? (selected ? 'var(--red)' : 'var(--paper)') : selected ? 'var(--paper)' : 'var(--ink)';
  const subColor = late ? (selected ? 'var(--red)' : 'var(--paper)') : selected ? '#c9c9c4' : 'var(--text-secondary)';
  const doneCount = allTasks.filter((t) => t.done).length;
  return (
    <button className={`lotRow ${selected ? 'lotRow--selected' : ''}`} onClick={onOpen}>
      <span className="lotRow__edge" style={{ background: color }} />
      <span className="lotRow__date" style={{ background: !selected && late ? 'var(--red)' : 'transparent' }}>
        <span className="lotRow__dateTop" style={{ color: dateColor }}>
          {entry.due ? formatShortDate(entry.due) : '—'}
        </span>
        <span className="lotRow__dateSub" style={{ color: subColor }}>
          {dateSubLabel(entry.due, urgency)}
        </span>
      </span>
      <span className="lotRow__body">
        <span
          className="lotRow__title"
          style={{
            font: selected ? '800 13.5px var(--font-ui)' : '500 13.5px var(--font-ui)',
            color: selected ? 'var(--paper)' : lot.done ? 'var(--text-secondary)' : 'var(--ink)',
            textDecoration: lot.done ? 'line-through' : 'none',
          }}
        >
          {lot.title}
        </span>
        {entry.tasks.map((t) => (
          <span
            key={t.id}
            className="lotRow__focusTask"
            style={{
              color: selected
                ? '#c9c9c4'
                : !isAgenda(t) && daysUntil(t.due)! < 0
                  ? 'var(--red)'
                  : 'var(--text-secondary)',
            }}
          >
            ↳ {t.label} · {taskWhen(t)}
          </span>
        ))}
        {entry.more > 0 && (
          <span
            className="lotRow__focusTask lotRow__more"
            style={{ color: selected ? '#c9c9c4' : 'var(--text-secondary)' }}
          >
            + {entry.more} {entry.more > 1 ? 'séances' : 'séance'}
          </span>
        )}
        {(showProject || allTasks.length > 0) && (
          <span className="lotRow__metaRow">
            {showProject && (
              <span
                className="lotRow__project"
                style={{ color: selected ? '#c9c9c4' : (project?.color ?? 'var(--text-tertiary)') }}
              >
                {project ? project.name : 'sans projet'}
              </span>
            )}
            {allTasks.length > 0 && (
              <span className="lotRow__taskCount" style={{ color: selected ? '#c9c9c4' : 'var(--text-secondary)' }}>
                {doneCount}/{allTasks.length}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
