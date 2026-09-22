// Tests de non-régression — CHANTIER "Pré-bêta Phase 1 — Amazon Safe Beta" (2026-09-22). Couvre le
// flag `EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED` (src/lib/amazonAffiliate.ts, module PUR) et reproduit
// À L'IDENTIQUE la logique de rendu de GiftsScreen.tsx::RecommendationCard (hasAmazonLink/
// showAmazonImage) — ce fichier importe react-native/expo et ne peut pas être chargé sous tsx, même
// pattern que les autres tests de ce projet (ex. test-regression-quiz-skip.ts pour ThemeAffinage.tsx).
// Vérifie aussi, via le VRAI moteur (generateCandidates/topRecommendations, aucune réimplémentation),
// que le flag n'a AUCUN effet sur le scoring/l'historique.
//
// Usage : npx tsx scripts/test-regression-amazon-safe-beta.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, QuizProfile } from '../src/data/types';
import { CURATED_GIFTS, CuratedGift } from '../src/data/giftCatalog';
import { generateCandidates, topRecommendations } from '../src/data/recommendationEngine';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Reproduit EXACTEMENT `isAmazonAffiliateEnabled()` (amazonAffiliate.ts) — au lieu d'importer le
 *  module réel (dont la valeur serait figée au premier `import`, avant toute mutation de
 *  `process.env` par ce script), on réévalue ici la même logique à chaque appel pour tester
 *  plusieurs valeurs de la variable d'env dans un seul process Node. */
function isAmazonAffiliateEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED;
  return raw === '1' || raw === 'true';
}

/** Reproduit EXACTEMENT GiftsScreen.tsx::RecommendationCard (hasAmazonLink/showAmazonImage/
 *  showPrice — ce dernier ajouté par "Pré-bêta Phase 1B", voir son commentaire dédié dans le
 *  fichier réel). */
function renderState(gift: Pick<CuratedGift, 'asin' | 'imageUrl'>, imageFailed: boolean) {
  const amazonEnabled = isAmazonAffiliateEnabled();
  const hasAmazonLink = amazonEnabled && !!gift.asin;
  const showAmazonImage = amazonEnabled && !!gift.imageUrl && !imageFailed;
  const showPrice = amazonEnabled || !gift.asin;
  return { hasAmazonLink, showAmazonImage, showPrice };
}

function makeQuiz(overrides: Partial<QuizProfile>): QuizProfile {
  return {
    answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'],
    interests: [], avoid: [], wish: '', completedAt: new Date().toISOString(),
    budget: null, themeAnswers: {}, feedback: [], recommendationHistory: [], ...overrides,
  };
}
function makeContact(prenom: string, quiz: QuizProfile): Contact {
  return {
    id: `p-${prenom}`, prenom, nom: '', tel: '', date: '2000-01-01', relation: 'Ami',
    familyRole: null, genre: 'homme', initials: prenom[0], color: 'sage', quiz,
    giftPreparedYear: null, favorite: false, birthdayReminderDays: null,
  };
}

const ENV_KEY = 'EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED';
const originalEnv = process.env[ENV_KEY];
function setFlag(value: string | undefined) {
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
}

console.log('\n[1] Flag — valeurs de EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED');
{
  setFlag(undefined);
  check('absent → OFF', isAmazonAffiliateEnabled() === false);
  setFlag('');
  check("'' (vide) → OFF", isAmazonAffiliateEnabled() === false);
  setFlag('0');
  check("'0' → OFF", isAmazonAffiliateEnabled() === false);
  setFlag('false');
  check("'false' → OFF", isAmazonAffiliateEnabled() === false);
  setFlag('yes');
  check("valeur inattendue ('yes') → OFF (comparaison stricte, jamais une coercition)", isAmazonAffiliateEnabled() === false);
  setFlag('1');
  check("'1' → ON", isAmazonAffiliateEnabled() === true);
  setFlag('true');
  check("'true' → ON", isAmazonAffiliateEnabled() === true);
  setFlag(undefined);
}

console.log('\n[2] OFF + gift AVEC asin/imageUrl (catalogue historique) → aucun lien, aucune image distante');
{
  setFlag(undefined);
  const giftWithCommerce = { asin: 'B0886C3SR8', imageUrl: 'https://m.media-amazon.com/images/I/example.jpg' };
  const state = renderState(giftWithCommerce, false);
  check('OFF : hasAmazonLink = false malgré un asin réel', state.hasAmazonLink === false);
  check('OFF : showAmazonImage = false malgré une imageUrl réelle', state.showAmazonImage === false);
}

console.log('\n[3] OFF + gift SANS asin (catalogue éditorial) → rendu normal, identique à avant');
{
  setFlag(undefined);
  const editorialGift = { asin: undefined, imageUrl: undefined };
  const state = renderState(editorialGift, false);
  check('OFF : hasAmazonLink = false (cohérent, jamais de lien fabriqué)', state.hasAmazonLink === false);
  check('OFF : showAmazonImage = false (repli emoji, comportement Phase 6B inchangé)', state.showAmazonImage === false);
}

console.log('\n[4] ON + gift avec asin/imageUrl → comportement historique conservé (mode ON non modifié en profondeur)');
{
  setFlag('1');
  const giftWithCommerce = { asin: 'B0886C3SR8', imageUrl: 'https://m.media-amazon.com/images/I/example.jpg' };
  const state = renderState(giftWithCommerce, false);
  check('ON : hasAmazonLink = true (comportement historique)', state.hasAmazonLink === true);
  check('ON : showAmazonImage = true (comportement historique)', state.showAmazonImage === true);
  setFlag(undefined);
}

console.log('\n[5] ON + gift sans asin (éditorial) → toujours aucun lien fabriqué (le flag ne devine jamais une donnée absente)');
{
  setFlag('1');
  const editorialGift = { asin: undefined, imageUrl: undefined };
  const state = renderState(editorialGift, false);
  check("ON mais asin absent : hasAmazonLink reste false (jamais d'URL devinée)", state.hasAmazonLink === false);
  setFlag(undefined);
}

console.log('\n[6] Catalogue réel — même produit historique (avec asin), OFF vs ON');
{
  const realGift = CURATED_GIFTS.find((g) => g.asin)!; // n'importe quel produit historique réel
  setFlag(undefined);
  const off = renderState(realGift, false);
  setFlag('1');
  const on = renderState(realGift, false);
  setFlag(undefined);
  check(`produit réel "${realGift.id}" — OFF: aucun lien/image`, off.hasAmazonLink === false && off.showAmazonImage === false);
  check(`produit réel "${realGift.id}" — ON: lien/image comme avant`, on.hasAmazonLink === true && on.showAmazonImage === true);
}

console.log('\n[7] Scoring/historique — IDENTIQUE que le flag soit ON ou OFF (le moteur ne le lit jamais)');
{
  const contact = makeContact('T', makeQuiz({ interests: ['tech', 'musique', 'lecture'] }));
  setFlag(undefined);
  const candidatesOff = generateCandidates(contact, { maxEuros: 100 });
  const topOff = topRecommendations(candidatesOff, 3);
  setFlag('1');
  const candidatesOn = generateCandidates(contact, { maxEuros: 100 });
  const topOn = topRecommendations(candidatesOn, 3);
  setFlag(undefined);

  check('même nombre de candidats OFF/ON', candidatesOff.length === candidatesOn.length);
  check(
    'mêmes candidats, même ordre, mêmes scores OFF/ON',
    candidatesOff.every((c, i) => c.gift.id === candidatesOn[i].gift.id && c.score === candidatesOn[i].score),
  );
  check(
    'même Top strictement OFF/ON',
    topOff.length === topOn.length && topOff.every((c, i) => c.gift.id === topOn[i].gift.id),
  );
}

console.log('\n[8] Nouveaux thèmes éditoriaux — strictement inchangés par le flag (jamais de donnée commerce de toute façon)');
{
  const editorialThemeProducts = CURATED_GIFTS.filter((g) => ['jeux_societe', 'science', 'beaute'].includes(g.theme) || (g.theme === 'lecture' && g.taxonomy?.sujet));
  check('au moins un produit éditorial trouvé pour ce test', editorialThemeProducts.length > 0);
  setFlag('1');
  const anyWithAsinOn = editorialThemeProducts.some((g) => renderState(g, false).hasAmazonLink);
  setFlag(undefined);
  check('aucun produit éditorial ne déclenche jamais de lien Amazon, même avec le flag ON (ils n’ont structurellement pas de commerce)', !anyWithAsinOn);
}

console.log('\n[9] Aucun chemin UI n’échappe au flag — audit source exhaustif (grep, pas une supposition)');
{
  const giftsScreenSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'GiftsScreen.tsx'), 'utf-8');
  check("amazonUrl() n'est appelé qu'après avoir vérifié hasAmazonLink (dérivé du flag)", giftsScreenSrc.includes('hasAmazonLink ?') && giftsScreenSrc.includes('amazonUrl(gift.asin!)'));
  check("l'affichage de l'image dépend de showAmazonImage (dérivé du flag), jamais de imageUrl seul", /showAmazonImage \? \(/.test(giftsScreenSrc));

  const allSrcFiles: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) allSrcFiles.push(full);
    }
  }
  walk(path.join(__dirname, '..', 'src'));
  const filesReferencingAmazonUrl = allSrcFiles.filter((f) => fs.readFileSync(f, 'utf-8').includes('amazonUrl'));
  check(
    'amazonUrl() est référencé UNIQUEMENT dans giftCatalog.ts (définition) et GiftsScreen.tsx (seul appelant) — aucun autre chemin UI',
    filesReferencingAmazonUrl.every((f) => f.endsWith('giftCatalog.ts') || f.endsWith('GiftsScreen.tsx')),
    JSON.stringify(filesReferencingAmazonUrl.map((f) => path.relative(path.join(__dirname, '..'), f))),
  );

  const recommendationEngineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'recommendationEngine.ts'), 'utf-8');
  check("recommendationEngine.ts n'importe jamais amazonAffiliate.ts (le flag ne peut pas influencer le scoring)", !recommendationEngineSrc.includes('amazonAffiliate'));
}

console.log('\n[10] Phase 1B — OFF + gift avec asin (historique) → prix masqué');
{
  setFlag(undefined);
  const giftWithAsin = { asin: 'B0886C3SR8', imageUrl: 'https://m.media-amazon.com/images/I/example.jpg' };
  const state = renderState(giftWithAsin, false);
  check('OFF + asin : showPrice = false (snapshot marchand daté jamais affiché comme prix courant)', state.showPrice === false);
}

console.log('\n[11] Phase 1B — OFF + gift sans asin (éditorial) → prix Pensif visible');
{
  setFlag(undefined);
  const editorialGift = { asin: undefined, imageUrl: undefined };
  const state = renderState(editorialGift, false);
  check('OFF sans asin : showPrice = true (prix éditorial Pensif, toujours affichable)', state.showPrice === true);
}

console.log('\n[12] Phase 1B — ON + gift avec asin → comportement historique conservé (prix affiché)');
{
  setFlag('1');
  const giftWithAsin = { asin: 'B0886C3SR8', imageUrl: 'https://m.media-amazon.com/images/I/example.jpg' };
  const state = renderState(giftWithAsin, false);
  check('ON + asin : showPrice = true (comportement historique inchangé)', state.showPrice === true);
  setFlag(undefined);
}

console.log('\n[13] Phase 1B — catalogue réel : showPrice sur un produit historique, OFF vs ON');
{
  const realGift = CURATED_GIFTS.find((g) => g.asin)!;
  setFlag(undefined);
  const off = renderState(realGift, false);
  setFlag('1');
  const on = renderState(realGift, false);
  setFlag(undefined);
  check(`produit réel "${realGift.id}" — OFF: prix masqué`, off.showPrice === false);
  check(`produit réel "${realGift.id}" — ON: prix affiché comme avant`, on.showPrice === true);

  const editorialGift = CURATED_GIFTS.find((g) => !g.asin)!;
  setFlag(undefined);
  const editorialOff = renderState(editorialGift, false);
  check(`produit éditorial "${editorialGift.id}" — OFF: prix toujours affiché`, editorialOff.showPrice === true);
}

console.log('\n[14] Phase 1B — budget/scoring IDENTIQUE OFF/ON (gift.price reste lu tel quel par le moteur, showPrice est purement UI)');
{
  const contact = makeContact('T2', makeQuiz({ interests: ['tech', 'musique', 'lecture'] }));
  setFlag(undefined);
  const candidatesOff = generateCandidates(contact, { maxEuros: 30 });
  setFlag('1');
  const candidatesOn = generateCandidates(contact, { maxEuros: 30 });
  setFlag(undefined);

  check('même nombre de candidats sous contrainte budget serrée OFF/ON', candidatesOff.length === candidatesOn.length);
  check(
    'mêmes candidats filtrés par budget, mêmes prix internes, OFF/ON',
    candidatesOff.every((c, i) => c.gift.id === candidatesOn[i].gift.id && c.gift.price === candidatesOn[i].gift.price),
  );
  check(
    'tous les candidats respectent maxEuros=30 (le moteur lit toujours gift.price, y compris pour les produits historiques dont le prix est masqué à l’écran)',
    candidatesOff.every((c) => c.gift.price <= 30),
  );
}

if (originalEnv === undefined) delete process.env[ENV_KEY];
else process.env[ENV_KEY] = originalEnv;

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
