import { Contact, GiftIdea } from './types';
import { normalizeName } from './calendar';

type CatalogItem = {
  id: string;
  title: string;
  price: number;
  emoji: string;
  keywords: string[];
};

/**
 * Catalogue générique de cadeaux, rattachés à des mots-clés. En production, ce serait remplacé
 * par un vrai catalogue produit (avec liens d'affiliation) — voir Analyse_business_monetisation.md.
 */
const CATALOG: CatalogItem[] = [
  { id: 'dripper', title: 'Dripper à café en céramique', price: 34, emoji: '☕', keywords: ['cafe', 'expresso', 'filtre'] },
  { id: 'moulin', title: 'Moulin à café manuel', price: 58, emoji: '⚙️', keywords: ['cafe', 'moulin'] },
  { id: 'carnet', title: 'Carnet en cuir recyclé', price: 22, emoji: '📓', keywords: ['carnet', 'notes', 'ecrit', 'journal'] },
  { id: 'stylo', title: 'Beau stylo plume', price: 28, emoji: '🖋️', keywords: ['ecrit', 'stylo', 'lettre', 'journal'] },
  { id: 'vinyle', title: "Bon d'achat chez un disquaire", price: 20, emoji: '🎵', keywords: ['vinyle', 'disque', 'musique', 'concert'] },
  { id: 'casque', title: 'Casque audio', price: 79, emoji: '🎧', keywords: ['musique', 'podcast', 'ecoute', 'playlist'] },
  { id: 'friperie', title: "Bon d'achat friperie / vintage", price: 30, emoji: '👕', keywords: ['vintage', 'retro', 'friperie', 'brocante'] },
  { id: 'tasses', title: 'Set de tasses en grès fait main', price: 45, emoji: '🏺', keywords: ['retro', 'artisanal', 'ceramique', 'brocante'] },
  { id: 'escalade', title: "Chaussons d'escalade", price: 75, emoji: '🧗', keywords: ['escalade', 'grimpe', 'bloc'] },
  { id: 'podcast', title: 'Abonnement podcast premium', price: 12, emoji: '🎧', keywords: ['podcast', 'true crime', 'ecoute'] },
  { id: 'plante', title: "Plante d'intérieur facile d'entretien", price: 25, emoji: '🪴', keywords: ['plante', 'jardin', 'balcon'] },
  { id: 'the', title: 'Coffret de thés premium', price: 24, emoji: '🍵', keywords: ['the', 'tisane', 'infusion'] },
  { id: 'chocolat', title: 'Coffret dégustation chocolat', price: 29, emoji: '🍫', keywords: ['chocolat', 'gourmand', 'sucre', 'patisserie'] },
  { id: 'livre', title: "Carte cadeau librairie", price: 20, emoji: '📚', keywords: ['lecture', 'livre', 'roman', 'lire', 'bouquin'] },
  { id: 'jeu', title: 'Jeu de société', price: 32, emoji: '🎲', keywords: ['jeu', 'soiree', 'amis', 'plateau'] },
  { id: 'dessin', title: 'Kit peinture ou carnet de croquis', price: 26, emoji: '🎨', keywords: ['dessin', 'peinture', 'art', 'creatif', 'creative'] },
  { id: 'rando', title: 'Accessoire de randonnée', price: 35, emoji: '🥾', keywords: ['rando', 'marche', 'exterieur', 'montagne'] },
  { id: 'bienetre', title: 'Bon cadeau bien-être / massage', price: 60, emoji: '🧖', keywords: ['bien-etre', 'bien etre', 'relax', 'spa', 'stress', 'yoga'] },
  { id: 'photo', title: 'Appareil photo instantané', price: 65, emoji: '📸', keywords: ['photo', 'souvenir', 'image'] },
  { id: 'velo', title: 'Accessoire vélo', price: 40, emoji: '🚲', keywords: ['velo', 'cyclisme', 'pedale'] },
  { id: 'cuisine', title: 'Beau tablier ou ustensile de cuisine', price: 27, emoji: '🍳', keywords: ['cuisine', 'cuisiner', 'recette', 'pâtisserie', 'patisserie'] },
  { id: 'cinema', title: 'Places de cinéma ou abonnement streaming', price: 30, emoji: '🎬', keywords: ['film', 'cinema', 'serie', 'streaming'] },
  { id: 'jardinage', title: 'Petit kit de jardinage', price: 23, emoji: '🌱', keywords: ['jardin', 'jardinage', 'potager'] },
  { id: 'animaux', title: 'Accessoire pour son animal', price: 25, emoji: '🐾', keywords: ['chat', 'chien', 'animal', 'chaton', 'chiot'] },
];

/** Petite sélection "valeur sûre" quand aucun mot-clé ne matche — mieux qu'un écran vide. */
const FALLBACK: GiftIdea[] = [
  { id: 'fallback-livre', title: 'Carte cadeau librairie', price: 20, emoji: '📚', why: 'Une valeur sûre, peu importe ses goûts précis.' },
  { id: 'fallback-chocolat', title: 'Coffret gourmand', price: 25, emoji: '🍫', why: 'Difficile de se tromper avec une jolie boîte de douceurs.' },
  { id: 'fallback-plante', title: "Plante d'intérieur facile", price: 22, emoji: '🪴', why: 'Un cadeau simple qui fait toujours plaisir.' },
];

function truncate(s: string, max = 90) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/**
 * Génère des idées cadeaux à partir des 3 réponses au quizz : simple recherche de mots-clés,
 * pas d'IA — mais assez pour illustrer le principe, et un point d'extension clair (voir README).
 */
/** Un mot-clé d'un seul mot doit matcher un mot entier (évite que "vert" matche dans "vert sapin"
 *  pour la catégorie plantes) ; un mot-clé à plusieurs mots ("true crime") reste une recherche de
 *  sous-chaîne, sinon il ne matcherait jamais. */
function keywordMatches(keyword: string, normalizedText: string, words: Set<string>) {
  if (keyword.includes(' ')) return normalizedText.includes(keyword);
  return words.has(keyword) || words.has(`${keyword}s`) || words.has(`${keyword}x`);
}

export function generateGiftIdeas(contact: Contact): GiftIdea[] {
  const questions: { text: string; norm: string; words: Set<string> }[] = [contact.q1, contact.q2, contact.q3]
    .filter(Boolean)
    .map((text) => {
      const norm = normalizeName(text);
      return { text, norm, words: new Set(norm.split(/[^a-z]+/).filter(Boolean)) };
    });

  if (questions.length === 0) return [];

  const scored: { item: CatalogItem; score: number; why: string }[] = [];

  for (const item of CATALOG) {
    let score = 0;
    let matchedText: string | null = null;
    for (const keyword of item.keywords) {
      for (const q of questions) {
        if (keywordMatches(keyword, q.norm, q.words)) {
          score += 1;
          if (!matchedText) matchedText = q.text;
        }
      }
    }
    if (score > 0) {
      scored.push({ item, score, why: `Ça rejoint ce qu'il/elle a dit : « ${truncate(matchedText!)} »` });
    }
  }

  if (scored.length === 0) return FALLBACK;

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map(({ item, why }) => ({
    id: item.id,
    title: item.title,
    price: item.price,
    emoji: item.emoji,
    why,
  }));
}
