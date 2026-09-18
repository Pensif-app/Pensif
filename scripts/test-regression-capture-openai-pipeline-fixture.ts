// CHANTIER "Capture — standardisation GPT-5-mini, validation finale" (2026-09-19), point 4.
// Pipeline complet REEL jusqu'au client : validateLlmOutput (server) → buildCaptureContract
// (server) → buildInitialCards (client) → isCaptureExploitable (client, avec le fix
// isExploitableExtractedText) — pour les DEUX scénarios réels "Tester Pensif" (23h35 et 00h10).
//
// ⚠️ HONNÊTETÉ : `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` sont absentes de cet environnement local — ce
// script n'appelle donc PAS `openaiLlmProvider.extract` (pas de réseau réel). Il utilise une
// FIXTURE : le JSON brut que GPT-5-mini DEVRAIT renvoyer pour ces phrases, construit strictement à
// partir des règles documentées dans prompt.ts (règle 2 : verbe/date/heure/récurrence retirés du
// "texte" quand hasReminder=true et rattachement certain → "Tester Pensif" ; règle 8 : reminder.date
// reste null tant qu'aucun point de départ explicite n'est dit, seule une durée l'est ici). Ceci
// prouve que la CHAÎNE validateLlmOutput→buildCaptureContract→buildInitialCards→isCaptureExploitable
// fonctionne correctement pour cette forme de sortie — PAS que GPT-5-mini produit réellement cette
// forme (seul un appel réseau réel, voir benchmark-capture-openai-mini-recurrence.ts, le prouverait).
//
// Usage : npx tsx scripts/test-regression-capture-openai-pipeline-fixture.ts

import { validateLlmOutput, buildCaptureContract } from '../supabase/functions/capture/validate.ts';
import { buildInitialCards, isCardValid, needsReview } from '../src/data/captureReview';
import { isCaptureExploitable } from '../src/data/captureExploitability';
import { ContactMatchResult } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const noMatch = (): ContactMatchResult => ({ kind: 'none' });
const NO_CONTACTS: Contact[] = [];
const FUTURE_NOW = new Date(2020, 0, 1);

function fixtureRawLlmOutput(time: string, heardExpression: string) {
  return {
    pensees: [
      {
        texte: 'Tester Pensif',
        heardContactName: null,
        event: { hasDate: false, date: null, time: null, heardExpression: null, confidence: 0.95 },
        reminder: {
          hasReminder: true,
          date: null, // aucun point de départ explicite dit ("pendant 3 jours" = durée seule, règle 8 prompt.ts)
          time,
          heardExpression,
          confidence: 0.9,
          recurrence: {
            detected: true,
            frequency: 'daily',
            daysOfWeek: [],
            occurrenceCount: 3,
            untilDate: null,
            heardExpression,
          },
        },
        confidence: 0.9,
      },
    ],
  };
}

function runScenario(label: string, transcript: string, time: string, heardExpression: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`  Transcript : "${transcript}"`);

  // 1) server : validateLlmOutput (réel)
  const rawFixture = fixtureRawLlmOutput(time, heardExpression);
  const outcome = validateLlmOutput(rawFixture);
  check('validateLlmOutput → ok:true', outcome.ok);
  if (!outcome.ok) return;

  // 2) server : buildCaptureContract (réel)
  const contract = buildCaptureContract(transcript, { sttProvider: 'mock', llmProvider: 'openai' }, outcome);
  check('parseError === null', contract.parseError === null);
  check('parseErrorCategory === null', contract.parseErrorCategory === null);
  check('texte extrait === "Tester Pensif"', contract.pensees[0]?.texte === 'Tester Pensif');

  // 3) client : isCaptureExploitable AVANT buildInitialCards (garde réel de CaptureScreen.tsx)
  const exploitable = isCaptureExploitable(contract, { weakAudioEvidence: false });
  check('isCaptureExploitable === true (avec le fix isExploitableExtractedText)', exploitable);

  // 4) client : buildInitialCards (réel)
  const cards = buildInitialCards(contract, noMatch, NO_CONTACTS);
  check('exactement une carte', cards.length === 1);
  const card = cards[0];
  check('card.texte === "Tester Pensif"', card?.texte === 'Tester Pensif');
  check('card.analysisFailed === false', card?.analysisFailed === false);
  check('card.reminderEnabled === true', card?.reminderEnabled === true);
  check(
    `card.reminderTime === ${time}`,
    card?.reminderTime?.hour === Number(time.split(':')[0]) && card?.reminderTime?.minute === Number(time.split(':')[1]),
    `reçu=${JSON.stringify(card?.reminderTime)}`,
  );
  check(
    'card.recurrenceDraft : daily, count=3',
    card?.recurrenceDraft?.frequency === 'daily' && card?.recurrenceDraft?.occurrenceCount === 3,
    `reçu=${JSON.stringify(card?.recurrenceDraft)}`,
  );
  // COMPORTEMENT ATTENDU RÉEL (pas un bug) : "pendant 3 jours" est une DURÉE sans point de départ
  // explicite (voir prompt.ts règle 8) → reminder.date=null côté LLM, ce que buildInitialCards
  // reporte tel quel dans card.reminderDate (jamais une date inventée, voir consigne "heure/date
  // jamais inventée"). Une date de départ proposée existe (seed, chantier "seeds contextuels"
  // 5c05b59) mais reste une PROPOSITION affichée sur le picker — jamais auto-appliquée à
  // card.reminderDate tant que l'utilisateur ne l'a pas confirmée (voir pending-confirmation
  // highlight, même chantier). La carte est donc légitimement `needsReview=true` /
  // `isCardValid=false` jusqu'à cette confirmation manuelle — ce n'est PAS un échec du pipeline
  // OpenAI/validate/buildCaptureContract/isCaptureExploitable, qui ont tous déjà réussi ci-dessus.
  check('card.reminderDate === null (aucune date inventée, seed en attente de confirmation)', card?.reminderDate === null);
  check('needsReview(card) === true (confirmation de date requise avant enregistrement)', needsReview(card));
  check('isCardValid(card) === false TANT QUE la date n’est pas confirmée (comportement voulu, pas un bug)', !isCardValid(card, FUTURE_NOW));
}

runScenario(
  '23h35 — "Rappelle-moi tous les jours à 23h35 de tester Pensif pendant 3 jours."',
  'Rappelle-moi tous les jours à 23h35 de tester Pensif pendant 3 jours.',
  '23:35',
  'tous les jours à 23h35 pendant 3 jours',
);

runScenario(
  '00h10 — passage de minuit — "Rappelle-moi tous les jours à 00h10 de tester Pensif pendant trois jours."',
  'Rappelle-moi tous les jours à 00h10 de tester Pensif pendant trois jours.',
  '00:10',
  'tous les jours à 00h10 pendant trois jours',
);

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
