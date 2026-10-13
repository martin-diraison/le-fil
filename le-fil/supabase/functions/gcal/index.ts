// Le Fil → Google Agenda, sens unique (fonction Edge Supabase, Deno).
//
// Actions (POST JSON { action, code? }, avec le jeton Supabase de l'utilisateur) :
//   status     → { clientId, linked, lastSync, lastError }
//   connect    → échange le code OAuth (fenêtre Google ouverte par l'appli) contre un jeton
//                longue durée, l'enregistre dans le_fil.gcal_links, puis synchronise
//   sync       → réconciliation complète (voir reconcile)
//   disconnect → retire les événements Le Fil de l'agenda, révoque l'accès, oublie le jeton
//
// Réconciliation : on calcule les événements voulus (lots + tâches datés de l'utilisateur), on
// liste ceux que Le Fil a déjà créés (marqués extendedProperties.private.lefil=1), puis on crée,
// met à jour (si l'empreinte `h` diffère) ou supprime. Les identifiants d'événements sont
// déterministes (« lfl » / « lft » + uuid sans tirets) : relancer la synchro, ou la lancer depuis
// deux appareils à la fois, ne crée jamais de doublon. Les autres événements de l'agenda ne sont
// jamais touchés.
//
// Secrets à définir : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (SUPABASE_URL, SUPABASE_ANON_KEY et
// SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TZ = 'Europe/Paris';
const API = 'https://www.googleapis.com/calendar/v3';
/** Au-delà, on s'arrête et on renvoie `partial` : l'appli relance (limite d'exécution Supabase). */
const TIME_BUDGET_MS = 100_000;
const CONCURRENCY = 4;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Row = Record<string, unknown>;
type GEvent = Record<string, unknown> & { id: string };

class GoogleError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------------ Google OAuth
async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const data = await res.json();
  if (!res.ok) throw new GoogleError(res.status, data.error ?? 'token_error');
  return data as { access_token: string; refresh_token?: string };
}

const accessTokenFor = async (refreshToken: string) =>
  (await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })).access_token;

// ------------------------------------------------------------------ Google Agenda
async function gfetch(token: string, path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  // Quota dépassé : on patiente un peu et on réessaie (deux fois au plus).
  if ((res.status === 429 || res.status === 403) && attempt < 2) {
    const text = await res.clone().text();
    if (res.status === 429 || /rateLimitExceeded|userRateLimitExceeded/.test(text)) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return gfetch(token, path, init, attempt + 1);
    }
  }
  return res;
}

async function check(res: Response, what: string) {
  if (res.ok) return;
  const text = await res.text();
  throw new GoogleError(res.status, `${what} : ${res.status} ${text.slice(0, 300)}`);
}

const calPath = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`;

/** Événements créés par Le Fil : id → empreinte. */
async function listOurs(token: string, calendarId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let pageToken = '';
  do {
    const q = new URLSearchParams({
      privateExtendedProperty: 'lefil=1',
      maxResults: '2500',
      fields: 'items(id,extendedProperties),nextPageToken',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await gfetch(token, `${calPath(calendarId)}?${q}`);
    await check(res, 'lecture de l’agenda');
    const data = await res.json();
    for (const it of data.items ?? []) out.set(it.id, it.extendedProperties?.private?.h ?? '');
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

async function putEvent(token: string, calendarId: string, ev: GEvent) {
  const res = await gfetch(token, `${calPath(calendarId)}/${ev.id}`, { method: 'PUT', body: JSON.stringify(ev) });
  await check(res, 'mise à jour d’un événement');
}

async function insertEvent(token: string, calendarId: string, ev: GEvent) {
  const res = await gfetch(token, calPath(calendarId), { method: 'POST', body: JSON.stringify(ev) });
  // 409 : l'identifiant existe déjà (événement supprimé auparavant, ou créé par une synchro
  // concurrente) → on le remplace, ce qui le restaure si besoin (status: confirmed).
  if (res.status === 409) return putEvent(token, calendarId, ev);
  await check(res, 'création d’un événement');
}

async function deleteEvent(token: string, calendarId: string, id: string) {
  const res = await gfetch(token, `${calPath(calendarId)}/${id}`, { method: 'DELETE' });
  if (res.status === 404 || res.status === 410) return; // déjà parti
  await check(res, 'suppression d’un événement');
}

/** Exécute les tâches avec au plus `n` en parallèle ; s'arrête (sans erreur) si le temps manque. */
async function pool(jobs: (() => Promise<void>)[], n: number, deadline: number): Promise<boolean> {
  let i = 0;
  let complete = true;
  const worker = async () => {
    while (i < jobs.length) {
      if (Date.now() > deadline) {
        complete = false;
        return;
      }
      await jobs[i++]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker));
  return complete;
}

// ------------------------------------------------------------------ événements voulus
// Couleurs d'événement Google (colorId 1 à 11) : la plus proche de la couleur du projet.
const GCOLORS: [string, string][] = [
  ['1', '#7986cb'], ['2', '#33b679'], ['3', '#8e24aa'], ['4', '#e67c73'], ['5', '#f6bf26'], ['6', '#f4511e'],
  ['7', '#039be5'], ['8', '#616161'], ['9', '#3f51b5'], ['10', '#0b8043'], ['11', '#d50000'],
];
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function nearestColorId(hex: string | undefined): string | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const [r, g, b] = rgb(hex);
  let best = GCOLORS[0][0];
  let bestD = Infinity;
  for (const [id, h] of GCOLORS) {
    const [r2, g2, b2] = rgb(h);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) [best, bestD] = [id, d];
  }
  return best;
}

const hhmm = (v: unknown) => (v ? String(v).slice(0, 5) : null); // Postgres renvoie HH:MM:SS
function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Jour + heure + décalage en minutes → { date, time } (passage de minuit géré). */
function shift(day: string, time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const days = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  const t = `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}`;
  return { date: addDays(day, days), time: t };
}

const RRULE: Record<string, string> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };

/** Empreinte courte (FNV-1a) du contenu de l'événement : évite de renvoyer ce qui n'a pas changé. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function buildEvent(o: {
  id: string;
  summary: string;
  description: string;
  location: string;
  startDate: string | null;
  due: string;
  startTime: string | null;
  endTime: string | null;
  repeat: string;
  colorId: string | undefined;
}): GEvent {
  let start: Row;
  let end: Row;
  if (o.startTime) {
    // Horaire rattaché au jour d'échéance (comme dans Le Fil) ; sans heure de fin : 1 h.
    start = { dateTime: `${o.due}T${o.startTime}:00`, timeZone: TZ };
    const e = o.endTime && o.endTime > o.startTime
      ? { date: o.due, time: o.endTime }
      : o.endTime
      ? { date: addDays(o.due, 1), time: o.endTime }
      : shift(o.due, o.startTime, 60);
    end = { dateTime: `${e.date}T${e.time}:00`, timeZone: TZ };
  } else {
    // Journée entière, sur toute la fourchette début → échéance (fin exclusive chez Google).
    start = { date: o.startDate && o.startDate < o.due ? o.startDate : o.due };
    end = { date: addDays(o.due, 1) };
  }
  const content: Row = {
    summary: o.summary,
    description: o.description,
    location: o.location || undefined,
    start,
    end,
    colorId: o.colorId,
    recurrence: RRULE[o.repeat] ? [`RRULE:FREQ=${RRULE[o.repeat]}`] : undefined,
  };
  return {
    id: o.id,
    ...content,
    status: 'confirmed',
    reminders: { useDefault: true },
    extendedProperties: { private: { lefil: '1', h: hash(JSON.stringify(content)) } },
  };
}

// Éléments importés de l'app de cours (source_id `cours:<sorte>:<promo>:<id>`, voir src/lib/cours.ts) :
// affichage simplifié — couleur par classe plutôt que par projet, titre court, pas de « ✓ » (ce
// sont des rendez-vous, pas des choses à faire).
const PROMO_COLOR: Record<string, string> = { GPN1: '9', GPN2: '6' }; // Myrtille, Mandarine ; sinon Graphite
function coursInfo(sourceId: unknown): { kind: string; colorId: string } | null {
  const m = /^cours:([a-z]+):([^:]+):/.exec(String(sourceId ?? ''));
  return m ? { kind: m[1], colorId: PROMO_COLOR[m[2]] ?? '8' } : null;
}

/** Toutes les lignes d'une table (PostgREST plafonne chaque réponse à 1000 lignes). */
async function fetchAll(db: SupabaseClient, table: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`lecture ${table} : ${error.message}`);
    out.push(...(data as Row[]));
    if (data.length < 1000) return out;
  }
}

async function desiredEvents(db: SupabaseClient): Promise<Map<string, GEvent>> {
  const [projects, lots, tasks] = await Promise.all([
    fetchAll(db, 'projects'),
    fetchAll(db, 'lots'),
    fetchAll(db, 'tasks'),
  ]);
  const projectById = new Map(projects.map((p) => [p.id as string, p]));
  const lotById = new Map(lots.map((l) => [l.id as string, l]));
  const out = new Map<string, GEvent>();
  const evId = (prefix: string, uuid: unknown) => prefix + String(uuid).replace(/-/g, '');

  for (const l of lots) {
    if (!l.due) continue;
    const p = l.project_id ? projectById.get(l.project_id as string) : undefined;
    const body = String(l.body ?? '').slice(0, 4000);
    const cours = coursInfo(l.source_id);
    const ev = buildEvent({
      id: evId('lfl', l.id),
      summary: (l.done && !cours ? '✓ ' : '') + (String(l.title).trim() || 'sans titre'),
      description: [p ? `Projet : ${p.name}` : 'Sans projet', body].filter(Boolean).join('\n\n'),
      location: String(l.location ?? ''),
      startDate: (l.start_date as string) ?? null,
      due: l.due as string,
      startTime: hhmm(l.start_time),
      endTime: hhmm(l.end_time),
      repeat: String(l.repeat ?? 'none'),
      colorId: cours?.colorId ?? nearestColorId(p?.color as string | undefined),
    });
    out.set(ev.id, ev);
  }
  for (const t of tasks) {
    if (!t.due) continue;
    const l = lotById.get(t.lot_id as string);
    if (!l) continue;
    const p = l.project_id ? projectById.get(l.project_id as string) : undefined;
    const cours = coursInfo(t.source_id);
    const label = String(t.label).trim() || 'tâche';
    const ev = buildEvent({
      id: evId('lft', t.id),
      // Cours : le libellé seul (« UE 1.1 · titre de la séance », nom de la période, « Réunion · … »).
      summary: cours ? label : (t.done ? '✓ ' : '') + `↳ ${label} · ${String(l.title).trim()}`,
      description: [`Lot : ${l.title}`, p ? `Projet : ${p.name}` : 'Sans projet'].join('\n'),
      location: String(t.location ?? ''),
      startDate: (t.start_date as string) ?? null,
      due: t.due as string,
      startTime: hhmm(t.start_time),
      endTime: hhmm(t.end_time),
      repeat: 'none',
      colorId: cours?.colorId ?? nearestColorId(p?.color as string | undefined),
    });
    out.set(ev.id, ev);
  }
  return out;
}

async function reconcile(db: SupabaseClient, token: string, calendarId: string, deadline: number) {
  const [want, have] = await Promise.all([desiredEvents(db), listOurs(token, calendarId)]);
  const jobs: (() => Promise<void>)[] = [];
  let created = 0;
  let updated = 0;
  let deleted = 0;
  for (const [id, ev] of want) {
    const h = have.get(id);
    if (h === undefined) {
      jobs.push(() => insertEvent(token, calendarId, ev).then(() => void created++));
    } else if (h !== (ev.extendedProperties as { private: { h: string } }).private.h) {
      jobs.push(() => putEvent(token, calendarId, ev).then(() => void updated++));
    }
  }
  for (const id of have.keys()) {
    if (!want.has(id)) jobs.push(() => deleteEvent(token, calendarId, id).then(() => void deleted++));
  }
  const complete = await pool(jobs, CONCURRENCY, deadline);
  return { created, updated, deleted, partial: !complete };
}

// ------------------------------------------------------------------ point d'entrée
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const started = Date.now();

  // Client « utilisateur » : lit ses données à travers la RLS, comme l'appli.
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    db: { schema: 'le_fil' },
    auth: { persistSession: false },
  });
  const { data: auth } = await db.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: 'non connecté' }, 401);
  // Client « service » : seul à pouvoir lire/écrire le jeton Google (table sans politique RLS).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'le_fil' }, auth: { persistSession: false } });
  const links = () => admin.from('gcal_links');

  let body: { action?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* corps vide */
  }

  const getLink = async () => {
    const { data, error } = await links().select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw new Error(`lecture du lien Google : ${error.message}`);
    return data as Row | null;
  };
  const status = async () => {
    const link = await getLink();
    return {
      clientId: CLIENT_ID,
      linked: !!link,
      lastSync: link?.last_sync ?? null,
      lastError: link?.last_error ?? null,
    };
  };

  async function runSync(link: Row) {
    let token: string;
    try {
      token = await accessTokenFor(link.refresh_token as string);
    } catch (e) {
      // invalid_grant : accès retiré côté Google (ou jeton expiré) → on oublie le lien.
      if (e instanceof GoogleError && e.message === 'invalid_grant') {
        await links().delete().eq('user_id', user!.id);
        return { linked: false, error: 'accès Google retiré ou expiré : relie à nouveau ton agenda' };
      }
      throw e;
    }
    try {
      const r = await reconcile(db, token, link.calendar_id as string, started + TIME_BUDGET_MS);
      await links().update({ last_sync: new Date().toISOString(), last_error: null }).eq('user_id', user!.id);
      return { linked: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await links().update({ last_error: msg.slice(0, 500) }).eq('user_id', user!.id);
      return { linked: true, error: msg };
    }
  }

  try {
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'secrets GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absents' }, 500);

    switch (body.action) {
      case 'status':
        return json(await status());

      case 'connect': {
        if (!body.code) return json({ error: 'code manquant' }, 400);
        // ux_mode « popup » de Google Identity Services : redirect_uri vaut « postmessage ».
        const t = await tokenRequest({ grant_type: 'authorization_code', code: body.code, redirect_uri: 'postmessage' });
        if (!t.refresh_token) {
          return json({
            error:
              'Google n’a pas fourni d’accès durable. Retire « Le Fil » des applis tierces de ton compte ' +
              'Google (myaccount.google.com › Sécurité › Applis tierces), puis relie à nouveau.',
          }, 400);
        }
        const { error } = await links().upsert({ user_id: user.id, refresh_token: t.refresh_token, last_error: null });
        if (error) throw new Error(`enregistrement du lien : ${error.message}`);
        const link = await getLink();
        const r = await runSync(link!);
        return json({ ...(await status()), ...r });
      }

      case 'sync': {
        const link = await getLink();
        if (!link) return json({ linked: false });
        return json(await runSync(link));
      }

      case 'disconnect': {
        const link = await getLink();
        if (!link) return json({ linked: false });
        let removed = 0;
        try {
          const token = await accessTokenFor(link.refresh_token as string);
          const ids = [...(await listOurs(token, link.calendar_id as string)).keys()];
          await pool(ids.map((id) => () => deleteEvent(token, link.calendar_id as string, id).then(() => void removed++)),
            CONCURRENCY, started + TIME_BUDGET_MS);
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(link.refresh_token as string)}`, {
            method: 'POST',
          });
        } catch (e) {
          console.error('déliaison Google :', e); // accès déjà retiré : on oublie le lien quand même
        }
        await links().delete().eq('user_id', user.id);
        return json({ linked: false, removed });
      }

      default:
        return json({ error: `action inconnue : ${body.action}` }, 400);
    }
  } catch (e) {
    console.error('gcal :', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
