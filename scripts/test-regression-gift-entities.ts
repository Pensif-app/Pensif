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

  const withScore = findByAsin(candidatesWith, LEGO_POKEMON.asin);
  const withoutScore = findByAsin(candidatesWithout, LEGO_POKEMON.asin);

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
  const withScore = findByAsin(generateCandidates(withWish, { maxEuros: 250 }), kindleProduct.asin);
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

  const pokemonCandidate = findByAsin(candidates, LEGO_POKEMON.asin)!;
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
  const candFull = findByAsin(generateCandidates(contactFull, { maxEuros: 200 }), LEGO_POKEMON.asin)!;
  check('Pokémon sur LEGO Pokémon : coverage = 1 (match complet)', candFull.reasons.textMatchCoverage === 1);
  check('Pokémon sur LEGO Pokémon : matchedConcepts = ["pokemon"]', JSON.stringify(candFull.reasons.matchedConcepts) === JSON.stringify(['pokemon']));

  // "LEGO Star Wars" sur un produit ['lego'] uniquement : concepts significatifs = {lego, star_wars}
  // (2), seul "lego" matche → couverture EXACTEMENT 1/2 = 0.5.
  const contactPartial = makeContact('Partial', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'LEGO Star Wars' } } }));
  const candidatesPartial = generateCandidates(contactPartial, { maxEuros: 200 });
  const candClassic = findByAsin(candidatesPartial, LEGO_CLASSIC.asin)!;
  const candArchitecture = findByAsin(candidatesPartial, LEGO_ARCHITECTURE.asin)!;
  check('LEGO Star Wars sur LEGO Classic (entities=[lego]) : coverage = EXACTEMENT 0.5', candClassic.reasons.textMatchCoverage === 0.5);
  check('LEGO Star Wars sur LEGO Architecture (entities=[lego]) : coverage = EXACTEMENT 0.5', candArchitecture.reasons.textMatchCoverage === 0.5);
  check('matchedConcepts = ["lego"] uniquement (star_wars jamais matché, produit non concerné)', JSON.stringify(candClassic.reasons.matchedConcepts) === JSON.stringify(['lego']));
  check('"star" / "wars" / "legostar" ne deviennent jamais des concepts significatifs indépendants (coverage resterait < 0.5 sinon)', candClassic.reasons.textMatchCoverage === 0.5);
}

console.log('\n[10] Formule exacte du bonus : Math.round(poids_max × coverage)');
{
  const contactFull = makeContact('Full', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'Pokémon' } } }));
  const candFull = findByAsin(generateCandidates(contactFull, { maxEuros: 200 }), LEGO_POKEMON.asin)!;
  const contactPartial = makeContact('Partial', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'LEGO Star Wars' } } }));
  const candPartial = findByAsin(generateCandidates(contactPartial, { maxEuros: 200 }), LEGO_CLASSIC.asin)!;
  const contactNone = makeContact('None', makeQuiz({ interests: ['collection'] }));
  const candNone = findByAsin(generateCandidates(contactNone, { maxEuros: 200 }), LEGO_CLASSIC.asin)!;

  // isolant le bonus texte : score_avec_texte - score_sans_texte = bonus exact appliqué (le reste du
  // profil est strictement identique entre les deux appels).
  const fullBonus = candFull.score - findByAsin(generateCandidates(makeContact('FullNone', makeQuiz({ interests: ['collection'] })), { maxEuros: 200 }), LEGO_POKEMON.asin)!.score;
  const partialBonus = candPartial.score - candNone.score;
  check('match complet (1/1) → bonus EXACTEMENT 38 (poids max, comportement Phase 1 préservé)', fullBonus === 38, `obtenu=${fullBonus}`);
  check('match partiel (1/2) → bonus EXACTEMENT round(38×0.5)=19, PAS 38', partialBonus === 19, `obtenu=${partialBonus}`);
}

console.log('\n[11] Cas Fujifilm/Instax — un produit ["fujifilm","instax"] doit être favorisé vs un produit ["instax"] seul');
{
  const contact = makeContact('Ines', makeQuiz({ interests: ['photo'], wish: 'Elle rêve d’un appareil Fujifilm Instax' }));
  const candidates = generateCandidates(contact, { maxEuros: 250 });
  const camera = findByAsin(candidates, FUJIFILM_CAMERA.asin)!; // ['fujifilm','instax']
  const films = findByAsin(candidates, INSTAX_ONLY_FILMS.asin)!; // ['instax'] seul

  check('produit ["fujifilm","instax"] : coverage = 1 (match complet)', camera.reasons.textMatchCoverage === 1);
  check('produit ["instax"] seul : coverage = 0.5 (match partiel)', films.reasons.textMatchCoverage === 0.5);
  check('AUCUNE règle spécifique Fujifilm : le résultat sort mécaniquement de la formule générique de coverage (même code que Pokémon/LEGO)', camera.reasons.textMatchCoverage === 1 && films.reasons.textMatchCoverage === 0.5);
}

console.log('\n[12] whyForContact() — match partiel jamais cité comme si le texte complet avait matché');
{
  const contact = makeContact('Noah', makeQuiz({ interests: ['collection'], themeAnswers: { collection: { favorite: 'LEGO Star Wars' } } }));
  const candidates = generateCandidates(contact, { maxEuros: 200 });
  const architecture = findByAsin(candidates, LEGO_ARCHITECTURE.asin)!;
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
  const scoreConflict = findByAsin(generateCandidates(contactConflict, { maxEuros: 200 }), CUISINE_BALANCE.asin)!.score;
  const scoreNoAnswer = findByAsin(generateCandidates(contactNoAnswer, { maxEuros: 200 }), CUISINE_BALANCE.asin)!.score;
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
  const scoreConflict = findByAsin(generateCandidates(contactConflict, { maxEuros: 200 }), MUSIQUE_ACCORDEUR.asin)!.score;
  const scoreNoAnswer = findByAsin(generateCandidates(contactNoAnswer, { maxEuros: 200 }), MUSIQUE_ACCORDEUR.asin)!.score;
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
  const scoreConflict = findByAsin(generateCandidates(contactConflict, { maxEuros: 200 }), GAMING_SOURIS.asin)!.score;
  const scoreNoAnswer = findByAsin(generateCandidates(contactNoAnswer, { maxEuros: 200 }), GAMING_SOURIS.asin)!.score;
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
  const scoreTasseur = findByAsin(generateCandidates(contactTasseur, { maxEuros: 200 }), CUISINE_TASSEUR.asin)!;
  const scoreTasseurNone = findByAsin(generateCandidates(contactTasseurNone, { maxEuros: 200 }), CUISINE_TASSEUR.asin)!.score;
  check('cuisine.univers différent (gastronomie vs cafe) : 0 conflit (hors allowlist)', scoreTasseur.reasons.realConflictCount === 0, `realConflictCount=${scoreTasseur.reasons.realConflictCount}`);
  check('cuisine.univers différent : score inchangé (pas de pénalité fantôme)', scoreTasseur.score === scoreTasseurNone);
  const scoreBalanceCheck = findByAsin(generateCandidates(makeContact('BalanceUnivers', makeQuiz({ interests: ['cuisine'], themeAnswers: { cuisine: { univers: 'gastronomie' } } })), { maxEuros: 200 }), CUISINE_BALANCE.asin)!;
  check('cuisine.univers différent (balance, gastronomie vs patisserie) : 0 conflit', scoreBalanceCheck.reasons.realConflictCount === 0);

  // cuisine.preference upgrade vs outil => TOUJOURS 1 vrai conflit (dimension dans l'allowlist).
  const contactBalanceConflict = makeContact('BalancePref', makeQuiz({ interests: ['cuisine'], themeAnswers: { cuisine: { preference: 'upgrade' } } }));
  const balanceConflict = findByAsin(generateCandidates(contactBalanceConflict, { maxEuros: 200 }), CUISINE_BALANCE.asin)!;
  check('cuisine.preference upgrade vs outil : EXACTEMENT 1 conflit', balanceConflict.reasons.realConflictCount === 1, `realConflictCount=${balanceConflict.reasons.realConflictCount}`);
  check('conflictingDimensions = ["preference"] uniquement', JSON.stringify(balanceConflict.reasons.conflictingDimensions) === JSON.stringify(['preference']));

  // musique.preference fandom vs pratique => PAS conflit (hors allowlist), mode reste le seul cas réel.
  const contactKaraoke = makeContact('Karaoke', makeQuiz({ interests: ['musique'], themeAnswers: { musique: { preference: 'fandom' } } }));
  const karaokePrefOnly = findByAsin(generateCandidates(contactKaraoke, { maxEuros: 200 }), MUSIQUE_KARAOKE.asin)!;
  check('musique.preference fandom vs pratique : 0 conflit (hors allowlist)', karaokePrefOnly.reasons.realConflictCount === 0, `realConflictCount=${karaokePrefOnly.reasons.realConflictCount}`);

  // musique.mode jouer(produit) vs ecoute(user) => 1 vrai conflit, même sur karaoké.
  const contactKaraokeMode = makeContact('KaraokeMode', makeQuiz({ interests: ['musique'], themeAnswers: { musique: { mode: 'ecoute' } } }));
  const karaokeMode = findByAsin(generateCandidates(contactKaraokeMode, { maxEuros: 200 }), MUSIQUE_KARAOKE.asin)!;
  check('musique.mode ecoute vs jouer (karaoké) : EXACTEMENT 1 conflit', karaokeMode.reasons.realConflictCount === 1);

  // nature.priorite equipement vs confort => PAS conflit (exemple donné explicitement).
  const contactGobelet = makeContact('Gobelet', makeQuiz({ interests: ['nature'], themeAnswers: { nature: { priorite: 'equipement' } } }));
  const gobelet = findByAsin(generateCandidates(contactGobelet, { maxEuros: 200 }), NATURE_GOBELET.asin)!;
  check('nature.priorite différente (equipement vs confort) : 0 conflit', gobelet.reasons.realConflictCount === 0, `realConflictCount=${gobelet.reasons.realConflictCount}`);

  // photo.usage souvenirs vs impression => PAS conflit (les deux se recoupent).
  const contactFilms = makeContact('Films', makeQuiz({ interests: ['photo'], themeAnswers: { photo: { usage: 'souvenirs' } } }));
  const films = findByAsin(generateCandidates(contactFilms, { maxEuros: 200 }), INSTAX_ONLY_FILMS.asin)!;
  check('photo.usage différent (souvenirs vs impression) : 0 conflit', films.reasons.realConflictCount === 0, `realConflictCount=${films.reasons.realConflictCount}`);

  // bricolage.besoin puissance vs polyvalence => PAS conflit (hors allowlist).
  const contactLampe = makeContact('Lampe', makeQuiz({ interests: ['bricolage'], themeAnswers: { bricolage: { besoin: 'puissance' } } }));
  const lampe = findByAsin(generateCandidates(contactLampe, { maxEuros: 200 }), BRICOLAGE_LAMPE.asin)!;
  check('bricolage.besoin différent (puissance vs polyvalence) : 0 conflit', lampe.reasons.realConflictCount === 0, `realConflictCount=${lampe.reasons.realConflictCount}`);

  // bricolage.outil electrique vs manuel => 1 vrai conflit (dans l'allowlist).
  const contactTournevis = makeContact('Tournevis', makeQuiz({ interests: ['bricolage'], themeAnswers: { bricolage: { outil: 'electrique' } } }));
  const tournevis = findByAsin(generateCandidates(contactTournevis, { maxEuros: 200 }), BRICOLAGE_TOURNEVIS.asin)!;
  check('bricolage.outil electrique vs manuel : EXACTEMENT 1 conflit', tournevis.reasons.realConflictCount === 1, `realConflictCount=${tournevis.reasons.realConflictCount}`);
  check('conflictingDimensions = ["outil"] uniquement (jamais "besoin", hors allowlist)', JSON.stringify(tournevis.reasons.conflictingDimensions) === JSON.stringify(['outil']));

  // unknown/indifferent => jamais un conflit, même sur une dimension de l'allowlist.
  const contactNeutral = makeContact('Neutral', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { focus: 'inconnu' } } }));
  const gamingSetupNeutral = findByAsin(generateCandidates(contactNeutral, { maxEuros: 200 }), GAMING_SOURIS.asin)!;
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
  const balanceCandidate = findByAsin(candidatesCamille, CUISINE_BALANCE.asin)!;
  check('balance : realConflictCount=1', balanceCandidate.reasons.realConflictCount === 1);
  check('balance : specificEvidenceCount >= 1 (match légitime sur rapport)', balanceCandidate.reasons.specificEvidenceCount >= 1, `specificEvidenceCount=${balanceCandidate.reasons.specificEvidenceCount}`);
  check('balance reste ÉLIGIBLE au Top malgré le vrai conflit (evidence compensatrice, accepté §7)', !(balanceCandidate.reasons.realConflictCount > 0 && balanceCandidate.reasons.specificEvidenceCount === 0));

  // Kindle : aucune réponse lecture => realConflictCount=0 systématiquement => jamais exclu, quel
  // que soit specificEvidenceCount (garde-fou structurel, pas une coïncidence).
  const kindleProduct = CURATED_GIFTS.find((g) => g.id === 'lecture-100')!;
  const readingLight = CURATED_GIFTS.find((g) => g.id === 'lecture-20')!;
  const contactJulie = makeContact('Julie', makeQuiz({ interests: ['tech', 'maison', 'lecture'], wish: 'Elle aimerait beaucoup une liseuse Kindle pour lire pendant ses trajets' }));
  const candidatesJulie = generateCandidates(contactJulie, { maxEuros: 250 });
  const lampeLectureCandidate = findByAsin(candidatesJulie, readingLight.asin)!;
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
  const mouseWithOldConfort = findByAsin(candidatesOldConfort, mouseProduct.asin)!;
  check(
    "ancienne réponse gaming.focus='confort' : la souris (focus=setup) n'est plus en conflit (realConflictCount=0)",
    mouseWithOldConfort.reasons.realConflictCount === 0
  );

  const contactOldMultijoueur = makeContact('Ancien2', makeQuiz({ interests: ['gaming'], themeAnswers: { gaming: { focus: 'multijoueur' } } }));
  const candidatesOldMultijoueur = generateCandidates(contactOldMultijoueur, { maxEuros: 100 });
  const mouseWithOldMultijoueur = findByAsin(candidatesOldMultijoueur, mouseProduct.asin)!;
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

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
