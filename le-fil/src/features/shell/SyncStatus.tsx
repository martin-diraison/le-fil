import { useStore, type SyncStatus } from '../../state/store';

const LABELS: Record<SyncStatus, { label: string; color: string }> = {
  ok: { label: 'synchronisé', color: 'var(--green)' },
  pending: { label: 'envoi…', color: 'var(--yellow)' },
  offline: { label: 'hors ligne', color: 'var(--text-secondary)' },
  error: { label: 'synchro en échec', color: 'var(--red)' },
};

/** Libellé + couleur de l'état réel de la synchro (alimenté par sync.ts), et l'erreur en infobulle. */
export function useSyncLabel() {
  const status = useStore((s) => s.syncStatus);
  const error = useStore((s) => s.syncError);
  return { ...LABELS[status], title: error ?? undefined };
}
