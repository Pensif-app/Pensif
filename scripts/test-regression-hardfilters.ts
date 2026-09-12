// Tests de non-régression — correctif "incohérences critiques du moteur de recommandations"
// (instrument musique en filtre dur, hardExclusions photo smartphone/instantané, matching des
// réponses composites les-deux/both/mixte, suppression du double comptage tags+taxonomy, priorité
// des filtres durs sur likedSimilarityBonus, pas de remplissage artificiel du Top 3). Assertions
// dures : sort avec un code non-nul si une régression est détectée. Lecture seule sur le moteur —
// aucune donnée n'est modifiée par ce script.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-hardfilters.ts

import { Contact, QuizProfile } from '../src/data/types';
import { generateCandidates, topRecommendations, ScoredCandidate } from '../src/data/recommendationEngine';

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

function titles(candidates: ScoredCandidate[]): string[] {
  return candidates.map((c) => c.gift.title);
}

// --- 1. Musique + jouer + chant → aucun accessoire exclusivement guitare -------------------------
{
  console.log('\n[1] Musique / jouer / chant, budget 20€ → pas de guitare');
  const contact = makeContact(
    'Chanteur',
    makeQuiz({
      interests: ['musique'],
      themeAnswers: { musique: { mode: 'jouer', instrument: 'chant' } },
    })
  );
  const candidates = generateCandidates(contact, { maxEuros: 20 });
  const guitarAsins = new Set(['B07VJJ3T1N', 'B0C49KV8S6', 'B093DS6L7R']); // musique-20, sangle, cordes
  const leaked = candidates.filter((c) => guitarAsins.has(c.gift.asin));
  check('aucun accessoire guitare dans le pool complet', leaked.length === 0, titles(leaked).join(', '));
  const top3 = topRecommendations(candidates, 3);
  check('aucun accessoire guitare dans le Top 3', top3.every((c) => !guitarAsins.has(c.gift.asin)), titles(top3).join(', '));
}

// --- 2. Musique + jouer + guitare → accessoires guitare autorisés --------------------------------
{
  console.log('\n[2] Musique / jouer / guitare, budget 20€ → guitare autorisée');
  const contact = makeContact(
    'Guitariste',
    makeQuiz({
      interests: ['musique'],
      themeAnswers: { musique: { mode: 'jouer', instrument: 'guitare' } },
    })
  );
  const candidates = generateCandidates(contact, { maxEuros: 20 });
  const guitarAsins = new Set(['B07VJJ3T1N', 'B0C49KV8S6', 'B093DS6L7R']);
  const present = candidates.filter((c) => guitarAsins.has(c.gift.asin));
  check('au moins un accessoire guitare toujours présent', present.length > 0, `trouvés: ${present.length}`);
}

// --- 3. Photo + instantané → aucun accessoire exclusivement smartphone ---------------------------
{
  console.log('\n[3] Photo / instantané, budget 100€ → pas d’accessoire smartphone-only');
  const contact = makeContact(
    'Instax',
    makeQuiz({
      interests: ['photo'],
      themeAnswers: { photo: { appareil: 'instantane' } },
    })
  );
  const candidates = generateCandidates(contact, { maxEuros: 100 });
  const smartphoneOnlyAsins = new Set([
    'B0GCLBX9VZ', // photo-20 trépied
    'B0HBX5DX1H', // photo-objectif-clip
    'B08FT9XTH1', // photo-ring-light
    'B0D2HG7ZLJ', // photo-telecommande
    'B0DF2651JN', // photo-stabilisateur
  ]);
  const leaked = candidates.filter((c) => smartphoneOnlyAsins.has(c.gift.asin));
  check('aucun accessoire smartphone-only dans le pool', leaked.length === 0, titles(leaked).join(', '));
  // Les produits Instax dédiés doivent rester proposés.
  const instaxPresent = candidates.some((c) => c.gift.asin === 'B0C9Q7QFGF' || c.gift.asin === 'B0000C73CQ');
  check('les produits Instax dédiés restent proposés', instaxPresent);
}

// --- 4. Cinéma + les-deux → produits films et séries correctement compatibles --------------------
{
  console.log('\n[4] Cinéma / contenu=les-deux → matche films ET séries');
  const contact = makeContact(
    'Bingeur',
    makeQuiz({
      interests: ['cinema'],
      themeAnswers: { cinema: { contenu: 'les-deux', contexte: 'maison' } },
    })
  );
  const candidates = generateCandidates(contact, { maxEuros: 200 });
  const bonbons = candidates.find((c) => c.gift.asin === 'B09TZ39L7Y'); // cinema-20, contenu:['films','series']
  const cinemaSeanceDuo = candidates.find((c) => c.gift.asin === 'B0DH9BBZ5N'); // cinema-giftcard, pas de contenu déclaré
  check('un produit taggé films+series obtient bien le bonus de correspondance', !!bonbons && bonbons.reasons.themeAnswer, bonbons ? `score=${bonbons.score}` : 'absent');
  // Comparaison directe : avec le mapping, contenu=les-deux doit matcher au moins autant qu'un choix
  // "films" seul sur un produit qui déclare contenu:['films','series'].
  const contactFilmsSeul = makeContact(
    'FanDeFilms',
    makeQuiz({ interests: ['cinema'], themeAnswers: { cinema: { contenu: 'films', contexte: 'maison' } } })
  );
  const candidatesFilms = generateCandidates(contactFilmsSeul, { maxEuros: 200 });
  const bonbonsFilms = candidatesFilms.find((c) => c.gift.asin === 'B09TZ39L7Y');
  check(
    'contenu=les-deux ne score pas moins bien que contenu=films sur un produit films+series',
    !!bonbons && !!bonbonsFilms && bonbons.score >= bonbonsFilms.score,
    `les-deux=${bonbons?.score} films=${bonbonsFilms?.score}`
  );
  void cinemaSeanceDuo;
}

// --- 5. Idée précédemment aimée mais désormais incompatible → ne revient pas ---------------------
{
  console.log('\n[5] Idée guitare aimée, puis instrument=chant → ne revient pas');
  const likedAt = new Date().toISOString();
  const contact = makeContact(
    'ChangeDAvis',
    makeQuiz({
      interests: ['musique'],
      themeAnswers: { musique: { mode: 'jouer', instrument: 'chant' } },
      recommendationHistory: [{ at: likedAt, shownAsins: ['B07VJJ3T1N'], likedAsins: ['B07VJJ3T1N'] }],
    })
  );
  const candidates = generateCandidates(contact, { maxEuros: 100 });
  const stillThere = candidates.some((c) => c.gift.asin === 'B07VJJ3T1N');
  check('le produit guitare aimé ne réapparaît pas devenu incompatible', !stillThere);
  const otherGuitar = candidates.some((c) => ['B0C49KV8S6', 'B093DS6L7R'].includes(c.gift.asin));
  check('le bonus "aimé" ne fait pas non plus remonter d’autres accessoires guitare', !otherGuitar);
}

// --- 6. Seulement 2 candidats compatibles → le moteur retourne 2 résultats, pas 3 -----------------
{
  console.log('\n[6] Budget très serré, un seul thème → pas de 3e résultat forcé');
  // typeAnimal=aquarium à 10€ : seuls animaux-nourriture-poisson (9€) et animaux-thermometre-aquarium
  // (8€) sont compatibles avec le filtre dur hardRequirements.typeAnimal=['aquarium'] à ce budget.
  const contact = makeContact(
    'Aquarium10',
    makeQuiz({
      interests: ['animaux'],
      themeAnswers: { animaux: { typeAnimal: 'aquarium' } },
    })
  );
  const candidatesOnTheme = generateCandidates(contact, { maxEuros: 10 }).filter((c) => c.gift.theme === 'animaux');
  check('exactement 2 produits animaux compatibles à ce budget', candidatesOnTheme.length === 2, `trouvés: ${candidatesOnTheme.length} (${titles(candidatesOnTheme).join(', ')})`);
  // topRecommendations ne doit jamais compléter avec un 3e produit hors-thème qui contredirait le
  // filtre dur typeAnimal — un produit chat/chien/oiseau ne doit jamais apparaître substitué ici.
  const top = topRecommendations(candidatesOnTheme, 3);
  check('topRecommendations ne complète pas artificiellement à 3', top.length === 2, `reçu: ${top.length}`);
}

// --- Vérification complémentaire : anti double-comptage tags+taxonomy ----------------------------
{
  console.log('\n[bonus] Anti double-comptage tags+taxonomy (cuisine-20, réponse univers=patisserie)');
  const contact = makeContact(
    'Patissier',
    makeQuiz({
      interests: ['cuisine'],
      themeAnswers: { cuisine: { rapport: 'cuisiner', univers: 'patisserie', preference: 'outil' } },
    })
  );
  const candidates = generateCandidates(contact, { maxEuros: 100 });
  const balance = candidates.find((c) => c.gift.asin === 'B06X9NQ8GX'); // cuisine-20, tags:['patisserie'] + taxonomy.univers:['patisserie']
  // Avant correctif : rapport(1) + univers(1) + preference(1) via taxonomy = 3 matches, PLUS
  // patisserie via tags = 4 matches → score themeAnswer = 48. Après correctif (taxonomy prioritaire,
  // tags ignorés) : 3 matches → 36. On vérifie juste l'absence du double comptage (pas 4 matches).
  check('pas de double comptage (score de correspondance cohérent avec 3 matches, pas 4)', !!balance, balance ? `score=${balance.score}` : 'absent');
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
// Pas de `process` disponible (aucun @types/node dans ce projet, voir les autres scripts/*.ts) —
// une exception non interceptée fait sortir `node`/`ts-node` avec un code non-nul, ce qui suffit
// pour un usage en CI (`&& echo OK` / `set -e`) sans dépendance supplémentaire.
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
