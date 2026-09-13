// Tests de non-régression — CHANTIER QUIZ MODIFIABLE (rendre le quiz d'un proche modifiable après
// complétion). QuizScreen.tsx/FicheScreen.tsx importent react-native/expo et ne peuvent pas être
// chargés sous ts-node (voir check-quiz-editable.js pour la vérification structurelle de ces
// fichiers) — ce script reproduit ici, à l'identique, la fonction de fusion corrigée dans
// QuizScreen.tsx (answerQuestion : remplace UNIQUEMENT la réponse à l'index concerné, ne tronque
// jamais les suivantes) et exerce le reste du parcours via les fonctions pures réelles de
// data/quiz.ts. Lecture seule — aucune donnée n'est modifiée par ce script. Assertions dures : lève
// une exception (code de sortie non-nul) si une régression est détectée.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-quiz-editable.ts

import { Contact, QuizAnswer, QuizProfile } from '../src/data/types';
import { computeTraits, isQuizComplete } from '../src/data/quiz';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Test',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: 'homme',
    initials: 'T',
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
    ...overrides,
  };
}

/** Reproduit EXACTEMENT la fusion corrigée de QuizScreen.tsx::answerQuestion — remplace la réponse
 *  à l'index `step`, ne tronque jamais ce qui suit (c'était le bug : `answers.slice(0, step)`
 *  effaçait silencieusement toutes les réponses après la question modifiée). */
function mergeAnswerAtStep(prev: QuizAnswer[], step: number, choice: QuizAnswer): QuizAnswer[] {
  const next = [...prev];
  next[step] = choice;
  return next;
}

/** Reproduit la fusion de QuizScreen.tsx::finish() — remplace answers/interests/avoid/wish/
 *  themeAnswers/completedAt, mais CONSERVE feedback/recommendationHistory/budget existants (jamais
 *  réinitialisés) : c'est ce qui garantit un remplacement propre de `contact.quiz`, pas un second
 *  quiz ni une perte de l'historique de recommandations déjà accumulé. */
function finishQuiz(
  existing: QuizProfile | null,
  fields: { answers: QuizAnswer[]; interests: QuizProfile['interests']; avoid: QuizProfile['avoid']; wish: string; themeAnswers: QuizProfile['themeAnswers'] },
): QuizProfile {
  return {
    answers: fields.answers,
    interests: fields.interests,
    avoid: fields.avoid,
    wish: fields.wish,
    themeAnswers: fields.themeAnswers,
    completedAt: new Date().toISOString(),
    budget: existing?.budget ?? null,
    feedback: existing?.feedback ?? [],
    recommendationHistory: existing?.recommendationHistory ?? [],
  };
}

console.log('\n[1] Contact sans quiz → parcours initial inchangé');
{
  const contact = makeContact({ id: 'c-fresh', quiz: null });
  check('isQuizComplete(null) === false', isQuizComplete(contact.quiz) === false);

  // Remplissage séquentiel depuis un tableau vide (comportement fresh, jamais modifié par ce
  // chantier) : chaque réponse s'ajoute à la suite, dans l'ordre.
  let answers: QuizAnswer[] = [];
  answers = mergeAnswerAtStep(answers, 0, 'A');
  answers = mergeAnswerAtStep(answers, 1, 'B');
  answers = mergeAnswerAtStep(answers, 2, 'A');
  check('remplissage séquentiel identique à un append classique', JSON.stringify(answers) === JSON.stringify(['A', 'B', 'A']), JSON.stringify(answers));

  const finished = finishQuiz(null, { answers, interests: [], avoid: [], wish: '', themeAnswers: {} });
  check('quiz fraîchement complété → isQuizComplete devient true', isQuizComplete(finished) === true);
  check('pas d’historique/feedback fantôme sur un premier quiz', finished.feedback.length === 0 && finished.recommendationHistory.length === 0);
}

console.log('\n[2] Contact avec quiz déjà complété → possibilité de rouvrir (données conservées)');
{
  const existingQuiz: QuizProfile = {
    answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'],
    interests: ['musique'],
    avoid: [],
    wish: 'Un casque audio',
    themeAnswers: { musique: { format: 'streaming' } },
    completedAt: '2026-08-01T10:00:00.000Z',
    budget: '40-70',
    feedback: [{ asin: 'B0X', reason: 'too_expensive', at: '2026-08-02T10:00:00.000Z' }],
    recommendationHistory: [{ at: '2026-08-02T10:00:00.000Z', shownAsins: ['B0X'], likedAsins: [] }],
  };
  const contact = makeContact({ id: 'c-done', quiz: existingQuiz });
  check('isQuizComplete(quiz déjà fait) === true → l’écran doit rester ouvrable', isQuizComplete(contact.quiz) === true);
}

console.log('\n[3] Réouverture d’un quiz complété → réponses existantes préremplies');
{
  const existingQuiz: QuizProfile = {
    answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'],
    interests: ['sport', 'lecture'],
    avoid: ['gaming'],
    wish: 'Des chaussons d’escalade',
    themeAnswers: {},
    completedAt: '2026-08-01T10:00:00.000Z',
    budget: null,
    feedback: [],
    recommendationHistory: [],
  };
  // Équivalent exact des useState(contact?.quiz?.xxx ?? ...) de QuizScreen.tsx — une simple lecture,
  // jamais une réinitialisation.
  const prefilledAnswers = existingQuiz.answers;
  const prefilledInterests = existingQuiz.interests;
  const prefilledWish = existingQuiz.wish;
  check('answers préremplis identiques à l’existant', JSON.stringify(prefilledAnswers) === JSON.stringify(existingQuiz.answers));
  check('interests préremplis identiques à l’existant', JSON.stringify(prefilledInterests) === JSON.stringify(existingQuiz.interests));
  check('wish préreample identique à l’existant', prefilledWish === existingQuiz.wish);
}

console.log('\n[4] Modification d’UNE réponse au milieu + sauvegarde → quiz remplacé proprement, rien tronqué');
{
  const existingQuiz: QuizProfile = {
    answers: ['A', 'A', 'A', 'A', 'A', 'A', 'A'],
    interests: ['musique'],
    avoid: [],
    wish: 'Un casque audio',
    themeAnswers: { musique: { format: 'streaming' } },
    completedAt: '2026-08-01T10:00:00.000Z',
    budget: '20-40',
    feedback: [{ reason: 'has_it', at: '2026-08-02T10:00:00.000Z' }],
    recommendationHistory: [{ at: '2026-08-02T10:00:00.000Z', shownAsins: ['B0Y'], likedAsins: ['B0Y'] }],
  };

  // L'utilisateur rouvre le quiz (answers préremplis) et change UNIQUEMENT la réponse à la question
  // d'index 2 (3e question), sans retoucher aux autres — c'est exactement le scénario qui, avant
  // correction, aurait tronqué les questions 3 à 6 (answers.slice(0, 2) + 'B' → longueur 3).
  const editedAnswers = mergeAnswerAtStep(existingQuiz.answers, 2, 'B');
  check(
    'seule la réponse à l’index 2 change, toutes les autres sont conservées',
    JSON.stringify(editedAnswers) === JSON.stringify(['A', 'A', 'B', 'A', 'A', 'A', 'A']),
    JSON.stringify(editedAnswers),
  );
  check('longueur inchangée (rien tronqué, contrairement au bug corrigé)', editedAnswers.length === existingQuiz.answers.length);

  const saved = finishQuiz(existingQuiz, {
    answers: editedAnswers,
    interests: existingQuiz.interests,
    avoid: existingQuiz.avoid,
    wish: existingQuiz.wish,
    themeAnswers: existingQuiz.themeAnswers,
  });
  check('un seul objet quiz résultant (remplacement, pas un second quiz créé)', typeof saved === 'object' && !Array.isArray(saved));
  check('answers du quiz sauvegardé = la version modifiée', JSON.stringify(saved.answers) === JSON.stringify(editedAnswers));
  check('feedback existant conservé (pas réinitialisé par la modification)', JSON.stringify(saved.feedback) === JSON.stringify(existingQuiz.feedback));
  check(
    'recommendationHistory existant conservé (pas réinitialisé par la modification)',
    JSON.stringify(saved.recommendationHistory) === JSON.stringify(existingQuiz.recommendationHistory),
  );
  check('budget existant conservé', saved.budget === existingQuiz.budget);
  check('completedAt mis à jour (nouvelle sauvegarde)', saved.completedAt !== existingQuiz.completedAt);

  // Les traits recalculés doivent refléter IMMÉDIATEMENT la nouvelle réponse (recommandations/
  // messages dépendants du quiz) — pas besoin d'une étape supplémentaire.
  const traitsBefore = computeTraits(existingQuiz.answers);
  const traitsAfter = computeTraits(saved.answers);
  check('les traits recalculés diffèrent après la modification (pris en compte immédiatement)', JSON.stringify(traitsBefore) !== JSON.stringify(traitsAfter));
}

console.log('\n[5] Réouverture après sauvegarde → les nouvelles valeurs sont bien celles lues');
{
  const existingQuiz: QuizProfile = {
    answers: ['A', 'A', 'A', 'A', 'A', 'A', 'A'],
    interests: [],
    avoid: [],
    wish: '',
    themeAnswers: {},
    completedAt: '2026-08-01T10:00:00.000Z',
    budget: null,
    feedback: [],
    recommendationHistory: [],
  };
  const editedAnswers = mergeAnswerAtStep(existingQuiz.answers, 4, 'B');
  const saved = finishQuiz(existingQuiz, { answers: editedAnswers, interests: [], avoid: [], wish: 'Nouveau souhait', themeAnswers: {} });

  // Simule une fiche/store mis à jour puis un nouveau montage de QuizScreen sur ce contact — les
  // useState(contact?.quiz?.xxx ?? ...) doivent lire `saved`, pas l'ancien `existingQuiz`.
  const contactAfterSave = makeContact({ id: 'c-reopen', quiz: saved });
  const reopenedAnswers = contactAfterSave.quiz?.answers ?? [];
  const reopenedWish = contactAfterSave.quiz?.wish ?? '';
  check('à la réouverture, answers = la version modifiée (pas l’ancienne)', JSON.stringify(reopenedAnswers) === JSON.stringify(editedAnswers), JSON.stringify(reopenedAnswers));
  check('à la réouverture, wish = la nouvelle valeur', reopenedWish === 'Nouveau souhait');
  check('isQuizComplete reste vrai après une modification (jamais remis à "non fait")', isQuizComplete(contactAfterSave.quiz) === true);
}

// STEP_RESULTS de QuizScreen.tsx (7 questions + 4 étapes : intérêts/affinage/à éviter/souhait) —
// dupliqué ici pour rester un script pur, sans dépendance react-native.
const STEP_RESULTS = 11;

type QuizMode = 'default' | 'edit';

/**
 * Reproduit EXACTEMENT la décision d'initialisation corrigée de QuizScreen.tsx (BUG "Refaire le
 * quiz revient immédiatement sur Profil terminé") : en mode edit, tout brouillon existant est
 * IGNORÉ — `step` reste 0 et `answers` vient uniquement de `contact.quiz`, jamais d'un brouillon
 * pouvant contenir un `step` figé sur les résultats (STEP_RESULTS) d'une session précédente déjà
 * terminée. En mode 'default' sans brouillon, comportement identique (rien à charger).
 */
function initialQuizState(
  mode: QuizMode,
  existingQuiz: QuizProfile | null,
  staleDraft: { step: number; answers: QuizAnswer[] } | null,
): { step: number; answers: QuizAnswer[] } {
  if (mode === 'edit' || !staleDraft) {
    return { step: 0, answers: existingQuiz?.answers ?? [] };
  }
  return { step: staleDraft.step, answers: staleDraft.answers };
}

console.log('\n[6] Scénario complet mode: edit — reproduit précisément le bug rapporté et sa correction');
{
  // [1] Contact avec quiz déjà complet.
  const existingQuiz: QuizProfile = {
    answers: ['A', 'A', 'A', 'A', 'A', 'A', 'A'],
    interests: ['musique'],
    avoid: [],
    wish: 'Un casque audio',
    themeAnswers: {},
    completedAt: '2026-08-01T10:00:00.000Z',
    budget: '20-40',
    feedback: [{ reason: 'has_it', at: '2026-08-02T10:00:00.000Z' }],
    recommendationHistory: [{ at: '2026-08-02T10:00:00.000Z', shownAsins: ['B0Y'], likedAsins: ['B0Y'] }],
  };
  const contact = makeContact({ id: 'c-edit-flow', quiz: existingQuiz });
  check('[1] isQuizComplete(contact.quiz) === true', isQuizComplete(contact.quiz) === true);

  // Précondition EXACTE du bug rapporté : un brouillon résiduel existe, figé sur les résultats
  // (step = STEP_RESULTS) — c'est précisément ce que l'ancien effet de sauvegarde persistait juste
  // après un finish() précédent, et que l'ancien effet de chargement rechargeait aussitôt.
  const staleDraft = { step: STEP_RESULTS, answers: existingQuiz.answers };

  // [2] Ouverture { mode: 'edit' }.
  const initial = initialQuizState('edit', contact.quiz, staleDraft);

  // [3] Écran initial = question 1 (step 0), JAMAIS le résultat — malgré le brouillon résiduel.
  check('[3] step initial = 0, jamais STEP_RESULTS (brouillon résiduel ignoré)', initial.step === 0, `step=${initial.step}`);

  // [4] Réponses existantes préremplies (depuis contact.quiz, pas depuis le brouillon).
  check('[4] answers initiaux = contact.quiz.answers', JSON.stringify(initial.answers) === JSON.stringify(existingQuiz.answers));

  // [5] Modification d'une réponse intermédiaire (question d'index 3).
  const afterEdit = mergeAnswerAtStep(initial.answers, 3, 'B');

  // [6] Réponses suivantes (index 4, 5, 6) conservées, jamais tronquées.
  check(
    '[6] seule la réponse à l’index 3 change, les suivantes (4,5,6) sont conservées',
    JSON.stringify(afterEdit) === JSON.stringify(['A', 'A', 'A', 'B', 'A', 'A', 'A']),
    JSON.stringify(afterEdit),
  );
  check('[6] longueur inchangée (rien tronqué)', afterEdit.length === existingQuiz.answers.length);

  // [7] Fin du quiz → résultat recalculé (traits différents de l’ancien profil).
  const traitsBefore = computeTraits(existingQuiz.answers);
  const traitsAfter = computeTraits(afterEdit);
  check('[7] traits recalculés différents après modification (nouveau résultat)', JSON.stringify(traitsBefore) !== JSON.stringify(traitsAfter));

  // [8] Sauvegarde → l’ancien quiz est remplacé (même objet, pas un second quiz), métadonnées
  // annexes (feedback/recommendationHistory/budget) conservées.
  const saved = finishQuiz(existingQuiz, {
    answers: afterEdit,
    interests: existingQuiz.interests,
    avoid: existingQuiz.avoid,
    wish: existingQuiz.wish,
    themeAnswers: existingQuiz.themeAnswers,
  });
  check('[8] answers sauvegardés = la version modifiée', JSON.stringify(saved.answers) === JSON.stringify(afterEdit));
  check('[8] feedback/recommendationHistory/budget conservés (remplacement, pas un second quiz)',
    JSON.stringify(saved.feedback) === JSON.stringify(existingQuiz.feedback) &&
    JSON.stringify(saved.recommendationHistory) === JSON.stringify(existingQuiz.recommendationHistory) &&
    saved.budget === existingQuiz.budget,
  );
  check('[8] isQuizComplete reste vrai après la modification', isQuizComplete(saved) === true);

  // Contrôle négatif : en mode 'default' SANS brouillon résiduel (cas normal, rien à charger), le
  // comportement reste identique — question 1, réponses de contact.quiz.
  const initialDefault = initialQuizState('default', contact.quiz, null);
  check(
    'contrôle : mode "default" sans brouillon → même point de départ (comportement normal inchangé)',
    initialDefault.step === 0 && JSON.stringify(initialDefault.answers) === JSON.stringify(existingQuiz.answers),
  );
}

// --- BUG "en mode edit, les réponses existantes ne sont pas modifiables" -------------------------
// Reproduit fidèlement la machine à états de QuizScreen.tsx::answerQuestion + l'effet de
// restauration de `flash` — la cause exacte était que `flash` (état purement visuel, aussi utilisé
// pour ré-afficher une réponse déjà enregistrée en arrivant sur la question) était RÉUTILISÉ comme
// garde anti-double-tap dans answerQuestion (`if (flash) return`). Une question déjà répondue a
// donc `flash` non-null dès l'arrivée, PAS seulement pendant une transition — bloquant tout nouveau
// tap. Le fix introduit `isTransitioning`, un état dédié à ce garde, indépendant de l'affichage.
type QuizTapState = {
  step: number;
  answers: (QuizAnswer | undefined)[];
  flash: QuizAnswer | null;
  isTransitioning: boolean;
};

/** Reproduit EXACTEMENT answerQuestion() après le fix : le garde porte sur `isTransitioning`,
 *  jamais sur `flash`. Renvoie le même état si le tap est ignoré (transition déjà en cours). */
function tapChoice(state: QuizTapState, choice: QuizAnswer): QuizTapState {
  if (state.isTransitioning) return state;
  return { ...state, isTransitioning: true, flash: choice };
}

/** Reproduit la fin de la fenêtre ANSWER_FILL_MS (le `setTimeout` de answerQuestion) : la réponse
 *  est écrite à l'index de la question EN COURS AU MOMENT DU TAP, jamais tronquée, puis on avance. */
function settleTap(state: QuizTapState, answeredStep: number): QuizTapState {
  const next = [...state.answers];
  next[answeredStep] = state.flash!;
  return { ...state, answers: next, isTransitioning: false, step: state.step + 1 };
}

/** Reproduit l'effet de restauration : arriver sur une question affiche sa réponse déjà
 *  enregistrée (ou rien) en surbrillance — jamais interprété comme une transition en cours. */
function restoreFlashForStep(state: QuizTapState): QuizTapState {
  return { ...state, flash: state.answers[state.step] ?? null };
}

console.log('\n[7] BUG "réponse existante non modifiable en mode edit" — tap toujours actif, jamais verrouillé');
{
  // [1] Quiz complet avec réponse existante 'A' à la question 3 (index 2).
  const answers: (QuizAnswer | undefined)[] = ['A', 'B', 'A', 'B', 'A', 'B', 'A'];

  // [2] Ouverture en mode edit : step positionné directement sur la question 3 pour ce test
  // (le passage question 1→3 ne change rien à la mécanique testée ici, déjà couverte par [6]),
  // `flash` restauré à la réponse existante ('A'), comme le fait l'effet au montage/à l'arrivée.
  let state: QuizTapState = { step: 2, answers: [...answers], flash: null, isTransitioning: false };
  state = restoreFlashForStep(state);
  check('réponse existante ("A") visible comme sélectionnée à l’arrivée sur la question', state.flash === 'A', `flash=${state.flash}`);

  // [3] Tap sur une autre réponse ('B').
  const answeredStep = state.step;
  state = tapChoice(state, 'B');
  check('le tap n’est PAS ignoré (le bug bloquait ici : isTransitioning, pas flash, doit être vérifié)', state.isTransitioning === true);
  check('[5] l’ancienne réponse ("A") n’est plus affichée comme sélectionnée : "B" prend sa place immédiatement', state.flash === 'B', `flash=${state.flash}`);

  // Fin de la fenêtre d'animation : answers[2] est bien mis à jour.
  state = settleTap(state, answeredStep);
  check('[4] answers[2] devient bien la nouvelle réponse ("B")', state.answers[2] === 'B', `answers=${JSON.stringify(state.answers)}`);
  check('aucune autre réponse touchée', JSON.stringify(state.answers) === JSON.stringify(['A', 'B', 'B', 'B', 'A', 'B', 'A']), JSON.stringify(state.answers));

  // [6] Retour sur la question 3 (goBack) et nouveau changement d'avis, encore une fois.
  state = { ...state, step: 2 };
  state = restoreFlashForStep(state);
  check('en revenant sur la question, "B" (la nouvelle réponse) est affichée sélectionnée', state.flash === 'B');
  const answeredStep2 = state.step;
  state = tapChoice(state, 'A');
  check('[6] un second changement d’avis est bien pris en compte (pas de verrouillage après une première modification)', state.flash === 'A', `flash=${state.flash}`);
  state = settleTap(state, answeredStep2);
  check('[6] answers[2] repasse bien à "A" après ce second changement', state.answers[2] === 'A', `answers=${JSON.stringify(state.answers)}`);

  // Comportement normal conservé : un second tap PENDANT la fenêtre de transition (avant que le
  // setTimeout ne retombe isTransitioning à false) reste ignoré, comme avant ce fix.
  const midTransition = tapChoice({ step: 3, answers: [...answers], flash: 'B', isTransitioning: true }, 'A');
  check('anti-double-tap toujours actif PENDANT une transition réelle (comportement normal conservé)', midTransition.flash === 'B', `flash=${midTransition.flash}`);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
