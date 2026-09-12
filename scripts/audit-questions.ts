// AUDIT V1 — pour chaque question à choix de chaque thème, bascule sa réponse (toutes les autres
// réponses du profil restant identiques) et regarde si le Top 3 change. USEFUL si oui, INERT si
// non. Lecture seule, ne modifie rien.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/audit-questions.ts

import { Contact, QuizProfile, InterestTag } from '../src/data/types';
import { getThemeQuiz } from '../src/data/themeQuizzes';
import { generateCandidates, topRecommendations } from '../src/data/recommendationEngine';
import { COVERED_THEMES } from '../src/data/giftCatalog';

function makeQuiz(themeAnswers: Record<string, string>, interests: InterestTag[]): QuizProfile {
  return { answers: ['A', 'B', 'A', 'B', 'A', 'B', 'A'], interests, avoid: [], wish: '', completedAt: new Date().toISOString(), budget: null, themeAnswers: { [interests[0]]: themeAnswers } as any, feedback: [], recommendationHistory: [] };
}
function makeContact(id: string, quiz: QuizProfile): Contact {
  return { id, prenom: id, nom: '', tel: '', date: '2000-01-01', relation: 'Ami', familyRole: null, genre: 'homme', initials: 'X', color: 'sage', quiz, giftPreparedYear: null, favorite: false, birthdayReminderDays: null };
}

function baselineAnswers(theme: InterestTag): Record<string, string> {
  const config = getThemeQuiz(theme);
  const answers: Record<string, string> = {};
  for (const q of config.questions) {
    if (q.type !== 'choice' || !q.options || q.options.length === 0) continue;
    if (q.when) {
      const dep = answers[q.when.questionId];
      if (!dep || !q.when.oneOf.some((v) => dep.split(',').includes(v))) continue;
    }
    answers[q.id] = q.options[0].key; // toujours la première option comme base stable
  }
  return answers;
}

/** Empreinte du pool ENTIER (pas juste le Top 3) : id + score arrondi de chaque candidat, à budget
 *  illimité pour ne jamais rater un effet qui n'apparaît qu'à certains paliers de prix (ex. un
 *  filtre dur qui élimine un article seulement disponible à 75€). Deux profils qui ne diffèrent
 *  QUE par une réponse mais produisent la MÊME empreinte n'ont, par construction, aucune différence
 *  de scoring ni de filtrage pour cette réponse — c'est un test plus strict que comparer le Top 3.
 */
function poolFingerprint(theme: InterestTag, answers: Record<string, string>): string {
  const contact = makeContact('t', makeQuiz(answers, [theme]));
  const pool = generateCandidates(contact, { maxEuros: Infinity });
  return pool.map((c) => `${c.gift.id}:${Math.round(c.score)}`).join('|');
}

function top3Ids(theme: InterestTag, answers: Record<string, string>, budget: number): string[] {
  const contact = makeContact('t', makeQuiz(answers, [theme]));
  const pool = generateCandidates(contact, { maxEuros: budget });
  return topRecommendations(pool, 3).map((c) => c.gift.id);
}

type QResult = { theme: InterestTag; question: string; status: 'USEFUL' | 'INERT'; poolDiffers: boolean; top3DiffersAt50: boolean; from: string; to: string };
const results: QResult[] = [];

for (const theme of COVERED_THEMES) {
  const config = getThemeQuiz(theme);
  const base = baselineAnswers(theme);
  const basePool = poolFingerprint(theme, base);
  const baseTop3 = new Set(top3Ids(theme, base, 50));

  for (const q of config.questions) {
    if (q.type !== 'choice' || !q.options || q.options.length < 2) continue;
    if (!(q.id in base)) continue; // question conditionnelle jamais déclenchée par la baseline — ignorée ici

    const altOption = q.options.find((o) => o.key !== base[q.id]);
    if (!altOption) continue;

    const altAnswers = { ...base, [q.id]: altOption.key };
    const altPool = poolFingerprint(theme, altAnswers);
    const altTop3 = new Set(top3Ids(theme, altAnswers, 50));

    const poolDiffers = basePool !== altPool;
    const top3DiffersAt50 = baseTop3.size !== altTop3.size || [...baseTop3].some((id) => !altTop3.has(id));
    // USEFUL dès que la réponse change QUOI QUE CE SOIT (pool ou classement) — pas seulement le Top 3
    // à un budget précis, sinon un filtre dur qui n'affecte que certains paliers de prix serait
    // signalé INERT à tort (voir gaming.platform, déjà validé manuellement comme filtre dur réel).
    const status: 'USEFUL' | 'INERT' = poolDiffers || top3DiffersAt50 ? 'USEFUL' : 'INERT';
    results.push({ theme, question: q.id, status, poolDiffers, top3DiffersAt50, from: base[q.id], to: altOption.key });
  }
}

const useful = results.filter((r) => r.status === 'USEFUL');
const inert = results.filter((r) => r.status === 'INERT');
const usefulButNeverTop3 = useful.filter((r) => !r.top3DiffersAt50);

console.log(`Questions testées : ${results.length}`);
console.log(`USEFUL : ${useful.length}  (dont ${usefulButNeverTop3.length} qui affectent le pool/score mais n'ont pas fait bouger le Top 3 à 50€ dans ce test précis)`);
console.log(`INERT  : ${inert.length}`);

console.log('\n=== INERT (AUCUN effet observé — ni sur le pool, ni sur le classement, budget illimité) ===');
for (const r of inert) {
  console.log(`  ${r.theme}.${r.question}  (${r.from} -> ${r.to})`);
}

console.log('\n=== USEFUL mais jamais visible dans un Top 3 à 50€ (affecte le score, marge insuffisante pour changer le classement) ===');
for (const r of usefulButNeverTop3) {
  console.log(`  ${r.theme}.${r.question}  (${r.from} -> ${r.to})`);
}
