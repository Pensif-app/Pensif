import { Contact, GiftIdea, InterestTag, TraitKey } from './types';
import { computeTraits, isQuizComplete, sortedTraits } from './quiz';

type CatalogItem = {
  id: string;
  title: string;
  price: number;
  emoji: string;
  interests: InterestTag[];
  trait: TraitKey;
};

/**
 * Catalogue générique de cadeaux, rattachés aux centres d'intérêt du quiz plutôt qu'à des
 * mots-clés en texte libre. En production, ce serait remplacé par un vrai catalogue produit (avec
 * liens d'affiliation) — voir Analyse_business_monetisation.md.
 */
const CATALOG: CatalogItem[] = [
  { id: 'dripper', title: 'Dripper à café en céramique', price: 34, emoji: '☕', interests: ['cuisine'], trait: 'practical' },
  { id: 'moulin', title: 'Moulin à café manuel', price: 58, emoji: '⚙️', interests: ['cuisine'], trait: 'curious' },
  { id: 'carnet', title: 'Carnet en cuir recyclé', price: 22, emoji: '📓', interests: ['lecture'], trait: 'sentimental' },
  { id: 'stylo', title: 'Beau stylo plume', price: 28, emoji: '🖋️', interests: ['lecture'], trait: 'sentimental' },
  { id: 'vinyle', title: "Bon d'achat chez un disquaire", price: 20, emoji: '🎵', interests: ['musique', 'collection'], trait: 'curious' },
  { id: 'casque', title: 'Casque audio', price: 79, emoji: '🎧', interests: ['musique', 'tech'], trait: 'practical' },
  { id: 'friperie', title: "Bon d'achat friperie / vintage", price: 30, emoji: '👕', interests: ['mode'], trait: 'curious' },
  { id: 'tasses', title: 'Set de tasses en grès fait main', price: 45, emoji: '🏺', interests: ['maison'], trait: 'sentimental' },
  { id: 'escalade', title: "Chaussons d'escalade", price: 75, emoji: '🧗', interests: ['sport'], trait: 'experience' },
  { id: 'podcast', title: 'Abonnement podcast premium', price: 12, emoji: '🎧', interests: ['musique'], trait: 'curious' },
  { id: 'plante', title: "Plante d'intérieur facile d'entretien", price: 25, emoji: '🪴', interests: ['nature', 'maison'], trait: 'practical' },
  { id: 'the', title: 'Coffret de thés premium', price: 24, emoji: '🍵', interests: ['cuisine'], trait: 'sentimental' },
  { id: 'chocolat', title: 'Coffret dégustation chocolat', price: 29, emoji: '🍫', interests: ['cuisine'], trait: 'sentimental' },
  { id: 'livre', title: 'Carte cadeau librairie', price: 20, emoji: '📚', interests: ['lecture'], trait: 'sentimental' },
  { id: 'jeu', title: 'Jeu de société', price: 32, emoji: '🎲', interests: ['gaming'], trait: 'social' },
  { id: 'dessin', title: 'Kit peinture ou carnet de croquis', price: 26, emoji: '🎨', interests: ['art'], trait: 'curious' },
  { id: 'rando', title: 'Accessoire de randonnée', price: 35, emoji: '🥾', interests: ['sport', 'nature'], trait: 'experience' },
  { id: 'bienetre', title: 'Bon cadeau bien-être / massage', price: 60, emoji: '🧖', interests: ['bienetre'], trait: 'experience' },
  { id: 'photo', title: 'Appareil photo instantané', price: 65, emoji: '📸', interests: ['photo', 'voyage'], trait: 'sentimental' },
  { id: 'velo', title: 'Accessoire vélo', price: 40, emoji: '🚲', interests: ['sport', 'auto'], trait: 'practical' },
  { id: 'cuisine', title: 'Beau tablier ou ustensile de cuisine', price: 27, emoji: '🍳', interests: ['cuisine'], trait: 'practical' },
  { id: 'cinema', title: 'Places de cinéma ou abonnement streaming', price: 30, emoji: '🎬', interests: ['cinema'], trait: 'practical' },
  { id: 'jardinage', title: 'Petit kit de jardinage', price: 23, emoji: '🌱', interests: ['jardinage', 'nature'], trait: 'practical' },
  { id: 'animaux', title: 'Accessoire pour son animal', price: 25, emoji: '🐾', interests: ['animaux'], trait: 'sentimental' },
  { id: 'valise', title: 'Accessoire de voyage malin', price: 32, emoji: '🧳', interests: ['voyage'], trait: 'practical' },
  { id: 'sac', title: 'Sac ou pochette tendance', price: 38, emoji: '👜', interests: ['mode'], trait: 'curious' },
  { id: 'manette', title: 'Accessoire gaming', price: 45, emoji: '🎮', interests: ['gaming', 'tech'], trait: 'curious' },
  { id: 'auto-access', title: 'Accessoire auto', price: 30, emoji: '🚗', interests: ['auto'], trait: 'practical' },
  { id: 'peinture-set', title: 'Set de peinture ou pastels pour artiste', price: 33, emoji: '🖌️', interests: ['art'], trait: 'curious' },
  { id: 'expo', title: "Place d'exposition ou atelier créatif", price: 28, emoji: '🖼️', interests: ['art'], trait: 'experience' },
  { id: 'cours-danse', title: 'Cours de danse à deux', price: 55, emoji: '💃', interests: ['danse'], trait: 'experience' },
  { id: 'enceinte-danse', title: 'Petite enceinte pour danser à la maison', price: 42, emoji: '🔊', interests: ['danse', 'musique'], trait: 'practical' },
  { id: 'boite-outils', title: "Belle boîte à outils ou kit de bricolage", price: 48, emoji: '🧰', interests: ['bricolage'], trait: 'practical' },
  { id: 'atelier-bois', title: 'Atelier initiation menuiserie', price: 65, emoji: '🪵', interests: ['bricolage'], trait: 'experience' },
];

/** Petite sélection "valeur sûre" quand on n'a encore aucune donnée exploitable. */
const FALLBACK: GiftIdea[] = [
  { id: 'fallback-livre', title: 'Carte cadeau librairie', price: 20, emoji: '📚', why: 'Une valeur sûre, peu importe ses goûts précis.' },
  { id: 'fallback-chocolat', title: 'Coffret gourmand', price: 25, emoji: '🍫', why: 'Difficile de se tromper avec une jolie boîte de douceurs.' },
  { id: 'fallback-plante', title: "Plante d'intérieur facile", price: 22, emoji: '🪴', why: 'Un cadeau simple qui fait toujours plaisir.' },
];

/** Catégories d'intérêt suggérées à partir du profil — affichées sur l'écran de résultat du quiz. */
export function suggestedCategories(contact: Contact): { key: InterestTag; label: string }[] {
  if (!isQuizComplete(contact.quiz)) return [];
  const traits = computeTraits(contact.quiz.answers);
  const topTrait = sortedTraits(traits)[0]?.key;
  const scored = new Map<InterestTag, number>();
  for (const item of CATALOG) {
    if (contact.quiz.avoid.includes(item.interests[0])) continue;
    let score = 0;
    for (const tag of item.interests) if (contact.quiz.interests.includes(tag)) score += 2;
    if (item.trait === topTrait) score += 1;
    if (score > 0) for (const tag of item.interests) scored.set(tag, (scored.get(tag) ?? 0) + score);
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => ({ key, label: INTEREST_LABELS[key] }));
}

const INTEREST_LABELS: Record<InterestTag, string> = {
  tech: 'Tech',
  musique: 'Musique',
  gaming: 'Gaming',
  sport: 'Sport',
  cuisine: 'Cuisine',
  mode: 'Mode',
  voyage: 'Voyage',
  lecture: 'Lecture',
  collection: 'Collection',
  maison: 'Maison',
  auto: 'Auto',
  nature: 'Nature',
  cinema: 'Cinéma & séries',
  art: 'Art & créatif',
  bienetre: 'Bien-être',
  animaux: 'Animaux',
  photo: 'Photo',
  jardinage: 'Jardinage',
  bricolage: 'Bricolage',
  danse: 'Danse',
};

/**
 * Génère des idées cadeaux à partir du profil de personnalité (centres d'intérêt, traits, ce
 * qu'il faut éviter, budget) — plus fiable qu'une recherche de mots-clés dans du texte libre.
 */
export function generateGiftIdeas(contact: Contact): GiftIdea[] {
  if (!isQuizComplete(contact.quiz)) return [];
  const { interests, avoid, budget } = contact.quiz;
  const traits = computeTraits(contact.quiz.answers);
  const ranked = sortedTraits(traits);
  const topTrait = ranked[0]?.key;
  const secondTrait = ranked[1]?.key;
  const maxPrice = budget ? BUDGET_MAX[budget] : Infinity;

  const scored: { item: CatalogItem; score: number; matchedInterest: InterestTag | null }[] = [];

  for (const item of CATALOG) {
    if (item.interests.some((tag) => avoid.includes(tag))) continue;
    if (item.price > maxPrice) continue;

    let score = 0;
    let matchedInterest: InterestTag | null = null;
    for (const tag of item.interests) {
      if (interests.includes(tag)) {
        score += 3;
        if (!matchedInterest) matchedInterest = tag;
      }
    }
    if (item.trait === topTrait) score += 2;
    else if (item.trait === secondTrait) score += 1;

    if (score > 0) scored.push({ item, score, matchedInterest });
  }

  if (scored.length === 0) return FALLBACK;

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map(({ item, matchedInterest }) => ({
    id: item.id,
    title: item.title,
    price: item.price,
    emoji: item.emoji,
    why: matchedInterest
      ? `Ça correspond à son intérêt pour ${INTEREST_LABELS[matchedInterest].toLowerCase()}.`
      : `Ça colle bien avec ce que le quiz a révélé sur lui/elle.`,
  }));
}

const BUDGET_MAX: Record<string, number> = { '0-20': 20, '20-50': 50, '50-100': 100, '100+': Infinity };
