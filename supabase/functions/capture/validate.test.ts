// Tests Deno — CHANTIER CAPTURE INTELLIGENTE : validation/normalisation STRICTE de la sortie LLM
// (jamais un cast direct). Usage : deno test supabase/functions/capture/validate.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildCaptureContract, validateLlmOutput } from './validate.ts';

Deno.test('sortie bien formée → acceptée telle quelle', () => {
  const outcome = validateLlmOutput({
    pensees: [
      {
        texte: 'Micka aime le café',
        heardContactName: 'Micka',
        event: { hasDate: false, date: null, heardExpression: null, confidence: 1 },
        reminder: { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 1 },
        confidence: 0.9,
      },
    ],
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.pensees.length, 1);
    assertEquals(outcome.pensees[0].texte, 'Micka aime le café');
    assertEquals(outcome.pensees[0].heardContactName, 'Micka');
  }
});

Deno.test('texte manquant → cette pensée est écartée, pas toute la réponse', () => {
  const outcome = validateLlmOutput({
    pensees: [
      { texte: '', heardContactName: 'X' },
      { texte: 'Pensée valide' },
    ],
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.pensees.length, 1);
    assertEquals(outcome.pensees[0].texte, 'Pensée valide');
  }
});

Deno.test('toutes les entrées invalides → parseError, repli attendu côté appelant', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: '' }, { texte: 123 }] });
  assertEquals(outcome.ok, false);
});

Deno.test('"pensees" absent ou non-tableau → parseError', () => {
  assertEquals(validateLlmOutput({}).ok, false);
  assertEquals(validateLlmOutput({ pensees: 'pas un tableau' }).ok, false);
  assertEquals(validateLlmOutput(null).ok, false);
  assertEquals(validateLlmOutput('pas un objet').ok, false);
});

Deno.test('date hors format YYYY-MM-DD → normalisée à null', () => {
  const outcome = validateLlmOutput({
    pensees: [{ texte: 'x', event: { hasDate: true, date: '20/09/2026' } }],
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].event.date, null);
});

Deno.test('date calendaire inexistante (2026-02-30) → normalisée à null', () => {
  const outcome = validateLlmOutput({
    pensees: [{ texte: 'x', reminder: { hasReminder: true, date: '2026-02-30', time: '10:00' } }],
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.date, null);
});

Deno.test('heure hors format HH:mm → normalisée à null (jamais rejetée en bloc)', () => {
  const outcome = validateLlmOutput({
    pensees: [{ texte: 'x', reminder: { hasReminder: true, date: '2026-09-19', time: '9h00' } }],
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].reminder.time, null);
    assertEquals(outcome.pensees[0].reminder.hasReminder, true); // intention conservée, pas effacée
  }
});

Deno.test('heure 24:00 ou minutes invalides → rejetée (normalisée à null)', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: 'x', reminder: { time: '24:00' } }] });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.time, null);
  const outcome2 = validateLlmOutput({ pensees: [{ texte: 'x', reminder: { time: '10:60' } }] });
  if (outcome2.ok) assertEquals(outcome2.pensees[0].reminder.time, null);
});

Deno.test('heure valide en format HH:mm → conservée', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: 'x', reminder: { hasReminder: true, date: '2026-09-19', time: '18:30' } }] });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.time, '18:30');
});

Deno.test('heardContactName autre que string/null → normalisé à null', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: 'x', heardContactName: 42 }] });
  if (outcome.ok) assertEquals(outcome.pensees[0].heardContactName, null);
  const outcome2 = validateLlmOutput({ pensees: [{ texte: 'x', heardContactName: ['Micka'] }] });
  if (outcome2.ok) assertEquals(outcome2.pensees[0].heardContactName, null);
});

Deno.test('confidence hors [0,1] → clampée ; non-numérique → 0', () => {
  const outcome = validateLlmOutput({
    pensees: [{ texte: 'x', confidence: 5, event: { confidence: -3 }, reminder: { confidence: 'haute' } }],
  });
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].confidence, 1);
    assertEquals(outcome.pensees[0].event.confidence, 0);
    assertEquals(outcome.pensees[0].reminder.confidence, 0);
  }
});

Deno.test('champs/tableaux inattendus dans une pensée sont ignorés, jamais propagés', () => {
  const outcome = validateLlmOutput({
    pensees: [{ texte: 'x', unePropriétéInconnue: { a: [1, 2, 3] }, __proto__: { hacked: true } }],
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    const pensee = outcome.pensees[0] as unknown as Record<string, unknown>;
    assertEquals(pensee.unePropriétéInconnue, undefined);
  }
});

Deno.test('event.hasDate incohérent avec une date invalide → repassé à false (rien à afficher)', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: 'x', event: { hasDate: true, date: 'pas une date' } }] });
  if (outcome.ok) assertEquals(outcome.pensees[0].event.hasDate, false);
});

Deno.test('buildCaptureContract — succès', () => {
  const contract = buildCaptureContract('transcript', { sttProvider: 'mock', llmProvider: 'mock' }, {
    ok: true,
    pensees: [],
  });
  assertEquals(contract.transcript, 'transcript');
  assertEquals(contract.parseError, null);
});

Deno.test('buildCaptureContract — repli parseError, transcript toujours présent', () => {
  const contract = buildCaptureContract('transcript brut', { sttProvider: 'mock', llmProvider: 'mock' }, {
    ok: false,
    parseError: 'raison',
  });
  assertEquals(contract.transcript, 'transcript brut');
  assertEquals(contract.parseError, 'raison');
  assertEquals(contract.pensees.length, 0);
});
