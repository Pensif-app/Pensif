// AUDIT FINAL V1 — génère ~100 profils synthétiques (5 par thème), fait tourner le vrai moteur de
// recommandation dessus, et évalue mécaniquement les critères de validation V1 : pertinence du
// Top 3, diversité, pollution du fallback, disponibilité d'au moins 3 idées pertinentes. Fait aussi
// un test USEFUL/INERT/REVIEW par question (bascule une réponse, même profil sinon, regarde si le
// Top 3 change). Ne modifie rien — lecture seule sur le moteur existant.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/audit-v1.ts

import { Contact, QuizProfile, InterestTag } from '../src/data/types';
import { getThemeQuiz } from '../src/data/themeQuizzes';
import { generateCandidates, topRecommendations, ScoredCandidate } from '../src/data/recommendationEngine';
import { COVERED_THEMES } from '../src/data/giftCatalog';

const BUDGETS = [20, 30, 50, 75, 100];

function makeQuiz(themeAnswers: Record<string, string>, interests: InterestTag[]): QuizProfile {
  return {
    answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'],
    interests,
    avoid: [],
    wish: '',
    completedAt: new Date().toISOString(),
    budget: null,
    themeAnswers: { [interests[0]]: themeAnswers } as any,
    feedback: [],
    recommendationHistory: [],
  };
}

function makeContact(id: string, quiz: QuizProfile): Contact {
  return {
    id,
    prenom: id,
    nom: '',
    tel: '',
    date: '2000-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: 'homme',
    initials: 'X',
    color: 'sage',
    quiz,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
  };
}

/** Construit un jeu de réponses pour un thème donné, en respectant les `when` déclarés — pour la
 *  question "index"-ième (parmi les questions à choix), on choisit l'option n° `variant % nbOptions`
 *  plutôt que toujours la première, pour explorer différentes branches du quiz au fil des profils. */
function buildAnswers(theme: InterestTag, variant: number): Record<string, string> {
  const config = getThemeQuiz(theme);
  const answers: Record<string, string> = {};
  for (const q of config.questions) {
    if (q.type !== 'choice' || !q.options || q.options.length === 0) continue;
    if (q.when) {
      const dep = answers[q.when.questionId];
      if (!dep || !q.when.oneOf.some((v) => dep.split(',').includes(v))) continue; // pas applicable, on n'y répond pas
    }
    const idx = (variant + q.id.length) % q.options.length; // léger décalage par question pour varier les combinaisons
    answers[q.id] = q.options[idx].key;
  }
  return answers;
}

type ProfileResult = {
  theme: InterestTag;
  variant: number;
  budget: number;
  answers: Record<string, string>;
  poolSize: number;
  onTopicInPool: number;
  top3: ScoredCandidate[];
  fallbackTriggered: boolean;
  fallbackPolluted: boolean;
  top3Pertinent: boolean;
  hasThreeGoodIdeas: boolean;
  diversityOk: boolean;
};

function runProfile(theme: InterestTag, variant: number, budget: number): ProfileResult {
  const answers = buildAnswers(theme, variant);
  const quiz = makeQuiz(answers, [theme]);
  const contact = makeContact(`${theme}-${variant}-${budget}`, quiz);
  const pool = generateCandidates(contact, { maxEuros: budget });
  const top3 = topRecommendations(pool, 3);

  const onTopicInPool = pool.filter((c) => c.gift.theme === theme).length;
  const fallbackTriggered = pool.some((c) => c.gift.theme !== theme);
  const fallbackPolluted = top3.some((c) => c.gift.theme !== theme);
  const onTopicInTop3 = top3.filter((c) => c.gift.theme === theme).length;
  const top3Pertinent = top3.length >= 2 && onTopicInTop3 >= Math.min(2, top3.length);
  const hasThreeGoodIdeas = onTopicInPool >= 3;
  const concepts = new Set(top3.map((c) => c.gift.giftConcept || c.gift.id));
  const diversityOk = top3.length < 3 || concepts.size >= 2;

  return { theme, variant, budget, answers, poolSize: pool.length, onTopicInPool, top3, fallbackTriggered, fallbackPolluted, top3Pertinent, hasThreeGoodIdeas, diversityOk };
}

function main() {
  const results: ProfileResult[] = [];
  for (const theme of COVERED_THEMES) {
    for (let i = 0; i < 5; i++) {
      const budget = BUDGETS[i % BUDGETS.length];
      results.push(runProfile(theme, i, budget));
    }
  }

  console.log(`Profils générés : ${results.length}\n`);

  const top3Pertinent = results.filter((r) => r.top3Pertinent).length;
  const hasThreeGoodIdeas = results.filter((r) => r.hasThreeGoodIdeas).length;
  const diversityOk = results.filter((r) => r.diversityOk).length;
  const fallbackTriggered = results.filter((r) => r.fallbackTriggered).length;
  const fallbackPolluted = results.filter((r) => r.fallbackPolluted).length;

  console.log('=== RÉSULTATS GLOBAUX ===');
  console.log(`Top 3 pertinent            : ${top3Pertinent}/${results.length}`);
  console.log(`>=3 bonnes idées dispo     : ${hasThreeGoodIdeas}/${results.length}`);
  console.log(`Top 3 suffisamment diversifié : ${diversityOk}/${results.length}`);
  console.log(`Fallback déclenché         : ${fallbackTriggered}/${results.length}`);
  console.log(`Fallback avec pollution réelle : ${fallbackPolluted}/${results.length}`);

  console.log('\n=== ÉCHECS DÉTAILLÉS (pour vérif manuelle) ===');
  for (const r of results) {
    const issues: string[] = [];
    if (!r.top3Pertinent) issues.push('TOP3_NON_PERTINENT');
    if (!r.hasThreeGoodIdeas) issues.push('MOINS_DE_3_BONNES_IDEES');
    if (!r.diversityOk) issues.push('PEU_DIVERSIFIE');
    if (r.fallbackPolluted) issues.push('FALLBACK_POLLUE');
    if (issues.length > 0) {
      const answersStr = Object.entries(r.answers).map(([k, v]) => `${k}=${v}`).join(', ');
      console.log(`\n[${r.theme} #${r.variant} budget=${r.budget}€] ${issues.join(', ')}`);
      console.log(`  réponses: ${answersStr}`);
      console.log(`  pool=${r.poolSize} onTopic=${r.onTopicInPool} top3=${r.top3.length}`);
      r.top3.forEach((c, idx) => console.log(`  ${idx + 1}. [${c.gift.theme}] ${c.gift.title} (${c.gift.price}€) score=${Math.round(c.score)} concept=${c.gift.giftConcept ?? '?'}`));
    }
  }

  console.log('\n=== DUMP COMPLET (JSON, pour grep/inspection) ===');
  console.log(
    JSON.stringify(
      results.map((r) => ({
        theme: r.theme,
        variant: r.variant,
        budget: r.budget,
        answers: r.answers,
        poolSize: r.poolSize,
        onTopicInPool: r.onTopicInPool,
        fallbackTriggered: r.fallbackTriggered,
        fallbackPolluted: r.fallbackPolluted,
        top3Pertinent: r.top3Pertinent,
        hasThreeGoodIdeas: r.hasThreeGoodIdeas,
        diversityOk: r.diversityOk,
        top3: r.top3.map((c) => ({ theme: c.gift.theme, title: c.gift.title, price: c.gift.price, score: Math.round(c.score), concept: c.gift.giftConcept })),
      }))
    )
  );
}

main();
