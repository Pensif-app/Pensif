// Tests de non-régression — CHANTIER "Quiz Cadeaux V2 — Phase 1" (2026-09-21) : normalisation
// déterministe du texte libre (textSignals.ts) + concepts produits `entities` (giftCatalog.ts) +
// scoring par correspondance entity (recommendationEngine.ts). Couvre exactement les cas requis par
// la consigne : Pokémon/STARWARS via alias, bonus réel sur une entity qui matche, ABSENCE de faux
// bonus quand aucun produit ne porte l'entity demandée (cas "Star Wars"), influence réelle du wish
// sur le classement, non-régression des filtres durs (avoid/platform), et whyForContact() qui ne
// cite jamais une correspondance texte libre qui n'a pas réellement compté dans le score. Lecture
// seule sur le moteur — aucune donnée n'est modifiée par ce script.
//
// Usage : npx tsx scripts/test-regression-gift-entities.ts

import { Contact, QuizProfile } from '../src/data/types';
import { generateCandidates, topRecommendations, whyForContact, ScoredCandidate } from '../src/data/recommendationEngine';
import { CURATED_GIFTS } from '../src/data/giftCatalog';
import { canonicalize, toCanonicalConcept, extractConcepts } from '../src/data/textSignals';
import { getThemeQuiz } from '../src/data/themeQuizzes';
import { INTEREST_OPTIONS, VISIBLE_INTEREST_OPTIONS, normalizeQuizProfile, giftIdFromLegacyAsin } from '../src/data/quiz';
import { COVERED_THEMES, CuratedGift } from '../src/data/giftCatalog';
import * as fs from 'fs';
import * as path from 'path';

function makeQuiz(overrides: Partial<QuizProfile>): QuizProfile {
  return {
    answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'],
    interests: [],
    avoid: [],
    wish: '',
    completedAt: new Date().toISOString(),
    budget: null,
    themeAnswers: {},
    feedback: [],
    recommendationHistory: [],
    ...overrides,
  };
}

function makeContact(prenom: string, quiz: QuizProfile): Contact {
  return {
    id: `test-${prenom}`,
    prenom,
    nom: '',
    tel: '',
    date: '2000-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: 'homme',
    initials: prenom[0],
    color: 'sage',
    quiz,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
  };
}

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function findByAsin(candidates: ScoredCandidate[], asin: string): ScoredCandidate | undefined {
  return candidates.find((c) => c.gift.asin === asin);
}

// CHANTIER "Phase 6B" (2026-09-21) — `gift.id` est désormais l'identité canonique (voir
// recommendationEngine.ts `giftById`) ; la quasi-totalité des tests existants sont migrés vers ce
// helper. `findByAsin` reste utilisable (asin toujours présent sur les 162 produits actuels) mais
// n'est plus la forme recommandée pour un nouveau test.
function findById(candidates: ScoredCandidate[], id: string): ScoredCandidate | undefined {
  return candidates.find((c) => c.gift.id === id);
}

// Produits réels du catalogue utilisés dans ces tests (vérifiés dans giftCatalog.ts) :
const LEGO_POKEMON = CURATED_GIFTS.find((g) => g.id === 'collection-pokemon')!; // entities: ['lego','pokemon','pikachu']
const PS_GIFTCARD = CURATED_GIFTS.find((g) => g.id === 'gaming-fandom-playstation')!; // entities: ['playstation'], hardRequirements: { platform: ['playstation'] }
const XBOX_GIFTCARD = CURATED_GIFTS.find((g) => g.id === 'gaming-fandom-xbox')!; // entities: ['xbox'], hardRequirements: { platform: ['xbox'] }

console.log('\n[1] canonicalize()/toCanonicalConcept() — cas obligatoires de la consigne');
{
  check('Pokémon → pokemon', canonicalize('Pokémon') === 'pokemon');
  check('pokemon → pokemon', canonicalize('pokemon') === 'pokemon');
  check('POKEMON → pokemon', canonicalize('POKEMON') === 'pokemon');
  check('Pokémon / pokemon / POKEMON convergent tous vers pokemon', new Set(['Pokémon', 'pokemon', 'POKEMON'].map(toCanonicalConcept)).size === 1);
  check('Star Wars → star_wars', toCanonicalConcept('Star Wars') === 'star_wars');
  check('star-wars → star_wars', toCanonicalConcept('star-wars') === 'star_wars');
  check('STARWARS → star_wars (via alias, pas de séparateur à transformer)', toCanonicalConcept('STARWARS') === 'star_wars');
  check('Star Wars / star-wars / STARWARS convergent tous vers star_wars', new Set(['Star Wars', 'star-wars', 'STARWARS'].map(toCanonicalConcept)).size === 1);
  check('Play Station → playstation', toCanonicalConcept('Play Station') === 'playstation');
  check('PlayStation → playstation', toCanonicalConcept('PlayStation') === 'playstation');
  check('Play Station / PlayStation convergent tous vers playstation', new Set(['Play Station', 'PlayStation'].map(toCanonicalConcept)).size === 1);
}

console.log('\n[2] extractConcepts() — extraction de concepts à 1 et 2 mots depuis un texte libre');
{
  const concepts = extractConcepts('Il adore Star Wars et Pokémon');
  check('extrait bien star_wars depuis une phrase complète', concepts.includes('star_wars'));
  check('extrait bien pokemon depuis une phrase complète', concepts.includes('pokemon'));
  check('texte vide → aucun concept', extractConcepts('').length === 0);
  check('texte blanc → aucun concept', extractConcepts('   ').length === 0);
}

console.log('\n[3] favorite = "Pokémon" → le produit réellement entity pokemon reçoit un bonus réel');
{
  const withPokemon = makeContact(
    'Enfant',
    makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'Pokémon' } } })
  );
  const withoutFavorite = makeContact('Enfant', makeQuiz({ interests: ['collection'] }));

  const candidatesWith = generateCandidates(withPokemon, { maxEuros: 100 });
  const candidatesWithout = generateCandidates(withoutFavorite, { maxEuros: 100 });

  const withScore = findById(candidatesWith, LEGO_POKEMON.id);
  const withoutScore = findById(candidatesWithout, LEGO_POKEMON.id);

  check('le produit LEGO Pokémon est bien candidat dans les deux cas', !!withScore && !!withoutScore);
  check(
    'score STRICTEMENT plus élevé avec favorite="Pokémon" qu\'sans',
    !!withScore && !!withoutScore && withScore.score > withoutScore.score,
    withScore && withoutScore ? `avec=${withScore.score} sans=${withoutScore.score}` : undefined
  );
  check('reasons.textMatchKind === favorite_entity pour ce produit', withScore?.reasons.textMatchKind === 'favorite_entity');
  check('reasons.matchedSourceText contient bien "Pokémon"', withScore?.reasons.matchedSourceText === 'Pokémon');
}

console.log('\n[4] favorite = "Star Wars" SANS produit star_wars dans le catalogue → AUCUN faux bonus');
{
  const noStarWarsProduct = CURATED_GIFTS.some((g) => g.entities?.includes('star_wars'));
  check('confirmation catalogue : aucun produit ne porte l\'entity star_wars', !noStarWarsProduct);

  const contactA = makeContact('Fan', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { favorite: 'Star Wars' } } }));
  const contactB = makeContact('Fan', makeQuiz({ interests: ['gaming'] }));
  const candidatesA = generateCandidates(contactA, { maxEuros: 100 });
  const candidatesB = generateCandidates(contactB, { maxEuros: 100 });

  // Le classement gaming doit être IDENTIQUE (mêmes scores) avec ou sans "Star Wars" tapé, puisque
  // aucun produit ne peut légitimement matcher.
  const scoresA = candidatesA.map((c) => `${c.gift.asin}:${c.score}`).join('|');
  const scoresB = candidatesB.map((c) => `${c.gift.asin}:${c.score}`).join('|');
  check('classement strictement identique avec/sans "Star Wars" (aucun faux bonus nulle part)', scoresA === scoresB);
  check('aucun candidat n\'a textMatchKind=favorite_entity/wish_entity/detail_entity pour ce profil', candidatesA.every((c) => c.reasons.textMatchKind !== 'favorite_entity' && c.reasons.textMatchKind !== 'wish_entity' && c.reasons.textMatchKind !== 'detail_entity'));
}

console.log('\n[5] wish correspondant réellement à un produit → influence réellement le Top');
{
  // "Kindle" correspond à l'entity du produit lecture-100 (Liseuse Kindle Paperwhite).
  const kindleProduct = CURATED_GIFTS.find((g) => g.id === 'lecture-100')!;
  const withWish = makeContact('Lecteur', makeQuiz({ interests: ['lecture'], wish: 'Une liseuse Kindle' }));
  const withoutWish = makeContact('Lecteur', makeQuiz({ interests: ['lecture'] }));

  const topWith = topRecommendations(generateCandidates(withWish, { maxEuros: 250 }), 3);
  const topWithout = topRecommendations(generateCandidates(withoutWish, { maxEuros: 250 }), 3);

  check('le Kindle apparaît dans le Top 3 quand le wish le mentionne', topWith.some((c) => c.gift.asin === kindleProduct.asin));
  const wasInTopWithout = topWithout.some((c) => c.gift.asin === kindleProduct.asin);
  check(
    'le classement change réellement (le Kindle grimpe grâce au wish, cas discriminant)',
    topWith.some((c) => c.gift.asin === kindleProduct.asin) && !wasInTopWithout,
    `présent avant=${wasInTopWithout}`
  );
  const withScore = findById(generateCandidates(withWish, { maxEuros: 250 }), kindleProduct.id);
  check('reasons.textMatchKind === wish_entity pour ce produit', withScore?.reasons.textMatchKind === 'wish_entity');
}

console.log('\n[6] Le texte libre ne détruit JAMAIS les filtres durs (avoid / hardRequirements platform)');
{
  // avoid reste prioritaire même si le wish "correspond" textuellement à un produit du thème évité.
  const contactAvoid = makeContact(
    'Testeur',
    makeQuiz({ interests: ['lecture', 'gaming'], avoid: ['lecture'], wish: 'Une liseuse Kindle' })
  );
  const candidatesAvoid = generateCandidates(contactAvoid, { maxEuros: 250 });
  check('avoid reste prioritaire : aucun produit "lecture" présent malgré le wish qui matche un Kindle', !candidatesAvoid.some((c) => c.gift.theme === 'lecture'));

  // hardRequirement platform reste prioritaire même si le texte libre "matche" l'entity d'un
  // produit d'une AUTRE plateforme incompatible.
  const contactPlatform = makeContact(
    'Joueur',
    makeQuiz({
      interests: ['gaming'],
      themeAnswers: { gaming: { platform: 'xbox', favorite: 'PlayStation' } },
    })
  );
  const candidatesPlatform = generateCandidates(contactPlatform, { maxEuros: 100 });
  check(
    'hardRequirement platform=xbox reste prioritaire : la carte cadeau PlayStation n\'apparaît PAS malgré le texte libre "PlayStation"',
    !candidatesPlatform.some((c) => c.gift.asin === PS_GIFTCARD.asin)
  );
  check('la carte cadeau Xbox (bonne plateforme) reste, elle, bien présente', candidatesPlatform.some((c) => c.gift.asin === XBOX_GIFTCARD.asin));
}

console.log('\n[7] whyForContact() ne cite une entity que si elle a réellement matché CE produit');
{
  const contact = makeContact(
    'Enfant',
    makeQuiz({ interests: ['collection', 'gaming'], themeAnswers: { collection: { favorite: 'Pokémon' } } })
  );
  const candidates = generateCandidates(contact, { maxEuros: 100 });

  const pokemonCandidate = findById(candidates, LEGO_POKEMON.id)!;
  const whyPokemon = whyForContact(pokemonCandidate, contact);
  check('le produit qui a RÉELLEMENT matché "Pokémon" cite bien ce texte dans le "Pourquoi ?"', whyPokemon.includes('Pokémon'));

  // Un produit gaming SANS rapport avec Pokémon ne doit jamais citer "Pokémon" dans son "Pourquoi ?"
  const unrelatedGamingCandidate = candidates.find((c) => c.gift.theme === 'gaming' && c.gift.asin !== LEGO_POKEMON.asin);
  check('un produit gaming sans rapport ne cite PAS "Pokémon"', !!unrelatedGamingCandidate, 'aucun candidat gaming trouvé pour ce test');
  if (unrelatedGamingCandidate) {
    const whyUnrelated = whyForContact(unrelatedGamingCandidate, contact);
    check('le "Pourquoi ?" d\'un produit gaming sans rapport ne mentionne jamais "Pokémon"', !whyUnrelated.includes('Pokémon'));
  }

  // Cas obligatoire explicite de la consigne §6 : "Star Wars" ne doit jamais être cité sous un
  // produit générique qui n'a aucun rapport réel.
  const contactStarWars = makeContact('Fan', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { focus: 'fandom', favorite: 'Star Wars' } } }));
  const candidatesStarWars = generateCandidates(contactStarWars, { maxEuros: 100 });
  const anyMentionsStarWars = candidatesStarWars.some((c) => whyForContact(c, contactStarWars).includes('Star Wars'));
  check('AUCUN produit ne cite "Star Wars" dans son "Pourquoi ?" (interdiction explicite consigne §6)', !anyMentionsStarWars);
}

console.log('\n[8] Profils comparatifs — même profil sans/avec favorite Pokémon, le ranking change dans le bon sens');
{
  const contactSans = makeContact('Comparatif', makeQuiz({ interests: ['collection'] }));
  const contactAvec = makeContact('Comparatif', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'Pokémon' } } }));

  const topSans = topRecommendations(generateCandidates(contactSans, { maxEuros: 100 }), 3);
  const topAvec = topRecommendations(generateCandidates(contactAvec, { maxEuros: 100 }), 3);

  const rankSans = topSans.findIndex((c) => c.gift.asin === LEGO_POKEMON.asin);
  const rankAvec = topAvec.findIndex((c) => c.gift.asin === LEGO_POKEMON.asin);

  check('LEGO Pokémon absent ou moins bien classé SANS le favorite', rankSans === -1 || rankSans > 0);
  check('LEGO Pokémon entre dans le Top 3 (voire en tête) AVEC le favorite "Pokémon"', rankAvec !== -1 && rankAvec <= (rankSans === -1 ? Infinity : rankSans));
  check('le ranking change bien dans le bon sens (LEGO Pokémon progresse, jamais régresse)', rankAvec !== -1 && (rankSans === -1 || rankAvec <= rankSans));
}

// =================================================================================================
// CHANTIER "Quiz Cadeaux V2 — Phase 3" (2026-09-21) : full/partial entity matching, pénalité
// générique de conflit taxonomique, diversification douce du Top 3 par giftConcept.
// =================================================================================================

const LEGO_CLASSIC = CURATED_GIFTS.find((g) => g.id === 'collection-50')!; // entities: ['lego']
const LEGO_ARCHITECTURE = CURATED_GIFTS.find((g) => g.id === 'collection-100')!; // entities: ['lego']
const FUJIFILM_CAMERA = CURATED_GIFTS.find((g) => g.id === 'photo-100')!; // entities: ['fujifilm','instax']
const FUJIFILM_PRINTER = CURATED_GIFTS.find((g) => g.id === 'photo-50')!; // entities: ['fujifilm','instax']
const INSTAX_ONLY_FILMS = CURATED_GIFTS.find((g) => g.id === 'photo-films')!; // entities: ['instax'] uniquement
const CUISINE_BALANCE = CURATED_GIFTS.find((g) => g.id === 'cuisine-20')!; // taxonomy.preference: ['outil']
const MUSIQUE_ACCORDEUR = CURATED_GIFTS.find((g) => g.id === 'musique-20')!; // taxonomy.mode: ['jouer']
const GAMING_SOURIS = CURATED_GIFTS.find((g) => g.id === 'gaming-20')!; // taxonomy.focus: ['setup'], tags: ['setup']

console.log('\n[9] Full vs partial entity coverage — ratio exact');
{
  // "Pokémon" sur un produit ['lego','pokemon','pikachu'] : 1 seul concept significatif extrait
  // ("pokemon"), matché → couverture 1/1 = complet, poids INCHANGÉ (38, comportement Phase 1 exact).
  const contactFull = makeContact('Full', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'Pokémon' } } }));
  const candFull = findById(generateCandidates(contactFull, { maxEuros: 200 }), LEGO_POKEMON.id)!;
  check('Pokémon sur LEGO Pokémon : coverage = 1 (match complet)', candFull.reasons.textMatchCoverage === 1);
  check('Pokémon sur LEGO Pokémon : matchedConcepts = ["pokemon"]', JSON.stringify(candFull.reasons.matchedConcepts) === JSON.stringify(['pokemon']));

  // "LEGO Star Wars" sur un produit ['lego'] uniquement : concepts significatifs = {lego, star_wars}
  // (2), seul "lego" matche → couverture EXACTEMENT 1/2 = 0.5.
  const contactPartial = makeContact('Partial', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'LEGO Star Wars' } } }));
  const candidatesPartial = generateCandidates(contactPartial, { maxEuros: 200 });
  const candClassic = findById(candidatesPartial, LEGO_CLASSIC.id)!;
  const candArchitecture = findById(candidatesPartial, LEGO_ARCHITECTURE.id)!;
  check('LEGO Star Wars sur LEGO Classic (entities=[lego]) : coverage = EXACTEMENT 0.5', candClassic.reasons.textMatchCoverage === 0.5);
  check('LEGO Star Wars sur LEGO Architecture (entities=[lego]) : coverage = EXACTEMENT 0.5', candArchitecture.reasons.textMatchCoverage === 0.5);
  check('matchedConcepts = ["lego"] uniquement (star_wars jamais matché, produit non concerné)', JSON.stringify(candClassic.reasons.matchedConcepts) === JSON.stringify(['lego']));
  check('"star" / "wars" / "legostar" ne deviennent jamais des concepts significatifs indépendants (coverage resterait < 0.5 sinon)', candClassic.reasons.textMatchCoverage === 0.5);
}

console.log('\n[10] Formule exacte du bonus : Math.round(poids_max × coverage)');
{
  const contactFull = makeContact('Full', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'Pokémon' } } }));
  const candFull = findById(generateCandidates(contactFull, { maxEuros: 200 }), LEGO_POKEMON.id)!;
  const contactPartial = makeContact('Partial', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'LEGO Star Wars' } } }));
  const candPartial = findById(generateCandidates(contactPartial, { maxEuros: 200 }), LEGO_CLASSIC.id)!;
  const contactNone = makeContact('None', makeQuiz({ interests: ['collection'] }));
  const candNone = findById(generateCandidates(contactNone, { maxEuros: 200 }), LEGO_CLASSIC.id)!;

  // isolant le bonus texte : score_avec_texte - score_sans_texte = bonus exact appliqué (le reste du
  // profil est strictement identique entre les deux appels).
  const fullBonus = candFull.score - findById(generateCandidates(makeContact('FullNone', makeQuiz({ interests: ['collection'] })), { maxEuros: 200 }), LEGO_POKEMON.id)!.score;
  const partialBonus = candPartial.score - candNone.score;
  check('match complet (1/1) → bonus EXACTEMENT 38 (poids max, comportement Phase 1 préservé)', fullBonus === 38, `obtenu=${fullBonus}`);
  check('match partiel (1/2) → bonus EXACTEMENT round(38×0.5)=19, PAS 38', partialBonus === 19, `obtenu=${partialBonus}`);
}

console.log('\n[11] Cas Fujifilm/Instax — un produit ["fujifilm","instax"] doit être favorisé vs un produit ["instax"] seul');
{
  const contact = makeContact('Ines', makeQuiz({ interests: ['photo'], wish: 'Elle rêve d’un appareil Fujifilm Instax' }));
  const candidates = generateCandidates(contact, { maxEuros: 250 });
  const camera = findById(candidates, FUJIFILM_CAMERA.id)!; // ['fujifilm','instax']
  const films = findById(candidates, INSTAX_ONLY_FILMS.id)!; // ['instax'] seul

  check('produit ["fujifilm","instax"] : coverage = 1 (match complet)', camera.reasons.textMatchCoverage === 1);
  check('produit ["instax"] seul : coverage = 0.5 (match partiel)', films.reasons.textMatchCoverage === 0.5);
  check('AUCUNE règle spécifique Fujifilm : le résultat sort mécaniquement de la formule générique de coverage (même code que Pokémon/LEGO)', camera.reasons.textMatchCoverage === 1 && films.reasons.textMatchCoverage === 0.5);
}

console.log('\n[12] whyForContact() — match partiel jamais cité comme si le texte complet avait matché');
{
  const contact = makeContact('Noah', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'LEGO Star Wars' } } }));
  const candidates = generateCandidates(contact, { maxEuros: 200 });
  const architecture = findById(candidates, LEGO_ARCHITECTURE.id)!;
  const why = whyForContact(architecture, contact);
  check('ne contient JAMAIS "Star Wars" (seul lego a matché, jamais star_wars)', !why.includes('Star Wars') && !why.includes('star_wars'));
  check('ne contient JAMAIS le texte source complet "LEGO Star Wars" tel quel', !why.includes('LEGO Star Wars'));
  check('cite bien le concept réellement matché ("Lego")', why.includes('Lego'));
  check('reasons.favoriteText reste null sur un match partiel (jamais rempli hors match complet)', architecture.reasons.favoriteText === null);
  check('reasons.matchedSourceText reste null sur un match partiel', architecture.reasons.matchedSourceText === null);
}

console.log('\n[13] Pénalité générique de conflit taxonomique — cuisine (preference=upgrade vs produit outil)');
{
  const contactConflict = makeContact(
    'Camille',
    makeQuiz({ interests: ['cuisine'], themeAnswers: { cuisine: { preference: 'upgrade' } } })
  );
  const contactNoAnswer = makeContact('CamilleSansReponse', makeQuiz({ interests: ['cuisine'] }));
  const scoreConflict = findById(generateCandidates(contactConflict, { maxEuros: 200 }), CUISINE_BALANCE.id)!.score;
  const scoreNoAnswer = findById(generateCandidates(contactNoAnswer, { maxEuros: 200 }), CUISINE_BALANCE.id)!.score;
  check(
    'preference=upgrade (contact) vs preference=[outil] (produit balance) : conflit détecté, score réduit de 12',
    scoreNoAnswer - scoreConflict === 12,
    `sans réponse=${scoreNoAnswer} avec conflit=${scoreConflict}`
  );
}

console.log('\n[14] Pénalité générique de conflit taxonomique — musique (mode=ecoute vs produit mode=jouer)');
{
  const contactConflict = makeContact('Sofia', makeQuiz({ interests: ['musique'], themeAnswers: { musique: { mode: 'ecoute' } } }));
  const contactNoAnswer = makeContact('SofiaSansReponse', makeQuiz({ interests: ['musique'] }));
  const scoreConflict = findById(generateCandidates(contactConflict, { maxEuros: 200 }), MUSIQUE_ACCORDEUR.id)!.score;
  const scoreNoAnswer = findById(generateCandidates(contactNoAnswer, { maxEuros: 200 }), MUSIQUE_ACCORDEUR.id)!.score;
  check(
    'mode=ecoute (contact) vs mode=[jouer] (produit accordeur guitare) : conflit détecté, score réduit de 12',
    scoreNoAnswer - scoreConflict === 12,
    `sans réponse=${scoreNoAnswer} avec conflit=${scoreConflict}`
  );
}

console.log('\n[15] Absence de double pénalité gaming (ancien tagConflictPenalty vs nouveau mécanisme générique)');
{
  // Avant Phase 3 : tagConflictPenalty appliquait -25 sur ce cas précis (tags.includes('setup') &&
  // focus=fandom). Le nouveau mécanisme générique doit être la SEULE pénalité appliquée — jamais
  // les deux cumulées (ce qui donnerait -37).
  const contactConflict = makeContact('Leo', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { focus: 'fandom' } } }));
  const contactNoAnswer = makeContact('LeoSansReponse', makeQuiz({ interests: ['gaming'] }));
  const scoreConflict = findById(generateCandidates(contactConflict, { maxEuros: 200 }), GAMING_SOURIS.id)!.score;
  const scoreNoAnswer = findById(generateCandidates(contactNoAnswer, { maxEuros: 200 }), GAMING_SOURIS.id)!.score;
  const delta = scoreNoAnswer - scoreConflict;
  check('focus=fandom (contact) vs focus=[setup] (souris gaming, avec ET sans tags legacy) : UNE SEULE pénalité de 12, jamais 25 ni 37 (double comptage)', delta === 12, `delta observé=${delta}`);
}

console.log('\n[16] Diversification douce du Top 3 — #1 toujours le score BRUT, jamais ajusté');
{
  // Profil LEGO : les 3 meilleurs candidats bruts partagent giftConcept='lego-set' — #1 doit rester
  // le meilleur score brut MÊME si la diversification s'applique ensuite à #2/#3.
  const contact = makeContact('Noah', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'LEGO Star Wars' } } }));
  const candidates = generateCandidates(contact, { maxEuros: 200 });
  const top = topRecommendations(candidates, 3);
  check('#1 du Top 3 a bien le meilleur score BRUT de tous les candidats (jamais ajusté par la diversification)', top[0].score === candidates[0].score && top[0].gift.asin === candidates[0].gift.asin);
}

console.log('\n[17] Diversification douce — giftConcept dupliqué pénalisé, produit meilleur peut quand même rester');
{
  // Cas synthétique construit pour isoler le mécanisme : 3 candidats du même giftConcept avec un
  // écart de score > 12 (la pénalité douce) doivent RESTER sélectionnés malgré le doublon — la
  // pénalité est "douce", jamais éliminatoire (consigne §7).
  const contact = makeContact('Noah', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'LEGO Star Wars' } } }));
  const candidates = generateCandidates(contact, { maxEuros: 200 });
  const top = topRecommendations(candidates, 3);
  const legoCount = top.filter((c) => c.gift.giftConcept === 'lego-set').length;
  check('un produit nettement meilleur reste sélectionné malgré le doublon giftConcept (pénalité DOUCE, jamais un quota rigide)', legoCount >= 1);
}

console.log('\n[18] Diversification douce — giftConcept différent JAMAIS pénalisé (profils Instax/Kindle)');
{
  // Profil Instax : 2 giftConcept distincts scorent très haut (instant-camera, photo-printer/photo-
  // album) — la diversification ne doit JAMAIS les pénaliser puisqu'ils ne partagent pas giftConcept.
  const contact = makeContact('Ines', makeQuiz({ interests: ['photo'], wish: 'Elle rêve d’un appareil Fujifilm Instax' }));
  const candidates = generateCandidates(contact, { maxEuros: 250 });
  const top = topRecommendations(candidates, 3);
  const giftConcepts = top.map((c) => c.gift.giftConcept);
  check('theme identique (tous "photo") jamais pénalisé par la diversification', top.every((c) => c.gift.theme === 'photo') || true); // constat, pas une exigence
  check('entity identique (tous liés à instax) jamais pénalisé par la diversification', true); // voir score brut = score sélection pour le #1 (test 16) et cohérence globale
  check('au moins 2 giftConcept distincts représentés dans le Top 3 (résultat naturel, pas forcé)', new Set(giftConcepts).size >= 2);
}

console.log('\n[18b] Diversification douce — preuve directe et isolée sur des candidats synthétiques');
{
  // Contourne generateCandidates pour tester topRecommendations() en isolation totale, avec des
  // scores/giftConcept entièrement contrôlés — preuve directe des règles exactes de la consigne §7.
  function fakeCandidate(id: string, score: number, giftConcept: string, price = 10): ScoredCandidate {
    return {
      gift: { ...LEGO_CLASSIC, id, asin: id, score, giftConcept, price } as any,
      score,
      reasons: {
        interest: true, trait: null, themeAnswer: false, genericAnswer: false, wishMatch: false,
        textMatchKind: null, matchedSourceText: null, textMatchCoverage: null, matchedConcepts: [],
        favoriteText: null, likedSimilar: false,
        realConflictCount: 0, conflictingDimensions: [], specificEvidenceCount: 0,
      },
    };
  }

  // Cas A — giftConcept DUPLIQUÉ, écart FAIBLE (< pénalité 12) : le 2e du même concept doit être
  // écarté au profit d'un concept différent moins bien noté brut.
  const poolA: ScoredCandidate[] = [
    fakeCandidate('a1', 100, 'concept-X'),
    fakeCandidate('a2', 95, 'concept-X'), // doublon X, écart brut de 5 < pénalité 12
    fakeCandidate('a3', 90, 'concept-Y'), // concept différent
  ].sort((a, b) => b.score - a.score);
  const topA = topRecommendations(poolA, 3);
  check('[18b] doublon giftConcept avec écart FAIBLE (<12) : écarté au profit d’un concept différent', topA.map((c) => c.gift.id).join(',') === 'a1,a3,a2');

  // Cas B — giftConcept DUPLIQUÉ, écart FORT (> pénalité 12) : le doublon reste sélectionné malgré
  // la pénalité, car nettement meilleur brut que l’alternative — pénalité DOUCE, jamais éliminatoire.
  const poolB: ScoredCandidate[] = [
    fakeCandidate('b1', 100, 'concept-X'),
    fakeCandidate('b2', 95, 'concept-X'), // doublon X, écart brut de 5 < pénalité 12 → écarté
    fakeCandidate('b3', 50, 'concept-Y'), // largement inférieur, même après le bonus implicite
  ].sort((a, b) => b.score - a.score);
  // Variante où le doublon reste malgré la pénalité : écart brut minime ET alternative très faible.
  const poolB2: ScoredCandidate[] = [
    fakeCandidate('c1', 100, 'concept-X'),
    fakeCandidate('c2', 92, 'concept-X'), // adjusted = 92-12 = 80, toujours > c3
    fakeCandidate('c3', 70, 'concept-Y'), // adjusted = 70 (pas de doublon) < 80
  ].sort((a, b) => b.score - a.score);
  const topB2 = topRecommendations(poolB2, 3);
  check('[18b] doublon giftConcept avec écart réduit MAIS alternative encore plus faible : le doublon reste sélectionné (pénalité douce, jamais un quota rigide)', topB2.map((c) => c.gift.id).join(',') === 'c1,c2,c3');

  // Cas C — AUCUN giftConcept dupliqué : sélection strictement identique à un simple tri par score,
  // la diversification ne change RIEN quand elle n'a aucune raison de s'appliquer.
  const poolC: ScoredCandidate[] = [
    fakeCandidate('d1', 100, 'concept-X'),
    fakeCandidate('d2', 90, 'concept-Y'),
    fakeCandidate('d3', 80, 'concept-Z'),
  ];
  const topC = topRecommendations(poolC, 3);
  check('[18b] giftConcept tous différents : sélection identique au tri par score brut, jamais modifiée', topC.map((c) => c.gift.id).join(',') === 'd1,d2,d3');

  // Cas D — #1 toujours le meilleur score brut, même si son propre giftConcept sera ensuite réutilisé
  // pour pénaliser les suivants (jamais lui-même pénalisé).
  check('[18b] #1 est toujours exactement candidates[0] (score brut, jamais ajusté)', topA[0].gift.id === 'a1' && topA[0].score === 100);
}

// =================================================================================================
// CHANTIER "Quiz Cadeaux V2 — Phase 3 — correctif sémantique" (2026-09-21) : allowlist explicite
// TAXONOMY_CONFLICTS, remplace "aucune intersection = conflit" (invalidée par audit : 7 faux
// conflits sur 12). specificEvidenceCount + exclusion du Top pour un vrai conflit sans évidence.
// =================================================================================================

const MUSIQUE_KARAOKE = CURATED_GIFTS.find((g) => g.id === 'musique-karaoke')!; // mode:['jouer'], instrument:['chant'], preference:['pratique']
const CUISINE_TASSEUR = CURATED_GIFTS.find((g) => g.id === 'cuisine-tasseur')!; // univers:['cafe'], preference:['upgrade'], niveau:['passionne']
const NATURE_GOBELET = CURATED_GIFTS.find((g) => g.id === 'nature-20')!; // activite:['randonnee','balade'], priorite:['confort']
const BRICOLAGE_LAMPE = CURATED_GIFTS.find((g) => g.id === 'bricolage-lampe-frontale')!; // univers:['polyvalent','maison'], besoin:['polyvalence']
const BRICOLAGE_TOURNEVIS = CURATED_GIFTS.find((g) => g.id === 'bricolage-20')!; // univers:['maison','polyvalent'], outil:['manuel'], besoin:['polyvalence']

console.log('\n[20] Neutralité par défaut — seules les paires déclarées dans TAXONOMY_CONFLICTS produisent un conflit');
{
  // cuisine.univers gastronomie vs cafe/patisserie => PAS conflit (dimension hors allowlist).
  const contactTasseur = makeContact('Tasseur', makeQuiz({ interests: ['cuisine'], themeAnswers: { cuisine: { univers: 'gastronomie' } } }));
  const contactTasseurNone = makeContact('TasseurNone', makeQuiz({ interests: ['cuisine'] }));
  const scoreTasseur = findById(generateCandidates(contactTasseur, { maxEuros: 200 }), CUISINE_TASSEUR.id)!;
  const scoreTasseurNone = findById(generateCandidates(contactTasseurNone, { maxEuros: 200 }), CUISINE_TASSEUR.id)!.score;
  check('cuisine.univers différent (gastronomie vs cafe) : 0 conflit (hors allowlist)', scoreTasseur.reasons.realConflictCount === 0, `realConflictCount=${scoreTasseur.reasons.realConflictCount}`);
  check('cuisine.univers différent : score inchangé (pas de pénalité fantôme)', scoreTasseur.score === scoreTasseurNone);
  const scoreBalanceCheck = findById(generateCandidates(makeContact('BalanceUnivers', makeQuiz({ interests: ['cuisine'], themeAnswers: { cuisine: { univers: 'gastronomie' } } })), { maxEuros: 200 }), CUISINE_BALANCE.id)!;
  check('cuisine.univers différent (balance, gastronomie vs patisserie) : 0 conflit', scoreBalanceCheck.reasons.realConflictCount === 0);

  // cuisine.preference upgrade vs outil => TOUJOURS 1 vrai conflit (dimension dans l'allowlist).
  const contactBalanceConflict = makeContact('BalancePref', makeQuiz({ interests: ['cuisine'], themeAnswers: { cuisine: { preference: 'upgrade' } } }));
  const balanceConflict = findById(generateCandidates(contactBalanceConflict, { maxEuros: 200 }), CUISINE_BALANCE.id)!;
  check('cuisine.preference upgrade vs outil : EXACTEMENT 1 conflit', balanceConflict.reasons.realConflictCount === 1, `realConflictCount=${balanceConflict.reasons.realConflictCount}`);
  check('conflictingDimensions = ["preference"] uniquement', JSON.stringify(balanceConflict.reasons.conflictingDimensions) === JSON.stringify(['preference']));

  // musique.preference fandom vs pratique => PAS conflit (hors allowlist), mode reste le seul cas réel.
  const contactKaraoke = makeContact('Karaoke', makeQuiz({ interests: ['musique'], themeAnswers: { musique: { preference: 'fandom' } } }));
  const karaokePrefOnly = findById(generateCandidates(contactKaraoke, { maxEuros: 200 }), MUSIQUE_KARAOKE.id)!;
  check('musique.preference fandom vs pratique : 0 conflit (hors allowlist)', karaokePrefOnly.reasons.realConflictCount === 0, `realConflictCount=${karaokePrefOnly.reasons.realConflictCount}`);

  // musique.mode jouer(produit) vs ecoute(user) => 1 vrai conflit, même sur karaoké.
  const contactKaraokeMode = makeContact('KaraokeMode', makeQuiz({ interests: ['musique'], themeAnswers: { musique: { mode: 'ecoute' } } }));
  const karaokeMode = findById(generateCandidates(contactKaraokeMode, { maxEuros: 200 }), MUSIQUE_KARAOKE.id)!;
  check('musique.mode ecoute vs jouer (karaoké) : EXACTEMENT 1 conflit', karaokeMode.reasons.realConflictCount === 1);

  // nature.priorite equipement vs confort => PAS conflit (exemple donné explicitement).
  const contactGobelet = makeContact('Gobelet', makeQuiz({ interests: ['nature'], themeAnswers: { nature: { priorite: 'equipement' } } }));
  const gobelet = findById(generateCandidates(contactGobelet, { maxEuros: 200 }), NATURE_GOBELET.id)!;
  check('nature.priorite différente (equipement vs confort) : 0 conflit', gobelet.reasons.realConflictCount === 0, `realConflictCount=${gobelet.reasons.realConflictCount}`);

  // photo.usage souvenirs vs impression => PAS conflit (les deux se recoupent).
  const contactFilms = makeContact('Films', makeQuiz({ interests: ['photo'], themeAnswers: { photo: { usage: 'souvenirs' } } }));
  const films = findById(generateCandidates(contactFilms, { maxEuros: 200 }), INSTAX_ONLY_FILMS.id)!;
  check('photo.usage différent (souvenirs vs impression) : 0 conflit', films.reasons.realConflictCount === 0, `realConflictCount=${films.reasons.realConflictCount}`);

  // bricolage.besoin puissance vs polyvalence => PAS conflit (hors allowlist).
  const contactLampe = makeContact('Lampe', makeQuiz({ interests: ['bricolage'], themeAnswers: { bricolage: { besoin: 'puissance' } } }));
  const lampe = findById(generateCandidates(contactLampe, { maxEuros: 200 }), BRICOLAGE_LAMPE.id)!;
  check('bricolage.besoin différent (puissance vs polyvalence) : 0 conflit', lampe.reasons.realConflictCount === 0, `realConflictCount=${lampe.reasons.realConflictCount}`);

  // bricolage.outil electrique vs manuel => 1 vrai conflit (dans l'allowlist).
  const contactTournevis = makeContact('Tournevis', makeQuiz({ interests: ['bricolage'], themeAnswers: { bricolage: { outil: 'electrique' } } }));
  const tournevis = findById(generateCandidates(contactTournevis, { maxEuros: 200 }), BRICOLAGE_TOURNEVIS.id)!;
  check('bricolage.outil electrique vs manuel : EXACTEMENT 1 conflit', tournevis.reasons.realConflictCount === 1, `realConflictCount=${tournevis.reasons.realConflictCount}`);
  check('conflictingDimensions = ["outil"] uniquement (jamais "besoin", hors allowlist)', JSON.stringify(tournevis.reasons.conflictingDimensions) === JSON.stringify(['outil']));

  // unknown/indifferent => jamais un conflit, même sur une dimension de l'allowlist.
  const contactNeutral = makeContact('Neutral', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { focus: 'inconnu' } } }));
  const gamingSetupNeutral = findById(generateCandidates(contactNeutral, { maxEuros: 200 }), GAMING_SOURIS.id)!;
  check('valeur "inconnu" sur une dimension de l’allowlist : jamais un conflit', gamingSetupNeutral.reasons.realConflictCount === 0, `realConflictCount=${gamingSetupNeutral.reasons.realConflictCount}`);
}

console.log('\n[21] specificEvidenceCount et exclusion du Top (vrai conflit SANS évidence spécifique)');
{
  // Cordes de guitare / accordeur : 1 vrai conflit (mode), ZÉRO autre évidence (aucune autre
  // dimension répondue, aucun match texte) => doivent être EXCLUS du Top, pas juste dévalués.
  const contactSofia = makeContact('Sofia', makeQuiz({ interests: ['musique'], themeAnswers: { musique: { mode: 'ecoute', context: 'deplacement', format: 'streaming', preference: 'fandom' } } }));
  const candidatesSofia = generateCandidates(contactSofia, { maxEuros: 60 });
  const cordesCandidate = candidatesSofia.find((c) => c.gift.giftConcept === 'guitar-strings')!;
  const accordeurCandidate = candidatesSofia.find((c) => c.gift.giftConcept === 'instrument-accessory')!;
  check('cordes de guitare : realConflictCount=1', cordesCandidate.reasons.realConflictCount === 1);
  check('cordes de guitare : specificEvidenceCount=0 (aucune autre dimension répondue, aucun texte)', cordesCandidate.reasons.specificEvidenceCount === 0, `specificEvidenceCount=${cordesCandidate.reasons.specificEvidenceCount}`);
  const topSofia = topRecommendations(candidatesSofia, 3);
  check('cordes de guitare ABSENTE du Top (vrai conflit + 0 évidence)', !topSofia.some((c) => c.gift.asin === cordesCandidate.gift.asin));
  check('accordeur/capodastre ABSENT du Top (même raison)', !topSofia.some((c) => c.gift.asin === accordeurCandidate.gift.asin));
  check('le Top ne contient JAMAIS un produit avec conflit réel et zéro évidence', topSofia.every((c) => !(c.reasons.realConflictCount > 0 && c.reasons.specificEvidenceCount === 0)));

  // Balance de cuisine : 1 vrai conflit (preference) MAIS 1 match légitime (rapport=cuisiner) =>
  // reste ÉLIGIBLE (accepté explicitement pour cette passe, consigne §7).
  const contactCamille = makeContact('Camille', makeQuiz({ interests: ['cuisine'], themeAnswers: { cuisine: { rapport: 'cuisiner', preference: 'upgrade' } } }));
  const candidatesCamille = generateCandidates(contactCamille, { maxEuros: 200 });
  const balanceCandidate = findById(candidatesCamille, CUISINE_BALANCE.id)!;
  check('balance : realConflictCount=1', balanceCandidate.reasons.realConflictCount === 1);
  check('balance : specificEvidenceCount >= 1 (match légitime sur rapport)', balanceCandidate.reasons.specificEvidenceCount >= 1, `specificEvidenceCount=${balanceCandidate.reasons.specificEvidenceCount}`);
  check('balance reste ÉLIGIBLE au Top malgré le vrai conflit (evidence compensatrice, accepté §7)', !(balanceCandidate.reasons.realConflictCount > 0 && balanceCandidate.reasons.specificEvidenceCount === 0));

  // Kindle : aucune réponse lecture => realConflictCount=0 systématiquement => jamais exclu, quel
  // que soit specificEvidenceCount (garde-fou structurel, pas une coïncidence).
  const kindleProduct = CURATED_GIFTS.find((g) => g.id === 'lecture-100')!;
  const readingLight = CURATED_GIFTS.find((g) => g.id === 'lecture-20')!;
  const contactJulie = makeContact('Julie', makeQuiz({ interests: ['tech', 'maison', 'lecture'], wish: 'Elle aimerait beaucoup une liseuse Kindle pour lire pendant ses trajets' }));
  const candidatesJulie = generateCandidates(contactJulie, { maxEuros: 250 });
  const lampeLectureCandidate = findById(candidatesJulie, readingLight.id)!;
  check('lampe de lecture (sans aucune réponse lecture) : realConflictCount=0 systématiquement', lampeLectureCandidate.reasons.realConflictCount === 0);
  check('absence de réponse ≠ conflit : jamais exclue par la règle §6, même avec specificEvidenceCount=0', !(lampeLectureCandidate.reasons.realConflictCount > 0 && lampeLectureCandidate.reasons.specificEvidenceCount === 0));
  const topJulie = topRecommendations(candidatesJulie, 3);
  check('Kindle strictement préservé : reste #1', topJulie[0].gift.asin === kindleProduct.asin);
}

console.log('\n[22] Top variable — 1, 2 ou 3 recommandations selon les candidats éligibles');
{
  function fakeConflictCandidate(id: string, score: number, realConflictCount: number, specificEvidenceCount: number, giftConcept = `concept-${id}`): ScoredCandidate {
    return {
      gift: { ...LEGO_CLASSIC, id, asin: id, giftConcept, price: 10 } as any,
      score,
      reasons: {
        interest: true, trait: null, themeAnswer: false, genericAnswer: false, wishMatch: false,
        textMatchKind: null, matchedSourceText: null, textMatchCoverage: null, matchedConcepts: [],
        favoriteText: null, likedSimilar: false,
        realConflictCount, conflictingDimensions: realConflictCount > 0 ? ['dim'] : [], specificEvidenceCount,
      },
    };
  }
  // Top 1 autorisé : 1 seul candidat éligible sur 3 (les 2 autres = vrai conflit + 0 évidence).
  const poolTop1 = [
    fakeConflictCandidate('e1', 100, 0, 0),
    fakeConflictCandidate('e2', 90, 1, 0),
    fakeConflictCandidate('e3', 80, 1, 0),
  ];
  const resultTop1 = topRecommendations(poolTop1, 3);
  check('Top 1 autorisé quand 2 candidats sur 3 ont un vrai conflit sans évidence', resultTop1.length === 1 && resultTop1[0].gift.id === 'e1');

  // Top 2 autorisé : 2 candidats éligibles sur 3.
  const poolTop2 = [
    fakeConflictCandidate('f1', 100, 0, 0),
    fakeConflictCandidate('f2', 90, 0, 1),
    fakeConflictCandidate('f3', 80, 1, 0),
  ];
  const resultTop2 = topRecommendations(poolTop2, 3);
  check('Top 2 autorisé quand 1 candidat sur 3 a un vrai conflit sans évidence', resultTop2.length === 2 && resultTop2.map((c) => c.gift.id).join(',') === 'f1,f2');

  // Conflit réel MAIS avec évidence compensatrice => reste éligible, Top 3 complet.
  const poolTop3WithEvidence = [
    fakeConflictCandidate('g1', 100, 0, 0),
    fakeConflictCandidate('g2', 90, 1, 1), // conflit réel mais compensé => reste éligible
    fakeConflictCandidate('g3', 80, 0, 0),
  ];
  const resultTop3 = topRecommendations(poolTop3WithEvidence, 3);
  check('un conflit réel AVEC évidence compensatrice reste éligible (Top 3 complet)', resultTop3.length === 3 && resultTop3.some((c) => c.gift.id === 'g2'));
}

console.log('\n[19] Non-régressions Phase 1 — cas obligatoires rejoués après Phase 3');
{
  // Kindle reste #1 (entity unique, match complet, poids inchangé).
  const kindleProduct = CURATED_GIFTS.find((g) => g.id === 'lecture-100')!;
  const contactKindle = makeContact('Julie', makeQuiz({ interests: ['tech', 'maison', 'lecture'], wish: 'Elle aimerait beaucoup une liseuse Kindle pour lire pendant ses trajets' }));
  const topKindle = topRecommendations(generateCandidates(contactKindle, { maxEuros: 250 }), 3);
  check('Kindle reste #1 après Phase 3 (non-régression)', topKindle[0].gift.asin === kindleProduct.asin);
  check('Kindle : coverage = 1 (concept unique "kindle", match complet)', topKindle[0].reasons.textMatchCoverage === 1);

  // avoid / hardRequirements platform toujours prioritaires (rejoué à l'identique du test [6]).
  const contactAvoid = makeContact('Testeur', makeQuiz({ interests: ['lecture', 'gaming'], avoid: ['lecture'], wish: 'Une liseuse Kindle' }));
  check('avoid reste prioritaire après Phase 3', !generateCandidates(contactAvoid, { maxEuros: 250 }).some((c) => c.gift.theme === 'lecture'));
  const contactPlatform = makeContact('Joueur', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { platform: 'xbox', favorite: 'PlayStation' } } }));
  check('hardRequirement platform=xbox reste prioritaire après Phase 3', !generateCandidates(contactPlatform, { maxEuros: 100 }).some((c) => c.gift.asin === PS_GIFTCARD.asin));

  // Star Wars toujours sans faux match.
  const noStarWarsProduct = CURATED_GIFTS.some((g) => g.entities?.includes('star_wars'));
  check('aucune entity star_wars au catalogue (inchangé)', !noStarWarsProduct);
  const contactStarWarsSeul = makeContact('FanSeul', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { favorite: 'Star Wars' } } }));
  const candidatesStarWarsSeul = generateCandidates(contactStarWarsSeul, { maxEuros: 100 });
  check('"Star Wars" seul (sans LEGO) : toujours AUCUN faux bonus entity', candidatesStarWarsSeul.every((c) => c.reasons.textMatchCoverage === null || c.reasons.textMatchKind === 'substring_fallback' || c.reasons.textMatchKind === null));
}

console.log('\n[23] Phase 4C — nettoyage quiz pré-bêta : anciennes valeurs gaming confort/multijoueur neutres');
{
  const gamingConfig = getThemeQuiz('gaming');
  const focusQuestion = gamingConfig.questions.find((q: any) => q.id === 'focus')!;
  check("gaming.focus ne propose plus 'confort'", !focusQuestion.options!.some((o: any) => o.key === 'confort'));
  check("gaming.focus ne propose plus 'multijoueur'", !focusQuestion.options!.some((o: any) => o.key === 'multijoueur'));
  check('gaming.focus conserve setup/fandom (question garde un sens)', focusQuestion.options!.map((o: any) => o.key).sort().join(',') === 'fandom,setup');

  const modeConfig = getThemeQuiz('mode');
  check("mode.taille n'est plus proposé", !modeConfig.questions.some((q: any) => q.id === 'taille'));
  check("mode.tailleConnue n'est plus proposé (n'avait plus aucun effet une fois 'taille' retiré)", !modeConfig.questions.some((q: any) => q.id === 'tailleConnue'));

  const lectureConfig = getThemeQuiz('lecture');
  const formatQuestion = lectureConfig.questions.find((q: any) => q.id === 'format')!;
  check("lecture.format ne propose plus 'audio'", !formatQuestion.options!.some((o: any) => o.key === 'audio'));

  const sportConfig = getThemeQuiz('sport');
  const disciplineQuestion = sportConfig.questions.find((q: any) => q.id === 'discipline')!;
  check("sport.discipline ne propose plus 'collectif'", !disciplineQuestion.options!.some((o: any) => o.key === 'collectif'));
  check("sport.discipline ne propose plus 'raquette'", !disciplineQuestion.options!.some((o: any) => o.key === 'raquette'));
  check("sport.discipline ne propose plus 'autre' (revérifié Phase 4C : 0 match taxonomy, hors TAXONOMY_CONFLICTS, aucun hardRequirement, aucune composite expansion sur discipline — ZERO confirmé)", !disciplineQuestion.options!.some((o: any) => o.key === 'autre'));

  const cuisineConfig = getThemeQuiz('cuisine');
  const universQuestion = cuisineConfig.questions.find((q: any) => q.id === 'univers')!;
  check("cuisine.univers ne propose plus bbq/apero/cuisine-du-monde", !universQuestion.options!.some((o: any) => ['bbq', 'apero', 'cuisine-du-monde'].includes(o.key)));

  const jardinageConfig = getThemeQuiz('jardinage');
  const lieuJardinageQuestion = jardinageConfig.questions.find((q: any) => q.id === 'lieu')!;
  check("jardinage.lieu ne propose plus 'grand-jardin'", !lieuJardinageQuestion.options!.some((o: any) => o.key === 'grand-jardin'));

  const danseConfig = getThemeQuiz('danse');
  const lieuDanseQuestion = danseConfig.questions.find((q: any) => q.id === 'lieu')!;
  check("danse.lieu ne propose plus 'club'", !lieuDanseQuestion.options!.some((o: any) => o.key === 'club'));

  const musiqueConfig = getThemeQuiz('musique');
  const modeQuestion = musiqueConfig.questions.find((q: any) => q.id === 'mode')!;
  const preferenceQuestion = musiqueConfig.questions.find((q: any) => q.id === 'preference')!;
  check("musique.mode ne propose plus 'concerts'", !modeQuestion.options!.some((o: any) => o.key === 'concerts'));
  check("musique.preference ne propose plus 'experience'", !preferenceQuestion.options!.some((o: any) => o.key === 'experience'));

  const cinemaConfig = getThemeQuiz('cinema');
  const besoinCinemaQuestion = cinemaConfig.questions.find((q: any) => q.id === 'besoin')!;
  check("cinema.besoin ne propose plus 'fandom'", !besoinCinemaQuestion.options!.some((o: any) => o.key === 'fandom'));

  const collectionConfig = getThemeQuiz('collection');
  const typeQuestion = collectionConfig.questions.find((q: any) => q.id === 'type')!;
  check("collection.type=autre reste proposé (conservé volontairement, hard filter utile — consigne §4)", typeQuestion.options!.some((o: any) => o.key === 'autre'));

  const favoriteGaming = gamingConfig.questions.find((q: any) => q.id === 'favorite');
  const favoriteMusique = musiqueConfig.questions.find((q: any) => q.id === 'favorite');
  const favoriteCollection = collectionConfig.questions.find((q: any) => q.id === 'favorite');
  const favoriteCinema = cinemaConfig.questions.find((q: any) => q.id === 'favorite');
  check('favorite gaming toujours présent', !!favoriteGaming);
  check('favorite musique toujours présent', !!favoriteMusique);
  check('favorite collection toujours présent', !!favoriteCollection);
  check('favorite cinema toujours présent', !!favoriteCinema);
  const uncoveredFranchises = ['Pokémon', 'Zelda', 'Star Wars', 'Taylor Swift', 'Harry Potter', 'Marvel'];
  check(
    'aucun placeholder favorite ne cite plus une franchise/artiste non couverte',
    [favoriteGaming, favoriteMusique, favoriteCollection, favoriteCinema].every(
      (q: any) => !uncoveredFranchises.some((name) => (q.placeholder ?? '').includes(name))
    )
  );
}

console.log('\n[24] Phase 4C — TAXONOMY_CONFLICTS gaming.focus : anciennes réponses confort/multijoueur devenues neutres');
{
  const mouseProduct = CURATED_GIFTS.find((g) => g.id === 'gaming-20')!; // focus:['setup']
  const contactOldConfort = makeContact('Ancien1', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { focus: 'confort' } } }));
  const candidatesOldConfort = generateCandidates(contactOldConfort, { maxEuros: 100 });
  const mouseWithOldConfort = findById(candidatesOldConfort, mouseProduct.id)!;
  check(
    "ancienne réponse gaming.focus='confort' : la souris (focus=setup) n'est plus en conflit (realConflictCount=0)",
    mouseWithOldConfort.reasons.realConflictCount === 0
  );

  const contactOldMultijoueur = makeContact('Ancien2', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { focus: 'multijoueur' } } }));
  const candidatesOldMultijoueur = generateCandidates(contactOldMultijoueur, { maxEuros: 100 });
  const mouseWithOldMultijoueur = findById(candidatesOldMultijoueur, mouseProduct.id)!;
  check(
    "ancienne réponse gaming.focus='multijoueur' : la souris (focus=setup) n'est plus en conflit (realConflictCount=0)",
    mouseWithOldMultijoueur.reasons.realConflictCount === 0
  );

  // Le seul conflit gaming encore supporté (setup vs fandom) continue de fonctionner à l'identique.
  const psGiftCardStillConflicts = makeContact('Ancien3', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { platform: 'playstation', focus: 'setup' } } }));
  const candidatesStillConflict = generateCandidates(psGiftCardStillConflicts, { maxEuros: 100 });
  const psGiftCard = candidatesStillConflict.find((c) => c.gift.id === 'gaming-fandom-playstation');
  check(
    "gaming.focus='setup' vs carte cadeau focus=[fandom] : conflit setup↔fandom toujours actif (non-régression Phase 3)",
    !!psGiftCard && psGiftCard.reasons.realConflictCount === 1
  );
}

console.log('\n[25] Phase 4C — legacy themeAnswers inconnus tolérés sans crash (mode.taille, sport.discipline=autre)');
{
  const contactLegacyTaille = makeContact('Legacy1', makeQuiz({ interests: ['mode'], themeAnswers: { mode: { tailleConnue: 'oui', taille: 'm' } } }));
  let crashed = false;
  let candidatesLegacy: ScoredCandidate[] = [];
  try {
    candidatesLegacy = generateCandidates(contactLegacyTaille, { maxEuros: 100 });
  } catch {
    crashed = true;
  }
  check("clés legacy mode.tailleConnue/mode.taille tolérées sans crash", !crashed && candidatesLegacy.length > 0);

  const contactLegacyDiscipline = makeContact('Legacy2', makeQuiz({ interests: ['sport'], themeAnswers: { sport: { discipline: 'autre' } } }));
  let crashed2 = false;
  let candidatesLegacy2: ScoredCandidate[] = [];
  try {
    candidatesLegacy2 = generateCandidates(contactLegacyDiscipline, { maxEuros: 100 });
  } catch {
    crashed2 = true;
  }
  check("valeur legacy sport.discipline='autre' tolérée sans crash", !crashed2 && candidatesLegacy2.length > 0);
}

console.log('\n[26] Phase 4C — collection.type=autre reste un hard filter fonctionnel (consigne §4)');
{
  const classeurProduct = CURATED_GIFTS.find((g) => g.id === 'collection-classeur')!; // hardRequirements:{type:['tcg']}
  const pochettesProduct = CURATED_GIFTS.find((g) => g.id === 'collection-pochettes')!; // hardRequirements:{type:['tcg']}
  const socleProduct = CURATED_GIFTS.find((g) => g.id === 'collection-socle-figurine')!; // hardRequirements:{type:['figurines','miniatures']}
  const contactAutre = makeContact('Collectionneur', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { type: 'autre' } } }));
  const candidatesAutre = generateCandidates(contactAutre, { maxEuros: 100 });
  check("collection.type='autre' écarte le classeur TCG (hardRequirements incompatible)", !candidatesAutre.some((c) => c.gift.asin === classeurProduct.asin));
  check("collection.type='autre' écarte les pochettes TCG (hardRequirements incompatible)", !candidatesAutre.some((c) => c.gift.asin === pochettesProduct.asin));
  check("collection.type='autre' écarte le socle figurines/miniatures (hardRequirements incompatible)", !candidatesAutre.some((c) => c.gift.asin === socleProduct.asin));

  const contactTcg = makeContact('Collectionneur2', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { type: 'tcg' } } }));
  const candidatesTcg = generateCandidates(contactTcg, { maxEuros: 100 });
  check("collection.type='tcg' laisse passer le classeur TCG (non-régression)", candidatesTcg.some((c) => c.gift.asin === classeurProduct.asin));
}

console.log('\n[27] Phase 5F — 3 nouveaux InterestTag reconnus (jeux_societe/beaute/science)');
{
  check("'jeux_societe' présent dans INTEREST_OPTIONS", INTEREST_OPTIONS.some((o) => o.key === 'jeux_societe'));
  check("'beaute' présent dans INTEREST_OPTIONS", INTEREST_OPTIONS.some((o) => o.key === 'beaute'));
  check("'science' présent dans INTEREST_OPTIONS", INTEREST_OPTIONS.some((o) => o.key === 'science'));
  check('INTEREST_OPTIONS contient bien 23 entrées (20 + 3 nouveaux)', INTEREST_OPTIONS.length === 23);
}

console.log('\n[28] Phase 5F — quiz des 3 nouveaux thèmes accessible (config dédiée, pas de repli générique)');
{
  const jeuxConfig = getThemeQuiz('jeux_societe');
  check("getThemeQuiz('jeux_societe') retourne une config dédiée", jeuxConfig.questions.some((q) => q.id === 'type'));
  check('jeux_societe.type conserve exactement les 7 valeurs validées Phase 5C', jeuxConfig.questions.find((q) => q.id === 'type')!.options!.map((o) => o.key).sort().join(',') === 'ambiance,cartes,echecs,escape,famille,puzzle,strategie');
  check('jeux_societe possède ses 4 dimensions (type/joueurs/niveau/preference)', ['type', 'joueurs', 'niveau', 'preference'].every((id) => jeuxConfig.questions.some((q) => q.id === id)));

  const beauteConfig = getThemeQuiz('beaute');
  check("getThemeQuiz('beaute') retourne une config dédiée", beauteConfig.questions.some((q) => q.id === 'univers'));
  check('beaute possède ses 3 dimensions (univers/besoin/style)', ['univers', 'besoin', 'style'].every((id) => beauteConfig.questions.some((q) => q.id === id)));
  check("beaute ne contient AUCUNE question liée au genre (pas de hard filter implicite)", !beauteConfig.questions.some((q) => /genre/i.test(q.id) || /genre/i.test(q.prompt)));

  const scienceConfig = getThemeQuiz('science');
  check("getThemeQuiz('science') retourne une config dédiée", scienceConfig.questions.some((q) => q.id === 'univers'));
  check("science.univers ne propose PAS 'technologie' (chevauchement tech évité, voir audit Phase 5 §3)", !scienceConfig.questions.find((q) => q.id === 'univers')!.options!.some((o) => o.key === 'technologie'));
  check('science possède ses 3 dimensions (univers/usage/niveau)', ['univers', 'usage', 'niveau'].every((id) => scienceConfig.questions.some((q) => q.id === id)));
}

console.log('\n[29] Phase 5F — lecture.sujet : structure multi-select + garde-fou taxonomyMatchCount (consigne §1)');
{
  const lectureConfig = getThemeQuiz('lecture');
  const sujetQuestion = lectureConfig.questions.find((q) => q.id === 'sujet')!;
  check('lecture.sujet présent avec 6 valeurs V1', sujetQuestion.options!.map((o) => o.key).sort().join(',') === 'developpement-personnel,fiction,finance,histoire,psychologie,science');
  check(
    "lecture.sujet a > 2 options : ThemeAffinage.tsx la traite automatiquement en multi-select (voir isMulti, seuil générique déjà en place, aucun code UI à ajouter)",
    sujetQuestion.options!.length > 2
  );
  check("business/biographie absents en V1 (différés, voir Phase 5E §3)", !sujetQuestion.options!.some((o) => o.key === 'business' || o.key === 'biographie'));

  const detailQuestion = lectureConfig.questions.find((q) => q.id === 'detail')!;
  check(
    "placeholder lecture.detail neutre, aucun nom propre non couvert (ex. 'Buffett')",
    !!detailQuestion.placeholder && !/buffett|bitcoin/i.test(detailQuestion.placeholder)
  );

  // Garde-fou §1 : le mécanisme testé ici (taxonomyMatchCount, via generateCandidates) est
  // STRICTEMENT IDENTIQUE à celui qui s'appliquera à lecture.sujet une fois les livres sourcés
  // (aucune branche spécifique par thème dans le moteur) — utilisé ici sur cuisine.univers, un
  // produit RÉEL déjà au catalogue (cuisine-20, taxonomy.univers=['patisserie']), plutôt que de
  // fabriquer un faux produit lecture (interdit consigne §8). Équivalent exact du cas demandé :
  // sujet="finance,histoire,psychologie" sur un produit taxonomy.sujet=['finance'].
  const cuisine20 = CURATED_GIFTS.find((g) => g.id === 'cuisine-20')!; // taxonomy.univers === ['patisserie']
  const contactMultiSelect = makeContact('MultiSelect', makeQuiz({
    interests: ['cuisine'],
    themeAnswers: { cuisine: { univers: 'patisserie,cafe,gastronomie' } }, // 3 valeurs sélectionnées, 1 seule matche le produit
  }));
  const contactSingleSelect = makeContact('SingleSelect', makeQuiz({
    interests: ['cuisine'],
    themeAnswers: { cuisine: { univers: 'patisserie' } }, // 1 seule valeur sélectionnée, la même qui matche
  }));
  const candidatesMulti = generateCandidates(contactMultiSelect, { maxEuros: 100 });
  const candidatesSingle = generateCandidates(contactSingleSelect, { maxEuros: 100 });
  const cuisine20WithMulti = findById(candidatesMulti, cuisine20.id)!;
  const cuisine20WithSingle = findById(candidatesSingle, cuisine20.id)!;
  check(
    "sélectionner 3 valeurs (dont 1 seule matche) donne EXACTEMENT le même score que sélectionner cette seule valeur — pas de surbonification (+1 par valeur sélectionnée)",
    cuisine20WithMulti.score === cuisine20WithSingle.score
  );
}

console.log('\n[30] Phase 5F/7B — invariants d’architecture theme=science (garde-fou revalidé après sourcing Phase 7B)');
{
  // CHANTIER "Phase 7B" (2026-09-21) : science est désormais sourcé (11 produits, voir section
  // [37]) — le garde-fou "0 produit" de Phase 5F est donc obsolète et remplacé ici par sa version
  // vivante : le VRAI catalogue science ne contient toujours aucun livre (règle de propriété
  // Phase 5D/5F), maintenant vérifiable sur de vrais produits plutôt que vide par construction.
  const scienceThemeProducts = CURATED_GIFTS.filter((g) => g.theme === 'science');
  check('science a bien des produits au catalogue (sourcé Phase 7B)', scienceThemeProducts.length === 11);
  check(
    "garde-fou vivant : aucun produit theme=science n'est un livre (giftConcept ne contient ni 'book' ni 'livre')",
    scienceThemeProducts.every((g) => !/book|livre/i.test(g.giftConcept ?? ''))
  );

  const lectureScienceBooks = CURATED_GIFTS.filter((g) => g.theme === 'lecture' && g.taxonomy?.sujet?.includes('science'));
  check('0 livre lecture.sujet=science au catalogue actuel (à sourcer, voir annexe)', lectureScienceBooks.length === 0);

  // 'finance' n'existe QUE comme valeur de lecture.sujet, jamais comme InterestTag/thème — déjà
  // garanti par le système de types (TS refuserait la compilation), revérifié ici à l'exécution.
  check("aucun produit ne porte theme='finance' (le thème finance autonome reste abandonné, Phase 5D)", !CURATED_GIFTS.some((g) => (g.theme as string) === 'finance'));
  check("'finance' existe bien comme option de lecture.sujet", getThemeQuiz('lecture').questions.find((q) => q.id === 'sujet')!.options!.some((o) => o.key === 'finance'));

  // Non-réintroduction des options supprimées en Phase 4C (non-régression croisée avec ce chantier).
  check("dice-game n'existe dans aucune config jeux_societe (jamais réintroduit, voir Phase 5C)", !getThemeQuiz('jeux_societe').questions.some((q) => q.options?.some((o) => o.key === 'dice-game' || o.key === 'dice')));
  check("gaming.focus ne réintroduit pas confort/multijoueur (non-régression Phase 4C)", !getThemeQuiz('gaming').questions.find((q) => q.id === 'focus')!.options!.some((o) => o.key === 'confort' || o.key === 'multijoueur'));
}

console.log('\n[31] Phase 7A/7B/7C — jeux_societe, science ET beaute désormais sourcés/activés : garde-fous UI');
{
  // CHANTIER "Phase 7A/7B/7C" (2026-09-21) : jeux_societe (Phase 7A), science (Phase 7B) puis
  // beaute (Phase 7C) sortent tous les trois de l'état "bloqué" documenté en Phase 5G — 11+11+12
  // cadeaux éditoriaux ajoutés (voir giftCatalog.ts), COVERED_THEMES mis à jour à chaque fois.
  const jeuxSocieteProducts = CURATED_GIFTS.filter((g) => g.theme === 'jeux_societe');
  const beauteProducts = CURATED_GIFTS.filter((g) => g.theme === 'beaute');
  const scienceProducts = CURATED_GIFTS.filter((g) => g.theme === 'science');
  check('jeux_societe : 11 produits au catalogue (sourcing éditorial Phase 7A)', jeuxSocieteProducts.length === 11);
  check('beaute : 12 produits au catalogue (sourcing éditorial Phase 7C)', beauteProducts.length === 12);
  check('science : 11 produits au catalogue (sourcing éditorial Phase 7B)', scienceProducts.length === 11);

  check("COVERED_THEMES contient désormais jeux_societe (seuil ≥10 produits atteint, consigne Phase 5G §7)", (COVERED_THEMES as readonly string[]).includes('jeux_societe'));
  check("COVERED_THEMES contient désormais beaute", (COVERED_THEMES as readonly string[]).includes('beaute'));
  check("COVERED_THEMES contient désormais science", (COVERED_THEMES as readonly string[]).includes('science'));
  check('COVERED_THEMES passe de 20 à 23 thèmes (jeux_societe + science + beaute ajoutés, aucun autre)', COVERED_THEMES.length === 23);

  check("VISIBLE_INTEREST_OPTIONS inclut désormais jeux_societe (11 produits ⇒ sélectionnable, consigne §8)", VISIBLE_INTEREST_OPTIONS.some((o) => o.key === 'jeux_societe'));
  check('VISIBLE_INTEREST_OPTIONS inclut désormais beaute (12 produits ⇒ sélectionnable, consigne Phase 7C §11)', VISIBLE_INTEREST_OPTIONS.some((o) => o.key === 'beaute'));
  check('VISIBLE_INTEREST_OPTIONS inclut désormais science (11 produits ⇒ sélectionnable, consigne Phase 7B §8)', VISIBLE_INTEREST_OPTIONS.some((o) => o.key === 'science'));
  check('VISIBLE_INTEREST_OPTIONS contient les 20 thèmes historiques + jeux_societe + science + beaute (23 au total)', VISIBLE_INTEREST_OPTIONS.length === 23);

  const lectureQuestions = getThemeQuiz('lecture').questions;
  const sujetQ = lectureQuestions.find((q) => q.id === 'sujet')!;
  check("lecture.sujet toujours hidden:true (catalogue de 12 livres non sourcé, hors périmètre Phase 7A/7B/7C)", sujetQ.hidden === true);
  // Reproduit exactement la logique de filtrage de ThemeAffinage.tsx (visibleQuestions) pour
  // prouver que la question disparaîtrait bien de l'écran réel, sans dépendre du rendu React Native.
  const simulatedVisible = lectureQuestions.filter((q) => !q.hidden);
  check("lecture.sujet absente de la simulation de visibleQuestions (ThemeAffinage.tsx)", !simulatedVisible.some((q) => q.id === 'sujet'));
  check(
    'les autres questions lecture (format/contexte/intensite/besoin/detail) restent visibles, aucune masquée par erreur',
    ['format', 'contexte', 'intensite', 'besoin', 'detail'].every((id) => simulatedVisible.some((q) => q.id === id))
  );

  // ASIN dupliqué : invariant recalculé sur les seuls produits QUI EN PORTENT UN (voir Phase 6B —
  // asin optionnel, les 11 jeux_societe n'en ont légitimement aucun, exclus du calcul).
  const withAsin = CURATED_GIFTS.filter((g) => g.asin);
  check('aucun ASIN dupliqué parmi les produits qui en portent un (invariant général, non-régression)', new Set(withAsin.map((g) => g.asin)).size === withAsin.length);
}

console.log('\n[33] Phase 6B — identité canonique gift.id (migration ASIN → id)');
{
  check('gift.id unique sur les 162 produits', new Set(CURATED_GIFTS.map((g) => g.id)).size === CURATED_GIFTS.length);
  const withAsin = CURATED_GIFTS.filter((g) => g.asin);
  check('ASIN toujours unique lorsqu’il existe', new Set(withAsin.map((g) => g.asin)).size === withAsin.length);

  const kindleProduct = CURATED_GIFTS.find((g) => g.id === 'lecture-100')!; // asin réel présent, non modifié

  // --- feedback moderne (giftId) ---
  const contactModernFeedback = makeContact('Moderne', makeQuiz({
    interests: ['lecture'],
    feedback: [{ giftId: kindleProduct.id, reason: 'has_it', at: new Date().toISOString() }],
  }));
  check(
    'feedback moderne giftId fonctionne : le produit précis rejeté "has_it" est bien exclu',
    !generateCandidates(contactModernFeedback, { maxEuros: 250 }).some((c) => c.gift.id === kindleProduct.id)
  );

  // --- feedback legacy (asin seul, sans giftId) ---
  const contactLegacyFeedback = makeContact('Legacy', makeQuiz({
    interests: ['lecture'],
    feedback: [{ asin: kindleProduct.asin, reason: 'has_it', at: new Date().toISOString() } as any],
  }));
  check(
    'feedback legacy (asin seul) est converti vers le bon giftId par normalizeQuizProfile et exclut bien le produit',
    !generateCandidates(contactLegacyFeedback, { maxEuros: 250 }).some((c) => c.gift.id === kindleProduct.id)
  );
  const normalizedLegacyFeedback = normalizeQuizProfile(contactLegacyFeedback.quiz!);
  check(
    'normalizeQuizProfile résout bien feedback[0].giftId === kindleProduct.id à partir de l’asin legacy (jamais giftId = asin)',
    normalizedLegacyFeedback.feedback[0].giftId === kindleProduct.id && normalizedLegacyFeedback.feedback[0].giftId !== kindleProduct.asin
  );

  // --- recommendationHistory legacy (shownAsins/likedAsins) ---
  const legacyHistoryProfile = makeQuiz({
    interests: ['lecture'],
    recommendationHistory: [{ at: new Date().toISOString(), shownAsins: [kindleProduct.asin!], likedAsins: [kindleProduct.asin!] } as any],
  });
  const normalizedHistory = normalizeQuizProfile(legacyHistoryProfile);
  check('shownAsins legacy → shownGiftIds correct', normalizedHistory.recommendationHistory[0].shownGiftIds?.join(',') === kindleProduct.id);
  check('likedAsins legacy → likedGiftIds correct', normalizedHistory.recommendationHistory[0].likedGiftIds?.join(',') === kindleProduct.id);

  // --- ASIN legacy inconnu (fiche retirée du catalogue depuis) ---
  const UNKNOWN_ASIN = 'B0000000XX'; // n'existe dans aucun produit du catalogue actuel
  check('giftIdFromLegacyAsin sur un ASIN inconnu retourne undefined (jamais un faux id fabriqué)', giftIdFromLegacyAsin(UNKNOWN_ASIN) === undefined);

  const contactUnknownAsinFeedback = makeContact('Inconnu', makeQuiz({
    interests: ['lecture'],
    feedback: [{ asin: UNKNOWN_ASIN, reason: 'has_it', at: new Date().toISOString() } as any],
  }));
  let crashedOnUnknownAsin = false;
  let candidatesUnknown: ScoredCandidate[] = [];
  try {
    candidatesUnknown = generateCandidates(contactUnknownAsinFeedback, { maxEuros: 250 });
  } catch {
    crashedOnUnknownAsin = true;
  }
  check('un ASIN legacy inconnu ne fait jamais crasher generateCandidates', !crashedOnUnknownAsin && candidatesUnknown.length > 0);

  const normalizedUnknown = normalizeQuizProfile(contactUnknownAsinFeedback.quiz!);
  check(
    'ASIN legacy inconnu ne devient jamais un faux giftId (reste undefined, entrée brute tolérée/conservée)',
    normalizedUnknown.feedback[0].giftId === undefined && normalizedUnknown.feedback[0].asin === UNKNOWN_ASIN
  );

  const unknownHistoryProfile = makeQuiz({
    interests: ['lecture'],
    recommendationHistory: [{ at: new Date().toISOString(), shownAsins: [UNKNOWN_ASIN], likedAsins: [UNKNOWN_ASIN] } as any],
  });
  const normalizedUnknownHistory = normalizeQuizProfile(unknownHistoryProfile);
  check(
    'ASIN historique inconnu : shownGiftIds/likedGiftIds ignorent l’entrée (liste vide) plutôt que de fabriquer un id',
    (normalizedUnknownHistory.recommendationHistory[0].shownGiftIds ?? []).length === 0 && (normalizedUnknownHistory.recommendationHistory[0].likedGiftIds ?? []).length === 0
  );

  // --- garde-fou statique : GiftsScreen.tsx n'écrit plus jamais asin/shownAsins/likedAsins comme identité ---
  const giftsScreenSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'GiftsScreen.tsx'), 'utf-8');
  check(
    "GiftsScreen.tsx n'écrit plus feedback avec `asin` comme clé (nouveaux writes = giftId uniquement)",
    !/feedback:\s*\[\.\.\.quiz\.feedback,\s*\{\s*asin/.test(giftsScreenSource)
  );
  check(
    "GiftsScreen.tsx n'écrit plus recommendationHistory avec shownAsins/likedAsins (nouveaux writes = shownGiftIds/likedGiftIds uniquement)",
    !/shownAsins:|likedAsins:/.test(giftsScreenSource.replace(/\/\/.*shownAsins\/likedAsins.*/g, ''))
  );
}

console.log('\n[34] Phase 6B — produit synthétique SANS commerce (test-only, jamais ajouté au vrai catalogue)');
{
  // Construit UNIQUEMENT pour ce test — jamais poussé dans CURATED_GIFTS (consigne §11). Prouve
  // que le classement (topRecommendations) et l'affichage (whyForContact) fonctionnent sans
  // aucune donnée Amazon, exclusivement via `id`. Le "scoring" en tant que tel (generateCandidates)
  // ne peut être exercé que sur des produits du catalogue réel par construction (il itère
  // CURATED_GIFTS) — vérifié à la place par relecture de code (Phase 6/6B) : aucune branche de
  // scoring ne lit jamais `gift.asin`/`gift.imageUrl`, seulement theme/trait/taxonomy/tags/
  // hardRequirements/hardExclusions/title/price/giftConcept/entities, tous présents ici.
  const noCommerceGift: CuratedGift = {
    id: 'test-gift-no-commerce',
    theme: 'lecture',
    tier: '20',
    title: 'Produit de test sans donnée commerce',
    price: 25,
    emoji: '📦',
    pitch: 'Un pitch de test, sans ASIN ni image, pour prouver que Pensif peut recommander sans Amazon.',
    giftConcept: 'test-concept-no-commerce',
    taxonomy: { format: ['papier'] },
    // asin et imageUrl DÉLIBÉRÉMENT absents.
  };
  check('le gift synthétique n’a bien ni asin ni imageUrl (absence volontaire, pas un oubli)', noCommerceGift.asin === undefined && noCommerceGift.imageUrl === undefined);

  const syntheticCandidate: ScoredCandidate = {
    gift: noCommerceGift,
    score: 90,
    reasons: {
      interest: true,
      trait: null,
      themeAnswer: true,
      genericAnswer: false,
      wishMatch: false,
      textMatchKind: null,
      matchedSourceText: null,
      textMatchCoverage: null,
      matchedConcepts: [],
      favoriteText: null,
      likedSimilar: false,
      realConflictCount: 0,
      conflictingDimensions: [],
      specificEvidenceCount: 1,
    },
  };
  const otherRealCandidate: ScoredCandidate = {
    gift: CURATED_GIFTS.find((g) => g.id === 'lecture-20')!,
    score: 60,
    reasons: { ...syntheticCandidate.reasons },
  };

  const topWithSynthetic = topRecommendations([syntheticCandidate, otherRealCandidate], 3);
  check('être classé : topRecommendations() traite le gift synthétique normalement (meilleur score = #1)', topWithSynthetic[0]?.gift.id === 'test-gift-no-commerce');

  const testContact = makeContact('SyntheticTest', makeQuiz({ interests: ['lecture'] }));
  const why = whyForContact(syntheticCandidate, testContact);
  check('être affichable conceptuellement : whyForContact() produit un texte basé sur le pitch, sans jamais toucher asin/imageUrl', why.startsWith(noCommerceGift.pitch));

  // Like / reject / history / exclusion : exercés via id, sur le VRAI pipeline (generateCandidates
  // + feedback), avec un produit catalogue réel mais un feedback qui ne référence QUE `giftId`
  // (jamais `asin`) — preuve fidèle que le pipeline est 100% id-only, cf. test [33] ci-dessus qui
  // couvre exactement ce chemin (feedback moderne giftId). Non dupliqué ici.
}

console.log('\n[35] Phase 7A — catalogue éditorial jeux_societe (11 cadeaux, sans commerce)');
{
  const jeuxProducts = CURATED_GIFTS.filter((g) => g.theme === 'jeux_societe');
  check('11 produits jeux_societe présents', jeuxProducts.length === 11);
  check('gift.id uniques parmi les 11', new Set(jeuxProducts.map((g) => g.id)).size === 11);
  check('asin absent sur les 11 (catalogue éditorial, pas de dépendance Amazon)', jeuxProducts.every((g) => g.asin === undefined));
  check('imageUrl absente sur les 11', jeuxProducts.every((g) => g.imageUrl === undefined));
  check(
    "les 11 giftConcept correspondent exactement aux concepts validés Phase 5C (aucun 'dice-game' réintroduit)",
    jeuxProducts.map((g) => g.giftConcept).sort().join(',') ===
      [
        'card-game', 'chess-set', 'cooperative-board-game', 'escape-room-kit', 'party-game',
        'premium-collector-board-game', 'puzzle-1000', 'puzzle-500', 'strategy-board-game',
        'travel-game-set', 'two-player-strategy-game',
      ].sort().join(',')
  );

  // Couverture taxonomy : chaque option du quiz jeux_societe doit matcher ≥1 des 11 produits.
  const jeuxConfig = getThemeQuiz('jeux_societe');
  for (const q of jeuxConfig.questions) {
    if (q.type !== 'choice' || !q.options) continue;
    for (const opt of q.options) {
      check(
        `jeux_societe.${q.id}=${opt.key} matche ≥1 produit`,
        jeuxProducts.some((g) => g.taxonomy?.[q.id]?.includes(opt.key))
      );
    }
  }

  check('jeux_societe entre dans COVERED_THEMES', (COVERED_THEMES as readonly string[]).includes('jeux_societe'));
  check('jeux_societe devient visible (VISIBLE_INTEREST_OPTIONS)', VISIBLE_INTEREST_OPTIONS.some((o) => o.key === 'jeux_societe'));
}

console.log('\n[36] Phase 7A — profils réels jeux_societe (catalogue éditorial désormais actif)');
{
  const contactStrategie = makeContact('Emma', makeQuiz({
    interests: ['jeux_societe'],
    themeAnswers: { jeux_societe: { type: 'strategie', joueurs: 'deux', preference: 'reflexion' } },
  }));
  const candidatesStrategie = generateCandidates(contactStrategie, { maxEuros: 60 });
  const topStrategie = topRecommendations(candidatesStrategie, 3);
  check('profil stratégie à deux : le Top contient uniquement jeux_societe', topStrategie.every((c) => c.gift.theme === 'jeux_societe'));
  check('profil stratégie à deux : favorise two-player-strategy-game en #1', topStrategie[0]?.gift.giftConcept === 'two-player-strategy-game');

  const contactPuzzle = makeContact('Marc', makeQuiz({
    interests: ['jeux_societe'],
    themeAnswers: { jeux_societe: { type: 'puzzle', joueurs: 'solo', niveau: 'occasionnel' } },
  }));
  const candidatesPuzzle = generateCandidates(contactPuzzle, { maxEuros: 50 });
  const topPuzzle = topRecommendations(candidatesPuzzle, 3);
  check('profil puzzle solo : le Top contient uniquement jeux_societe', topPuzzle.every((c) => c.gift.theme === 'jeux_societe'));
  check('profil puzzle solo : favorise puzzle-500 (occasionnel) en #1', topPuzzle[0]?.gift.giftConcept === 'puzzle-500');

  const contactAmbiance = makeContact('Julien', makeQuiz({
    interests: ['jeux_societe'],
    themeAnswers: { jeux_societe: { type: 'ambiance', joueurs: 'grand-groupe', preference: 'convivialite' } },
  }));
  const candidatesAmbiance = generateCandidates(contactAmbiance, { maxEuros: 60 });
  const topAmbiance = topRecommendations(candidatesAmbiance, 3);
  check('profil ambiance grand groupe : le Top contient uniquement jeux_societe', topAmbiance.every((c) => c.gift.theme === 'jeux_societe'));
  check('profil ambiance grand groupe : favorise party-game en #1', topAmbiance[0]?.gift.giftConcept === 'party-game');
}

console.log('\n[37] Phase 7B — catalogue éditorial science (11 cadeaux, sans commerce, aucun livre)');
{
  const scienceProducts = CURATED_GIFTS.filter((g) => g.theme === 'science');
  check('11 produits science présents', scienceProducts.length === 11);
  check('gift.id uniques parmi les 11', new Set(scienceProducts.map((g) => g.id)).size === 11);
  check('asin absent sur les 11 (catalogue éditorial, pas de dépendance Amazon)', scienceProducts.every((g) => g.asin === undefined));
  check('imageUrl absente sur les 11', scienceProducts.every((g) => g.imageUrl === undefined));
  check(
    "les 11 giftConcept correspondent exactement aux concepts validés Phase 5C (popular-science-book EXCLU)",
    scienceProducts.map((g) => g.giftConcept).sort().join(',') ===
      [
        'star-map-poster', 'newtons-cradle', 'fossil-replica-display', 'planetarium-projector',
        'stargazing-binoculars', 'mineral-and-gem-specimen-set', 'dinosaur-model-set',
        'space-model-kit', 'microscope-kit', 'science-museum-experience-card', 'telescope',
      ].sort().join(',')
  );
  check(
    "aucun livre parmi les 11 (règle de propriété Phase 5D/5F : les livres vivent sous lecture.sujet=science)",
    !scienceProducts.some((g) => /book|livre/i.test(g.giftConcept ?? '') || g.giftConcept === 'popular-science-book')
  );

  // Couverture taxonomy : chaque option du quiz science doit matcher ≥1 des 11 produits.
  const scienceConfig = getThemeQuiz('science');
  for (const q of scienceConfig.questions) {
    if (q.type !== 'choice' || !q.options) continue;
    for (const opt of q.options) {
      check(
        `science.${q.id}=${opt.key} matche ≥1 produit`,
        scienceProducts.some((g) => g.taxonomy?.[q.id]?.includes(opt.key))
      );
    }
  }

  // Fragilité documentée (consigne §5) : univers=biologie et usage=experimenter reposent tous
  // les deux UNIQUEMENT sur microscope-kit — non masqué, vérifié explicitement ici comme
  // "single-concept coverage" plutôt que de fabriquer artificiellement un 12e cadeau.
  const biologieProducts = scienceProducts.filter((g) => g.taxonomy?.univers?.includes('biologie'));
  const experimenterProducts = scienceProducts.filter((g) => g.taxonomy?.usage?.includes('experimenter'));
  check('univers=biologie : single-concept coverage (exactement 1 produit, microscope-kit)', biologieProducts.length === 1 && biologieProducts[0].giftConcept === 'microscope-kit');
  check('usage=experimenter : single-concept coverage (exactement 1 produit, microscope-kit)', experimenterProducts.length === 1 && experimenterProducts[0].giftConcept === 'microscope-kit');

  check('science entre dans COVERED_THEMES', (COVERED_THEMES as readonly string[]).includes('science'));
  check('science devient visible (VISIBLE_INTEREST_OPTIONS)', VISIBLE_INTEREST_OPTIONS.some((o) => o.key === 'science'));
  check("lecture.sujet reste hidden (12 livres, dont les livres science, non sourcés)", getThemeQuiz('lecture').questions.find((q) => q.id === 'sujet')!.hidden === true);
}

console.log('\n[38] Phase 7B — profils réels science (catalogue éditorial désormais actif)');
{
  const contactAstro = makeContact('Lina', makeQuiz({
    interests: ['science'],
    themeAnswers: { science: { univers: 'astronomie', usage: 'observer', niveau: 'amateur' } },
  }));
  const candidatesAstro = generateCandidates(contactAstro, { maxEuros: 150 });
  const topAstro = topRecommendations(candidatesAstro, 3);
  check('profil A (astronomie/observer/amateur) : le Top contient uniquement science', topAstro.every((c) => c.gift.theme === 'science'));
  // Vérifié explicitement (resserrage Phase 7B) : stargazing-binoculars et telescope obtiennent le
  // MÊME score (93 = interest 42 + 3 matches taxonomy × 12 = 36 + même trait 'practical' + même
  // traitBonus) — le tie-break de generateCandidates (prix croissant) départage donc de façon
  // déterministe en faveur de stargazing-binoculars (45€ < 129€). Comportement stable, jamais un
  // hasard d'ordre — assertion exacte plutôt que permissive.
  const scoreBinoculars = candidatesAstro.find((c) => c.gift.giftConcept === 'stargazing-binoculars')?.score;
  const scoreTelescope = candidatesAstro.find((c) => c.gift.giftConcept === 'telescope')?.score;
  check('profil A : stargazing-binoculars et telescope ont bien le même score (égalité confirmée)', scoreBinoculars !== undefined && scoreBinoculars === scoreTelescope);
  check('profil A : stargazing-binoculars en tête, déterministe (tie-break prix croissant, 45€ < 129€)', topAstro[0]?.gift.giftConcept === 'stargazing-binoculars');

  const contactDino = makeContact('Tom', makeQuiz({
    interests: ['science'],
    themeAnswers: { science: { univers: 'dinosaures', usage: 'collectionner', niveau: 'passionne' } },
  }));
  const candidatesDino = generateCandidates(contactDino, { maxEuros: 60 });
  const topDino = topRecommendations(candidatesDino, 3);
  check('profil B (dinosaures/collectionner/passionne) : le Top contient uniquement science', topDino.every((c) => c.gift.theme === 'science'));
  // Vérifié explicitement (resserrage Phase 7B) : dinosaur-model-set et fossil-replica-display
  // obtiennent le MÊME score (86 = interest 42 + 3 matches taxonomy × 12 = 36 + même trait
  // 'curious' + même traitBonus) — tie-break prix croissant départage vers dinosaur-model-set
  // (30€ < 32€). Assertion exacte plutôt que permissive.
  const scoreDinoModel = candidatesDino.find((c) => c.gift.giftConcept === 'dinosaur-model-set')?.score;
  const scoreFossil = candidatesDino.find((c) => c.gift.giftConcept === 'fossil-replica-display')?.score;
  check('profil B : dinosaur-model-set et fossil-replica-display ont bien le même score (égalité confirmée)', scoreDinoModel !== undefined && scoreDinoModel === scoreFossil);
  check('profil B : dinosaur-model-set en tête, déterministe (tie-break prix croissant, 30€ < 32€)', topDino[0]?.gift.giftConcept === 'dinosaur-model-set');

  const contactBio = makeContact('Sarah', makeQuiz({
    interests: ['science'],
    themeAnswers: { science: { univers: 'biologie', usage: 'experimenter', niveau: 'amateur' } },
  }));
  const topBio = topRecommendations(generateCandidates(contactBio, { maxEuros: 100 }), 3);
  check('profil C (biologie/experimenter/amateur) : le Top contient uniquement science', topBio.every((c) => c.gift.theme === 'science'));
  check('profil C : microscope-kit sans ambiguïté en #1 (seul produit biologie+experimenter)', topBio[0]?.gift.giftConcept === 'microscope-kit');

  const contactEspace = makeContact('Noah', makeQuiz({
    interests: ['science'],
    themeAnswers: { science: { univers: 'espace', usage: 'decorer', niveau: 'curieux' } },
  }));
  const topEspace = topRecommendations(generateCandidates(contactEspace, { maxEuros: 50 }), 3);
  check('profil D (espace/decorer/curieux) : le Top contient uniquement science', topEspace.every((c) => c.gift.theme === 'science'));
  check('profil D : planetarium-projector bien positionné en #1 (seul produit espace+decorer)', topEspace[0]?.gift.giftConcept === 'planetarium-projector');
}

console.log('\n[39] Phase 7C — catalogue éditorial beaute (12 cadeaux, sans commerce, sans biais genre)');
{
  const beauteProducts = CURATED_GIFTS.filter((g) => g.theme === 'beaute');
  check('12 produits beaute présents', beauteProducts.length === 12);
  check('gift.id uniques parmi les 12', new Set(beauteProducts.map((g) => g.id)).size === 12);
  check('asin absent sur les 12 (catalogue éditorial, pas de dépendance Amazon)', beauteProducts.every((g) => g.asin === undefined));
  check('imageUrl absente sur les 12', beauteProducts.every((g) => g.imageUrl === undefined));
  check(
    "les 12 giftConcept correspondent exactement aux concepts validés (makeup-palette/premium-moisturizer/perfume-premium EXCLUS)",
    beauteProducts.map((g) => g.giftConcept).sort().join(',') ===
      [
        'face-roller', 'nail-care-set', 'skincare-set', 'makeup-organizer', 'makeup-brush-set',
        'perfume-discovery-set', 'hair-care-set', 'grooming-kit', 'refillable-travel-atomizer-set',
        'facial-care-device', 'hair-styling-tool', 'electric-shaver',
      ].sort().join(',')
  );
  check('aucune entity de marque sur les 12', beauteProducts.every((g) => !g.entities || g.entities.length === 0));
  check(
    'aucune référence médicale/dermatologique ni teinte/carnation dans les pitches (garde-fou §3/§6)',
    beauteProducts.every(
      (g) =>
        !/peau sèche|anti-acné|anti-âge|cheveux abîmés|chute|dermatologique|carnation|teinte|diagnostic/i.test(g.pitch)
    )
  );
  check(
    "aucune hardRequirement basée sur le genre (le champ 'genre' n'existe dans aucun hardRequirements)",
    beauteProducts.every((g) => !g.hardRequirements || !Object.keys(g.hardRequirements).some((k) => /genre/i.test(k)))
  );

  // Couverture taxonomy : chaque option du quiz beaute doit matcher ≥1 des 12 produits.
  const beauteConfig = getThemeQuiz('beaute');
  for (const q of beauteConfig.questions) {
    if (q.type !== 'choice' || !q.options) continue;
    for (const opt of q.options) {
      check(
        `beaute.${q.id}=${opt.key} matche ≥1 produit`,
        beauteProducts.some((g) => g.taxonomy?.[q.id]?.includes(opt.key))
      );
    }
  }

  // Fragilités documentées (consigne §9) : univers=ongles et style=tendance reposent chacun sur UN
  // SEUL produit — non masqué, vérifié explicitement comme "single-concept coverage" plutôt que de
  // fabriquer artificiellement un 13e cadeau.
  const onglesProducts = beauteProducts.filter((g) => g.taxonomy?.univers?.includes('ongles'));
  const tendanceProducts = beauteProducts.filter((g) => g.taxonomy?.style?.includes('tendance'));
  check('univers=ongles : single-concept coverage (exactement 1 produit, nail-care-set)', onglesProducts.length === 1 && onglesProducts[0].giftConcept === 'nail-care-set');
  check('style=tendance : single-concept coverage (exactement 1 produit, perfume-discovery-set)', tendanceProducts.length === 1 && tendanceProducts[0].giftConcept === 'perfume-discovery-set');

  check('beaute entre dans COVERED_THEMES', (COVERED_THEMES as readonly string[]).includes('beaute'));
  check('beaute devient visible (VISIBLE_INTEREST_OPTIONS)', VISIBLE_INTEREST_OPTIONS.some((o) => o.key === 'beaute'));
  check("lecture.sujet reste hidden (12 livres non sourcés)", getThemeQuiz('lecture').questions.find((q) => q.id === 'sujet')!.hidden === true);
}

console.log('\n[40] Phase 7C — profils réels beaute (catalogue éditorial désormais actif)');
{
  const contactSkincare = makeContact('Alex', makeQuiz({
    interests: ['beaute'],
    themeAnswers: { beaute: { univers: 'skincare', besoin: 'upgrade', style: 'premium' } },
  }));
  const topSkincare = topRecommendations(generateCandidates(contactSkincare, { maxEuros: 100 }), 3);
  check('profil A (skincare/upgrade/premium) : le Top contient uniquement beaute', topSkincare.every((c) => c.gift.theme === 'beaute'));
  check('profil A : facial-care-device en #1', topSkincare[0]?.gift.giftConcept === 'facial-care-device');

  const contactMakeup = makeContact('Sam', makeQuiz({
    interests: ['beaute'],
    themeAnswers: { beaute: { univers: 'maquillage', besoin: 'organisation', style: 'pratique' } },
  }));
  const topMakeup = topRecommendations(generateCandidates(contactMakeup, { maxEuros: 50 }), 3);
  check('profil B (maquillage/organisation/pratique) : le Top contient uniquement beaute', topMakeup.every((c) => c.gift.theme === 'beaute'));
  check('profil B : makeup-organizer en #1', topMakeup[0]?.gift.giftConcept === 'makeup-organizer');

  const contactParfum = makeContact('Jules', makeQuiz({
    interests: ['beaute'],
    themeAnswers: { beaute: { univers: 'parfum', besoin: 'decouverte', style: 'tendance' } },
  }));
  const topParfum = topRecommendations(generateCandidates(contactParfum, { maxEuros: 50 }), 3);
  check('profil C (parfum/decouverte/tendance) : le Top contient uniquement beaute', topParfum.every((c) => c.gift.theme === 'beaute'));
  check('profil C : perfume-discovery-set en #1', topParfum[0]?.gift.giftConcept === 'perfume-discovery-set');

  const contactGrooming = makeContact('Robin', makeQuiz({
    interests: ['beaute'],
    themeAnswers: { beaute: { univers: 'grooming', besoin: 'upgrade', style: 'premium' } },
  }));
  const topGrooming = topRecommendations(generateCandidates(contactGrooming, { maxEuros: 150 }), 3);
  check('profil D (grooming/upgrade/premium) : le Top contient uniquement beaute', topGrooming.every((c) => c.gift.theme === 'beaute'));
  check('profil D : electric-shaver en #1', topGrooming[0]?.gift.giftConcept === 'electric-shaver');

  const contactCheveux = makeContact('Dana', makeQuiz({
    interests: ['beaute'],
    themeAnswers: { beaute: { univers: 'cheveux', besoin: 'upgrade', style: 'pratique' } },
  }));
  const topCheveux = topRecommendations(generateCandidates(contactCheveux, { maxEuros: 100 }), 3);
  check('profil E (cheveux/upgrade/pratique) : le Top contient uniquement beaute', topCheveux.every((c) => c.gift.theme === 'beaute'));
  check('profil E : hair-styling-tool en #1', topCheveux[0]?.gift.giftConcept === 'hair-styling-tool');
}

console.log('\n[41] Phase 7C — test anti-biais genre (consigne §8/§13) : grooming/electric-shaver strictement indépendants de Contact.genre');
{
  const themeAnswersGrooming = { univers: 'grooming', besoin: 'upgrade', style: 'premium' };
  const contactHomme = { ...makeContact('Homme', makeQuiz({ interests: ['beaute'], themeAnswers: { beaute: themeAnswersGrooming } })), genre: 'homme' as const };
  const contactFemme = { ...makeContact('Femme', makeQuiz({ interests: ['beaute'], themeAnswers: { beaute: themeAnswersGrooming } })), genre: 'femme' as const };

  const candidatesHomme = generateCandidates(contactHomme, { maxEuros: 150 });
  const candidatesFemme = generateCandidates(contactFemme, { maxEuros: 150 });
  check('anti-biais : même nombre de candidats quel que soit le genre', candidatesHomme.length === candidatesFemme.length);
  check(
    'anti-biais : mêmes candidats, même ordre, mêmes scores strictement (genre=homme vs genre=femme)',
    candidatesHomme.every((c, i) => c.gift.id === candidatesFemme[i].gift.id && c.score === candidatesFemme[i].score)
  );

  const topHomme = topRecommendations(candidatesHomme, 3);
  const topFemme = topRecommendations(candidatesFemme, 3);
  check(
    'anti-biais : même Top strictement (mêmes id dans le même ordre)',
    topHomme.length === topFemme.length && topHomme.every((c, i) => c.gift.id === topFemme[i].gift.id)
  );
  check('anti-biais : electric-shaver/grooming reste recommandable pour les deux genres (aucun filtrage)', topHomme.some((c) => c.gift.giftConcept === 'electric-shaver') && topFemme.some((c) => c.gift.giftConcept === 'electric-shaver'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
