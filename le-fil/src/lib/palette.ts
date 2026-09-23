// Le Fil — palette des projets (28 teintes, grille de 8 colonnes)
// Source : design_handoff_le_fil/README.md §5
// Ordre : profonds (0-7) · vifs (8-15) · pastels (16-23) · neutres (24-27)

export type Swatch = { hex: string; name: string };

export const PALETTE: Swatch[] = [
  // Profonds
  { hex: '#8f1d10', name: 'brique' },
  { hex: '#9a5a10', name: 'ambre foncé' },
  { hex: '#7a6a12', name: 'olive' },
  { hex: '#1f5140', name: 'sapin' },
  { hex: '#14555f', name: 'sarcelle foncé' },
  { hex: '#1e3a7a', name: 'outremer' },
  { hex: '#4d2f73', name: 'aubergine' },
  { hex: '#6e2f52', name: 'prune' },
  // Vifs
  { hex: '#e8402a', name: 'rouge' },
  { hex: '#e07f23', name: 'orange' },
  { hex: '#f2c015', name: 'jaune' },
  { hex: '#2f6f5e', name: 'vert' },
  { hex: '#2a8a97', name: 'sarcelle' },
  { hex: '#2f4f9e', name: 'bleu' },
  { hex: '#7a4fa3', name: 'violet' },
  { hex: '#b0466f', name: 'framboise' },
  // Pastels
  { hex: '#f3a79b', name: 'rose pâle' },
  { hex: '#f5c48f', name: 'abricot' },
  { hex: '#f7e08a', name: 'paille' },
  { hex: '#9fc9ba', name: 'menthe' },
  { hex: '#9fd0d8', name: 'ciel' },
  { hex: '#a3b4e2', name: 'bleu pâle' },
  { hex: '#c3aada', name: 'lilas' },
  { hex: '#e8adc1', name: 'dragée' },
  // Neutres
  { hex: '#0a0a0a', name: 'encre' },
  { hex: '#4a4a46', name: 'ardoise' },
  { hex: '#8a6a3a', name: 'brun' },
  { hex: '#9c9c98', name: 'gris' }, // aussi la couleur de « sans projet »
];

export const NO_PROJECT_COLOR = '#9c9c98';

/** Ligne "vifs" utilisée pour la bande de couleurs de l'écran de connexion. */
export const AUTH_BAND_COLORS = PALETTE.slice(8, 16);

/**
 * Contraste automatique — luminance 0.299 R + 0.587 G + 0.114 B.
 * Au-dessus de 150 : texte encre. Sinon : texte papier.
 */
export function contrastText(hex: string): '#0a0a0a' | '#fbfbf9' {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? '#0a0a0a' : '#fbfbf9';
}

/** Première couleur de la ligne "vifs + pastels" non encore utilisée par un projet. */
export function nextProjectColor(usedColors: string[]): string {
  const vifsAndPastels = PALETTE.slice(8, 24);
  const used = new Set(usedColors);
  const free = vifsAndPastels.find((s) => !used.has(s.hex));
  return free ? free.hex : vifsAndPastels[0].hex;
}
