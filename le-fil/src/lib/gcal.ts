// Synchro Le Fil → Google Agenda (sens unique), côté appli. Tout le travail est fait par la
// fonction Edge Supabase `gcal` (supabase/functions/gcal) : l'appli ne fait que la déclencher et
// ouvrir la fenêtre d'autorisation Google (Google Identity Services, flux « code » en popup).

import { supabase } from './supabase';

export type GcalStatus = {
  clientId: string;
  linked: boolean;
  lastSync: string | null;
  lastError: string | null;
};
type SyncResult = { linked: boolean; partial?: boolean; error?: string };

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
/** Délai de regroupement : plusieurs modifs rapprochées → une seule synchro Google. */
const SYNC_DELAY = 4000;

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gcal', { body: { action, ...extra } });
  if (error) {
    // Le corps de la réponse porte le message utile (« secrets absents », « code manquant »…).
    const ctx = (error as { context?: Response }).context;
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  if (data?.error && !('linked' in data)) throw new Error(data.error);
  return data as T;
}

// Mémo local « agenda relié ? » par compte : évite d'appeler la fonction après chaque modif quand
// Google n'est pas relié. Le lien se fait depuis un seul appareil : un « non relié » mémorisé
// ailleurs deviendrait faux sans que cet appareil le sache. Il n'est donc cru qu'une heure, et
// chaque démarrage revérifie (requestGcalSync(…, true)). Inconnu = on essaie.
const linkKey = (userId: string) => `lefil:gcal:${userId}`;
const UNLINKED_TTL = 60 * 60_000;
function rememberLinked(userId: string, linked: boolean) {
  try {
    localStorage.setItem(linkKey(userId), linked ? '1' : `0:${Date.now()}`);
  } catch {
    /* stockage indisponible : on appellera la fonction pour rien, sans gravité */
  }
}
function knownUnlinked(userId: string): boolean {
  try {
    const v = localStorage.getItem(linkKey(userId)) ?? '';
    // Ancien format « 0 » sans date : considéré comme périmé.
    return v.startsWith('0:') && Date.now() - Number(v.slice(2)) < UNLINKED_TTL;
  } catch {
    return false;
  }
}

export async function gcalStatus(userId: string): Promise<GcalStatus> {
  const s = await call<GcalStatus>('status');
  rememberLinked(userId, s.linked);
  return s;
}

export async function gcalDisconnect(userId: string): Promise<number> {
  const r = await call<{ removed?: number }>('disconnect');
  rememberLinked(userId, false);
  return r.removed ?? 0;
}

export async function gcalSyncNow(userId: string): Promise<SyncResult> {
  const r = await call<SyncResult>('sync');
  rememberLinked(userId, r.linked);
  if (r.error) throw new Error(r.error);
  return r;
}

// ------------------------------------------------------------ déclenchement automatique
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

/** À appeler après chaque envoi réussi de données à Supabase : synchro Google regroupée.
 * `force` : ignore le mémo « non relié » (démarrage de l'appli). */
export function requestGcalSync(userId: string, force = false) {
  if (!force && knownUnlinked(userId)) return;
  clearTimeout(timer);
  timer = setTimeout(() => void run(userId), SYNC_DELAY);
}

async function run(userId: string) {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    const r = await gcalSyncNow(userId);
    if (r.partial) again = true; // beaucoup d'événements : la fonction a rendu la main avant la fin
  } catch (e) {
    // Pas de toast : l'état et l'erreur sont visibles dans « compte › Google Agenda ».
    console.warn('Synchro Google Agenda :', e);
  } finally {
    running = false;
    if (again) {
      again = false;
      requestGcalSync(userId);
    }
  }
}

// ------------------------------------------------------------ autorisation Google
type CodeClient = { requestCode: () => void };
type GoogleOAuth = {
  accounts: {
    oauth2: {
      initCodeClient: (cfg: {
        client_id: string;
        scope: string;
        ux_mode: 'popup';
        callback: (r: { code?: string; error?: string }) => void;
        error_callback?: (e: { type: string }) => void;
      }) => CodeClient;
    };
  };
};

let gisPromise: Promise<GoogleOAuth> | null = null;
/** Charge le script Google Identity Services (une seule fois). */
export function loadGoogleScript(): Promise<GoogleOAuth> {
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: GoogleOAuth }).google);
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('impossible de charger le module de connexion Google'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/**
 * Ouvre la fenêtre Google puis enregistre l'accès côté serveur. À appeler directement dans un
 * clic (sinon la fenêtre est bloquée) : le script Google doit donc déjà être chargé.
 */
export function gcalConnect(google: GoogleOAuth, clientId: string, userId: string): Promise<GcalStatus> {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: SCOPE,
      ux_mode: 'popup',
      callback: (r) => {
        if (!r.code) return reject(new Error(r.error === 'access_denied' ? 'autorisation refusée' : (r.error ?? 'échec')));
        call<GcalStatus & SyncResult>('connect', { code: r.code })
          .then((s) => {
            rememberLinked(userId, s.linked);
            if (s.error) reject(new Error(s.error));
            else resolve(s);
          })
          .catch(reject);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'fenêtre Google fermée' : e.type)),
    });
    client.requestCode();
  });
}
