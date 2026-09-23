// Données de démonstration locales — en attendant le branchement Supabase.
// Voir design_handoff_le_fil/README.md pour le modèle de données réel.
import type { Lot, Project, Task } from '../types/models';

function iso(offsetDays: number | null): string | null {
  if (offsetDays === null) return null;
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const now = new Date().toISOString();

export const SEED_PROJECTS: Project[] = [
  { id: 'proj_maison', userId: 'local', name: 'Maison', color: '#e8402a', position: 0 },
  { id: 'proj_site', userId: 'local', name: 'Site perso', color: '#2a8a97', position: 1 },
  { id: 'proj_lecture', userId: 'local', name: 'Lectures', color: '#7a4fa3', position: 2 },
];

export const SEED_LOTS: Lot[] = [
  {
    id: 'lot_1',
    userId: 'local',
    projectId: 'proj_maison',
    title: 'Réviser la chaudière',
    body: 'Appeler le chauffagiste avant l’hiver.',
    due: iso(-2),
    done: false,
    position: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'lot_2',
    userId: 'local',
    projectId: 'proj_site',
    title: 'Refondre la page d’accueil',
    body: '',
    due: iso(0),
    done: false,
    position: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'lot_3',
    userId: 'local',
    projectId: 'proj_site',
    title: 'Écrire l’article sur le design system',
    body: '',
    due: iso(4),
    done: false,
    position: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'lot_4',
    userId: 'local',
    projectId: 'proj_lecture',
    title: 'Finir « Les villes invisibles »',
    body: '',
    due: iso(18),
    done: false,
    position: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'lot_5',
    userId: 'local',
    projectId: null,
    title: 'Trier les photos de vacances',
    body: '',
    due: null,
    done: false,
    position: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'lot_6',
    userId: 'local',
    projectId: 'proj_maison',
    title: 'Changer le joint du robinet',
    body: '',
    due: iso(-10),
    done: true,
    position: null,
    createdAt: now,
    updatedAt: now,
  },
];

export const SEED_TASKS: Task[] = [
  { id: 'task_1', lotId: 'lot_1', label: 'Trouver un numéro', due: null, done: true, position: 0 },
  { id: 'task_2', lotId: 'lot_1', label: 'Prendre rendez-vous', due: iso(-1), done: false, position: 1 },
  { id: 'task_3', lotId: 'lot_2', label: 'Maquette mobile', due: iso(0), done: false, position: 0 },
  { id: 'task_4', lotId: 'lot_2', label: 'Choisir la typo', due: null, done: false, position: 1 },
];
