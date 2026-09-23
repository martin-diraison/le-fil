import type { Session } from '@supabase/supabase-js';
import AccountPanel from './AccountPanel';
import './AccountDrawer.css';

export default function AccountDrawer({ session, onClose }: { session: Session; onClose: () => void }) {
  return (
    <>
      <div className="acctDrawer__overlay" onClick={onClose} />
      <div className="acctDrawer">
        <div className="acctDrawer__header">
          <span className="acctDrawer__title">compte &amp; sécurité</span>
          <button className="acctDrawer__close" title="fermer" onClick={onClose}>
            ✕
          </button>
        </div>
        <AccountPanel session={session} />
      </div>
    </>
  );
}
