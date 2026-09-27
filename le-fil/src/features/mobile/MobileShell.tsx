import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { DAYS_SHORT, MONTHS_SHORT } from '../../lib/format';
import { toDay } from '../../lib/dates';
import { useStore, type ProjectKey } from '../../state/store';
import AccountPanel from '../account/AccountPanel';
import FilScreen from './FilScreen';
import ProjectsScreen from './ProjectsScreen';
import ProjectScreen from './ProjectScreen';
import LotScreen from './LotScreen';
import CalendarScreen from './CalendarScreen';
import './Mobile.css';

// Coquille mobile — README §4, prototype « Le Fil - Mobile.dc.html ».
// Navigation : trois onglets (fil · projets · calendrier) et deux écrans empilés
// (projet ouvert, lot ouvert). Le lot ouvert se souvient de l'écran d'origine pour « ← retour ».

export type Screen = 'fil' | 'projets' | 'projet' | 'lot' | 'cal';
export type LotOrigin = 'fil' | 'projet' | 'cal';

export type MobileNav = {
  openLot: (id: string, from: LotOrigin) => void;
  openProject: (key: ProjectKey) => void;
  go: (screen: Screen) => void;
};

const TABS: { key: 'fil' | 'projets' | 'cal'; label: string }[] = [
  { key: 'fil', label: 'fil' },
  { key: 'projets', label: 'projets' },
  { key: 'cal', label: 'calendrier' },
];

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function MobileShell({ session }: { session: Session }) {
  const openLotInStore = useStore((s) => s.openLot);
  const toast = useStore((s) => s.toast);

  // Ouverture par défaut sur « projets » tant que l'onglet « fil » n'est pas retravaillé.
  const [screen, setScreen] = useState<Screen>('projets');
  const [from, setFrom] = useState<LotOrigin>('fil');
  const [openProj, setOpenProj] = useState<ProjectKey | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [compte, setCompte] = useState(false);

  // Calendrier : conservé en changeant d'onglet.
  const [calMonth, setCalMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [calDay, setCalDay] = useState(() => toDay(new Date()));
  const [calTall, setCalTall] = useState(false);

  const now = useClock();
  const clock = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayShort = `${DAYS_SHORT[now.getDay()]} ${now.getDate()} ${MONTHS_SHORT[now.getMonth()]}`;

  const nav: MobileNav = {
    openLot: (id, origin) => {
      openLotInStore(id);
      setFrom(origin);
      setScreen('lot');
    },
    openProject: (key) => {
      setOpenProj(key);
      setScreen('projet');
    },
    go: (s) => {
      if (s !== 'lot') openLotInStore(null);
      setScreen(s);
    },
  };

  const tabOn = (key: string) =>
    screen === key ||
    (key === 'projets' && screen === 'projet') ||
    (screen === 'lot' && ((key === 'fil' && from === 'fil') || (key === 'cal' && from === 'cal')));

  return (
    <div className="m">
      <div className="m__status">
        <span>
          {clock} · {todayShort}
        </span>
        <button className="m__sync" onClick={() => setAcctOpen((v) => !v)}>
          <span className="m__syncDot" />
          synchronisé
        </button>
      </div>
      {acctOpen && (
        <div className="m__acct">
          <span className="m__acctEmail">{session.user.email}</span>
          <div className="m__acctRow">
            <button
              className="m__acctBtn"
              onClick={() => {
                setCompte(true);
                setAcctOpen(false);
              }}
            >
              compte
            </button>
            <button className="m__acctBtn m__acctBtn--danger" onClick={() => supabase.auth.signOut()}>
              se déconnecter
            </button>
          </div>
        </div>
      )}

      <div className="m__screen">
        {compte ? (
          <div className="m__col">
            <div className="m__topbar">
              <button className="m__back" onClick={() => setCompte(false)}>
                ← retour
              </button>
              <span className="m__topTitle">compte</span>
            </div>
            <div className="m__scroll m__compte">
              <AccountPanel session={session} />
            </div>
          </div>
        ) : screen === 'fil' ? (
          <FilScreen nav={nav} />
        ) : screen === 'projets' ? (
          <ProjectsScreen nav={nav} />
        ) : screen === 'projet' && openProj ? (
          <ProjectScreen nav={nav} projectKey={openProj} />
        ) : screen === 'lot' ? (
          <LotScreen nav={nav} from={from} projectKey={openProj} />
        ) : (
          <CalendarScreen
            nav={nav}
            month={calMonth}
            setMonth={setCalMonth}
            day={calDay}
            setDay={setCalDay}
            tall={calTall}
            toggleTall={() => setCalTall((v) => !v)}
          />
        )}
      </div>

      <div className="m__tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`m__tab ${tabOn(t.key) ? 'm__tab--on' : ''}`}
            onClick={() => {
              setCompte(false);
              nav.go(t.key);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {toast && <div className="m__toast">{toast}</div>}
    </div>
  );
}
