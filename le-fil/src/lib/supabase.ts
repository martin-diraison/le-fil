import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase n'est pas configuré : copie .env.example en .env.local et renseigne " +
      'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (voir README du projet). ' +
      "En attendant, l'appli démarre en mode démo local (App.tsx contourne l'authentification).",
  );
}

// createClient exige une URL syntaxiquement valide même en mode démo (non utilisée tant
// qu'isSupabaseConfigured est faux — voir App.tsx).
// Le projet Supabase héberge plusieurs applis : Le Fil vit dans son propre schéma Postgres
// (supabase/schema.sql), qui doit être listé dans Data API › Exposed schemas.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  db: { schema: 'le_fil' },
});
