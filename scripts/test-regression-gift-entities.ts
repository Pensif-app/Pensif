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

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
