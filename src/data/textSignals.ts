import { InterestTag } from './types';

/**
 * Mots-clés par thème, utilisés pour repérer dans du texte libre (le souhait du quiz) un signal
 * explicite d'aversion ("il n'aime pas la cuisine") en plus du sélecteur de tags "à éviter" — ce
 * dernier reste la source la plus fiable, ceci est un filet de sécurité pour le texte écrit à la
 * main, comme demandé : "il faut plus considérer les informations écrites".
 */
const THEME_KEYWORDS: Partial<Record<InterestTag, string[]>> = {
  tech: ['tech', 'gadget', 'électronique', 'electronique'],
  musique: ['musique', 'musical'],
  gaming: ['gaming', 'jeu vidéo', 'jeux vidéo', 'jeu video', 'jeux video'],
  sport: ['sport', 'sportif', 'sportive'],
  cuisine: ['cuisine', 'cuisiner', 'cuisinier', 'cuisinière'],
  mode: ['mode', 'vêtement', 'vetement', 'fringue'],
  voyage: ['voyage', 'voyager'],
  lecture: ['lecture', 'lire', 'livre', 'roman'],
  collection: ['collection', 'collectionner'],
  maison: ['maison', 'déco', 'deco', 'décoration', 'decoration'],
  auto: ['voiture', 'auto', 'automobile'],
  nature: ['nature', 'randonnée', 'randonnee', 'extérieur', 'exterieur'],
  cinema: ['cinéma', 'cinema', 'film', 'série', 'serie'],
  art: ['art', 'dessin', 'peinture', 'créatif', 'creatif'],
  bienetre: ['bien-être', 'bien-etre', 'bienêtre', 'bienetre', 'relaxation', 'détente', 'detente'],
  animaux: ['animal', 'animaux', 'chat', 'chien'],
  photo: ['photo', 'photographie'],
  jardinage: ['jardin', 'jardinage', 'plante'],
  bricolage: ['bricolage', 'bricoler'],
  danse: ['danse', 'danser'],
};

const NEGATION_PATTERN = /\b(n[e']?\s*\w{0,3}\s*pas|jamais|déteste|deteste|horreur|évite|evite|pas fan)\b/i;

/**
 * Repère les thèmes explicitement rejetés dans un texte libre (fenêtre de ~25 caractères autour
 * du mot-clé pour vérifier la présence d'une négation) — volontairement conservateur : en cas de
 * doute, ne rien exclure plutôt que de sur-filtrer.
 */
export function inferAvoidFromText(text: string): InterestTag[] {
  if (!text.trim()) return [];
  const lower = text.toLowerCase();
  const found: InterestTag[] = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS) as [InterestTag, string[]][]) {
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      const windowStart = Math.max(0, idx - 25);
      const windowEnd = Math.min(lower.length, idx + kw.length + 12);
      const window = lower.slice(windowStart, windowEnd);
      if (NEGATION_PATTERN.test(window)) {
        found.push(theme);
        break;
      }
    }
  }
  return found;
}

const STOPWORDS = new Set([
  'des', 'les', 'une', 'un', 'du', 'de', 'la', 'le', 'et', 'ou', 'pour', 'avec', 'qui', 'que',
  'son', 'sa', 'ses', 'il', 'elle', 'aimerait', 'voudrait', 'avoir', 'plutôt', 'plutot', 'bien',
]);

/** Mots significatifs (≥4 lettres, hors mots vides) d'un texte libre — sert à bonifier les
 *  produits dont le titre recoupe ce que l'utilisateur a écrit vouloir (voir wishMatchBonus). */
export function significantWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-zàâäéèêëïîôöùûüç]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
}
