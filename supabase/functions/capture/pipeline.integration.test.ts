// Test d'intégration — CHANTIER "Capture réelle toujours cassée après v16" (2026-09-18), point 3.
// Rejoue le pipeline SERVEUR RÉEL — transcript → llmProvider.extract (openaiLlmProvider, avec `fetch`
// mocké, aucun réseau réel) → validateLlmOutput → buildCaptureContract — SANS jamais construire un
// `ExtractedPensee` déjà correct à la main (voir consigne explicite). Seule la couche HTTP (OpenAI)
// est simulée ; tout le reste (extract/validate/buildCaptureContract) est le VRAI code de production.
//
// Volontairement SOUS le niveau de `index.ts` : n'inclut PAS la normalisation "Pansif"→"Pensif"
// (appliquée uniquement dans index.ts, voir textNormalization.ts et index.test.ts pour sa couverture
// bout en bout) — ce fichier teste la chaîne extract→validate→buildCaptureContract isolément, avec le
// transcript "Pansif" TEL QUE le STT le produirait, pour prouver que CETTE couche n'est pas non plus
// en cause dans la régression.
//
// Usage : deno test --allow-env supabase/functions/capture/pipeline.integration.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { openaiLlmProvider } from './providers/llm/openai.ts';
import { LlmExtractionError } from './providers/llm/types.ts';
import { buildCaptureContract, validateLlmOutput } from './validate.ts';
import { CaptureParseErrorCategory, TemporalContext } from '../_shared/captureContract.ts';

const CONTEXT: TemporalContext = { timezone: 'Europe/Paris', localDateTime: '2026-09-18T22:40:00', weekday: 'vendredi' };
const OPTIONS = { model: 'gpt-5-mini' };
const TRANSCRIPT = 'Rappelle-moi tous les jours à 22h55 de tester Pansif pendant 3 jours.';

/** Contenu JSON RÉALISTE — la forme exacte qu'une vraie réponse GPT-5 mini produirait pour cette
 *  phrase (voir consigne point 3 : hasReminder=true, time="22:55", recurrence daily, occurrenceCount
 *  3, date=null car aucun point de départ explicite dit — même règle que "tous les jours pendant N
 *  jours" déjà validée par le benchmark réel, voir prompt.ts règle 7). */
function realisticLlmContent(): string {
  return JSON.stringify({
    pensees: [
      {
        texte: 'Tester Pansif',
        heardContactName: null,
        event: { hasDate: false, date: null, time: null, heardExpression: null, confidence: 0.9 },
        reminder: {
          hasReminder: true,
          date: null,
          time: '22:55',
          heardExpression: 'tous les jours à 22h55 pendant 3 jours',
          confidence: 0.95,
          recurrence: {
            detected: true,
            frequency: 'daily',
            daysOfWeek: [],
            occurrenceCount: 3,
            untilDate: null,
            heardExpression: 'tous les jours pendant 3 jours',
          },
        },
        confidence: 0.92,
      },
    ],
  });
}

function chatCompletionResponse(content: string | null, finishReason = 'stop', status = 200): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }], usage: { prompt_tokens: 6900, completion_tokens: 700 } }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}
function httpErrorResponse(status: number, body = 'erreur'): Response {
  return new Response(body, { status });
}

function installFetchMock(handlers: Array<() => Response | Promise<Response>>) {
  const original = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (() => {
    const handler = handlers[callCount] ?? handlers[handlers.length - 1];
    callCount += 1;
    return Promise.resolve(handler());
  }) as typeof fetch;
  return { callCount: () => callCount, restore: () => { globalThis.fetch = original; } };
}

/** Rejoue EXACTEMENT ce que index.ts fait entre `transcript` et la réponse HTTP finale (sans la
 *  couche HTTP elle-même : pas de Request/Response, pas d'auth/rate-limit — ceux-là sont déjà
 *  couverts par index.test.ts). */
async function runServerPipeline(transcript: string) {
  let rawLlmOutput: unknown;
  try {
    rawLlmOutput = await openaiLlmProvider.extract(transcript, CONTEXT, OPTIONS);
  } catch (e) {
    const category: CaptureParseErrorCategory = e instanceof LlmExtractionError ? e.category : 'unknown';
    const outcome = { ok: false as const, parseError: `Extraction LLM indisponible : ${e instanceof Error ? e.message : String(e)}`, category };
    return buildCaptureContract(transcript, { sttProvider: 'mock', llmProvider: 'openai' }, outcome);
  }
  const outcome = validateLlmOutput(rawLlmOutput);
  return buildCaptureContract(transcript, { sttProvider: 'mock', llmProvider: 'openai' }, outcome);
}

Deno.test('pipeline complet — succès dès la 1ère tentative — phrase "Pansif" (transcript STT réel)', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => chatCompletionResponse(realisticLlmContent())]);
  try {
    const contract = await runServerPipeline(TRANSCRIPT);

    assertEquals(contract.parseError, null);
    assertEquals(contract.pensees.length, 1);
    assertEquals(contract.pensees[0].texte, 'Tester Pansif', 'AVANT normalisation de marque (couche index.ts, testée séparément)');
    assertEquals(contract.pensees[0].reminder.hasReminder, true);
    assertEquals(contract.pensees[0].reminder.time, '22:55');
    assert(contract.pensees[0].reminder.recurrence !== null);
    assertEquals(contract.pensees[0].reminder.recurrence?.detected, true);
    assertEquals(contract.pensees[0].reminder.recurrence?.frequency, 'daily');
    assertEquals(contract.pensees[0].reminder.recurrence?.occurrenceCount, 3);
    assertEquals(mock.callCount(), 1);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('pipeline complet — 1ère tentative échoue (429), 2e réussit — résultat final identique à un succès direct', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => httpErrorResponse(429, 'rate limited'), () => chatCompletionResponse(realisticLlmContent())]);
  try {
    const contract = await runServerPipeline(TRANSCRIPT);

    assertEquals(contract.parseError, null);
    assertEquals(contract.pensees.length, 1);
    assertEquals(contract.pensees[0].reminder.hasReminder, true);
    assertEquals(contract.pensees[0].reminder.recurrence?.occurrenceCount, 3);
    assertEquals(mock.callCount(), 2);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('pipeline complet — double échec (2×500) → parseError EXPLICITE, pensees=[], transcript conservé', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => httpErrorResponse(500, 'server error 1'), () => httpErrorResponse(500, 'server error 2')]);
  try {
    const contract = await runServerPipeline(TRANSCRIPT);

    assertEquals(typeof contract.parseError, 'string');
    assert(contract.parseError !== null && contract.parseError.length > 0);
    assertEquals(contract.pensees.length, 0);
    assertEquals(contract.transcript, TRANSCRIPT, 'le transcript original doit survivre même en cas d’échec total');
    assertEquals(mock.callCount(), 2);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

// buildInitialCards (client, captureReview.ts) n'est pas importable ici (module TS "app", pas Deno) —
// sa consommation du contrat produit par ce pipeline est couverte côté app par
// scripts/test-regression-capture-review.ts (buildInitialCards) et les nouveaux tests dédiés à l'état
// "analyse échouée" (voir CHANTIER "Capture robustness" côté client). Ce fichier s'arrête au contrat
// HTTP que le serveur renvoie réellement — c'est la frontière testable ici.
