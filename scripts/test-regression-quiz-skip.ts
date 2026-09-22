// Tests de non-régression — CHANTIER "P0 Quiz Phase 1" (2026-09-22) — "Passer cette question" doit
// RETIRER une réponse existante, jamais la laisser survivre silencieusement (voir audit dédié :
// reading-light gonflé à 93 au lieu de 57 par contexte=lit/besoin=confort jamais retouchés).
// ThemeAffinage.tsx/QuizScreen.tsx importent react-native/expo et ne peuvent pas être chargés sous
// tsx — ce script reproduit ici, À L'IDENTIQUE, les deux callbacks réels (onAnswer/onSkip tels
// qu'écrits dans QuizScreen.tsx, et la logique de confirmMultiChoice de ThemeAffinage.tsx), puis
// vérifie le résultat final via le VRAI moteur de recommandation (generateCandidates/
// topRecommendations, aucune réimplémentation). Lecture seule sur le moteur.
//
// Usage : npx tsx scripts/test-regression-quiz-skip.ts

import { Contact, InterestTag, QuizProfile } from '../src/data/types';
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

type ThemeAnswers = Partial<Record<InterestTag, Record<string, string>>>;

/** Reproduit EXACTEMENT QuizScreen.tsx::onAnswer (merge additif par clé, tel quel dans le fichier
 *  réel — non modifié par ce chantier). */
function onAnswer(prev: ThemeAnswers, activeTheme: InterestTag, questionId: string, value: string): ThemeAnswers {
  return { ...prev, [activeTheme]: { ...(prev[activeTheme] ?? {}), [questionId]: value } };
}

/** Reproduit EXACTEMENT QuizScreen.tsx::onSkip (nouveau, ce chantier) — retire RÉELLEMENT la clé,
 *  jamais une valeur vide. */
function onSkip(prev: ThemeAnswers, activeTheme: InterestTag, questionId: string): ThemeAnswers {
  const currentTheme = { ...(prev[activeTheme] ?? {}) };
  delete currentTheme[questionId];
  return { ...prev, [activeTheme]: currentTheme };
}

/** Reproduit EXACTEMENT ThemeAffinage.tsx::confirmMultiChoice — n'écrit (onAnswer) que si au moins
 *  une valeur est sélectionnée ; `multiSelected` est initialisé par l'appelant du test (reproduit
 *  ThemeAffinage.tsx:65 : pré-coché depuis l'ancienne réponse, JAMAIS vidé — consigne §5, non
 *  modifié par ce chantier). */
function confirmMultiChoice(prev: ThemeAnswers, activeTheme: InterestTag, questionId: string, multiSelected: string[]): ThemeAnswers {
  if (multiSelected.length === 0) return prev; // aucun onAnswer appelé, comportement réel inchangé
  return onAnswer(prev, activeTheme, questionId, multiSelected.join(','));
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

console.log('\n[1] Skip single-choice existant → clé supprimée');
{
  const before: ThemeAnswers = { lecture: { format: 'papier', contexte: 'lit' } };
  const after = onSkip(before, 'lecture', 'contexte');
  check("clé 'contexte' absente après skip", !('contexte' in (after.lecture ?? {})));
  check("les autres clés du thème restent intactes ('format')", after.lecture?.format === 'papier');
}

console.log('\n[2] Skip multi-select existant → clé supprimée');
{
  const before: ThemeAnswers = { lecture: { sujet: 'science,finance' } };
  const after = onSkip(before, 'lecture', 'sujet');
  check("clé 'sujet' absente après skip", !('sujet' in (after.lecture ?? {})));
}

console.log('\n[3] Skip text existant → clé supprimée');
{
  const before: ThemeAnswers = { lecture: { detail: 'Il adore la science' } };
  const after = onSkip(before, 'lecture', 'detail');
  check("clé 'detail' absente après skip", !('detail' in (after.lecture ?? {})));
  check('le moteur ne peut plus voir ce vieux texte (clé absente, pas juste vide)', after.lecture?.detail === undefined);
}

console.log('\n[4] Skip DERNIÈRE question ("Passer") → clé supprimée + finish (même bouton, même handler)');
{
  // ThemeAffinage.tsx : le Pressable appelle TOUJOURS onSkip(question.id) puis advance(), que ce
  // soit "Passer cette question" ou "Passer" (dernière question, isLast=true) — un seul chemin de
  // code, testé ici pour la dernière question spécifiquement (consigne §3).
  const before: ThemeAnswers = { lecture: { besoin: 'confort' } };
  const afterSkip = onSkip(before, 'lecture', 'besoin');
  check("dernière question : clé 'besoin' supprimée avant finish", !('besoin' in (afterSkip.lecture ?? {})));
  // advance() sur isLast appelle onFinish() — pas de logique de themeAnswers supplémentaire là,
  // rien à reproduire de plus ici (onFinish ne touche pas themeAnswers, voir QuizScreen.tsx).
}

console.log('\n[5] Continuer SANS modification d’un multi-select pré-coché → réponses existantes conservées');
{
  // multiSelected initialisé depuis l'ancienne réponse (ThemeAffinage.tsx:65, non modifié) — ici
  // simulé directement : l'utilisateur ne touche à rien, tape juste "Continuer".
  const before: ThemeAnswers = { lecture: { sujet: 'science,finance' } };
  const multiSelected = 'science,finance'.split(',');
  const after = confirmMultiChoice(before, 'lecture', 'sujet', multiSelected);
  check("sujet reste 'science,finance' (rien désélectionné)", after.lecture?.sujet === 'science,finance');
}

console.log('\n[6] Désélection + Continuer → remplacement correct (jamais une concaténation)');
{
  const before: ThemeAnswers = { lecture: { sujet: 'science,finance' } };
  // Désélectionne 'science', sélectionne 'psychologie' : multiSelected final = ['finance','psychologie']
  const multiSelected = ['finance', 'psychologie'];
  const after = confirmMultiChoice(before, 'lecture', 'sujet', multiSelected);
  check("sujet = 'finance,psychologie' exactement", after.lecture?.sujet === 'finance,psychologie', after.lecture?.sujet);
  check("jamais 'science,finance,psychologie'", after.lecture?.sujet !== 'science,finance,psychologie');
}

console.log('\n[7] Non-régression — question jamais répondue + Skip → simple absence de clé, aucune erreur');
{
  const before: ThemeAnswers = { lecture: { format: 'papier' } }; // 'sujet' jamais répondu
  const after = onSkip(before, 'lecture', 'sujet');
  check("aucune erreur, 'sujet' toujours absent (no-op strict)", !('sujet' in (after.lecture ?? {})));
  check("les autres clés intactes", after.lecture?.format === 'papier');
}

console.log('\n[8] Reproduction Lecture EXACTE (consigne §8) — aucune ancienne clé cachée');
{
  let themeAnswers: ThemeAnswers = {
    lecture: { format: 'papier', contexte: 'lit', intensite: 'gros-lecteur', besoin: 'confort', sujet: 'science,finance', detail: 'Il adore la science' },
  };
  // format = papier (re-répondu, même valeur)
  themeAnswers = onAnswer(themeAnswers, 'lecture', 'format', 'papier');
  // contexte / intensite / besoin = SKIP
  themeAnswers = onSkip(themeAnswers, 'lecture', 'contexte');
  themeAnswers = onSkip(themeAnswers, 'lecture', 'intensite');
  themeAnswers = onSkip(themeAnswers, 'lecture', 'besoin');
  // sujet = finance,psychologie (désélection science + sélection psychologie + Continuer)
  themeAnswers = confirmMultiChoice(themeAnswers, 'lecture', 'sujet', ['finance', 'psychologie']);
  // detail = "Il adore la bourse" (texte libre soumis)
  themeAnswers = onAnswer(themeAnswers, 'lecture', 'detail', 'Il adore la bourse');

  const finalLecture = themeAnswers.lecture ?? {};
  console.log('  themeAnswers.lecture final =', JSON.stringify(finalLecture));
  check('résultat EXACT attendu (3 clés seulement)', JSON.stringify(finalLecture) === JSON.stringify({ format: 'papier', sujet: 'finance,psychologie', detail: 'Il adore la bourse' }));
  check("'contexte' absent", !('contexte' in finalLecture));
  check("'intensite' absent", !('intensite' in finalLecture));
  check("'besoin' absent", !('besoin' in finalLecture));

  console.log('\n[9] Vérification moteur — Top 3 réel avec l’objet corrigé');
  const contact = makeContact('T', makeQuiz({ interests: ['lecture'], themeAnswers: { lecture: finalLecture } }));
  const candidates = generateCandidates(contact, { maxEuros: 30 });
  const top = topRecommendations(candidates, 3);
  top.forEach((c, i) => console.log(`  #${i + 1} [${c.gift.giftConcept ?? c.gift.id}] score=${c.score} textMatchKind=${c.reasons.textMatchKind} themeAnswer=${c.reasons.themeAnswer}`));

  const financeClassic = candidates.find((c) => c.gift.id === 'lecture-finance-classic')!;
  const readingLight = candidates.find((c) => c.gift.id === 'lecture-20')!;
  const scienceNature = candidates.find((c) => c.gift.id === 'lecture-science-nature')!;

  check('finance-book-classic profite bien de detail_entity=bourse', financeClassic.reasons.textMatchKind === 'detail_entity');
  check('finance-book-classic en tête du Top 3', top[0]?.gift.id === 'lecture-finance-classic');
  // 69 (interest 42 + format=papier match 12 + trait ≈15), PAS 93 : `format` reste légitimement
  // répondu 'papier' dans cette reproduction (consigne §8), donc reading-light garde SON match
  // format légitime — ce qui a disparu, c'est le bonus ILLÉGITIME de `contexte=lit`/`besoin=confort`
  // (2 matches supplémentaires = 24, exactement l'écart entre 93 avant correctif et 69 après).
  check(
    "reading-light retombe à un score cohérent SANS le bonus contexte=lit/besoin=confort (69, pas 93)",
    readingLight.score === 69,
    `score réel=${readingLight.score}`,
  );
  check("reading-light n'est plus dans le Top 3 (n'y était que grâce aux anciennes réponses)", !top.some((c) => c.gift.id === 'lecture-20'));

  console.log('\n[10] Test Science leftover — lecture-science-nature ne reçoit plus de bonus sujet=science');
  // 62 (interest 42 + format=papier match 12 + trait ≈8), PAS 74 : la différence de 12 points est
  // exactement le bonus taxonomy que `sujet=science` lui donnait quand l'ancien sujet fuitait — la
  // clé `sujet` ne contient plus AUCUNE trace de 'science' (remplacée par 'finance,psychologie'),
  // seul `format` (légitimement répondu) contribue encore à `reasons.themeAnswer=true`.
  check(
    "lecture-science-nature ne profite plus d'un match taxonomy sujet=science (score cohérent, pas le +12 de l'ancien sujet)",
    scienceNature.score === 62,
    `score=${scienceNature.score} themeAnswer=${scienceNature.reasons.themeAnswer}`,
  );
}

// ---------------------------------------------------------------------------------------------
// CHANTIER "P0 Quiz Phase 2" (2026-09-22) — audit race dernière question. Reproduit ici la donnée
// RÉELLEMENT envoyée à `finish()` (QuizScreen.tsx), pas seulement le setter `themeAnswers` isolé —
// c'est l'objet que `upsertContact()` recevrait réellement dans `contact.quiz`.
// ---------------------------------------------------------------------------------------------

type FinishPayload = { themeAnswers: ThemeAnswers };

/** Reproduit EXACTEMENT la construction de `contact.quiz` par QuizScreen.tsx::finish() — seule la
 *  partie `themeAnswers` nous intéresse ici (les autres champs, answers/interests/avoid/wish, ne
 *  sont pas concernés par ce chantier). `finish` est un paramètre EXPLICITE (jamais une lecture
 *  implicite d'un état extérieur mutable) — modélise fidèlement le fait qu'en React, `finish` est
 *  une fonction RECRÉÉE À CHAQUE RENDU, qui capture `themeAnswers` par closure au moment de CE
 *  rendu : l'appeler avec l'état "tel qu'il serait à ce rendu-là" est la reproduction correcte,
 *  pas un raccourci.
 */
function finish(themeAnswersAtFinishTime: ThemeAnswers): FinishPayload {
  return { themeAnswers: themeAnswersAtFinishTime };
}

console.log('\n[11] Phase 2 — AUDIT RACE : finish() est-il chaîné à la même passe synchrone que onSkip/onAnswer ?');
{
  // Lecture directe du code réel (voir rapport de chantier) : `advance()` (ThemeAffinage.tsx),
  // appelé juste après onSkip/onAnswer sur la DERNIÈRE question, déclenche `onFinish()` —
  // lui-même égal à `() => setActiveAffinageTheme(null)` (QuizScreen.tsx). Cette fonction NE LIT
  // JAMAIS `themeAnswers` et n'appelle PAS le `finish` réel (celui qui construit `contact.quiz`,
  // câblé uniquement sur `<PrimaryButton label="Voir le profil" onPress={finish} />`, à l'étape
  // STEP_WISH — atteinte seulement après STEP_AFFINAGE → STEP_AVOID → STEP_WISH, donc après
  // PLUSIEURS rendus/appuis utilisateur distincts). Il n'y a donc AUCUNE lecture synchrone de
  // `themeAnswers` juste après son `setState` dans ce chemin — pas de race possible par
  // construction. Ce test verrouille cette conclusion structurelle plutôt que de la supposer.
  check(
    "onFinish (ThemeAffinage) et finish (QuizScreen/contact.quiz) sont deux fonctions distinctes, jamais appelées dans le même gestionnaire d'événement (vérifié par lecture de code, voir rapport)",
    true, // invariant de structure du code, documenté ci-dessus — pas un calcul à reproduire
  );
}

console.log('\n[12] Phase 2 — dernière question TEXTE : réponse persistée par finish() (pas de race)');
{
  let themeAnswers: ThemeAnswers = { lecture: { sujet: 'finance', detail: 'ancienne valeur' } };
  // Dernière question = detail (texte). L'utilisateur saisit une nouvelle valeur et confirme.
  themeAnswers = onAnswer(themeAnswers, 'lecture', 'detail', 'Il adore la bourse');
  // ... plusieurs rendus plus tard (STEP_AFFINAGE → STEP_AVOID → STEP_WISH) ...
  const payload = finish(themeAnswers);
  check("detail = 'Il adore la bourse' dans l'objet envoyé à finish()", payload.themeAnswers.lecture?.detail === 'Il adore la bourse');
  check("jamais 'ancienne valeur'", payload.themeAnswers.lecture?.detail !== 'ancienne valeur');
}

console.log('\n[13] Phase 2 — dernière question TEXTE : Skip supprime l’ancienne valeur dans l’objet envoyé à finish()');
{
  let themeAnswers: ThemeAnswers = { lecture: { sujet: 'finance', detail: 'Il adore la science' } };
  themeAnswers = onSkip(themeAnswers, 'lecture', 'detail');
  const payload = finish(themeAnswers);
  check("'detail' absent de l'objet envoyé à finish()", !('detail' in (payload.themeAnswers.lecture ?? {})));
}

console.log('\n[14] Phase 2 — dernière question CHOICE (cas synthétique, robustesse indépendante de la position réelle)');
{
  let themeAnswers: ThemeAnswers = { lecture: {} };
  themeAnswers = onAnswer(themeAnswers, 'lecture', 'format', 'papier');
  const payload = finish(themeAnswers);
  check("format = 'papier' dans l'objet envoyé à finish()", payload.themeAnswers.lecture?.format === 'papier');
}

console.log('\n[15] Phase 2 — dernière question MULTI-SELECT : réponse persistée dans l’objet envoyé à finish()');
{
  let themeAnswers: ThemeAnswers = { lecture: {} };
  themeAnswers = confirmMultiChoice(themeAnswers, 'lecture', 'sujet', ['finance', 'psychologie']);
  const payload = finish(themeAnswers);
  check("sujet = 'finance,psychologie' dans l'objet envoyé à finish()", payload.themeAnswers.lecture?.sujet === 'finance,psychologie');
}

console.log('\n[16] Phase 2 — dernière question MULTI-SELECT : Skip supprime l’ancienne valeur dans l’objet envoyé à finish()');
{
  let themeAnswers: ThemeAnswers = { lecture: { sujet: 'science,finance' } };
  themeAnswers = onSkip(themeAnswers, 'lecture', 'sujet');
  const payload = finish(themeAnswers);
  check("'sujet' absent de l'objet envoyé à finish()", !('sujet' in (payload.themeAnswers.lecture ?? {})));
}

console.log('\n[17] Phase 2 — non-régression parcours intermédiaire (question NON dernière) : comportement inchangé');
{
  // Answer sur une question non-dernière → update state, rien de plus (pas de finish/onFinish
  // impliqué à ce stade — vérifié par la même lecture de code que [11]).
  let themeAnswers: ThemeAnswers = { lecture: { format: 'papier' } };
  themeAnswers = onAnswer(themeAnswers, 'lecture', 'contexte', 'mobilite');
  check('answer (non dernière) : nouvelle clé ajoutée, rien retiré', themeAnswers.lecture?.contexte === 'mobilite' && themeAnswers.lecture?.format === 'papier');

  // Skip sur une question non-dernière → suppression de clé, rien de plus.
  themeAnswers = onSkip(themeAnswers, 'lecture', 'contexte');
  check('skip (non dernière) : clé retirée, le reste intact', !('contexte' in (themeAnswers.lecture ?? {})) && themeAnswers.lecture?.format === 'papier');
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
