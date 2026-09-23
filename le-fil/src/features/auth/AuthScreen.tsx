import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { AUTH_BAND_COLORS } from '../../lib/palette';
import './AuthScreen.css';

type AuthMode = 'login' | 'signup' | 'forgot' | 'sent';

const TITLES: Record<AuthMode, string> = {
  login: 'Se connecter',
  signup: 'Créer un compte',
  forgot: 'Mot de passe oublié',
  sent: 'Vérifie ta boîte',
};

const CTAS: Record<AuthMode, string> = {
  login: 'se connecter',
  signup: 'créer le compte',
  forgot: 'envoyer le lien',
  sent: 'retour à la connexion',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
    setPassword('');
    setPassword2('');
  }

  const sub: Record<AuthMode, string> = {
    login: 'Retrouve tes projets sur tous tes écrans.',
    signup: 'Une adresse e-mail et un mot de passe suffisent.',
    forgot: 'Tu recevras un lien pour choisir un nouveau mot de passe.',
    sent: `Lien de réinitialisation envoyé à ${sentTo}. Il reste valable 30 minutes.`,
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'sent') {
      switchMode('login');
      return;
    }

    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('adresse e-mail invalide');
      return;
    }

    if (mode === 'forgot') {
      setSubmitting(true);
      // Le message de confirmation s'affiche même si l'adresse est inconnue (pas de fuite d'info).
      await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reinitialiser`,
      });
      setSubmitting(false);
      setSentTo(trimmed);
      setError('');
      setMode('sent');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        setError('mot de passe : 8 caractères minimum');
        return;
      }
      if (password !== password2) {
        setError('les deux mots de passe diffèrent');
        return;
      }
      setSubmitting(true);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmed,
        password,
      });
      setSubmitting(false);
      if (signUpError) {
        setError(
          /registered|exists/i.test(signUpError.message)
            ? 'un compte existe déjà avec cette adresse'
            : signUpError.message,
        );
        return;
      }
      // Un compte existant renvoie un utilisateur sans identités nouvelles côté Supabase.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError('un compte existe déjà avec cette adresse');
        return;
      }
      setPassword('');
      setPassword2('');
      setError('');
      return;
    }

    // login
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError('e-mail ou mot de passe incorrect');
      return;
    }
    setPassword('');
    setError('');
  }

  return (
    <div className="authScreen">
      <div className="authScreen__ink">
        <span className="authScreen__brand">le fil</span>
        <div className="authScreen__pitchBlock">
          <p className="authScreen__pitch">
            Projets,
            <br />
            lots,
            <br />
            tâches.
          </p>
          <div className="authScreen__band">
            {AUTH_BAND_COLORS.map((c) => (
              <span key={c.hex} style={{ background: c.hex }} />
            ))}
          </div>
        </div>
        <span className="authScreen__tagline">un seul compte · tous tes écrans</span>
      </div>

      <div className="authScreen__panel">
        <form className="authScreen__form" onSubmit={handleSubmit}>
          <div className="authScreen__heading">
            <span className="authScreen__title">{TITLES[mode]}</span>
            <span className="authScreen__sub">{sub[mode]}</span>
          </div>

          {mode !== 'sent' && (
            <label className="authField">
              <span className="authField__label">adresse e-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="toi@exemple.fr"
                autoFocus
              />
            </label>
          )}

          {(mode === 'login' || mode === 'signup') && (
            <label className="authField">
              <span className="authField__labelRow">
                <span className="authField__label">mot de passe</span>
                <span className="authField__hint">
                  {mode === 'signup' ? '8 caractères minimum' : ''}
                </span>
              </span>
              <span className="authField__pwRow">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                />
                <button
                  type="button"
                  className="authField__toggle"
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? 'masquer' : 'afficher'}
                </button>
              </span>
            </label>
          )}

          {mode === 'signup' && (
            <label className="authField">
              <span className="authField__label">confirmer le mot de passe</span>
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={password2}
                onChange={(e) => {
                  setPassword2(e.target.value);
                  setError('');
                }}
              />
            </label>
          )}

          {error && <div className="authScreen__error">{error}</div>}

          <div className="authScreen__actions">
            <button type="submit" className="authScreen__submit" disabled={submitting}>
              {CTAS[mode]}
            </button>
            {mode === 'login' && (
              <button
                type="button"
                className="authScreen__forgotLink"
                onClick={() => switchMode('forgot')}
              >
                mot de passe oublié ?
              </button>
            )}
          </div>

          {mode !== 'sent' && (
            <div className="authScreen__switch">
              <span className="authScreen__switchText">
                {mode === 'signup' || mode === 'forgot' ? 'déjà un compte ?' : 'pas encore de compte ?'}
              </span>
              <button
                type="button"
                className="authScreen__switchCta"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'signup' || mode === 'forgot' ? 'se connecter' : 'créer un compte'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
