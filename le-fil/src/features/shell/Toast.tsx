import { useStore } from '../../state/store';
import './Toast.css';

/** Toast partagé desktop/mobile ; propose « annuler » quand l'action le permet (voir `flash`). */
export default function Toast({ className }: { className: string }) {
  const toast = useStore((s) => s.toast);
  const canUndo = useStore((s) => s.toastUndo !== null);
  const undoToast = useStore((s) => s.undoToast);
  if (!toast) return null;
  return (
    <div className={className}>
      {toast}
      {canUndo && (
        <button className="toastUndo" onClick={undoToast}>
          annuler
        </button>
      )}
    </div>
  );
}
