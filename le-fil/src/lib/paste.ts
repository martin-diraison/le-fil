import type { ClipboardEvent } from 'react';

/**
 * Coller une liste dans « ajouter une tâche » : une tâche par ligne. Les puces et cases usuelles
 * (« - », « * », « • », « 1. », « [ ] », « ☐ »…) sont retirées, les lignes vides ignorées.
 * Renvoie null si le texte collé tient sur une seule ligne (collage normal dans le champ).
 */
export function pastedLines(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–·]|\d+[.)]|\[[ xX]?\]|[☐☑✓✔])\s*/, '').trim())
    .filter(Boolean);
  return lines.length > 1 ? lines : null;
}

/** Gestionnaire onPaste commun desktop/mobile : crée les tâches et empêche le collage dans le champ. */
export function handleTaskPaste(e: ClipboardEvent<HTMLInputElement>, add: (labels: string[]) => void) {
  const lines = pastedLines(e.clipboardData.getData('text'));
  if (!lines) return;
  e.preventDefault();
  add(lines);
}
