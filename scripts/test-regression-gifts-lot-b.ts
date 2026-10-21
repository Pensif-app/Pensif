// Build 9, lot B : « Mes idées » et « Offrir celle-ci ». Exécutable sous `npx tsx scripts/test-regression-gifts-lot-b.ts`.
import * as fs from 'fs';
import * as path from 'path';
import { Contact } from '../src/data/types';
import { CURATED_GIFTS } from '../src/data/giftCatalog';
import { occurrenceYear } from '../src/data/calendar';
import { withGiftLiked } from '../src/data/giftLikes';
import { chosenGiftFor, savedGiftIdsLatestFirst, savedIdeasFor, withChosenGift, withIdeaRemoved, withoutChosenGift } from '../src/data/myIdeas';
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

const today = new Date(2026, 9, 22); // 22 octobre 2026
const [A, B, C] = CURATED_GIFTS.filter((g) => g.asin).slice(0, 3);
function contact(history: any[] = [], extra: Record<string, unknown> = {}, giftPreparedYear: number | null = null): Contact {
  return {
    id: 'x', prenom: 'Yohan', nom: '', tel: '', date: '1990-11-05', relation: 'Famille', familyRole: 'Frère', genre: 'homme',
    initials: 'Y', color: 'violet', giftPreparedYear, favorite: false, birthdayReminderDays: null,
    quiz: { answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'], interests: ['sport'], avoid: [], wish: '', completedAt: 'x', themeAnswers: {}, feedback: [], recommendationHistory: history, budget: null, ...extra },
  } as any;
}
let h: any[] = withGiftLiked([], A.id, [A.id, B.id, C.id], '2026-10-01T10:00:00.000Z');
h = withGiftLiked(h, B.id, [B.id], '2026-10-02T10:00:00.000Z');
h = withGiftLiked(h, C.id, [C.id], '2026-10-03T10:00:00.000Z');

console.log('\n[1] Liste « Mes idées »');
{
  const ids = savedGiftIdsLatestFirst(normalizeQuizProfile(contact(h).quiz!).recommendationHistory);
  check('la plus récente en premier', ids.join() === [C.id, B.id, A.id].join(), ids.join());
  check('savedIdeasFor résout les idées dans le catalogue', savedIdeasFor(contact(h)).map((g) => g.id).join() === [C.id, B.id, A.id].join());
  check('profil sans historique : liste vide', savedIdeasFor(contact([])).length === 0);
  check('profil sans quiz : liste vide', savedIdeasFor({ ...contact(), quiz: null } as any).length === 0);
  const ghost = withGiftLiked(h, 'produit-disparu', [], '2026-10-04T10:00:00.000Z');
  check('idée disparue du catalogue : ignorée, jamais une erreur', savedIdeasFor(contact(ghost)).length === 3);
  const legacy = [{ at: 'x', shownAsins: [], likedAsins: [A.asin!] }] as any[];
  check('historique ancien (ASIN) converti', savedIdeasFor(contact(legacy)).map((g) => g.id).join() === A.id);
}

console.log('\n[2] « Offrir celle-ci »');
{
  const year = occurrenceYear('1990-11-05', today);
  const c0 = contact(h);
  const c1 = withChosenGift(c0, B.id, today);
  check('cadeau prévu pour l’année en cours', c1.giftPreparedYear === year);
  check('idée choisie mémorisée', c1.quiz!.chosenGift?.giftId === B.id && c1.quiz!.chosenGift?.year === year);
  check('chosenGiftFor retrouve l’idée', chosenGiftFor(c1, today)?.id === B.id);
  const c2 = withChosenGift(c1, C.id, today);
  check('choisir une autre idée remplace la précédente', chosenGiftFor(c2, today)?.id === C.id);
  check('un seul cadeau choisi', Object.keys(c2.quiz!).filter((k) => k === 'chosenGift').length === 1);
  const c3 = withoutChosenGift(c2);
  check('annuler : plus de cadeau prévu ni d’idée choisie', c3.giftPreparedYear === null && chosenGiftFor(c3, today) === null);
  check('les idées aimées sont conservées', savedIdeasFor(c3).length === 3);
  const nextYear = new Date(2027, 0, 10);
  check('année passée : idée choisie ignorée', chosenGiftFor(c1, nextYear) === null);
  check('cadeau décoché (giftPreparedYear remis à null) : idée choisie ignorée', chosenGiftFor({ ...c1, giftPreparedYear: null }, today) === null);
  check('profil sans quiz : inchangé', (withChosenGift({ ...c0, quiz: null } as any, B.id, today) as any).quiz === null);
  check('un profil ancien sans le champ fonctionne', chosenGiftFor(contact(h), today) === null);
}

console.log('\n[3] Retrait d’une idée');
{
  const c1 = withChosenGift(contact(h), B.id, today);
  const r = withIdeaRemoved(c1, A.id);
  check('retirer une idée non choisie garde le cadeau prévu', r.giftPreparedYear === c1.giftPreparedYear && chosenGiftFor(r, today)?.id === B.id);
  check('l’idée retirée disparaît de la liste', !savedIdeasFor(r).some((g) => g.id === A.id) && savedIdeasFor(r).length === 2);
  const r2 = withIdeaRemoved(c1, B.id);
  check('retirer l’idée choisie annule le cadeau prévu', r2.giftPreparedYear === null && chosenGiftFor(r2, today) === null);
}

console.log('\n[4] Synchronisation et écrans');
{
  const repo = read('src', 'lib', 'supabaseRepo.ts');
  check('le profil est envoyé en entier (le champ part et revient sans colonne)', repo.includes('quiz: contact.quiz') && repo.includes('quiz: row.quiz'));
  const normalized = normalizeQuizProfile(withChosenGift(contact(h), A.id, today).quiz!);
  check('normalizeQuizProfile conserve chosenGift', normalized.chosenGift?.giftId === A.id);
  const screen = read('src', 'screens', 'MyIdeasScreen.tsx');
  const gifts = read('src', 'screens', 'GiftsScreen.tsx');
  const message = read('src', 'screens', 'MessageScreen.tsx');
  const nav = read('src', 'navigation', 'RootNavigator.tsx');
  check('écran enregistré dans la navigation', nav.includes('name="MesIdees"') && read('src', 'navigation', 'types.ts').includes('MesIdees: { contactId: string }'));
  check('boutons Offrir celle-ci / Retirer / Voir de nouvelles idées', screen.includes('Offrir celle-ci') && screen.includes('Retirer') && screen.includes('Voir de nouvelles idées'));
  check('état vide', screen.includes('Les idées que tu aimes apparaîtront ici.'));
  check('aucune image ni prix dans Mes idées', !/<Image\b/.test(screen) && !screen.includes('gift.price'));
  check('lien Amazon et mention conditionnés au mode Amazon', screen.includes('amazonEnabled && !!gift.asin') && screen.includes('Partenaire Amazon'));
  check('lien d’accès depuis l’écran Idées', gifts.includes("navigate('MesIdees'") && gifts.includes('Mes idées pour'));
  check('libellé « Cadeau prévu : idée » sur l’écran Idées', gifts.includes('`Cadeau prévu : ${chosenGift.title}`'));
  check('idée choisie affichée dans « Cadeau prévu : … » sur l’écran Message, anniversaire seulement', message.includes('`Cadeau prévu : ${chosenGift.title}`') && message.includes("occasion === 'birthday' ? chosenGiftFor"));
  const edgePrompt = read('supabase', 'functions', 'suggest-message', 'prompt.ts');
  const ctx = read('src', 'data', 'messageSuggestion.ts');
  check('l’idée choisie n’est jamais envoyée au modèle IA', !ctx.includes('chosenGift') && !edgePrompt.includes('chosenGift'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
