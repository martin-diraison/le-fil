import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../state/store';
import './AccountDrawer.css';

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

      <div className="acctDrawer__section">
        <span className="acctDrawer__sectionTitle">données</span>
        <span className="acctDrawer__hint">Projets, lots et tâches dans un fichier JSON lisible.</span>
        <button className="acctDrawer__btn" onClick={exportData}>
          exporter mes données
        </button>
      </div>

      <div className="acctDrawer__section" style={{ borderBottom: 'none' }}>
        <button className="acctDrawer__btn acctDrawer__btn--danger" onClick={() => supabase.auth.signOut()}>
          se déconnecter
        </button>
      </div>
    </div>
  );
}
