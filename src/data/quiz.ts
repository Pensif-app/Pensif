import { BudgetBand, Contact, Genre, InterestTag, QuizAnswer, QuizProfile, TraitKey } from './types';
import { COVERED_THEMES, CURATED_GIFTS } from './giftCatalog';

/**
 * CHANTIER "Cadeaux V2 — Phase 6B" (2026-09-21) — convertit un ASIN legacy vers le `gift.id`
 * correspondant en le recherchant dans le catalogue COURANT — jamais une affectation directe
 * `giftId = asin` (un ASIN n'est PAS un id Pensif, ce serait une fausse identité). Retourne
 * `undefined` si l'ASIN ne correspond plus à aucun produit actuel (fiche retirée du catalogue
 * depuis) : ce cas est géré par l'appelant, jamais un crash, jamais un id fabriqué (voir
 * normalizeQuizProfile ci-dessous — l'entrée reste tolérée telle quelle, juste sans effet moteur).
 */
export function giftIdFromLegacyAsin(asin: string): string | undefined {
  return CURATED_GIFTS.find((g) => g.asin === asin)?.id;
}

/**
 * Comble les champs absents sur un profil de quiz créé avant l'ajout de l'affinage par thème / du
 * feedback / de l'historique de recommandations — ancien contact ("Papa" et les autres créés plus
 * tôt) ou données legacy en base. C'est le SEUL endroit du code qui doit connaître l'ancienne
 * forme : tout le reste lit toujours un QuizProfile complet (même pattern que normalizeRelation
 * dans FicheScreen.tsx pour les anciennes valeurs de relation).
 *
 * CHANTIER "Phase 6B" (2026-09-21) — convertit également l'identité legacy par ASIN
 * (`feedback[].asin`, `recommendationHistory[].shownAsins/likedAsins`) vers l'identité canonique
 * par `gift.id` (`feedback[].giftId`, `.../shownGiftIds/likedGiftIds`) : SEUL endroit qui fait
 * cette conversion, via `giftIdFromLegacyAsin` (jamais `giftId = asin`). Un ASIN legacy introuvable
 * dans le catalogue actuel n'est JAMAIS transformé en faux id — il est simplement ignoré pour le
 * calcul (`undefined` filtré), tout en laissant l'entrée brute (`asin`/`shownAsins`/`likedAsins`)
 * intacte dans l'objet retourné : cette fonction ne fait jamais persister quoi que ce soit (elle
 * retourne une copie en mémoire), donc aucune donnée utilisateur n'est jamais supprimée — voir
 * consigne §4/§5. Les nouveaux écrits (GiftsScreen.tsx) n'utilisent plus jamais `asin`/`shownAsins`/
 * `likedAsins`, uniquement les champs `*GiftId(s)`.
 */
export function normalizeQuizProfile(raw: QuizProfile): QuizProfile {
  const feedback = (raw.feedback ?? []).map((f) => ({
    ...f,
    giftId: f.giftId ?? (f.asin ? giftIdFromLegacyAsin(f.asin) : undefined),
  }));
  const recommendationHistory = (raw.recommendationHistory ?? []).map((h) => ({
    ...h,
    shownGiftIds: h.shownGiftIds ?? (h.shownAsins ?? []).map(giftIdFromLegacyAsin).filter((id): id is string => !!id),
    likedGiftIds: h.likedGiftIds ?? (h.likedAsins ?? []).map(giftIdFromLegacyAsin).filter((id): id is string => !!id),
  }));
  return {
    ...raw,
    themeAnswers: raw.themeAnswers ?? {},
    feedback,
    recommendationHistory,
  };
}

/**
 * Remplace les jetons {prenom}/{il}/{Il}/{lui}/{son} d'un gabarit de texte par le prénom et les
 * bons pronoms du contact — {il}/{lui}/{son} valent "il/elle"/"lui/elle"/"son/sa" tant que le
 * genre n'est pas renseigné, pour rester correct dans tous les cas.
 */
export function formatQuizText(template: string, contact: Pick<Contact, 'prenom' | 'genre'>): string {
  const g: Genre | null = contact.genre;
  const il = g === 'homme' ? 'il' : g === 'femme' ? 'elle' : 'il/elle';
  const lui = g === 'homme' ? 'lui' : g === 'femme' ? 'elle' : 'lui/elle';
  const son = g === 'homme' ? 'son' : g === 'femme' ? 'sa' : 'son/sa';
  return template
    .replace(/\{prenom\}/g, contact.prenom)
    .replace(/\{Il\}/g, il.charAt(0).toUpperCase() + il.slice(1))
    .replace(/\{il\}/g, il)
    .replace(/\{lui\}/g, lui)
    .replace(/\{son\}/g, son);
}

/**
 * Le petit quiz de personnalité — remplace les 3 anciens champs texte libre. Chaque question A/B
 * "vote" pour un ou deux traits ; le profil final est dérivé de ces votes plutôt que demandé
 * directement, pour rester léger et ludique à remplir (~1 minute). Les gabarits utilisent
 * {prenom}/{il}/{Il}/{lui}/{son} — voir formatQuizText.
 */
export const QUIZ_QUESTIONS: {
  prompt: string;
  a: { label: string; votes: TraitKey[] };
  b: { label: string; votes: TraitKey[] };
}[] = [
  {
    prompt: 'Un samedi complètement libre, {prenom} préférerait…',
    a: { label: 'Sortir et faire quelque chose', votes: ['social'] },
    b: { label: 'Rester tranquille chez {lui}', votes: ['practical'] },
  },
  {
    prompt: 'Pour faire plaisir à {prenom}, tu choisirais plutôt…',
    a: { label: 'Une expérience à vivre', votes: ['experience'] },
    b: { label: 'Un objet à garder', votes: ['practical'] },
  },
  {
    prompt: '{Il} est plutôt du genre…',
    a: { label: 'Pratique et utile', votes: ['practical'] },
    b: { label: 'Original et surprenant', votes: ['curious'] },
  },
  {
    prompt: 'Quand {il} reçoit quelque chose, {il} préfère…',
    a: { label: 'Quelque chose qu’{il} connaît déjà', votes: ['sentimental'] },
    b: { label: 'Découvrir quelque chose de nouveau', votes: ['curious'] },
  },
  {
    prompt: 'Le temps libre de {prenom}, c’est plutôt…',
    a: { label: 'Activités / sorties', votes: ['social'] },
    b: { label: 'Films, musique, jeux…', votes: ['curious'] },
  },
  {
    prompt: '{Il} accorde plus d’importance à…',
    a: { label: 'La qualité', votes: ['sentimental'] },
    b: { label: 'La quantité / variété', votes: ['curious'] },
  },
  {
    prompt: 'Un cadeau réussi pour {prenom}, c’est surtout…',
    a: { label: 'Quelque chose qu’{il} voulait', votes: ['practical'] },
    b: { label: 'Quelque chose auquel {il} n’aurait pas pensé', votes: ['curious', 'experience'] },
  },
];

const MAX_VOTES: Record<TraitKey, number> = QUIZ_QUESTIONS.reduce(
  (acc, q) => {
    for (const t of q.a.votes) acc[t] += 1;
    for (const t of q.b.votes) acc[t] += 1;
    return acc;
  },
  { practical: 0, social: 0, curious: 0, sentimental: 0, experience: 0 } as Record<TraitKey, number>,
);

export const TRAIT_LABELS: Record<TraitKey, string> = {
  practical: 'Pratique',
  social: 'Sociable',
  curious: 'Curieux',
  sentimental: 'Sentimental',
  experience: 'Expériences',
};

export const INTEREST_OPTIONS: { key: InterestTag; label: string; emoji: string }[] = [
  { key: 'tech', label: 'Tech', emoji: '📱' },
  { key: 'musique', label: 'Musique', emoji: '🎵' },
  { key: 'gaming', label: 'Gaming', emoji: '🎮' },
  { key: 'sport', label: 'Sport', emoji: '🏃' },
  { key: 'cuisine', label: 'Cuisine', emoji: '🍳' },
  { key: 'mode', label: 'Mode', emoji: '👕' },
  { key: 'voyage', label: 'Voyage', emoji: '✈️' },
  { key: 'lecture', label: 'Lecture', emoji: '📚' },
  { key: 'collection', label: 'Collection', emoji: '🧩' },
  { key: 'maison', label: 'Maison', emoji: '🏠' },
  { key: 'auto', label: 'Auto', emoji: '🚗' },
  { key: 'nature', label: 'Nature', emoji: '🌿' },
  { key: 'cinema', label: 'Cinéma & séries', emoji: '🎬' },
  { key: 'art', label: 'Art & créatif', emoji: '🎨' },
  { key: 'bienetre', label: 'Bien-être', emoji: '🧘' },
  { key: 'animaux', label: 'Animaux', emoji: '🐾' },
  { key: 'photo', label: 'Photo', emoji: '📸' },
  { key: 'jardinage', label: 'Jardinage', emoji: '🌱' },
  { key: 'bricolage', label: 'Bricolage', emoji: '🔧' },
  { key: 'danse', label: 'Danse', emoji: '💃' },
  // CHANTIER "Phase 5F" (2026-09-21) : sélectionnables dès cette passe, aucun produit catalogue
  // associé pour l'instant (voir types.ts, giftCatalog.ts — pas de fabrication de données
  // commerciales, consigne §8).
  { key: 'jeux_societe', label: 'Jeux de société', emoji: '🎲' },
  { key: 'beaute', label: 'Beauté & soins', emoji: '🧴' },
  { key: 'science', label: 'Science & espace', emoji: '🔭' },
];

/**
 * CHANTIER "Phase 5G" (2026-09-21) — sous-ensemble d'INTEREST_OPTIONS réellement sélectionnable
 * par l'utilisateur : uniquement les thèmes qui ont de vrais produits (COVERED_THEMES,
 * giftCatalog.ts) — source UNIQUE de vérité, pas de seconde liste manuelle à maintenir en
 * parallèle. Un thème ajouté ici (config/quiz prêts) mais sans catalogue (ex. jeux_societe/
 * beaute/science tant qu'ils ne sont pas sourcés) reste dans INTEREST_OPTIONS (pour les lookups
 * de label sur des données déjà stockées) mais disparaît de VISIBLE_INTEREST_OPTIONS — donc du
 * sélecteur affiché à l'utilisateur — jusqu'à ce que COVERED_THEMES l'inclue réellement.
 */
export const VISIBLE_INTEREST_OPTIONS = INTEREST_OPTIONS.filter((opt) => (COVERED_THEMES as readonly InterestTag[]).includes(opt.key));

/** Paliers de budget proposés au moment de générer des recommandations (voir GiftsScreen.tsx) —
 *  ce n'est plus une question du quiz général, le budget appartient à la recherche, pas au profil. */
export const BUDGET_OPTIONS: { key: BudgetBand; label: string; max: number }[] = [
  { key: '0-20', label: 'Moins de 20 €', max: 20 },
  { key: '20-40', label: '20 – 40 €', max: 40 },
  { key: '40-70', label: '40 – 70 €', max: 70 },
  { key: '70-100', label: '70 – 100 €', max: 100 },
  { key: '100+', label: '100 € et +', max: Infinity },
];

/** 0 → 1 par trait, en fonction du nombre de fois où il a été "voté" sur ses questions concernées. */
export function computeTraits(answers: QuizAnswer[]): Record<TraitKey, number> {
  const votes: Record<TraitKey, number> = { practical: 0, social: 0, curious: 0, sentimental: 0, experience: 0 };
  answers.forEach((answer, i) => {
    const q = QUIZ_QUESTIONS[i];
    if (!q) return;
    const side = answer === 'A' ? q.a : q.b;
    for (const t of side.votes) votes[t] += 1;
  });
  const traits = {} as Record<TraitKey, number>;
  (Object.keys(votes) as TraitKey[]).forEach((t) => {
    traits[t] = MAX_VOTES[t] > 0 ? votes[t] / MAX_VOTES[t] : 0;
  });
  return traits;
}

const ARCHETYPES: { key: string; when: (t: Record<TraitKey, number>) => boolean; title: string; description: string }[] = [
  {
    key: 'bon-vivant',
    when: (t) => t.practical >= 0.5 && t.social < 0.5 && t.curious < 0.6,
    title: 'Le bon vivant',
    description:
      '{Il} semble apprécier les plaisirs simples, les moments tranquilles et les choses qu’{il} peut réellement utiliser. Plus sensible à un cadeau adapté à {son} quotidien qu’à quelque chose de purement décoratif.',
  },
  {
    key: 'explorateur',
    when: (t) => t.curious >= 0.6,
    title: "L'explorateur",
    description: 'Toujours partant·e pour découvrir quelque chose de nouveau. Un cadeau surprenant ou original marquera plus qu’une valeur sûre.',
  },
  {
    key: 'aventurier',
    when: (t) => t.experience >= 0.5 && t.social >= 0.5,
    title: "L'aventurier",
    description:
      'Ce qui compte, ce sont les moments vécus plus que les objets accumulés — une expérience à partager fera toujours mouche.',
  },
  {
    key: 'sociable',
    when: (t) => t.social >= 0.5,
    title: 'Le sociable',
    description: 'Les sorties et les moments partagés comptent beaucoup — pense aux cadeaux qui se vivent à plusieurs.',
  },
  {
    key: 'sentimental',
    when: (t) => t.sentimental >= 0.5,
    title: 'Le sentimental',
    description: 'Attaché·e à ce qu’{il} connaît déjà et à la qualité plus qu’à la quantité — un cadeau qui a du sens compte plus que la surprise.',
  },
];

export function archetypeFor(traits: Record<TraitKey, number>, contact?: Pick<Contact, 'prenom' | 'genre'>): { title: string; description: string } {
  const match = ARCHETYPES.find((a) => a.when(traits)) ?? {
    title: 'Le curieux',
    description: 'Un mélange équilibré de goûts — difficile à cerner en une phrase, ce qui laisse justement plein d’options pour {le}/{la} surprendre.',
  };
  if (!contact) return match;
  return {
    title: match.title,
    description: formatQuizText(match.description, contact).replace(/\{le\}\/\{la\}/g, contact.genre === 'femme' ? 'la' : 'le'),
  };
}

/** Traits triés du plus fort au plus faible, pour l'affichage des barres de profil. */
export function sortedTraits(traits: Record<TraitKey, number>): { key: TraitKey; value: number }[] {
  return (Object.keys(traits) as TraitKey[])
    .map((key) => ({ key, value: traits[key] }))
    .sort((a, b) => b.value - a.value);
}

/** Le quiz est "fait" dès qu'on est arrivé au bout (completedAt posé par finish() dans
 *  QuizScreen) — pas besoin d'avoir répondu à toutes les questions A/B, "Passer cette question"
 *  est une option volontaire et ne doit pas empêcher le quiz d'être considéré comme terminé. */
export function isQuizComplete(quiz: QuizProfile | null | undefined): quiz is QuizProfile {
  return Boolean(quiz && quiz.completedAt);
}
