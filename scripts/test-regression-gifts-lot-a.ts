// Build 9, lot A : pagination 3 par 3 (plafond 12), « J'aime » réversible, libellé « Cadeau prévu ».
// Exécutable sous `npx tsx scripts/test-regression-gifts-lot-a.ts`.
import * as fs from 'fs';
import * as path from 'path';
import { Contact } from '../src/data/types';
import { COVERED_THEMES } from '../src/data/giftCatalog';
import { generateCandidates, topRecommendations } from '../src/data/recommendationEngine';
import { atGiftCap, canCollapse, canShowMore, clampVisibleCount, GIFT_MAX_VISIBLE, GIFT_PAGE_SIZE, nextVisibleCount } from '../src/data/giftPagination';
import { likedGiftIdSet, toggleGiftLike, withGiftLiked, withGiftUnliked } from '../src/data/giftLikes';
import { normalizeQuizProfile } from '../src/data/quiz';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` : ${detail}` : ''}`);
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

console.log('\n[1] Pagination 3 par 3, plafond 12');
{
  check('page de 3 et plafond de 12', GIFT_PAGE_SIZE === 3 && GIFT_MAX_VISIBLE === 12);
  let n = GIFT_PAGE_SIZE;
  const steps = [n];
  while (canShowMore(n, 162)) {
    n = nextVisibleCount(n, 162);
    steps.push(n);
  }
  check('progression 3, 6, 9, 12 puis arrêt', steps.join() === '3,6,9,12', steps.join());
  check('plafond atteint avec 162 candidats : message « affiner »', atGiftCap(12, 162) && !canShowMore(12, 162));
  check('jamais plus de 12 cartes même avec 162 candidats', clampVisibleCount(200, 162) === 12);
  check('moins de 12 candidats : la liste s’arrête aux candidats, sans message de plafond', clampVisibleCount(99, 7) === 7 && !canShowMore(7, 7) && !atGiftCap(7, 7));
  check('exactement 12 candidats : pas de message de plafond', !atGiftCap(12, 12));
  check('2 candidats : 2 cartes, pas de bouton', clampVisibleCount(3, 2) === 2 && !canShowMore(2, 2));
  check('Réduire proposé seulement au-delà de la première page', !canCollapse(3) && canCollapse(6));
  check('liste vide : aucune carte', clampVisibleCount(3, 0) === 0);
}

console.log('\n[2] « J\'aime » réversible, sans doublon');
{
  const t0 = '2026-10-22T10:00:00.000Z';
  let h = withGiftLiked([], 'a', ['a', 'b', 'c'], t0);
  check('un J’aime crée une entrée', h.length === 1 && likedGiftIdSet(h).has('a'));
  const again = withGiftLiked(h, 'a', ['a', 'b', 'c'], t0);
  check('un second J’aime sur la même idée ne duplique rien', again === h && again.length === 1);
  h = toggleGiftLike(h, 'b', ['a', 'b', 'c'], t0);
  check('deux idées aimées', likedGiftIdSet(h).size === 2);
  h = toggleGiftLike(h, 'a', ['a', 'b', 'c'], t0);
  check('toggle sur une idée aimée la retire', !likedGiftIdSet(h).has('a') && likedGiftIdSet(h).has('b'));
  check('les idées affichées sont conservées (pas de reproposition immédiate)', h.some((e) => (e.shownGiftIds ?? []).includes('a')));
  check('retirer une idée non aimée ne change rien', withGiftUnliked(h, 'zzz') === h);
  h = toggleGiftLike(h, 'a', ['a'], t0);
  check('on peut aimer à nouveau après un retrait', likedGiftIdSet(h).has('a'));
}

console.log('\n[3] Le moteur ignore une idée retirée');
{
  const base = (history: any[]): Contact => ({
    id: 'x', prenom: 'T', nom: '', tel: '', date: '1990-01-01', relation: 'Ami', familyRole: null, genre: 'femme',
    initials: 'T', color: 'violet', giftPreparedYear: null, favorite: false, birthdayReminderDays: null,
    quiz: { answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'], interests: ['sport'], avoid: [], wish: '', completedAt: 'x', themeAnswers: {}, feedback: [], recommendationHistory: history, budget: null },
  } as any);
  const top = topRecommendations(generateCandidates(base([]), { maxEuros: 100 }), 3);
  const liked = top[2].gift.id;
  const hLiked = withGiftLiked([], liked, top.map((c) => c.gift.id), '2026-10-22T10:00:00.000Z');
  const scoreOf = (hist: any[], id: string) => generateCandidates(base(hist), { maxEuros: 100 }).find((c) => c.gift.id === id)!.score;
  // une idée proche de celle aimée gagne du score ; après retrait, tout revient comme sans J'aime
  const sibling = generateCandidates(base([]), { maxEuros: 100 }).find((c) => c.gift.id !== liked && c.gift.giftConcept && c.gift.theme === top[2].gift.theme)!;
  const before = scoreOf([], sibling.gift.id);
  const withLike = scoreOf(hLiked, sibling.gift.id);
  const afterRemoval = scoreOf(withGiftUnliked(hLiked, liked), sibling.gift.id);
  check('un J’aime peut faire monter une idée proche', withLike >= before, `${before} → ${withLike}`);
  check('après retrait du J’aime, le score revient à celui sans J’aime', afterRemoval === before, `${before} vs ${afterRemoval}`);
  const nq = normalizeQuizProfile(base(hLiked).quiz!);
  check('l’historique normalisé conserve l’idée aimée', likedGiftIdSet(nq.recommendationHistory).has(liked));
}

console.log('\n[4] Écran Idées : pagination, cœur persistant, libellé');
{
  const screen = read('src', 'screens', 'GiftsScreen.tsx');
  const message = read('src', 'screens', 'MessageScreen.tsx');
  check('plus de « Tout voir »', !screen.includes('Tout voir'));
  check('bouton « Voir 3 idées de plus »', screen.includes('idées de plus') && screen.includes('nextVisibleCount'));
  check('Réduire présent', screen.includes('Réduire'));
  check('message au plafond', screen.includes('Pas convaincu ? Touche'));
  check('le cœur se lit dans l’historique du profil, plus dans un état local', screen.includes('likedGiftIdSet(') && !screen.includes('setLikedGiftIds'));
  check('le cœur bascule via toggleGiftLike', screen.includes('toggleGiftLike('));
  check('un changement de budget revient à la première page', /function commitSlider[\s\S]{0,400}setVisibleCount\(GIFT_PAGE_SIZE\)/.test(screen));
  check('libellé « Cadeau prévu » sur l’écran Idées et l’écran Message', screen.includes("'Cadeau prévu'") && message.includes("'Cadeau prévu'"));
  check('plus aucun « Cadeau déjà envoyé » dans l’app', !screen.includes('Cadeau déjà envoyé') && !message.includes('Cadeau déjà envoyé'));
  // sanity : 162 candidats possibles avec un seul thème (cause du problème d’origine)
  const one = generateCandidates({
    id: 'x', prenom: 'T', nom: '', tel: '', date: '1990-01-01', relation: 'Ami', familyRole: null, genre: 'femme', initials: 'T', color: 'violet',
    giftPreparedYear: null, favorite: false, birthdayReminderDays: null,
    quiz: { answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'], interests: [COVERED_THEMES[0]], avoid: [], wish: '', completedAt: 'x', themeAnswers: {}, feedback: [], recommendationHistory: [], budget: null },
  } as any, { maxEuros: Infinity }, [], { linkableOnly: true });
  check('cas d’origine (1 thème, budget illimité) : > 12 candidats, la liste affichée reste ≤ 12', one.length > 12 && clampVisibleCount(999, one.length) === 12, `${one.length}`);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
