import { Contact, RejectReason, TraitKey } from './types';
import { computeTraits, isQuizComplete, normalizeQuizProfile, INTEREST_OPTIONS } from './quiz';
import { significantWords } from './textSignals';
import { CuratedGift, CURATED_GIFTS } from './giftCatalog';

export type BudgetRequest = { maxEuros: number };

export type ScoredCandidate = {
  gift: CuratedGift;
  score: number;
  /** Signaux réellement utilisés dans le score — sert de base à whyForContact(), jamais inventé. */
  reasons: {
    interest: boolean;
    trait: TraitKey | null;
    themeAnswer: boolean;
    genericAnswer: boolean;
    wishMatch: boolean;
    favoriteText: string | null;
    likedSimilar: boolean;
  };
};

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  has_it: 'Il a déjà ça',
  not_his_style: 'Pas son style',
  too_classic: 'Trop classique',
  too_expensive: 'Trop cher',
  too_similar: 'Trop similaire à ce qu’il possède',
  more_personal: 'Je veux quelque chose de plus personnel',
  other: 'Autre',
};

/**
 * Réduit la contrainte de budget après un "Trop cher", et compte les "Trop classique" reçus pour
 * pondérer l'originalité dans generateCandidates — c'est tout l'effet mémorisé de ces deux retours,
 * les autres raisons agissent uniquement via l'exclusion (isExcluded ci-dessous).
 */
export function adjustBudgetForFeedback(currentMax: number, reason: RejectReason): number {
  if (reason === 'too_expensive') return Math.round(currentMax * 0.75);
  return currentMax;
}

function isExcluded(gift: CuratedGift, feedback: ReturnType<typeof normalizeQuizProfile>['feedback']): boolean {
  return feedback.some((f) => {
    if (f.asin && f.asin === gift.asin) return true; // ce produit précis a été rejeté
    if (f.theme === gift.theme && (f.reason === 'too_similar' || f.reason === 'has_it')) return true;
    return false;
  });
}

function traitBonus(gift: CuratedGift, traits: Record<TraitKey, number>): number {
  if (!gift.trait) return 0;
  return traits[gift.trait] * 20; // traits sont 0..1, donc jusqu'à +20
}

/** Nombre de tags du produit qui recoupent une réponse d'affinage — pas juste un booléen, pour
 *  qu'un produit qui correspond sur PLUSIEURS critères (ex. 'fandom' ET 'playstation') sorte
 *  clairement devant un produit qui ne recoupe qu'un seul critère générique. */
function themeAnswerMatchCount(gift: CuratedGift, themeAnswers: Record<string, string> | undefined): number {
  if (!gift.tags || !themeAnswers) return 0;
  const answerValues = new Set(Object.values(themeAnswers));
  return gift.tags.filter((tag) => answerValues.has(tag)).length;
}

/**
 * Pénalise un produit dont le tag va à l'encontre d'une réponse explicite donnée ailleurs sur le
 * même thème — ex. un accessoire "setup" alors que le contact a dit préférer "quelque chose lié à
 * ses jeux préférés" (fandom) ou avoir déjà un setup bien équipé. Sans ça, l'absence de bonus
 * (themeAnswerBonus renvoie simplement false) ne suffit pas à faire redescendre ces produits sous
 * les mieux alignés dans le classement.
 */
function tagConflictPenalty(gift: CuratedGift, themeAnswers: Record<string, string> | undefined): number {
  if (!gift.tags || !themeAnswers) return 0;
  const answerValues = new Set(Object.values(themeAnswers));
  if (gift.tags.includes('setup') && (answerValues.has('fandom') || answerValues.has('equipped'))) return 25;
  return 0;
}

/** Un mot significatif retrouvé dans le titre du produit — regroupe TOUT le texte libre écrit sur
 *  ce contact (souhait général + détail/favori de chaque thème affiné), pas seulement le souhait,
 *  pour vraiment tenir compte de ce qui a été écrit à la main plutôt que juste coché. */
function textMatch(gift: CuratedGift, texts: string[]): boolean {
  const titleLower = gift.title.toLowerCase();
  return texts.some((text) => significantWords(text).some((w) => titleLower.includes(w)));
}

/**
 * Scoring générique pour les thèmes SANS arbre dédié (voir genericThemeQuiz dans
 * themeQuizzes.ts) — les clés de réponse (passion/depth/style/priority) sont les mêmes pour tous
 * ces thèmes, donc lisibles ici sans connaître le thème. Une vraie passion pousse l'intérêt pour
 * CE thème plus fort ; "pratique" vs "original" et "objet" vs "expérience" recoupent directement
 * les traits practical/curious/experience du produit ; "connaisseur" pousse vers le haut de la
 * fourchette de budget plutôt que l'entrée de gamme.
 */
function genericThemeAnswerBonus(gift: CuratedGift, answers: Record<string, string> | undefined, budgetMax: number): number {
  if (!answers) return 0;
  let bonus = 0;
  if (answers.passion === 'passion' && gift.theme) bonus += 10;
  if (answers.style === 'pratique' && gift.trait === 'practical') bonus += 12;
  if (answers.style === 'original' && gift.trait === 'curious') bonus += 12;
  if (answers.priority === 'objet' && gift.trait === 'practical') bonus += 10;
  if (answers.priority === 'experience' && gift.trait === 'experience') bonus += 10;
  if (answers.depth === 'connaisseur' && Number.isFinite(budgetMax) && gift.price >= budgetMax * 0.6) bonus += 8;
  if (answers.depth === 'debutant' && gift.price <= (Number.isFinite(budgetMax) ? budgetMax : 100) * 0.4) bonus += 8;
  return bonus;
}

// Seuls ces ids de question sont du texte libre (voir themeQuizzes.ts) — les autres valeurs de
// quiz.themeAnswers sont des clés de choix (ex. 'pratique', 'original') qu'il ne faut PAS
// rechercher comme des mots-clés dans les titres produits, sous peine de faux positifs.
const TEXT_ANSWER_IDS = ['favorite', 'detail'];

/** Tout le texte libre écrit sur ce contact : souhait général + détail/favori de chaque thème
 *  affiné — sert de base à textMatch(), pour vraiment tenir compte de l'écrit, pas juste du coché. */
function collectFreeTexts(quiz: ReturnType<typeof normalizeQuizProfile>): string[] {
  const texts = [quiz.wish];
  for (const answers of Object.values(quiz.themeAnswers)) {
    if (!answers) continue;
    for (const id of TEXT_ANSWER_IDS) {
      const value = answers[id];
      if (value) texts.push(value);
    }
  }
  return texts;
}

/** Tous les produits "aimés" via ♡ sur ce contact, toutes recherches précédentes confondues —
 *  reconstruit à partir de l'historique plutôt que stocké à part, une seule source de vérité. */
function likedGiftsFor(history: ReturnType<typeof normalizeQuizProfile>['recommendationHistory']): CuratedGift[] {
  const likedAsins = new Set(history.flatMap((h) => h.likedAsins));
  return CURATED_GIFTS.filter((g) => likedAsins.has(g.asin));
}

/** Un produit qui ressemble à une idée déjà aimée (même thème, même trait, ou tags en commun) est
 *  poussé vers le haut du classement — c'est ce qui fait que "J'aime cette idée" a un effet réel
 *  sur les prochaines recommandations, pas juste un cœur qui se colore. Plafonné pour ne jamais à
 *  lui seul dominer l'intérêt/le budget/les réponses du quiz. */
function likedSimilarityBonus(gift: CuratedGift, liked: CuratedGift[]): number {
  let bonus = 0;
  for (const l of liked) {
    if (l.asin === gift.asin) continue;
    if (l.theme === gift.theme) bonus += 8;
    if (l.trait && l.trait === gift.trait) bonus += 6;
    if (l.tags && gift.tags) bonus += l.tags.filter((t) => gift.tags!.includes(t)).length * 5;
  }
  return Math.min(bonus, 25);
}

/**
 * Génère les candidats compatibles avec le budget, scorés du meilleur au moins bon. Contrainte de
 * budget forte (les produits hors budget sont simplement retirés, pas juste pénalisés) ; si le
 * pool sur les intérêts choisis est trop restreint (<6, ex. un seul centre d'intérêt sélectionné),
 * élargissement automatique à tout le catalogue pour garder assez de choix à scorer.
 */
export function generateCandidates(contact: Contact, budget: BudgetRequest, excludeAsins: string[] = []): ScoredCandidate[] {
  if (!isQuizComplete(contact.quiz)) return [];
  const quiz = normalizeQuizProfile(contact.quiz);
  const traits = computeTraits(quiz.answers);
  const originalityBoost = quiz.feedback.filter((f) => f.reason === 'too_classic').length * 8;
  const liked = likedGiftsFor(quiz.recommendationHistory);
  const freeTexts = collectFreeTexts(quiz);
  const excludedSet = new Set(excludeAsins);

  const onInterests = CURATED_GIFTS.filter((g) => quiz.interests.includes(g.theme) && g.price <= budget.maxEuros);
  const pool = onInterests.length >= 6 ? onInterests : CURATED_GIFTS.filter((g) => g.price <= budget.maxEuros);

  return pool
    .filter((g) => !excludedSet.has(g.asin) && !isExcluded(g, quiz.feedback) && !quiz.avoid.includes(g.theme))
    .map((g) => {
      const interestMatch = quiz.interests.includes(g.theme);
      const trait = traitBonus(g, traits) >= 10 ? (g.trait ?? null) : null;
      const answersForTheme = quiz.themeAnswers[g.theme];
      const themeAnswerMatches = themeAnswerMatchCount(g, answersForTheme);
      const genericBonus = genericThemeAnswerBonus(g, answersForTheme, budget.maxEuros);
      const themeAnswer = themeAnswerMatches > 0 || genericBonus > 0;
      const matchedText = textMatch(g, freeTexts);
      // Le champ 'favorite' (licence/artiste préféré…) n'a pas de correspondance produit directe
      // dans un catalogue statique, mais on le rappelle honnêtement dans "Pourquoi ?" quand un
      // produit "fandom" est justement là pour couvrir ce goût précis (ex. carte cadeau plateforme).
      const favoriteText = themeAnswerMatches > 0 && g.tags?.includes('fandom') ? answersForTheme?.favorite ?? null : null;
      const likedBonus = likedSimilarityBonus(g, liked);
      let score = 0;
      // Intérêt choisi et texte écrit à la main sont les deux signaux les plus fiables (jamais
      // inventés) — pondérés plus fort que les traits déduits du quiz général.
      if (interestMatch) score += 42;
      score += traitBonus(g, traits);
      score += themeAnswerMatches * 12;
      score += genericBonus;
      score -= tagConflictPenalty(g, answersForTheme);
      if (matchedText) score += 26;
      if (g.trait === 'curious') score += originalityBoost;
      score += likedBonus;
      return {
        gift: g,
        score,
        reasons: { interest: interestMatch, trait, themeAnswer, genericAnswer: genericBonus > 0, wishMatch: matchedText, favoriteText, likedSimilar: likedBonus >= 8 },
      };
    })
    .sort((a, b) => b.score - a.score || a.gift.price - b.gift.price);
}

export function topRecommendations(candidates: ScoredCandidate[], n = 3): ScoredCandidate[] {
  return candidates.slice(0, n);
}

/** Phrase "Pourquoi pour {prénom} ?" — construite UNIQUEMENT à partir des signaux qui ont compté
 *  dans le score (voir ScoredCandidate.reasons), jamais un goût ou trait inventé. */
export function whyForContact(candidate: ScoredCandidate, contact: Contact): string {
  const bits: string[] = [];
  const opt = INTEREST_OPTIONS.find((o) => o.key === candidate.gift.theme);
  if (candidate.reasons.interest && opt) {
    bits.push(`${contact.prenom} s’intéresse à ${opt.label.toLowerCase()}`);
  }
  if (candidate.reasons.trait) {
    const traitPhrase: Record<TraitKey, string> = {
      practical: `${contact.prenom} apprécie les cadeaux pratiques`,
      social: `${contact.prenom} aime les moments partagés`,
      curious: `${contact.prenom} aime découvrir des choses nouvelles`,
      sentimental: `${contact.prenom} privilégie la qualité aux choses éphémères`,
      experience: `${contact.prenom} préfère les expériences aux objets`,
    };
    bits.push(traitPhrase[candidate.reasons.trait]);
  }
  const il = contact.genre === 'femme' ? 'elle' : 'il';
  if (candidate.reasons.favoriteText) {
    bits.push(`tu as noté qu’${il} aime particulièrement ${candidate.reasons.favoriteText}`);
  } else if (candidate.reasons.themeAnswer) {
    bits.push('ça correspond à ce que tu as précisé sur ses goûts dans ce domaine');
  }
  if (candidate.reasons.wishMatch) {
    bits.push(`ça rejoint ce que tu as noté qu’${il} aimerait avoir`);
  }
  if (candidate.reasons.likedSimilar) {
    bits.push('ça ressemble à une idée que tu as aimée précédemment');
  }
  if (bits.length === 0) return `Une idée dans le budget indiqué pour ${contact.prenom}.`;
  const joined = bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(', ')} et ${bits[bits.length - 1]}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

/**
 * Quantité/qualité réelle des informations connues sur le contact — sert au badge "Précision des
 * recommandations", jamais purement décoratif : recalculé à chaque fois depuis le profil.
 */
export function precisionLevel(contact: Contact): 'faible' | 'bonne' | 'excellente' {
  if (!isQuizComplete(contact.quiz)) return 'faible';
  const quiz = normalizeQuizProfile(contact.quiz);
  let score = 0;
  if (quiz.answers.length > 0) score += 1;
  if (quiz.interests.length > 0) score += 1;
  const withThemeAnswers = quiz.interests.filter((t) => Object.keys(quiz.themeAnswers[t] ?? {}).length > 0);
  if (withThemeAnswers.length > 0) score += 1;
  if (quiz.interests.length > 0 && withThemeAnswers.length >= quiz.interests.length) score += 1;
  if (quiz.wish.trim()) score += 1;
  if (score >= 4) return 'excellente';
  if (score >= 2) return 'bonne';
  return 'faible';
}

export const PRECISION_LABELS: Record<ReturnType<typeof precisionLevel>, string> = {
  faible: 'Faible',
  bonne: 'Bonne',
  excellente: 'Excellente',
};
