import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import AuthScreen from './features/auth/AuthScreen';
import DesktopShell from './features/shell/DesktopShell';
import MobileShell from './features/mobile/MobileShell';

// Session factice utilisée uniquement quand Supabase n'est pas encore configuré (voir
// .env.example), pour pouvoir développer/prévisualiser l'appli sans compte au préalable.
// Aucune donnée n'est envoyée nulle part : le store applicatif reste 100% local (voir
// src/state/seed.ts) jusqu'au branchement réel.
const DEMO_SESSION = { user: { email: 'demo@local' } } as unknown as Session;

// Même seuil que la mise en page responsive de l'écran de connexion (AuthScreen.css).
const MOBILE_QUERY = '(max-width: 760px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

export default function App() {
  const isMobile = useIsMobile();
  const Shell = isMobile ? MobileShell : DesktopShell;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return null;

  if (!isSupabaseConfigured) {
    // Contournement de QA visuelle uniquement : ?showAuth force l'écran de connexion
    // même sans Supabase configuré, pour comparer au prototype. À retirer plus tard.
    if (typeof window !== 'undefined' && window.location.search.includes('showAuth')) {
      return <AuthScreen />;
    }
    return <Shell session={DEMO_SESSION} />;
  }

  if (!session) return <AuthScreen />;

  return <Shell session={session} />;
}
