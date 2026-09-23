import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import AuthScreen from './features/auth/AuthScreen';
import DesktopShell from './features/shell/DesktopShell';

// Session factice utilisée uniquement quand Supabase n'est pas encore configuré (voir
// .env.example), pour pouvoir développer/prévisualiser l'appli sans compte au préalable.
// Aucune donnée n'est envoyée nulle part : le store applicatif reste 100% local (voir
// src/state/seed.ts) jusqu'au branchement réel.
const DEMO_SESSION = { user: { email: 'demo@local' } } as unknown as Session;

export default function App() {
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
    return <DesktopShell session={DEMO_SESSION} />;
  }

  if (!session) return <AuthScreen />;

  // TODO : coquille mobile (onglets fil · projets · calendrier) — voir README §4.
  // Pour l'instant, le shell desktop s'affiche à toutes les tailles.
  return <DesktopShell session={session} />;
}
