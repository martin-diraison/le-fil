import { useEffect } from 'react';
import { useStore } from '../state/store';
import { takeLaunchIntent } from './launchIntent';

/** À appeler dans la coquille (données déjà chargées) : crée le lot partagé, ou signale « nouveau lot ». */
export function useLaunchIntent(onShared: (lotId: string) => void, onNew: () => void) {
  useEffect(() => {
    const intent = takeLaunchIntent();
    if (!intent) return;
    if (intent.kind === 'new') return onNew();
    const s = useStore.getState();
    const id = s.addLot(intent.title, null, { parse: false });
    if (!id) return;
    if (intent.body) s.updateLotBody(id, intent.body);
    s.flash('lot créé depuis le partage');
    onShared(id);
    // Une seule fois au montage : l'intention est consommée par takeLaunchIntent().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
