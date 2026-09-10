// Charte Pensif : le violet signale l'action/la navigation (Pensif), le corail signale
// l'attention portée à une personne (anniversaire, favori) — jamais l'inverse. Le violet ne doit
// pas devenir le fond de toute l'app : il reste réservé aux boutons, sélections et accents.
export const light = {
  ink: '#20202A',
  inkSoft: '#777783',
  paper: '#F7F6FB',
  paperDim: '#F0EEFA',
  card: '#FFFFFF',
  accent: '#7257E8',
  accentStrong: '#5C42C7',
  accentTint: '#EDE9FB',
  plum: '#FF5A6B',
  plumTint: '#FFE1E4',
  sage: '#2E9C6D',
  sageTint: '#DFF5EA',
  civil: '#A8524A',
  civilTint: '#F3E1DE',
  // Rouge "classique", volontairement différent du corail (plum) : le corail = attention envers
  // une personne, le danger = action destructive (supprimer). Les deux ne doivent jamais se
  // confondre, sinon "cœur Pensif" se lirait inconsciemment comme une erreur.
  danger: '#C62F2F',
  line: '#E7E4F0',
  tabBarTint: 'rgba(255,255,255,0.55)',
};

export const dark = {
  ink: '#F8F7FB',
  inkSoft: '#A8A8BA',
  paper: '#111124',
  paperDim: '#21213A',
  card: '#19192F',
  accent: '#7257E8',
  accentStrong: '#9581F2',
  accentTint: '#241E42',
  plum: '#FF5A6B',
  plumTint: '#3A2130',
  sage: '#55B98B',
  sageTint: '#1E3A2C',
  civil: '#E08A80',
  civilTint: '#3A211E',
  danger: '#F0453D',
  line: '#2B2B47',
  tabBarTint: 'rgba(33,33,58,0.6)',
};

export type Palette = typeof light;
