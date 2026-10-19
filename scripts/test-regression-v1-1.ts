// v1.1 — liens Amazon seuls, ciblage du budget, questions d'affinage utiles, langue de la fiche.
// Module pur : exécutable sous `npx tsx scripts/test-regression-v1-1.ts`.
import * as fs from 'fs';
import * as path from 'path';
import { Contact } from '../src/data/types';
import { CURATED_GIFTS, COVERED_THEMES, amazonUrl } from '../src/data/giftCatalog';
import { generateCandidates, topRecommendations, budgetFitBonus, budgetTargetFor } from '../src/data/recommendationEngine';
import { visibleInterestOptions, VISIBLE_INTEREST_OPTIONS, MIN_LINKABLE_PRODUCTS_PER_THEME } from '../src/data/quiz';
import { getThemeQuiz } from '../src/data/themeQuizzes';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function contact(interests: string[], themeAnswers: Record<string, Record<string, string>> = {}, feedback: any[] = []): Contact {
  return {
    id: 'x', prenom: 'T', nom: '', tel: '', date: '1990-01-01', relation: 'Ami', familyRole: null, genre: 'femme',
    initials: 'T', color: 'violet', giftPreparedYear: null, favorite: false, birthdayReminderDays: null,
    quiz: {
      answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'], interests, avoid: [], wish: '', completedAt: 'x',
      themeAnswers, feedback, recommendationHistory: [], budget: null,
    },
  } as any;
}

console.log('\n[1] linkableOnly — aucun produit sans ASIN, moteur toujours pur');
{
  const noLink = CURATED_GIFTS.filter((g) => !g.asin).length;
  check('le catalogue contient bien des produits sans lien (cas à masquer)', noLink > 0);
  let leaked = 0;
  let empty = 0;
  for (const theme of COVERED_THEMES) {
    for (const maxEuros of [20, 40, 70, 100, Infinity]) {
      const all = generateCandidates(contact([theme]), { maxEuros }, [], { linkableOnly: true });
      leaked += all.filter((c) => !c.gift.asin).length;
      if (topRecommendations(all, 3).length === 0 && VISIBLE_INTEREST_OPTIONS.some((o) => o.key === theme) && maxEuros >= 40) empty++;
    }
  }
  check('aucun candidat sans ASIN avec linkableOnly', leaked === 0, `${leaked} fuites`);
  check('jamais de top-3 vide (budget ≥ 40 €) avec linkableOnly', empty === 0, `${empty} cas vides`);
  const withDefault = generateCandidates(contact(['tech']), { maxEuros: 100 });
  check('sans option, comportement inchangé (produits sans lien autorisés)', withDefault.length > 0);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'recommendationEngine.ts'), 'utf8');
  check("le moteur n'importe toujours pas amazonAffiliate", !src.includes('amazonAffiliate'));
}

console.log('\n[2] Thèmes proposés en mode Amazon');
{
  const on = visibleInterestOptions(true).map((o) => o.key as string);
  const off = visibleInterestOptions(false).map((o) => o.key as string);
  check('mode inactif : sélecteur inchangé', off.length === VISIBLE_INTEREST_OPTIONS.length);
  for (const t of ['jeux_societe', 'science', 'beaute']) check(`mode actif : ${t} retiré`, !on.includes(t));
  check(
    `mode actif : chaque thème proposé a ≥ ${MIN_LINKABLE_PRODUCTS_PER_THEME} produits à lien`,
    on.every((t) => CURATED_GIFTS.filter((g) => g.theme === t && g.asin).length >= MIN_LINKABLE_PRODUCTS_PER_THEME),
  );
  check('mode actif : lecture reste proposée', on.includes('lecture'));
  // Un proche ayant déjà choisi un thème retiré reçoit toujours des idées.
  const legacy = generateCandidates(contact(['science']), { maxEuros: 70 }, [], { linkableOnly: true });
  check('proche avec un thème retiré : des idées sont proposées (repli catalogue)', topRecommendations(legacy, 3).length === 3);
}

console.log('\n[3] Ciblage du budget');
{
  check('bonus : ≥ 60 % du budget → +14', budgetFitBonus(60, 100) === 14);
  check('bonus : 40–60 % → +6', budgetFitBonus(50, 100) === 6 && budgetFitBonus(40, 100) === 6);
  check('bonus : < 40 % → 0', budgetFitBonus(39, 100) === 0);
  check('budget illimité : ≥ 70 € → +14 ; 45–70 € → +6 ; sinon 0', budgetFitBonus(70, budgetTargetFor(Infinity, [])) === 14 && budgetFitBonus(50, budgetTargetFor(Infinity, [])) === 6 && budgetFitBonus(30, budgetTargetFor(Infinity, [])) === 0);

  let near = 0, total = 0, onTheme = 0, onThemeTotal = 0;
  for (const theme of COVERED_THEMES) {
    for (const B of [70, 100]) {
      const top = topRecommendations(generateCandidates(contact([theme]), { maxEuros: B }), 3);
      for (const c of top) {
        total++;
        if (c.gift.price >= 0.5 * B && c.gift.price <= B) near++;
        onThemeTotal++;
        if (c.gift.theme === theme) onTheme++;
      }
    }
  }
  const shareNear = near / total;
  console.log(`  part du top-3 entre 50 % et 100 % du budget (B = 70, 100) : ${(shareNear * 100).toFixed(0)} %`);
  // Plafond théorique : part du top-3 qu'on PEUT remplir avec des produits du thème dans [50 %, 100 %] du budget.
  let feasible = 0;
  let feasibleTotal = 0;
  for (const theme of COVERED_THEMES) {
    for (const B of [70, 100]) {
      const pool = CURATED_GIFTS.filter((g) => g.theme === theme && g.price >= 0.5 * B && g.price <= B).length;
      feasible += Math.min(3, pool);
      feasibleTotal += 3;
    }
  }
  console.log(`  plafond théorique avec le catalogue actuel : ${((feasible / feasibleTotal) * 100).toFixed(0)} % (avant v1.1 : ≈ 5 %)`);
  check('le ciblage atteint au moins 70 % du plafond permis par le catalogue (et bien plus que les 5 % d’avant)', shareNear >= 0.7 * (feasible / feasibleTotal) && shareNear >= 0.3, `part=${shareNear}`);
  check('les idées restent sur le thème choisi (≥ 90 %)', onTheme / onThemeTotal >= 0.9, `part=${onTheme / onThemeTotal}`);
  const a = topRecommendations(generateCandidates(contact(['sport']), { maxEuros: 100 }), 3).map((c) => c.gift.id).join();
  const b = topRecommendations(generateCandidates(contact(['sport']), { maxEuros: 100 }), 3).map((c) => c.gift.id).join();
  check('déterministe', a === b);
  check('plafond dur inchangé (aucune idée au-dessus du budget)', generateCandidates(contact(['sport']), { maxEuros: 40 }).every((c) => c.gift.price <= 40));
}

console.log('\n[4] « Trop cher » abaisse la cible de budget');
{
  const fb = (n: number) => Array.from({ length: n }, (_, i) => ({ giftId: `none-${i}`, reason: 'too_expensive', at: 'x' }));
  check('0 refus : cible = budget', budgetTargetFor(100, []) === 100);
  check('1 refus : −20 %', Math.abs(budgetTargetFor(100, fb(1)) - 80) < 1e-9);
  check('2 refus : −36 %', Math.abs(budgetTargetFor(100, fb(2)) - 64) < 1e-9);
  check('plafonné à 2 refus', Math.abs(budgetTargetFor(100, fb(5)) - 64) < 1e-9);
  // Un produit à 35–39 € (0 point à budget 100) gagne +6 une fois la cible abaissée à 80 € ; un produit à 90 € garde +14.
  const cheap = CURATED_GIFTS.find((g) => g.theme === 'sport' && g.price >= 35 && g.price < 40)!;
  const pricey = CURATED_GIFTS.find((g) => g.theme === 'sport' && g.price >= 85 && g.price <= 100)!;
  check('produits de test trouvés dans le catalogue', !!cheap && !!pricey);
  const score = (c: Contact, id: string) => generateCandidates(c, { maxEuros: 100 }).find((x) => x.gift.id === id)!.score;
  const base = contact(['sport']);
  const refused = contact(['sport'], {}, fb(2));
  check('après 2 « Trop cher », un produit moins cher monte', score(refused, cheap.id) > score(base, cheap.id), `${cheap.id}`);
  check('après 2 « Trop cher », un produit proche du budget initial garde son bonus', score(refused, pricey.id) === score(base, pricey.id), `${pricey.id}`);
}

console.log('\n[5] Questions d’affinage rendues utiles');
{
  const EFFECTIVE: Record<string, string> = { sport: 'niveau', nature: 'niveau', bricolage: 'niveau', danse: 'niveau', auto: 'frequence' };
  for (const [theme, qid] of Object.entries(EFFECTIVE)) {
    const q = getThemeQuiz(theme as any).questions.find((x) => x.id === qid)!;
    const keys = (q.options ?? []).map((o) => o.key);
    const tagged = CURATED_GIFTS.filter((g) => g.theme === theme && g.taxonomy?.[qid]);
    check(`${theme}.${qid} : question visible`, !q.hidden);
    check(`${theme}.${qid} : valeurs de taxonomie valides`, tagged.every((g) => g.taxonomy![qid]!.every((v) => keys.includes(v))));
    for (const k of keys) {
      const n = tagged.filter((g) => g.taxonomy![qid]!.includes(k)).length;
      check(`${theme}.${qid}=${k} : au moins un produit ciblé`, n >= 1, `${n}`);
    }
    // Effet réel : répondre fait gagner un produit correspondant (+12) par rapport à ne pas répondre.
    for (const k of keys) {
      const target = tagged.find((g) => g.taxonomy![qid]!.includes(k))!;
      const without = generateCandidates(contact([theme]), { maxEuros: Infinity }).find((c) => c.gift.id === target.id)!;
      const withAns = generateCandidates(contact([theme], { [theme]: { [qid]: k } }), { maxEuros: Infinity }).find((c) => c.gift.id === target.id)!;
      check(`${theme}.${qid}=${k} : le produit ciblé "${target.id}" gagne du score`, withAns.score > without.score, `${without.score} → ${withAns.score}`);
    }
  }
  check('gaming.social masquée', getThemeQuiz('gaming' as any).questions.find((q) => q.id === 'social')!.hidden === true);
  check('bienetre.frequence masquée', getThemeQuiz('bienetre' as any).questions.find((q) => q.id === 'frequence')!.hidden === true);
}

console.log('\n[6] Lien affilié et configuration');
{
  const asin = CURATED_GIFTS.find((g) => g.asin)!.asin!;
  check('lien Amazon.fr + identifiant pensif-21', amazonUrl(asin) === `https://www.amazon.fr/dp/${asin}?tag=pensif-21`);
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  const plist = cfg.expo.ios.infoPlist;
  check('langue de développement = fr', plist.CFBundleDevelopmentRegion === 'fr');
  check('localisations = [fr]', JSON.stringify(plist.CFBundleLocalizations) === '["fr"]');
  const screen = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'GiftsScreen.tsx'), 'utf8');
  check('bouton « Voir sur Amazon » présent', screen.includes('Voir sur Amazon'));
  const settings = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'SettingsScreen.tsx'), 'utf8');
  check('mention d’affiliation unique sur l’écran des idées, conditionnée au mode Amazon', (screen.match(/Partenaire Amazon/g) ?? []).length === 1 && screen.includes('{isAmazonAffiliateEnabled() && ('));
  check('aucune mention répétée sur chaque carte', !screen.includes('Lien affilié ·'));
  check('mention d’affiliation dans les Réglages, conditionnée au mode Amazon', settings.includes('liens affiliés') && settings.includes('isAmazonAffiliateEnabled()') && settings.includes('Partenaire Amazon'));
  check('deux motifs de refus seulement : trop cher / je n’aime pas', screen.includes("reason: 'too_expensive'") && screen.includes("reason: 'not_his_style'") && !screen.includes('REJECT_REASON_LABELS'));
  check('« Trop cher » abaisse le curseur sans alerte', !screen.includes('Alert.alert') && screen.includes('commitSlider(lower)'));
  check('le bouton est le seul point d’ouverture du lien', (screen.match(/Linking\.openURL/g) ?? []).length === 1);
  check('GiftsScreen passe linkableOnly au moteur', screen.includes('linkableOnly: isAmazonAffiliateEnabled()'));
}

console.log('\n[7] Aucune image Amazon stockée (Licence PI, art. 2.c.viii)');
{
  check('aucun produit du catalogue ne porte d’imageUrl', CURATED_GIFTS.every((g) => (g as any).imageUrl === undefined));
  const catalogSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'giftCatalog.ts'), 'utf8');
  check('aucune URL d’image Amazon dans le code du catalogue', !catalogSrc.includes('media-amazon.com'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
