import { useEffect, useRef, useState } from 'react';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import AuthScreen from './features/auth/AuthScreen';
import DesktopShell from './features/shell/DesktopShell';
import MobileShell from './features/mobile/MobileShell';
import { resetStore, startSync } from './state/sync';
import { useAppBadge } from './lib/badge';
import { loadCache, readLastUser, saveLastUser } from './lib/localCache';

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
  useAppBadge();
  const Shell = isMobile ? MobileShell : DesktopShell;
  const [realSession, setSession] = useState<Session | null>(null);
  // Hors ligne avec un jeton expiré, Supabase ne rend pas de session (il ne peut pas la
  // renouveler) mais la garde en mémoire : on rouvre alors le dernier compte sur sa copie locale.
  // Le vrai jeton revient tout seul au retour du réseau (renouvellement automatique de Supabase).
  const [offlineSession, setOfflineSession] = useState<Session | null>(null);
  const session = realSession ?? offlineSession;
  const signedOut = useRef(false); // déconnexion volontaire : effacer la copie locale
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session);
      if (!data.session && (!navigator.onLine || (error && isAuthRetryableFetchError(error)))) {
        const last = readLastUser();
        if (last && loadCache(last.id)) {
          setOfflineSession({ user: { id: last.id, email: last.email } } as unknown as Session);
        }
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') {
        signedOut.current = true;
        setOfflineSession(null);
      }
      if (s) {
        signedOut.current = false;
        setOfflineSession(null);
        saveLastUser({ id: s.user.id, email: s.user.email ?? '' });
      }
      setSession(s);
    });
    // Retour du réseau en mode hors ligne : redemander la session (déclenche le renouvellement).
    const onOnline = () => {
      void supabase.auth.getSession().then(({ data }) => data.session && setSession(data.session));
    };
    window.addEventListener('online', onOnline);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Une fois connecté : charge les données du compte, puis synchronise chaque modification.
  const userId = session?.user.id;
  const [dataState, setDataState] = useState<'idle' | 'loading' | 'ready' | { error: string }>('idle');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!userId) {
      resetStore();
      setDataState('idle');
      return;
    }
    let cancelled = false;
    let stop: ((forget?: boolean) => void) | undefined;
    setDataState('loading');
    startSync(userId).then(
      (fn) => {
        if (cancelled) return fn();
        stop = fn;
        setDataState('ready');
      },
      (e: Error) => {
        if (!cancelled) setDataState({ error: e.message });
      },
    );
    return () => {
      cancelled = true;
      stop?.(signedOut.current);
    };
  }, [userId, attempt]);

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

  if (typeof dataState === 'object') {
    return (
      <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
        <p>Impossible de charger tes données.</p>
        <p style={{ opacity: 0.7 }}>
          {navigator.onLine
            ? dataState.error
            : "Pas de connexion, et pas encore de copie locale sur cet appareil : il faut s'être connecté une fois en ligne."}
        </p>
        <button onClick={() => setAttempt((n) => n + 1)}>Réessayer</button>{' '}
        <button onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    );
  }
  if (dataState !== 'ready') return null;

  return <Shell session={session} />;
}
