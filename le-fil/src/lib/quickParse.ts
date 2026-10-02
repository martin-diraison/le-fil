import { toDay } from './dates';
import { formatTimeRange } from './format';

// Saisie rapide en langage naturel : « dentiste mardi 14h-15h @cabinet Dupont » → titre
// « dentiste », échéance mardi prochain, 14:00–15:00, lieu « cabinet Dupont ».
// Une seule date et une seule plage horaire sont reconnues (la première trouvée) ; le lieu est
// tout ce qui suit « @ », une fois date et heure retirées. Une heure sans date = aujourd'hui.

export type QuickParse = {
  title: string;
  due: string | null; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  endTime: string | null;
  location: string;
};

// Bornes de mot compatibles avec les lettres accentuées (\b ne les connaît pas).
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
// Petits mots qui précèdent une date/heure et n'ont plus de sens une fois celle-ci retirée.
const PRE = `(?:${B}(?:le|la|à|a|au|de|du|pour|ce|cet|cette|dès|des)\\s+)?`;

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS: [RegExp, number][] = [
  [/^janv?/, 0],
  [/^f[ée]vr?/, 1],
  [/^mars?/, 2],
  [/^avr/, 3],
  [/^mai/, 4],
  [/^juin/, 5],
  [/^juil/, 6],
  [/^ao[uû]/, 7],
  [/^sept?/, 8],
  [/^oct/, 9],
  [/^nov/, 10],
  [/^d[ée]c/, 11],
];
const MONTH_WORD =
  'janv(?:ier|\\.)?|f[ée]v(?:rier|r?\\.)?|mars|avr(?:il|\\.)?|mai|juin|juil(?:let|\\.)?|ao[uû]t|sept(?:embre|\\.)?|oct(?:obre|\\.)?|nov(?:embre|\\.)?|d[ée]c(?:embre|\\.)?';

function addDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}

/** Date sans année : cette année, ou l'an prochain si elle est déjà passée. */
function upcoming(today: Date, month: number, day: number, year?: number): Date | null {
  let d = new Date(year ?? today.getFullYear(), month, day);
  if (d.getMonth() !== month) return null; // 31 février…
  if (year === undefined && d < today) d = new Date(today.getFullYear() + 1, month, day);
  return d;
}

function fullYear(y: string | undefined): number | undefined {
  if (!y) return undefined;
  const n = Number(y);
  return n < 100 ? 2000 + n : n;
}

type DateRule = { re: RegExp; date: (m: RegExpMatchArray, today: Date) => Date | null };

const DATE_RULES: DateRule[] = [
  { re: new RegExp(`${PRE}${B}apr[eè]s[- ]demain${E}`, 'iu'), date: (_m, t) => addDays(t, 2) },
  { re: new RegExp(`${PRE}${B}demain${E}`, 'iu'), date: (_m, t) => addDays(t, 1) },
  { re: new RegExp(`${PRE}${B}(?:aujourd['’]hui|auj\\.?)(?![\\p{L}\\d])`, 'iu'), date: (_m, t) => t },
  {
    re: new RegExp(`${B}dans\\s+(\\d{1,3})\\s+(jours?|j|semaines?|sem|mois)${E}`, 'iu'),
    date: (m, t) => {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('mois')) return new Date(t.getFullYear(), t.getMonth() + n, t.getDate());
      return addDays(t, unit.startsWith('s') ? n * 7 : n);
    },
  },
  {
    // 15/10, 15/10/26, 15/10/2026
    re: new RegExp(`${PRE}${B}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${E}`, 'iu'),
    date: (m, t) => upcoming(t, Number(m[2]) - 1, Number(m[1]), fullYear(m[3])),
  },
  {
    // 15 oct, 1er mai, 3 décembre 2026
    re: new RegExp(`${PRE}${B}(\\d{1,2})(?:er)?\\s+(${MONTH_WORD})(?:\\s+(\\d{4}))?(?![\\p{L}\\d])`, 'iu'),
    date: (m, t) => {
      const word = m[2].toLowerCase();
      const month = MONTHS.find(([re]) => re.test(word))?.[1];
      return month === undefined ? null : upcoming(t, month, Number(m[1]), fullYear(m[3]));
    },
  },
  {
    // lundi, mardi prochain — toujours le prochain, jamais aujourd'hui (on dirait « aujourd'hui »)
    re: new RegExp(`${PRE}${B}(${WEEKDAYS.join('|')})(?:\\s+prochain)?${E}`, 'iu'),
    date: (m, t) => {
      const wd = WEEKDAYS.indexOf(m[1].toLowerCase());
      return addDays(t, ((wd - t.getDay() + 7) % 7) || 7);
    },
  },
  {
    // le 15 : prochain jour 15 du mois (ce mois-ci ou le suivant)
    re: new RegExp(`${B}le\\s+(\\d{1,2})(?:er)?${E}(?!\\s*[h:/])`, 'iu'),
    date: (m, t) => {
      const day = Number(m[1]);
      if (day < 1 || day > 31) return null;
      const d = new Date(t.getFullYear(), t.getMonth(), day);
      return d >= t && d.getDate() === day ? d : new Date(t.getFullYear(), t.getMonth() + 1, day);
    },
  },
];

// 14h, 14h30, 14:30 ; plage « 14h-16h », « 14h à 16h », « de 14h à 16h30 ».
const T = '(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))';
const TIME_RANGE = new RegExp(`${PRE}${B}${T}(?:\\s*(?:-|–|à|a|jusqu'à)\\s*${T})?${E}`, 'iu');

function hhmm(h: string, m1?: string, m2?: string): string | null {
  const hour = Number(h);
  const min = Number(m1 ?? m2 ?? 0);
  if (hour > 23 || min > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function quickParse(raw: string, now: Date = new Date()): QuickParse {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let text = raw;
  let due: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;

  for (const rule of DATE_RULES) {
    const m = text.match(rule.re);
    if (!m) continue;
    const d = rule.date(m, today);
    if (!d) continue;
    due = toDay(d);
    text = text.replace(m[0], ' ');
    break;
  }

  const tm = text.match(TIME_RANGE);
  if (tm) {
    const start = hhmm(tm[1], tm[2], tm[3]);
    const end = tm[4] ? hhmm(tm[4], tm[5], tm[6]) : null;
    if (start && (end || !tm[4])) {
      startTime = start;
      endTime = end;
      text = text.replace(tm[0], ' ');
      if (!due) due = toDay(today);
    }
  }

  let location = '';
  const at = text.indexOf('@');
  if (at >= 0) {
    location = text.slice(at + 1).trim();
    text = text.slice(0, at);
  }

  const title = text.replace(/\s+/g, ' ').replace(/[\s,;:–-]+$/, '').trim();
  // Si tout le texte a été « compris » (ex. « demain 14h »), on garde la saisie brute comme titre.
  return { title: title || raw.trim(), due, startTime, endTime, location };
}

/** Résumé court de ce qui a été compris, pour le toast (« mar. 7 oct · 14h–15h · cabinet »). */
export function describeParse(p: QuickParse, formatDate: (d: string) => string): string | null {
  const parts: string[] = [];
  if (p.due) parts.push(formatDate(p.due));
  if (p.startTime) parts.push(formatTimeRange(p.startTime, p.endTime));
  if (p.location) parts.push(p.location);
  return parts.length ? parts.join(' · ') : null;
}
