// Ouverture de l'appli par le raccourci « nouveau lot » de l'icône (?nouveau=1) ou par le menu
// Partager d'Android (?share_title=…&share_text=…&share_url=…, voir share_target dans
// vite.config.ts). Lu une seule fois au chargement du module, puis retiré de l'adresse.

export type LaunchIntent = { kind: 'new' } | { kind: 'share'; title: string; body: string } | null;

const URL_RE = /https?:\/\/\S+/;

function read(): LaunchIntent {
  const p = new URLSearchParams(window.location.search);
  if (p.has('nouveau')) return { kind: 'new' };
  if (!p.has('share_title') && !p.has('share_text') && !p.has('share_url')) return null;
  const title = (p.get('share_title') ?? '').trim();
  const text = (p.get('share_text') ?? '').trim();
  // Beaucoup d'applis mettent le lien dans le texte plutôt que dans share_url.
  const url = (p.get('share_url') ?? '').trim() || (text.match(URL_RE)?.[0] ?? '');
  const textNoUrl = text.replace(URL_RE, '').trim();
  const firstLine = textNoUrl.split('\n')[0].trim();
  const lotTitle = title || firstLine || url || 'partage';
  const body = [textNoUrl === lotTitle ? '' : textNoUrl, url].filter(Boolean).join('\n');
  return { kind: 'share', title: lotTitle, body };
}

let pending: LaunchIntent = read();
if (pending) window.history.replaceState(null, '', window.location.pathname);

/** Renvoie l'intention de lancement une seule fois (null ensuite). */
export function takeLaunchIntent(): LaunchIntent {
  const i = pending;
  pending = null;
  return i;
}
