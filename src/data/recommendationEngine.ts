import { Contact, InterestTag, RejectReason, TraitKey } from './types';
import { computeTraits, isQuizComplete, normalizeQuizProfile } from './quiz';
import { significantWords, extractConcepts, CONCEPT_ALIAS_TARGETS } from './textSignals';
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
     *  correspondance — uniquement rempli quand le match est COMPLET (coverage===1), pour permettre
     *  de citer fidèlement ce que l'utilisateur a écrit ; jamais rempli sur un match partiel (voir
     *  CHANTIER "Quiz Cadeaux V2 — Phase 3", consigne §4 — ne jamais laisser croire qu'un texte a
     *  été entièrement satisfait alors que seule une partie a matché). */
    matchedSourceText: string | null;
    /** CHANTIER "Phase 3" (2026-09-21) — couverture du match structuré : `1` = complet (tous les
     *  concepts significatifs extraits du texte sont couverts par `gift.entities`), `]0,1[` =
     *  partiel, `null` = pas de match structuré pour ce produit (repli substring ou aucun match).
     *  Sert à moduler le bonus (`Math.round(poids_max * coverage)`) et à choisir la bonne phrase
     *  dans whyForContact(). */
    textMatchCoverage: number | null;
    /** Concepts canoniques RÉELLEMENT matchés (sous-ensemble de `gift.entities`) — ex. `['lego']`
     *  pour un favorite "LEGO Star Wars" sur un produit qui ne porte que `lego`. Vide si aucun match
     *  structuré. Sert à whyForContact() pour ne citer QUE la portion réellement matchée sur un
     *  match partiel, jamais le texte source complet. */
    matchedConcepts: string[];
    favoriteText: string | null;
    likedSimilar: boolean;
    /** CHANTIER "Phase 3 — correctif sémantique" (2026-09-21) — nombre de VRAIS conflits taxonomiques
     *  (voir TAXONOMY_CONFLICTS : allowlist explicite, jamais "aucune intersection = conflit"). `0`
     *  systématiquement si le contact n'a répondu à aucune question d'affinage pour ce thème —
     *  absence de réponse ≠ conflit, jamais. Sert à `topRecommendations()` pour distinguer un
     *  produit "juste moins bien matché" d'un produit "réellement contradictoire". */
    realConflictCount: number;
    /** ids des dimensions (questionId) en conflit réel — ex. `['mode']` — jamais affiché à
     *  l'utilisateur, sert uniquement au diagnostic/tests. */
    conflictingDimensions: string[];
    /** CHANTIER "Phase 3 — correctif sémantique" (2026-09-21) — nombre de preuves SPÉCIFIQUES
     *  (au-delà d'interestMatch/trait/simple présence dans le thème) : compte
     *  `themeAnswerMatches` (valeurs de taxonomie qui recoupent RÉELLEMENT une réponse, dimensions
     *  différentes des éventuels conflits) + 1 si un match texte/entity STRUCTURÉ réel existe
     *  (`wish_entity`/`favorite_entity`/`detail_entity`, complet OU partiel — jamais
     *  `substring_fallback`, trop faible pour compter). Sert à `topRecommendations()` : un produit
     *  avec ≥1 conflit réel ET 0 preuve spécifique est exclu de la sélection finale (jamais affiché
     *  juste pour "remplir" le Top 3) — voir consigne §5/§6. */
    specificEvidenceCount: number;
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

/** CHANTIER "Cadeaux V2 — Phase 6B" (2026-09-21) — résolution CANONIQUE d'un produit à partir de
 *  `gift.id` : c'est la seule fonction d'identité utilisée par le scoring/l'historique/le feedback
 *  modernes (voir isExcluded, likedGiftsFor, notStyleTaxonomyPenalty ci-dessous). Permet de connaître
 *  le `giftConcept`/`taxonomy` d'un produit référencé dans `quiz.feedback`/`recommendationHistory`
 *  sans dupliquer ces champs (une seule source de vérité, le catalogue). */
function giftById(id: string | undefined): CuratedGift | undefined {
  if (!id) return undefined;
  return CURATED_GIFTS.find((g) => g.id === id);
}

/** Conservée UNIQUEMENT pour un éventuel lookup commercial Amazon (voir aussi
 *  giftIdFromLegacyAsin dans quiz.ts, qui fait sa propre recherche directe pour la conversion
 *  legacy) — ne doit plus jamais être appelée par le scoring ou l'historique moderne (voir
 *  consigne Phase 6B §6). Exportée pour rester disponible côté commerce sans forcer un import
 *  redondant du catalogue ailleurs. */
export function giftByAsin(asin: string | undefined): CuratedGift | undefined {
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
    // CHANTIER "Phase 6B" (2026-09-21) — identité par `giftId` (canonique), plus jamais `asin`. Une
    // entrée legacy dont l'ASIN ne correspond plus à aucun produit actuel a `giftId === undefined`
    // (voir normalizeQuizProfile) : elle ne matche jamais rien ici, sans crash — exactement le
    // comportement "ignorer pour le calcul moteur, tolérer la donnée persistée" voulu (consigne §4).
    if (f.giftId && f.giftId === gift.id) return true; // ce produit précis a été rejeté
    if (f.reason !== 'has_it' && f.reason !== 'too_similar') return false;
    // "Il a déjà ça" / "Trop similaire" n'excluent plus tout le thème (trop large — un thème couvre
    // des dizaines d'idées très différentes) : seulement les autres produits qui partagent la MÊME
    // idée-cadeau concrète (giftConcept) que celui refusé, ex. une 2e carte cadeau PlayStation après
    // en avoir refusé une.
    const rejected = giftById(f.giftId);
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
 * CHANTIER "Quiz Cadeaux V2 — Phase 3 — correctif sémantique" (2026-09-21) — remplace la règle
 * générique "aucune intersection = conflit" (elle-même remplaçait déjà l'ancien `tagConflictPenalty`
 * gaming-only, -25, voir commentaire historique conservé plus bas). La règle générique a été
 * INVALIDÉE par un audit empirique sur les 8 profils réels de la campagne qualité : sur 12 conflits
 * générés, **7 étaient des faux positifs** (ex. cuisine.univers "gastronomie" vs "café" — deux
 * sous-spécialités qui se recoupent, pas une contradiction ; nature.priorite "equipement" vs
 * "confort" — deux qualités désirables non exclusives ; photo.usage "souvenirs" vs "impression" —
 * un tirage papier EST un souvenir). Remplacée par une ALLOWLIST EXPLICITE : seules les paires de
 * valeurs RÉELLEMENT incompatibles, une par une, empiriquement vérifiées contre un profil réel,
 * déclenchent un conflit. Aucune dimension ajoutée par anticipation (voir rapport de chantier —
 * sport.discipline/maison.connecte/auto.diy/lecture.format/art (toutes dimensions)/jardinage.lieu/nature.activite
 * restent volontairement absentes tant qu'aucun profil réel ne les a vérifiées).
 *
 * Les paires sont SYMÉTRIQUES par construction (voir `conflictsWith` : A vs B et B vs A sont le même
 * conflit) — écrire chaque paire une seule fois suffit.
 */
const TAXONOMY_CONFLICTS: Partial<Record<InterestTag, Partial<Record<string, readonly (readonly [string, string])[]>>>> = {
  gaming: {
    // Un accessoire "améliorer son setup" ne répond pas à "quelque chose lié à ses jeux préférés"
    // — catégories de produit réellement distinctes (remplace l'ancien tagConflictPenalty
    // gaming-only, -25 : ce cas précis est désormais couvert ici, sans double comptage — voir
    // consigne Phase 3 §4/§6, aucun mécanisme séparé conservé).
    // CHANTIER "Phase 4C — nettoyage quiz pré-bêta" (2026-09-21) : setup↔confort et
    // setup↔multijoueur RETIRÉS d'ici — les options 'confort'/'multijoueur' n'existent plus dans
    // le quiz gaming (voir themeQuizzes.ts), donc ces paires ne pouvaient plus jamais être
    // déclenchées par une nouvelle réponse ; les retirer rend explicitement neutres les anciennes
    // réponses déjà stockées avec ces valeurs (elles ne recoupent plus aucune paire de
    // TAXONOMY_CONFLICTS, donc `conflictsWith` retourne toujours `false` pour elles désormais —
    // aucune dégradation silencieuse des recommandations pour les profils existants, voir
    // consigne §7).
    focus: [['setup', 'fandom']],
  },
  musique: {
    // Un accessoire pour JOUER d'un instrument est fonctionnellement inutile à quelqu'un qui
    // n'écoute que de la musique — vérifié sur le profil "Sofia" (cordes de guitare/accordeur).
    mode: [['ecoute', 'jouer']],
  },
  cuisine: {
    // "upgrade" exprime une vraie intention de gamme, contredite par un produit qui se déclare
    // lui-même "outil" (entrée de gamme) — vérifié sur le profil "Camille" (balance de cuisine).
    preference: [['outil', 'upgrade']],
  },
  bricolage: {
    // Un outil électrique ne répond pas à une préférence explicite pour l'outillage manuel (et
    // inversement) — vérifié sur le profil "Karim" (tournevis à cliquet).
    outil: [['manuel', 'electrique']],
  },
};

/** Valeurs jamais interprétées comme un signal de conflit, même si une dimension correspondante est
 *  un jour ajoutée à TAXONOMY_CONFLICTS — l'utilisateur n'a exprimé aucune préférence tranchée sur
 *  cette dimension (voir bienetre.parfum='inconnu', ou tout futur "indifferent" similaire). Ne
 *  modifie aucun quiz existant : ce garde-fou est purement défensif, côté scoring. */
const NEUTRAL_CONFLICT_VALUES = new Set(['inconnu', 'indifferent']);

/** Vrai si `valueA`/`valueB` forment une paire DÉCLARÉE incompatible pour cette dimension de ce
 *  thème — jamais un conflit implicite (voir TAXONOMY_CONFLICTS), jamais si l'une des deux valeurs
 *  est neutre (voir NEUTRAL_CONFLICT_VALUES). Symétrique : l'ordre des deux valeurs n'importe pas. */
function conflictsWith(theme: InterestTag, questionId: string, valueA: string, valueB: string): boolean {
  if (NEUTRAL_CONFLICT_VALUES.has(valueA) || NEUTRAL_CONFLICT_VALUES.has(valueB)) return false;
  const pairs = TAXONOMY_CONFLICTS[theme]?.[questionId];
  if (!pairs) return false;
  return pairs.some(([a, b]) => (a === valueA && b === valueB) || (a === valueB && b === valueA));
}

type TaxonomyConflictResult = { realConflictCount: number; conflictingDimensions: string[]; penalty: number };

/**
 * Calcule les VRAIS conflits taxonomiques pour un produit précis, un par dimension déclarée dans
 * TAXONOMY_CONFLICTS uniquement — jamais une dimension hors allowlist. Retourne une métadonnée
 * complète (pas juste un nombre) pour que `topRecommendations` puisse distinguer un produit "juste
 * moins bien matché" (0 conflit réel) d'un produit "réellement contradictoire" (≥1 conflit réel),
 * voir consigne §4/§6. Pénalité inchangée : -12 par conflit réel, symétrique du bonus
 * `themeAnswerMatches * 12`. Les questions texte libre (`favorite`/`detail`) sont exclues par
 * construction (jamais des valeurs de choix comparables à une dimension de `taxonomy`).
 */
function taxonomyConflicts(gift: CuratedGift, themeAnswers: Record<string, string> | undefined): TaxonomyConflictResult {
  if (!gift.taxonomy || !themeAnswers) return { realConflictCount: 0, conflictingDimensions: [], penalty: 0 };
  const conflictingDimensions: string[] = [];
  for (const [questionId, rawAnswer] of Object.entries(themeAnswers)) {
    if (TEXT_ANSWER_IDS.includes(questionId)) continue; // favorite/detail : jamais une valeur de choix
    const productValues = gift.taxonomy[questionId];
    if (!productValues) continue; // le produit ne renseigne pas cette dimension : neutre, pas un conflit
    const userValues = rawAnswer.split(',').flatMap((v) => expandAnswerValue(gift.theme, questionId, v));
    const hasConflict = userValues.some((uv) => productValues.some((pv) => conflictsWith(gift.theme, questionId, uv, pv)));
    if (hasConflict) conflictingDimensions.push(questionId);
  }
  return { realConflictCount: conflictingDimensions.length, conflictingDimensions, penalty: conflictingDimensions.length * 12 };
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
 * CHANTIER "Quiz Cadeaux V2 — Phase 3" (2026-09-21) — ensemble des concepts "structurés
 * significatifs" connus du système : toutes les `entities` réellement portées par au moins un
 * produit du catalogue, PLUS toutes les cibles canoniques de `CONCEPT_ALIASES` (ex. `star_wars`),
 * même quand aucun produit ne les porte encore. Sert à distinguer, dans `extractConcepts()`, un
 * concept qui COMPTE (`lego`, `star_wars`) d'un simple fragment de mot sans signification propre
 * (`star`, `wars`, `legostar`) — voir consigne §1/§2. Calculé une seule fois (catalogue statique).
 */
const KNOWN_STRUCTURED_CONCEPTS: Set<string> = new Set<string>([
  ...CURATED_GIFTS.flatMap((g) => g.entities ?? []),
  ...CONCEPT_ALIAS_TARGETS,
]);

/** Filtre les concepts candidats d'un texte libre à ceux réellement "connus" du système (voir
 *  KNOWN_STRUCTURED_CONCEPTS) — ex. "LEGO Star Wars" → extractConcepts produit 5 candidats
 *  (lego/star/wars/legostar/star_wars), dont seuls `lego` et `star_wars` sont significatifs. */
function meaningfulConceptsOf(text: string): string[] {
  return extractConcepts(text).filter((c) => KNOWN_STRUCTURED_CONCEPTS.has(c));
}

type StructuredMatch = { matched: string[]; meaningful: string[]; coverage: number };

/** Calcule la couverture d'un texte libre contre les `entities` d'UN produit précis :
 *  `coverage = |concepts significatifs matchés| / |concepts significatifs extraits|`. Retourne
 *  `null` si le texte ne contient aucun concept significatif, ou si aucun ne matche ce produit —
 *  jamais un faux positif à coverage 0 (voir consigne §2, exemples Pokémon 1/1, LEGO Star Wars 1/2
 *  sur un produit `['lego']` seul). */
function structuredMatchOf(gift: CuratedGift, text: string): StructuredMatch | null {
  const meaningful = meaningfulConceptsOf(text);
  if (meaningful.length === 0) return null;
  const entitySet = new Set(gift.entities ?? []);
  const matched = meaningful.filter((c) => entitySet.has(c));
  if (matched.length === 0) return null;
  return { matched, meaningful, coverage: matched.length / meaningful.length };
}

type TextMatchResult = { kind: TextMatchKind; sourceText: string | null; coverage: number | null; matchedConcepts: string[] };

/**
 * Détermine LA meilleure correspondance texte libre pour CE produit précis (jamais cumulée),
 * dans l'ordre de force voulu : wish > favorite > detail > repli substring. Une correspondance
 * "entity" exige que `gift.entities` (concepts factuellement associés à CE produit, voir
 * giftCatalog.ts) recoupe au moins un concept SIGNIFICATIF extrait du texte libre (voir
 * `structuredMatchOf`) — jamais une correspondance sémantique/devinée. Si le produit n'a aucune
 * `entities` (cas très majoritaire, 114/162), ou si aucun concept significatif ne recoupe, retombe
 * sur le repli substring historique (`textMatch`, toujours un match "complet" de son propre palier
 * faible — pas de notion de couverture partielle à ce niveau, voir consigne §2) ; si RIEN ne
 * correspond, retourne `{ kind: null, coverage: null, ... }` — jamais de faux bonus, jamais de faux
 * "Pourquoi ?" (voir le cas "Star Wars" sans produit `star_wars`, rapport de chantier §5).
 */
function bestTextMatch(gift: CuratedGift, quiz: ReturnType<typeof normalizeQuizProfile>): TextMatchResult {
  const giftEntities = gift.entities;
  if (giftEntities && giftEntities.length > 0) {
    if (quiz.wish) {
      const m = structuredMatchOf(gift, quiz.wish);
      if (m) return { kind: 'wish_entity', sourceText: quiz.wish, coverage: m.coverage, matchedConcepts: m.matched };
    }
    const answersForTheme = quiz.themeAnswers[gift.theme];
    const favoriteText = answersForTheme?.favorite;
    if (favoriteText) {
      const m = structuredMatchOf(gift, favoriteText);
      if (m) return { kind: 'favorite_entity', sourceText: favoriteText, coverage: m.coverage, matchedConcepts: m.matched };
    }
    const detailText = answersForTheme?.detail;
    if (detailText) {
      const m = structuredMatchOf(gift, detailText);
      if (m) return { kind: 'detail_entity', sourceText: detailText, coverage: m.coverage, matchedConcepts: m.matched };
    }
  }
  if (textMatch(gift, collectFreeTexts(quiz))) {
    // Repli faible : on ne sait pas PRÉCISÉMENT quel texte a matché (mots significatifs, pas
    // concept unique) — jamais cité littéralement dans whyForContact pour cette raison, voir §6.
    // Pas de notion de couverture partielle ici : coverage=1 par convention (le palier lui-même est
    // déjà le plus faible, poids fixe 15, voir TEXT_MATCH_BONUS).
    return { kind: 'substring_fallback', sourceText: null, coverage: 1, matchedConcepts: [] };
  }
  return { kind: null, sourceText: null, coverage: null, matchedConcepts: [] };
}

/** Tous les produits "aimés" via ♡ sur ce contact, toutes recherches précédentes confondues —
 *  reconstruit à partir de l'historique plutôt que stocké à part, une seule source de vérité. */
function likedGiftsFor(history: ReturnType<typeof normalizeQuizProfile>['recommendationHistory']): CuratedGift[] {
  // CHANTIER "Phase 6B" (2026-09-21) — `likedGiftIds` (canonique) ; `normalizeQuizProfile` a déjà
  // résolu les entrées legacy `likedAsins`, un ASIN legacy introuvable est simplement absent ici.
  const likedIds = new Set(history.flatMap((h) => h.likedGiftIds ?? []));
  return CURATED_GIFTS.filter((g) => likedIds.has(g.id));
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
    if (l.id === gift.id) continue;
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
    const rejected = giftById(f.giftId);
    if (!rejected || rejected.id === gift.id) continue;
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
export function generateCandidates(contact: Contact, budget: BudgetRequest, excludeGiftIds: string[] = []): ScoredCandidate[] {
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
  // CHANTIER "Phase 6B" (2026-09-21) — exclusion par `gift.id` (canonique), plus jamais par ASIN :
  // voir GiftsScreen.tsx (sessionExcluded stocke désormais des `gift.id`, jamais des ASIN).
  const excludedSet = new Set(excludeGiftIds);

  const onInterests = CURATED_GIFTS.filter((g) => quiz.interests.includes(g.theme) && g.price <= budget.maxEuros);
  const pool = onInterests.length >= 6 ? onInterests : CURATED_GIFTS.filter((g) => g.price <= budget.maxEuros);

  return pool
    .filter(
      (g) =>
        !excludedSet.has(g.id) &&
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
      // CHANTIER "Phase 3" (2026-09-21) — `favoriteText`/`matchedSourceText` (cités littéralement
      // par whyForContact) ne sont conservés que sur un match COMPLET (coverage===1) : sur un match
      // partiel, whyForContact doit citer uniquement `matchedConcepts`, jamais le texte source
      // entier (voir consigne §4 — interdiction explicite de "Tu as indiqué LEGO Star Wars" sous un
      // produit qui n'a matché que `lego`).
      const isFullTextMatch = textMatchResult.coverage === 1;
      const favoriteText = textMatchResult.kind === 'favorite_entity' && isFullTextMatch ? textMatchResult.sourceText : null;
      const likedBonus = likedSimilarityBonus(g, liked);
      // CHANTIER "Phase 3 — correctif sémantique" (2026-09-21) — allowlist explicite (voir
      // taxonomyConflicts/TAXONOMY_CONFLICTS), remplace la règle générique invalidée par l'audit.
      const conflictResult = taxonomyConflicts(g, answersForTheme);
      // "Preuve spécifique" (consigne §5) : themeAnswerMatches (valeurs de taxonomie RÉELLEMENT
      // recoupées, jamais celles en conflit — un conflit et un match ne peuvent jamais coexister sur
      // la même comparaison de valeurs) + 1 si un match texte/entity STRUCTURÉ existe (complet ou
      // partiel, jamais substring_fallback ni aucun match). N'inclut JAMAIS interestMatch/trait/
      // simple présence dans le thème, explicitement exclus par la consigne.
      const isStructuredTextMatch = textMatchResult.kind !== null && textMatchResult.kind !== 'substring_fallback';
      const specificEvidenceCount = themeAnswerMatches + (isStructuredTextMatch ? 1 : 0);
      let score = 0;
      // Intérêt choisi et texte écrit à la main sont les deux signaux les plus fiables (jamais
      // inventés) — pondérés plus fort que les traits déduits du quiz général.
      if (interestMatch) score += 42;
      score += traitBonus(g, traits);
      score += themeAnswerMatches * 12;
      score += genericBonus;
      // Pénalité de conflit taxonomique — UNIQUEMENT les paires déclarées dans TAXONOMY_CONFLICTS
      // (allowlist explicite), jamais "aucune intersection = conflit". Centralisée : aucun mécanisme
      // séparé (l'ancien tagConflictPenalty gaming-only reste supprimé, consigne §4/§6).
      score -= conflictResult.penalty;
      score -= notStyleTaxonomyPenalty(g, quiz.feedback);
      // Le texte libre écrit à la main est déjà un signal réel et fiable (pas inventé) ; "je veux
      // plus personnel" amplifie ce signal EXISTANT plutôt que d'en fabriquer un nouveau — et pousse
      // en plus les objets au trait sentimental, qui sont par nature le genre de cadeau "personnel".
      // JAMAIS un filtre dur : un profil sans correspondance texte garde tous ses autres signaux
      // (intérêt/thème/trait) intacts, voir consigne §4.
      // CHANTIER "Phase 3" — bonus proportionnel à la couverture (arrondi déterministe), jamais un
      // tout-ou-rien : un match complet (coverage=1) conserve EXACTEMENT le poids Phase 1 (Math.round
      // d'un entier reste cet entier) ; un match partiel (ex. LEGO seul sur "LEGO Star Wars", 1/2)
      // reçoit une fraction proportionnelle du poids max, jamais le bonus plein (consigne §2).
      if (textMatchResult.kind && textMatchResult.coverage !== null) {
        const bonus = Math.round(TEXT_MATCH_BONUS[textMatchResult.kind] * textMatchResult.coverage);
        score += bonus + (wantsMorePersonal ? 10 : 0);
      }
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
          matchedSourceText: isFullTextMatch ? textMatchResult.sourceText : null,
          textMatchCoverage: textMatchResult.coverage,
          matchedConcepts: textMatchResult.matchedConcepts,
          favoriteText,
          likedSimilar: likedBonus >= 8,
          realConflictCount: conflictResult.realConflictCount,
          conflictingDimensions: conflictResult.conflictingDimensions,
          specificEvidenceCount,
        },
      };
    })
    .sort((a, b) => b.score - a.score || a.gift.price - b.gift.price);
}

/** CHANTIER "Quiz Cadeaux V2 — Phase 3" (2026-09-21) — pénalité douce appliquée UNIQUEMENT à la
 *  sélection (jamais à `candidate.score` lui-même) quand le `giftConcept` d'un candidat a déjà été
 *  retenu dans la sélection en cours — équivalent d'un match d'affinage thématique (même magnitude
 *  que +12 par valeur recoupée), pour rester "douce" : un produit nettement meilleur peut très bien
 *  rester sélectionné malgré le doublon (voir consigne §7). */
const DUPLICATE_GIFT_CONCEPT_PENALTY = 12;

/**
 * CHANTIER "Phase 3 — correctif sémantique" (2026-09-21) — un candidat est écarté de la sélection
 * (jamais du pool `generateCandidates`, ni de son `score` — uniquement de ce qui est montré) SI ET
 * SEULEMENT SI il porte ≥1 VRAI conflit taxonomique (voir TAXONOMY_CONFLICTS) ET ne possède AUCUNE
 * preuve spécifique compensatrice (`specificEvidenceCount === 0`, voir consigne §5) — jamais montré
 * juste pour "remplir" le Top 3 avec une idée manifestement incompatible et non compensée. Absence
 * de réponse ⇒ `realConflictCount` reste à 0 par construction (voir `taxonomyConflicts`) ⇒ jamais
 * exclu par cette règle (garantit explicitement le profil Kindle, consigne §9 — aucune affinage
 * `lecture` répondue, donc aucun conflit possible, quel que soit le manque d'évidence par ailleurs).
 * Aucun seuil de score global inventé : uniquement ce couple booléen conflit réel/preuve spécifique.
 */
function isEligibleForTop(candidate: ScoredCandidate): boolean {
  return !(candidate.reasons.realConflictCount > 0 && candidate.reasons.specificEvidenceCount === 0);
}

/**
 * `#1` = TOUJOURS le meilleur score BRUT (jamais ajusté) PARMI LES CANDIDATS ÉLIGIBLES (voir
 * `isEligibleForTop`). `#2`/`#3` : sélection gloutonne déterministe sur
 * `rawScore - DUPLICATE_GIFT_CONCEPT_PENALTY` si (et seulement si) le `giftConcept` du candidat a
 * déjà été choisi dans cette sélection — jamais sur `theme`/`entity`/`interest` identiques (les
 * profils Instax/Kindle prouvent qu'un Top 3 mono-thème peut être parfaitement pertinent, voir
 * rapport de chantier Phase 3 §2 : aucune redondance n'y est détectée sur `giftConcept`, donc ce
 * mécanisme n'y change rigoureusement rien). `candidates` arrive déjà trié par
 * `generateCandidates()` (score desc, prix asc) — cet ordre sert de tie-break déterministe : à
 * égalité de score ajusté, le candidat déjà le mieux classé dans cet ordre l'emporte (jamais un
 * choix aléatoire). Le Top peut donc légitimement contenir 1, 2 ou 3 recommandations selon le
 * nombre de candidats éligibles restants — `GiftsScreen`/`RecommendationCard` le supportent déjà
 * (aucune longueur fixe supposée, voir audit de faisabilité dédié).
 */
export function topRecommendations(candidates: ScoredCandidate[], n = 3): ScoredCandidate[] {
  const eligible = candidates.filter(isEligibleForTop);
  if (eligible.length === 0) return [];
  const pool = eligible.slice(); // ne modifie jamais le tableau reçu
  const selected: ScoredCandidate[] = [];
  const usedConcepts = new Set<string>();

  const first = pool.shift()!;
  selected.push(first);
  if (first.gift.giftConcept) usedConcepts.add(first.gift.giftConcept);

  while (selected.length < n && pool.length > 0) {
    let bestIndex = 0;
    let bestAdjusted = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const penalty = c.gift.giftConcept && usedConcepts.has(c.gift.giftConcept) ? DUPLICATE_GIFT_CONCEPT_PENALTY : 0;
      const adjusted = c.score - penalty;
      // Comparaison stricte (`>`) : `pool` est déjà trié score desc/prix asc, donc le premier
      // candidat qui bat strictement le meilleur ajusté courant l'emporte — un ex-aequo garde
      // toujours le candidat rencontré en premier dans cet ordre (tie-break déterministe, jamais
      // aléatoire), sans threading de comparaison additionnelle nécessaire.
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = i;
      }
    }
    const chosen = pool.splice(bestIndex, 1)[0];
    selected.push(chosen);
    if (chosen.gift.giftConcept) usedConcepts.add(chosen.gift.giftConcept);
  }
  return selected;
}

/** Rend un concept canonique lisible pour l'affichage (ex. "star_wars" → "Star wars") — dérivé
 *  MÉCANIQUEMENT du concept réellement matché, jamais un libellé inventé/reformulé. */
function displayConcept(concept: string): string {
  return concept
    .split('_')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
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
  // CHANTIER "Quiz Cadeaux V2 — Phase 1/3" (2026-09-21) — chaque branche ci-dessous ne s'active que
  // si `textMatchKind` correspond RÉELLEMENT au produit affiché (voir bestTextMatch) : plus jamais
  // de citation d'un texte libre qui n'a pas compté dans le score de CE produit précis (consigne
  // §6 Phase 1 — interdiction explicite du comportement "Tu as noté qu'il aime Star Wars" sous un
  // produit sans rapport réel). Phase 3 ajoute la distinction complet/partiel (consigne §4) : un
  // match COMPLET (coverage===1) peut citer le texte utilisateur intégral, un match PARTIEL ne cite
  // JAMAIS le texte brut — uniquement les concepts réellement matchés (ex. "LEGO", jamais "LEGO
  // Star Wars" si seul `lego` a matché).
  if (reasons.textMatchCoverage === 1 && reasons.textMatchKind === 'favorite_entity' && reasons.favoriteText) {
    tail = ` Tu as justement noté qu’${il} aime ${reasons.favoriteText}.`;
  } else if (reasons.textMatchCoverage === 1 && reasons.textMatchKind === 'wish_entity' && reasons.matchedSourceText) {
    tail = ` Ça correspond pile à ce que tu as noté qu’${il} aimerait avoir : « ${reasons.matchedSourceText.trim()} ».`;
  } else if (reasons.textMatchCoverage === 1 && reasons.textMatchKind === 'detail_entity' && reasons.matchedSourceText) {
    tail = ` Ça rejoint le détail que tu as donné sur ses goûts.`;
  } else if (
    reasons.textMatchCoverage !== null &&
    reasons.textMatchCoverage < 1 &&
    reasons.matchedConcepts.length > 0 &&
    (reasons.textMatchKind === 'wish_entity' || reasons.textMatchKind === 'favorite_entity' || reasons.textMatchKind === 'detail_entity')
  ) {
    // Match structuré PARTIEL (consigne §4) : ne cite QUE les concepts réellement matchés, jamais
    // le texte source complet — ex. "Ça correspond à son intérêt pour Lego." (jamais "LEGO Star
    // Wars" si `star_wars` n'a pas matché ce produit précis).
    tail = ` Ça correspond à son intérêt pour ${reasons.matchedConcepts.map(displayConcept).join(', ')}.`;
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
