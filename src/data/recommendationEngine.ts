import { Contact, RejectReason, TraitKey } from './types';
import { computeTraits, isQuizComplete, normalizeQuizProfile } from './quiz';
import { significantWords, extractConcepts } from './textSignals';
import { CuratedGift, CURATED_GIFTS, GiftTaxonomy } from './giftCatalog';

export type BudgetRequest = { maxEuros: number };

/** CHANTIER "Quiz Cadeaux V2 — Phase 1" (2026-09-21) — type de correspondance texte libre retenue
 *  pour UN produit précis, dans l'ordre de force voulu (voir TEXT_MATCH_BONUS) : au plus UNE seule
 *  retenue par candidat (jamais cumulées), la plus forte disponible. `null` = aucune correspondance
 *  texte réelle pour ce produit — jamais de faux bonus, jamais de faux "Pourquoi ?" (voir le cas
 *  "Star Wars" sans produit `star_wars` dans le catalogue, rapport de chantier). */
export type TextMatchKind = 'wish_entity' | 'favorite_entity' | 'detail_entity' | 'substring_fallback' | null;

export type ScoredCandidate = {
  gift: CuratedGift;
  score: number;
  /** Signaux réellement utilisés dans le score — sert de base à whyForContact(), jamais inventé. */
  reasons: {
    interest: boolean;
    trait: TraitKey | null;
    themeAnswer: boolean;
    genericAnswer: boolean;
    /** true dès qu'une correspondance texte libre RÉELLE a compté dans le score de CE produit
     *  (entity exacte ou repli substring) — conservé pour compat avec scripts/test-profiles.ts. */
    wishMatch: boolean;
    /** Détail du type de correspondance retenue (voir TextMatchKind) — permet à whyForContact() de
     *  choisir la bonne phrase, et de ne JAMAIS citer un texte libre qui n'a pas réellement compté
     *  dans le score de CE produit précis. */
    textMatchKind: TextMatchKind;
    /** Texte source exact (wish, ou réponse favorite/detail du thème) qui a produit la
     *  correspondance — uniquement rempli quand textMatchKind !== null, pour permettre de citer
     *  fidèlement ce que l'utilisateur a écrit, jamais un texte reconstruit/inventé. */
    matchedSourceText: string | null;
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

/** Retrouve le produit d'origine à partir de l'ASIN mémorisé dans un feedback — permet de connaître
 *  son `giftConcept`/`taxonomy` au moment du scoring sans avoir à dupliquer ces champs dans
 *  `quiz.feedback` (une seule source de vérité, le catalogue). */
function giftByAsin(asin: string | undefined): CuratedGift | undefined {
  if (!asin) return undefined;
  return CURATED_GIFTS.find((g) => g.asin === asin);
}

/** Compare deux taxonomies en ne comptant QUE les dimensions présentes chez les DEUX produits, et à
 *  l'intérieur de chaque dimension commune, les valeurs partagées — jamais de correspondance entre
 *  deux dimensions différentes (ex. gaming.focus et musique.mode ne se comparent jamais entre eux,
 *  même si leurs libellés se ressemblaient). */
function taxonomySimilarity(a: GiftTaxonomy | undefined, b: GiftTaxonomy | undefined): number {
  if (!a || !b) return 0;
  let shared = 0;
  for (const [dim, valuesA] of Object.entries(a)) {
    const valuesB = b[dim];
    if (!valuesA || !valuesB) continue;
    shared += valuesA.filter((v) => valuesB.includes(v)).length;
  }
  return shared;
}

function isExcluded(gift: CuratedGift, feedback: ReturnType<typeof normalizeQuizProfile>['feedback']): boolean {
  return feedback.some((f) => {
    if (f.asin && f.asin === gift.asin) return true; // ce produit précis a été rejeté
    if (f.reason !== 'has_it' && f.reason !== 'too_similar') return false;
    // "Il a déjà ça" / "Trop similaire" n'excluent plus tout le thème (trop large — un thème couvre
    // des dizaines d'idées très différentes) : seulement les autres produits qui partagent la MÊME
    // idée-cadeau concrète (giftConcept) que celui refusé, ex. une 2e carte cadeau PlayStation après
    // en avoir refusé une.
    const rejected = giftByAsin(f.asin);
    if (rejected?.giftConcept && rejected.giftConcept === gift.giftConcept) return true;
    return false;
  });
}

function traitBonus(gift: CuratedGift, traits: Record<TraitKey, number>): number {
  if (!gift.trait) return 0;
  return traits[gift.trait] * 20; // traits sont 0..1, donc jusqu'à +20
}

/**
 * Certaines réponses composites ("les deux"/"both"/"mixte") représentent réellement l'UNION de
 * plusieurs valeurs de taxonomie distinctes plutôt qu'une valeur à part entière — sans ce mapping
 * explicite, un produit taggé UNIQUEMENT `films` OU `series` ne matche jamais la valeur littérale
 * "les-deux", si bien que répondre "les deux" (le choix le plus ouvert) matche STRICTEMENT MOINS
 * de produits que répondre une seule des deux options — l'inverse du but recherché. Mapping
 * contrôlé par thème + question + valeur : ne JAMAIS supposer qu'un token 'mixte'/'both' a partout
 * la même signification. Ex. `danse.usage=mixte` est une vraie valeur produit à part entière
 * (`danse-enceinte-mini`) et n'est délibérément PAS mappée ici.
 */
const COMPOSITE_ANSWER_EXPANSIONS: Record<string, Record<string, Record<string, string[]>>> = {
  cinema: { contenu: { 'les-deux': ['films', 'series'] } },
  musique: { mode: { both: ['ecoute', 'jouer'] } },
  cuisine: { rapport: { 'les-deux': ['cuisiner', 'deguster'] } },
  sport: { lieu: { mixte: ['maison', 'salle', 'exterieur'] } },
  art: { support: { mixte: ['manuel', 'numerique'] } },
};

function expandAnswerValue(theme: string, questionId: string, value: string): string[] {
  return COMPOSITE_ANSWER_EXPANSIONS[theme]?.[questionId]?.[value] ?? [value];
}

/** Ensemble des valeurs de réponse d'affinage pour un thème, éclatées (multi-choix séparé par
 *  virgule) puis étendues via COMPOSITE_ANSWER_EXPANSIONS — calculé une seule fois par candidat et
 *  réutilisé par themeAnswerMatchCount/taxonomyMatchCount ci-dessous. */
function answerValueSet(theme: string, themeAnswers: Record<string, string> | undefined): Set<string> {
  const values = new Set<string>();
  if (!themeAnswers) return values;
  for (const [questionId, raw] of Object.entries(themeAnswers)) {
    for (const v of raw.split(',')) {
      for (const expanded of expandAnswerValue(theme, questionId, v)) values.add(expanded);
    }
  }
  return values;
}

/** Nombre de tags du produit qui recoupent une réponse d'affinage — pas juste un booléen, pour
 *  qu'un produit qui correspond sur PLUSIEURS critères (ex. 'fandom' ET 'playstation') sorte
 *  clairement devant un produit qui ne recoupe qu'un seul critère générique. Legacy : uniquement
 *  utilisé pour les produits SANS `taxonomy` (voir generateCandidates) pour ne jamais compter deux
 *  fois le même signal quand un produit migré porte encore `tags` en plus de `taxonomy`. */
function themeAnswerMatchCount(gift: CuratedGift, answerValues: Set<string>): number {
  if (!gift.tags) return 0;
  return gift.tags.filter((tag) => answerValues.has(tag)).length;
}

/** Même principe que themeAnswerMatchCount mais pour les thèmes migrés vers la vraie taxonomie
 *  (`taxonomy` plutôt que `tags` libres) — compte toutes les valeurs, toutes dimensions confondues,
 *  qui recoupent une réponse d'affinage. */
function taxonomyMatchCount(gift: CuratedGift, answerValues: Set<string>): number {
  if (!gift.taxonomy) return 0;
  let count = 0;
  for (const values of Object.values(gift.taxonomy)) {
    if (!values) continue;
    count += values.filter((v) => answerValues.has(v)).length;
  }
  return count;
}

/**
 * Filtre DUR : élimine (pas juste pénalise) un produit incompatible avec une réponse déjà donnée —
 * ex. une manette DualSense alors que le contact joue sur Xbox. Une question sans réponse ne filtre
 * rien (on ne sait pas encore, donc on ne prive pas de candidats). Uniquement actif pour les
 * produits qui déclarent hardRequirements/hardExclusions (thèmes migrés) — aucun effet sur les
 * autres, donc pas de régression sur les 18 thèmes pas encore migrés.
 */
function passesHardFilters(gift: CuratedGift, themeAnswers: Record<string, string> | undefined): boolean {
  if (!themeAnswers) return true;
  if (gift.hardRequirements) {
    for (const [questionId, allowed] of Object.entries(gift.hardRequirements)) {
      const answer = themeAnswers[questionId];
      if (!answer) continue;
      const values = answer.split(',');
      if (!values.some((v) => allowed.includes(v))) return false;
    }
  }
  if (gift.hardExclusions) {
    for (const [questionId, excluded] of Object.entries(gift.hardExclusions)) {
      const answer = themeAnswers[questionId];
      if (!answer) continue;
      const values = answer.split(',');
      if (values.some((v) => excluded.includes(v))) return false;
    }
  }
  return true;
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

/**
 * CHANTIER "Quiz Cadeaux V2 — Phase 1" (2026-09-21) — poids des 4 niveaux de correspondance texte
 * libre, en cohérence avec les poids déjà en place dans ce moteur (interestMatch=42,
 * themeAnswerMatches=12/valeur, traitBonus≤20, likedBonus≤25) :
 *   - wish_entity (45) : le signal le plus fort du moteur, légèrement au-dessus d'interestMatch
 *     (42) — un souhait précis qui correspond RÉELLEMENT à un produit du catalogue est plus
 *     explicite qu'un simple centre d'intérêt coché.
 *   - favorite_entity (38) : juste sous interestMatch — une licence/marque explicitement confirmée
 *     pour ce thème précis, un cran sous un souhait direct mais toujours un signal fort et non
 *     inventé.
 *   - detail_entity (30) : au-dessus de themeAnswerMatches*12 (3 valeurs recoupées = 36, souvent
 *     déjà élevé) mais sous favorite_entity — le "détail précis" est par nature plus généraliste
 *     que la question dédiée "favorite" des 4 thèmes qui l'ont.
 *   - substring_fallback (15) : ancien mécanisme conservé comme FILET FAIBLE uniquement (l'ancien
 *     bonus 26/36 est réduit — l'audit a montré que ce signal produit très peu de vrais positifs et
 *     ne doit plus dominer le classement comme avant).
 * Amplifié de +10 (au lieu du +10 déjà existant sur l'ancien mécanisme) si l'utilisateur a
 * explicitement demandé "plus personnel" (voir wantsMorePersonal) — comportement inchangé dans son
 * principe, juste appliqué au nouveau mécanisme plus précis.
 */
const TEXT_MATCH_BONUS: Record<Exclude<TextMatchKind, null>, number> = {
  wish_entity: 45,
  favorite_entity: 38,
  detail_entity: 30,
  substring_fallback: 15,
};

/**
 * Détermine LA meilleure correspondance texte libre pour CE produit précis (jamais cumulée),
 * dans l'ordre de force voulu : wish > favorite > detail > repli substring. Une correspondance
 * "entity" exige que `gift.entities` (concepts factuellement associés à CE produit, voir
 * giftCatalog.ts) contienne un concept canonique extrait du texte libre — jamais une correspondance
 * sémantique/devinée. Si le produit n'a aucune `entities` (cas très majoritaire, 114/162), ou si
 * aucun concept ne recoupe, retombe sur le repli substring historique (`textMatch`) ; si RIEN ne
 * correspond, retourne `{ kind: null, sourceText: null }` — jamais de faux bonus, jamais de faux
 * "Pourquoi ?" (voir le cas "Star Wars" sans produit `star_wars`, rapport de chantier §5).
 */
function bestTextMatch(gift: CuratedGift, quiz: ReturnType<typeof normalizeQuizProfile>): { kind: TextMatchKind; sourceText: string | null } {
  const giftEntities = gift.entities;
  if (giftEntities && giftEntities.length > 0) {
    const entitySet = new Set(giftEntities);
    if (quiz.wish) {
      const wishConcepts = extractConcepts(quiz.wish);
      if (wishConcepts.some((c) => entitySet.has(c))) return { kind: 'wish_entity', sourceText: quiz.wish };
    }
    const answersForTheme = quiz.themeAnswers[gift.theme];
    const favoriteText = answersForTheme?.favorite;
    if (favoriteText) {
      const favoriteConcepts = extractConcepts(favoriteText);
      if (favoriteConcepts.some((c) => entitySet.has(c))) return { kind: 'favorite_entity', sourceText: favoriteText };
    }
    const detailText = answersForTheme?.detail;
    if (detailText) {
      const detailConcepts = extractConcepts(detailText);
      if (detailConcepts.some((c) => entitySet.has(c))) return { kind: 'detail_entity', sourceText: detailText };
    }
  }
  if (textMatch(gift, collectFreeTexts(quiz))) {
    // Repli faible : on ne sait pas PRÉCISÉMENT quel texte a matché (mots significatifs, pas
    // concept unique) — jamais cité littéralement dans whyForContact pour cette raison, voir §6.
    return { kind: 'substring_fallback', sourceText: null };
  }
  return { kind: null, sourceText: null };
}

/** Tous les produits "aimés" via ♡ sur ce contact, toutes recherches précédentes confondues —
 *  reconstruit à partir de l'historique plutôt que stocké à part, une seule source de vérité. */
function likedGiftsFor(history: ReturnType<typeof normalizeQuizProfile>['recommendationHistory']): CuratedGift[] {
  const likedAsins = new Set(history.flatMap((h) => h.likedAsins));
  return CURATED_GIFTS.filter((g) => likedAsins.has(g.asin));
}

/** Un produit qui ressemble à une idée déjà aimée (même thème, même trait, dimensions taxonomiques
 *  communes) est poussé vers le haut du classement — c'est ce qui fait que "J'aime cette idée" a un
 *  effet réel sur les prochaines recommandations, pas juste un cœur qui se colore. La similarité de
 *  détail utilise la vraie `taxonomy` quand les deux produits en ont une (thèmes migrés Phase 3) ;
 *  sinon elle retombe sur les `tags` legacy — jamais les deux mécanismes cumulés sur la même paire,
 *  pour ne pas compter un même recoupement deux fois. Plafonné pour ne jamais à lui seul dominer
 *  l'intérêt/le budget/les réponses du quiz. */
function likedSimilarityBonus(gift: CuratedGift, liked: CuratedGift[]): number {
  let bonus = 0;
  for (const l of liked) {
    if (l.asin === gift.asin) continue;
    if (l.theme === gift.theme) bonus += 8;
    if (l.trait && l.trait === gift.trait) bonus += 6;
    if (l.taxonomy && gift.taxonomy) {
      bonus += taxonomySimilarity(l.taxonomy, gift.taxonomy) * 5;
    } else if (l.tags && gift.tags) {
      bonus += l.tags.filter((t) => gift.tags!.includes(t)).length * 5;
    }
  }
  return Math.min(bonus, 25);
}

/**
 * "Pas son style" n'exclut que le produit précis refusé — mais recevoir ce retour doit quand même
 * avoir un effet réel, sous forme de pénalité MODÉRÉE (jamais une exclusion) sur les produits qui
 * partagent des dimensions taxonomiques avec ce qui a été refusé. Plafonnée nettement plus bas que
 * le bonus "J'aime" pour ne jamais, à elle seule, faire disparaître une branche entière sur un seul
 * retour.
 */
function notStyleTaxonomyPenalty(gift: CuratedGift, feedback: ReturnType<typeof normalizeQuizProfile>['feedback']): number {
  let penalty = 0;
  for (const f of feedback) {
    if (f.reason !== 'not_his_style') continue;
    const rejected = giftByAsin(f.asin);
    if (!rejected || rejected.asin === gift.asin) continue;
    if (rejected.taxonomy && gift.taxonomy) {
      penalty += taxonomySimilarity(rejected.taxonomy, gift.taxonomy) * 4;
    }
  }
  return Math.min(penalty, 20);
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
  // Plafonnés (3 occurrences suffisent à atteindre le maximum) pour qu'un contact avec beaucoup de
  // refus accumulés ne finisse pas par écraser l'intérêt/le budget/les réponses du quiz — même
  // logique de plafond que likedBonus ci-dessous.
  const originalityBoost = Math.min(quiz.feedback.filter((f) => f.reason === 'too_classic').length * 8, 24);
  const personalBoost = Math.min(quiz.feedback.filter((f) => f.reason === 'more_personal').length * 8, 24);
  const wantsMorePersonal = personalBoost > 0;
  const liked = likedGiftsFor(quiz.recommendationHistory);
  const excludedSet = new Set(excludeAsins);

  const onInterests = CURATED_GIFTS.filter((g) => quiz.interests.includes(g.theme) && g.price <= budget.maxEuros);
  const pool = onInterests.length >= 6 ? onInterests : CURATED_GIFTS.filter((g) => g.price <= budget.maxEuros);

  return pool
    .filter(
      (g) =>
        !excludedSet.has(g.asin) &&
        !isExcluded(g, quiz.feedback) &&
        !quiz.avoid.includes(g.theme) &&
        passesHardFilters(g, quiz.themeAnswers[g.theme])
    )
    .map((g) => {
      const interestMatch = quiz.interests.includes(g.theme);
      const trait = traitBonus(g, traits) >= 10 ? (g.trait ?? null) : null;
      const answersForTheme = quiz.themeAnswers[g.theme];
      const answerValues = answerValueSet(g.theme, answersForTheme);
      // Un produit migré (taxonomy) ne recompte jamais le même signal via ses tags legacy — sinon
      // une réponse qui recoupe une valeur présente à la fois dans tags et taxonomy (ex. 'setup')
      // est comptée deux fois pour un seul et même signal réel.
      const themeAnswerMatches = g.taxonomy ? taxonomyMatchCount(g, answerValues) : themeAnswerMatchCount(g, answerValues);
      const genericBonus = genericThemeAnswerBonus(g, answersForTheme, budget.maxEuros);
      const themeAnswer = themeAnswerMatches > 0 || genericBonus > 0;
      // CHANTIER "Quiz Cadeaux V2 — Phase 1" (2026-09-21) — remplace l'ancien matchedText/isFandom :
      // une seule correspondance texte libre retenue par produit, la plus forte disponible parmi
      // wish/favorite/detail (entity exacte, voir giftCatalog.ts) puis repli substring. L'ancien
      // mécanisme "favoriteText" (afficher le texte 'favorite' brut sous N'IMPORTE QUEL produit
      // taggé fandom dès qu'un thème matchait) est RETIRÉ : il pouvait citer "Star Wars" sous une
      // carte cadeau PlayStation générique sans aucun rapport réel — interdit explicitement par la
      // consigne §6. `favoriteText` n'est plus rempli que si l'entity a RÉELLEMENT matché ce produit.
      const textMatchResult = bestTextMatch(g, quiz);
      const favoriteText = textMatchResult.kind === 'favorite_entity' ? textMatchResult.sourceText : null;
      const likedBonus = likedSimilarityBonus(g, liked);
      let score = 0;
      // Intérêt choisi et texte écrit à la main sont les deux signaux les plus fiables (jamais
      // inventés) — pondérés plus fort que les traits déduits du quiz général.
      if (interestMatch) score += 42;
      score += traitBonus(g, traits);
      score += themeAnswerMatches * 12;
      score += genericBonus;
      score -= tagConflictPenalty(g, answersForTheme);
      score -= notStyleTaxonomyPenalty(g, quiz.feedback);
      // Le texte libre écrit à la main est déjà un signal réel et fiable (pas inventé) ; "je veux
      // plus personnel" amplifie ce signal EXISTANT plutôt que d'en fabriquer un nouveau — et pousse
      // en plus les objets au trait sentimental, qui sont par nature le genre de cadeau "personnel".
      // JAMAIS un filtre dur : un profil sans correspondance texte garde tous ses autres signaux
      // (intérêt/thème/trait) intacts, voir consigne §4.
      if (textMatchResult.kind) score += TEXT_MATCH_BONUS[textMatchResult.kind] + (wantsMorePersonal ? 10 : 0);
      if (g.trait === 'curious') score += originalityBoost;
      if (g.trait === 'sentimental') score += personalBoost;
      score += likedBonus;
      return {
        gift: g,
        score,
        reasons: {
          interest: interestMatch,
          trait,
          themeAnswer,
          genericAnswer: genericBonus > 0,
          wishMatch: textMatchResult.kind !== null,
          textMatchKind: textMatchResult.kind,
          matchedSourceText: textMatchResult.sourceText,
          favoriteText,
          likedSimilar: likedBonus >= 8,
        },
      };
    })
    .sort((a, b) => b.score - a.score || a.gift.price - b.gift.price);
}

export function topRecommendations(candidates: ScoredCandidate[], n = 3): ScoredCandidate[] {
  return candidates.slice(0, n);
}

/**
 * Texte affiché sous chaque recommandation — mène avec le PITCH de l'objet lui-même (pourquoi
 * c'est un bon cadeau en soi, pour donner envie de l'acheter), et n'ajoute qu'une courte clause de
 * personnalisation à la fin, seulement quand un signal concret et réel le justifie (jamais un goût
 * ou trait inventé) : un seul signal, le plus précis disponible, pour rester court et lisible.
 */
export function whyForContact(candidate: ScoredCandidate, contact: Contact): string {
  const il = contact.genre === 'femme' ? 'elle' : 'il';
  const { reasons } = candidate;
  let tail = '';
  // CHANTIER "Quiz Cadeaux V2 — Phase 1" (2026-09-21) — chaque branche ci-dessous ne s'active que
  // si `textMatchKind` correspond RÉELLEMENT au produit affiché (voir bestTextMatch) : plus jamais
  // de citation d'un texte libre qui n'a pas compté dans le score de CE produit précis (consigne
  // §6 — interdiction explicite du comportement "Tu as noté qu'il aime Star Wars" sous un produit
  // sans rapport réel).
  if (reasons.textMatchKind === 'favorite_entity' && reasons.favoriteText) {
    tail = ` Tu as justement noté qu’${il} aime ${reasons.favoriteText}.`;
  } else if (reasons.textMatchKind === 'wish_entity' && reasons.matchedSourceText) {
    tail = ` Ça correspond pile à ce que tu as noté qu’${il} aimerait avoir : « ${reasons.matchedSourceText.trim()} ».`;
  } else if (reasons.textMatchKind === 'detail_entity' && reasons.matchedSourceText) {
    tail = ` Ça rejoint le détail que tu as donné sur ses goûts.`;
  } else if (reasons.textMatchKind === 'substring_fallback') {
    // Repli faible (mot retrouvé dans le titre, pas une entity confirmée) — phrasing volontairement
    // plus prudent, jamais une citation littérale d'un texte qu'on n'a pas identifié avec certitude.
    tail = ` Ça rejoint peut-être ce que tu as noté sur ses goûts.`;
  } else if (reasons.likedSimilar) {
    tail = ` Dans la même veine qu’une idée déjà aimée pour ${contact.prenom}.`;
  } else if (reasons.themeAnswer) {
    tail = ` Ça correspond à ce que tu as précisé sur ses goûts.`;
  }
  return `${candidate.gift.pitch}${tail}`;
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
