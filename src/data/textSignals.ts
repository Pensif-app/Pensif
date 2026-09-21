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

/**
 * CHANTIER "Quiz Cadeaux V2 — Phase 1" (2026-09-21) — normalisation déterministe d'un texte libre
 * en un slug canonique stable : minuscules, accents retirés (NFD + suppression des diacritiques),
 * toute suite de caractères non alphanumériques réduite à un seul "_", underscores de bord retirés.
 * Volontairement DÉTERMINISTE, sans LLM — à cette échelle (concepts d'un catalogue de 162 produits),
 * une table d'alias explicite suffit et reste auditable ligne par ligne, contrairement à un modèle.
 *   canonicalize("Star Wars") === canonicalize("star-wars") === "star_wars"
 *   canonicalize("Pokémon") === canonicalize("pokemon") === canonicalize("POKEMON") === "pokemon"
 */
export function canonicalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les diacritiques (é→e, etc.)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Alias explicites : forme COLLÉE (sans séparateur) du slug → concept canonique final. Nécessaire
 * pour les cas où deux écritures légitimes d'un même concept ne convergent PAS par le seul
 * `canonicalize` — ex. "Star Wars" → "star_wars" mais "STARWARS" (un seul mot, aucune ponctuation
 * à transformer) → "starwars" sans alias. La clé est donc la forme collée ("starwars"), pour
 * attraper les deux écritures à la fois.
 * Table VOLONTAIREMENT COURTE et maintenue à la main (pas de dictionnaire externe) : à l'échelle
 * de ce catalogue, chaque entrée est ajoutée seulement si un vrai cas d'usage l'exige — jamais
 * peuplée par anticipation.
 */
const CONCEPT_ALIASES: Record<string, string> = {
  starwars: 'star_wars',
  pokemon: 'pokemon', // pokémon→pokemon déjà couvert par le retrait d'accent ; entrée explicite pour documenter le cas obligatoire de l'audit
  playstation: 'playstation',
  ps5: 'playstation',
  ps4: 'playstation',
  ps3: 'playstation',
  clickandgrow: 'click_grow', // "Click & Grow" canonicalise en "click_grow" (le "&" devient un séparateur) ; "Click and Grow" doit converger vers le même concept.
};

/** Résout un mot/texte court vers son concept canonique final (après alias). */
export function toCanonicalConcept(text: string): string {
  const slug = canonicalize(text);
  const collapsed = slug.replace(/_/g, '');
  return CONCEPT_ALIASES[collapsed] ?? slug;
}

/**
 * Extrait tous les concepts canoniques CANDIDATS d'un texte libre : chaque mot pris seul, et chaque
 * paire de mots consécutifs (pour capturer un concept à deux mots comme "star_wars" même écrit en
 * toutes lettres avec un espace), chacun résolu via `toCanonicalConcept`. C'est une extraction
 * LEXICALE PURE — elle ne "comprend" rien : c'est la comparaison en aval avec les `entities` réelles
 * du catalogue (recommendationEngine.ts) qui décide si un concept candidat correspond à un produit
 * réel, jamais une correspondance sémantique inventée ici.
 */
export function extractConcepts(text: string): string[] {
  if (!text.trim()) return [];
  const words = canonicalize(text)
    .split('_')
    .filter((w) => w.length >= 2);
  const concepts = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    concepts.add(toCanonicalConcept(words[i]));
    if (i + 1 < words.length) concepts.add(toCanonicalConcept(`${words[i]}${words[i + 1]}`));
  }
  return Array.from(concepts);
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
