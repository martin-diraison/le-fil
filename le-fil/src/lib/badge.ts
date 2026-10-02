import { useEffect } from 'react';
import { useStore } from '../state/store';
import { computeUrgency, lotFocus } from '../types/models';

/**
 * Pastille sur l'icône de l'appli installée : nombre de lots en retard ou du jour (en tenant
 * compte des tâches datées, comme le Fil). API Badging : Chrome/Edge, Android selon le lanceur,
 * iOS 16.4+ ; ailleurs, rien ne se passe.
 */
export function useAppBadge() {
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    const update = () => {
      const count = lots.filter((l) => {
        if (l.done) return false;
        const u = computeUrgency({ done: false, due: lotFocus(l, tasks.filter((t) => t.lotId === l.id)).due });
        return u === 'late' || u === 'today';
      }).length;
      const p = count ? navigator.setAppBadge(count) : navigator.clearAppBadge();
      p.catch(() => {}); // refus (permission, appli non installée) : sans conséquence
    };
    update();
    // Le passage à minuit change ce qui est « du jour » : recalcul au retour sur l'appli.
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [lots, tasks]);
}
