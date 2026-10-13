import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../state/store';
import { gcalConnect, gcalDisconnect, gcalStatus, gcalSyncNow, loadGoogleScript, type GcalStatus } from '../../lib/gcal';
import {
  coursAllPref,
  coursSignIn,
  coursSignOut,
  coursSignedInEmail,
  importCoursNow,
  isCoursConfigured,
  lastCoursImport,
  setCoursAllPref,
} from '../../lib/cours';
import './AccountDrawer.css';

/** Import des séances de l'app « organisation-cours » (autre projet Supabase, lecture seule). */
function CoursSection() {
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = chargement
  const [mail, setMail] = useState('');
  const [pwd, setPwd] = useState('');
  const [all, setAll] = useState(coursAllPref);
  const [last, setLast] = useState(lastCoursImport);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    void coursSignedInEmail().then(setEmail);
  }, []);

  async function connect() {
    setBusy(true);
    setErr('');
    const e = await coursSignIn(mail.trim(), pwd);
    setBusy(false);
    if (e) return setErr(e);
    setPwd('');
    setEmail(mail.trim());
  }

  async function sync() {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const r = await importCoursNow();
      setLast(lastCoursImport());
      setMsg(
        `${r.sessions} séances, ${r.periods} périodes, ${r.meetings} réunions lues — ` +
          `${r.created} ajout(s), ${r.updated} mise(s) à jour, ${r.removed} retrait(s)`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="acctDrawer__section">
      <span className="acctDrawer__sectionTitle">cours (BTS GPN)</span>
      <span className="acctDrawer__hint">
        Importe de l’app « organisation cours », dans le projet BTS GPN : une UE = un lot, une séance placée = une
        tâche, plus les semaines thématiques, examens, sorties, événements et tes réunions. Lecture seule : rien
        n’est modifié côté cours. Dans Google Agenda, une couleur par classe.
      </span>
      {email === undefined ? null : email ? (
        <>
          <span className="acctDrawer__stats">connecté : {email}</span>
          <span className="acctDrawer__hint">
            Mise à jour automatique à l’ouverture, puis toutes les 30 min
            {last ? ` · dernier import ${last.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          <label className="acctDrawer__hint">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => {
                setAll(e.target.checked);
                setCoursAllPref(e.target.checked);
              }}
            />{' '}
            toutes les séances
            (pas seulement les miennes)
          </label>
          <button className="acctDrawer__btn acctDrawer__btn--primary" onClick={sync} disabled={busy}>
            {busy ? 'synchronisation…' : 'synchroniser maintenant'}
          </button>
          <button
            className="acctDrawer__btn"
            onClick={() => {
              void coursSignOut();
              setEmail(null);
              setMsg('');
            }}
          >
            se déconnecter des cours
          </button>
        </>
      ) : (
        <>
          <label className="acctDrawer__field">
            <span className="acctDrawer__fieldLabel">e-mail du compte cours</span>
            <input type="email" autoComplete="off" value={mail} onChange={(e) => setMail(e.target.value)} />
          </label>
          <label className="acctDrawer__field">
            <span className="acctDrawer__fieldLabel">mot de passe</span>
            <input
              type="password"
              autoComplete="off"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connect()}
            />
          </label>
          <button className="acctDrawer__btn acctDrawer__btn--primary" onClick={connect} disabled={busy || !mail || !pwd}>
            se connecter aux cours
          </button>
        </>
      )}
      {err && <div className="acctDrawer__msg acctDrawer__msg--error">{err}</div>}
      {msg && <div className="acctDrawer__msg acctDrawer__msg--ok">{msg}</div>}
    </div>
  );
}

function deviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
    ? 'iPad'
    : /Android/.test(ua)
    ? 'Android'
    : /Mac/.test(ua)
    ? 'Mac'
    : /Windows/.test(ua)
    ? 'Windows'
    : 'Appareil';
  const browser = /Firefox/.test(ua)
    ? 'Firefox'
    : /Edg/.test(ua)
    ? 'Edge'
    : /Chrome/.test(ua)
    ? 'Chrome'
    : /Safari/.test(ua)
    ? 'Safari'
    : 'navigateur';
  return `${os} · ${browser}`;
}

/** Sections « compte & sécurité » (README §3.7) — partagées par le tiroir desktop et la page mobile. */
export default function AccountPanel({ session }: { session: Session }) {
  const projects = useStore((s) => s.projects);
  const lots = useStore((s) => s.lots);
  const tasks = useStore((s) => s.tasks);

  const [cOld, setCOld] = useState('');
  const [cNew, setCNew] = useState('');
  const [cNew2, setCNew2] = useState('');
  const [cErr, setCErr] = useState('');
  const [cOk, setCOk] = useState('');
  const [saving, setSaving] = useState(false);
  const [othersMsg, setOthersMsg] = useState('');

  const email = session.user.email ?? '';
  const stats = `${projects.length} projets · ${lots.length} lots · ${tasks.length} tâches`;

  async function changePassword() {
    setCErr('');
    setCOk('');
    if (!email) return;
    setSaving(true);
    // Vérifie le mot de passe actuel par une ré-authentification (le SDK Supabase ne
    // propose pas de vérification directe côté client).
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: cOld });
    if (verifyError) {
      setSaving(false);
      setCErr('mot de passe actuel incorrect');
      return;
    }
    if (cNew.length < 8) {
      setSaving(false);
      setCErr('nouveau mot de passe : 8 caractères minimum');
      return;
    }
    if (cNew !== cNew2) {
      setSaving(false);
      setCErr('les deux mots de passe diffèrent');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: cNew });
    setSaving(false);
    if (updateError) {
      setCErr(updateError.message);
      return;
    }
    setCOld('');
    setCNew('');
    setCNew2('');
    setCOk('mot de passe modifié');
  }

  async function disconnectOthers() {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setOthersMsg(error ? "échec de la déconnexion des autres appareils" : 'autres appareils déconnectés');
  }

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      account: email,
      projects: projects.map((p) => ({ id: p.id, name: p.name, color: p.color, position: p.position })),
      lots: lots.map((l) => ({
        id: l.id,
        title: l.title,
        project: l.projectId,
        body: l.body,
        done: l.done,
        due: l.due, // déjà au format YYYY-MM-DD
        tasks: tasks
          .filter((t) => t.lotId === l.id)
          .map((t) => ({ label: t.label, done: t.done, due: t.due })),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'le-fil-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="acctDrawer__body">
      <div className="acctDrawer__section">
        <span className="acctDrawer__sectionTitle">adresse e-mail</span>
        <span className="acctDrawer__email">{email}</span>
        <span className="acctDrawer__stats">{stats}</span>
      </div>

      <div className="acctDrawer__section">
        <span className="acctDrawer__sectionTitle">changer le mot de passe</span>
        <label className="acctDrawer__field">
          <span className="acctDrawer__fieldLabel">actuel</span>
          <input
            type="password"
            autoComplete="current-password"
            value={cOld}
            onChange={(e) => {
              setCOld(e.target.value);
              setCErr('');
              setCOk('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && changePassword()}
          />
        </label>
        <label className="acctDrawer__field">
          <span className="acctDrawer__fieldLabel">nouveau · 8 caractères minimum</span>
          <input
            type="password"
            autoComplete="new-password"
            value={cNew}
            onChange={(e) => {
              setCNew(e.target.value);
              setCErr('');
              setCOk('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && changePassword()}
          />
        </label>
        <label className="acctDrawer__field">
          <span className="acctDrawer__fieldLabel">confirmer</span>
          <input
            type="password"
            autoComplete="new-password"
            value={cNew2}
            onChange={(e) => {
              setCNew2(e.target.value);
              setCErr('');
              setCOk('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && changePassword()}
          />
        </label>
        {cErr && <div className="acctDrawer__msg acctDrawer__msg--error">{cErr}</div>}
        {cOk && <div className="acctDrawer__msg acctDrawer__msg--ok">{cOk}</div>}
        <button className="acctDrawer__btn acctDrawer__btn--primary" onClick={changePassword} disabled={saving}>
          enregistrer
        </button>
      </div>

      <div className="acctDrawer__section">
        <span className="acctDrawer__sectionTitle">appareils connectés</span>
        <div className="acctDrawer__device">
          <span className="acctDrawer__deviceDot" />
          <span className="acctDrawer__deviceName">{deviceName()}</span>
          <span className="acctDrawer__deviceTag">cet appareil</span>
        </div>
        <button className="acctDrawer__btn" onClick={disconnectOthers}>
          déconnecter les autres appareils
        </button>
        {othersMsg && <span className="acctDrawer__stats">{othersMsg}</span>}
      </div>

      <GoogleSection userId={session.user.id} />

      <div className="acctDrawer__section">
        <span className="acctDrawer__sectionTitle">données</span>
        <span className="acctDrawer__hint">Projets, lots et tâches dans un fichier JSON lisible.</span>
        <button className="acctDrawer__btn" onClick={exportData}>
          exporter mes données
        </button>
      </div>

      {isCoursConfigured && <CoursSection />}

      <div className="acctDrawer__section" style={{ borderBottom: 'none' }}>
        <button className="acctDrawer__btn acctDrawer__btn--danger" onClick={() => supabase.auth.signOut()}>
          se déconnecter
        </button>
      </div>
    </div>
  );
}

const SYNC_TIME = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Google Agenda : relier / délier, état de la dernière synchro (sens unique Le Fil → Google). */
function GoogleSection({ userId }: { userId: string }) {
  const [status, setStatus] = useState<GcalStatus | null>(null);
  const [google, setGoogle] = useState<Awaited<ReturnType<typeof loadGoogleScript>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // État + script Google chargés à l'avance : la fenêtre d'autorisation doit s'ouvrir dans le clic.
  useEffect(() => {
    let alive = true;
    gcalStatus(userId)
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        if (!s.linked) return loadGoogleScript().then((g) => alive && setGoogle(g));
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [userId]);

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      setMsg(await fn());
      setStatus(await gcalStatus(userId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const connect = () =>
    status && google && act(async () => {
      await gcalConnect(google, status.clientId, userId);
      return 'agenda relié : les lots et tâches datés y sont envoyés';
    });
  const syncNow = () =>
    act(async () => {
      const r = await gcalSyncNow(userId);
      return r.partial ? 'synchro en cours (beaucoup d\u2019événements), elle se poursuit…' : 'agenda à jour';
    });
  const unlink = () => {
    if (!confirmUnlink) return setConfirmUnlink(true);
    setConfirmUnlink(false);
    act(async () => {
      const n = await gcalDisconnect(userId);
      loadGoogleScript().then(setGoogle).catch(() => {});
      return `agenda délié · ${n} événement${n > 1 ? 's' : ''} retiré${n > 1 ? 's' : ''} de Google`;
    });
  };

  return (
    <div className="acctDrawer__section">
      <span className="acctDrawer__sectionTitle">google agenda</span>
      <span className="acctDrawer__hint">
        Sens unique : les lots et tâches datés sont recopiés dans ton agenda Google principal (terminés
        marqués ✓). Les modifications faites dans Google ne reviennent pas dans Le Fil.
      </span>
      {!status && !err && <span className="acctDrawer__stats">…</span>}
      {status?.linked && (
        <>
          <span className="acctDrawer__stats">
            relié · {status.lastSync ? `dernière synchro ${SYNC_TIME.format(new Date(status.lastSync))}` : 'pas encore synchronisé'}
          </span>
          {status.lastError && <div className="acctDrawer__msg acctDrawer__msg--error">{status.lastError}</div>}
          <button className="acctDrawer__btn" onClick={syncNow} disabled={busy}>
            synchroniser maintenant
          </button>
          <button
            className="acctDrawer__btn acctDrawer__btn--danger"
            onClick={unlink}
            onBlur={() => setConfirmUnlink(false)}
            disabled={busy}
          >
            {confirmUnlink ? 'confirmer : retirer les événements Le Fil de Google' : 'délier google agenda'}
          </button>
        </>
      )}
      {status && !status.linked && (
        <button className="acctDrawer__btn acctDrawer__btn--primary" onClick={connect} disabled={busy || !google}>
          relier google agenda
        </button>
      )}
      {busy && <span className="acctDrawer__stats">…</span>}
      {msg && <div className="acctDrawer__msg acctDrawer__msg--ok">{msg}</div>}
      {err && <div className="acctDrawer__msg acctDrawer__msg--error">{err}</div>}
    </div>
  );
}
