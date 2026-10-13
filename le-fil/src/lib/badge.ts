import { useEffect } from 'react';
import { useStore } from '../state/store';
import { focusByLot } from './urgencyGroups';

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
      const focus = focusByLot(lots, tasks);
      const count = lots.filter((l) => {
        const u = focus.get(l.id)!.urgency;
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
