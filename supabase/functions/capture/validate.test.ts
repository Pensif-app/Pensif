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

// --- CHANTIER CAPTURE — EVENT TIME, incrément 1 (2026-09-18) --------------------------------------

Deno.test('event.time valide en format HH:mm → conservée (même discipline que reminder.time)', () => {
  const outcome = validateLlmOutput({
    pensees: [{ texte: 'x', event: { hasDate: true, date: '2027-03-07', time: '20:00' } }],
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].event.time, '20:00');
});

Deno.test('event.time absent → null, jamais une heure par défaut inventée', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: 'x', event: { hasDate: true, date: '2026-09-19' } }] });
  if (outcome.ok) assertEquals(outcome.pensees[0].event.time, null);
});

Deno.test('event.time hors format HH:mm → normalisée à null (jamais rejetée en bloc, même principe que reminder.time)', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: 'x', event: { hasDate: true, date: '2026-09-19', time: '20h00' } }] });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].event.time, null);
    assertEquals(outcome.pensees[0].event.hasDate, true); // le reste de l'event n'est jamais affecté par une heure invalide
  }
});

Deno.test('event.time 24:00 ou minutes invalides → rejetée (normalisée à null)', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: 'x', event: { time: '24:00' } }] });
  if (outcome.ok) assertEquals(outcome.pensees[0].event.time, null);
  const outcome2 = validateLlmOutput({ pensees: [{ texte: 'x', event: { time: '10:60' } }] });
  if (outcome2.ok) assertEquals(outcome2.pensees[0].event.time, null);
});

Deno.test('event.time indépendant de hasDate/date — une heure valide n\'affecte jamais hasDate, une date absente n\'efface pas une heure présente', () => {
  const outcome = validateLlmOutput({ pensees: [{ texte: 'x', event: { hasDate: false, date: null, time: '18:30' } }] });
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].event.hasDate, false);
    assertEquals(outcome.pensees[0].event.time, '18:30'); // conservée même sans date associée
  }
});

Deno.test('event.time et reminder.time sont deux champs strictement indépendants au niveau de la validation (aucune copie de l\'un vers l\'autre)', () => {
  const outcome = validateLlmOutput({
    pensees: [
      {
        texte: 'x',
        event: { hasDate: true, date: '2026-09-19', time: '20:00' },
        reminder: { hasReminder: true, date: '2026-09-18', time: null },
      },
    ],
  });
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].event.time, '20:00');
    assertEquals(outcome.pensees[0].reminder.time, null); // validate.ts ne recopie jamais event.time ici
  }
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
    category: 'validation',
  });
  assertEquals(contract.transcript, 'transcript brut');
  assertEquals(contract.parseError, 'raison');
  assertEquals(contract.parseErrorCategory, 'validation');
  assertEquals(contract.pensees.length, 0);
});

// --- CHANTIER RAPPELS RÉCURRENTS — incrément 2 (2026-09-18), reminder.recurrence -------------------

function reminderWithRecurrence(recurrence: unknown) {
  return validateLlmOutput({
    pensees: [{ texte: 'x', reminder: { hasReminder: true, date: '2026-09-19', time: '21:40', recurrence } }],
  });
}

Deno.test('recurrence absente (capture sans récurrence, compatibilité) → null, reste totalement inchangé', () => {
  const outcome = reminderWithRecurrence(undefined);
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].reminder.recurrence, null);
    // Le reste du reminder n’est jamais affecté par l’absence de recurrence.
    assertEquals(outcome.pensees[0].reminder.hasReminder, true);
    assertEquals(outcome.pensees[0].reminder.date, '2026-09-19');
    assertEquals(outcome.pensees[0].reminder.time, '21:40');
  }
});

Deno.test('recurrence: null explicite → null (même représentation canonique)', () => {
  const outcome = reminderWithRecurrence(null);
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('detected=false, même avec des champs remplis → null (jamais une fausse règle qui survit)', () => {
  const outcome = reminderWithRecurrence({
    detected: false,
    frequency: 'daily',
    daysOfWeek: [1, 2, 3],
    occurrenceCount: 5,
    untilDate: '2026-09-25',
    heardExpression: 'tous les jours',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('daily valide (daysOfWeek=[]) → accepté tel quel', () => {
  const outcome = reminderWithRecurrence({
    detected: true,
    frequency: 'daily',
    daysOfWeek: [],
    occurrenceCount: null,
    untilDate: null,
    heardExpression: 'tous les jours',
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].reminder.recurrence, {
      detected: true,
      frequency: 'daily',
      daysOfWeek: [],
      occurrenceCount: null,
      untilDate: null,
      heardExpression: 'tous les jours',
    });
  }
});

Deno.test('daily avec daysOfWeek non vide → incohérence, rejeté en bloc (null), jamais "réparé"', () => {
  const outcome = reminderWithRecurrence({
    detected: true,
    frequency: 'daily',
    daysOfWeek: [1, 2],
    occurrenceCount: null,
    untilDate: null,
    heardExpression: 'tous les jours',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('weekly avec jours uniques valides (0-6) → accepté', () => {
  const outcome = reminderWithRecurrence({
    detected: true,
    frequency: 'weekly',
    daysOfWeek: [1, 2, 3, 4, 5],
    occurrenceCount: null,
    untilDate: null,
    heardExpression: 'du lundi au vendredi',
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence?.daysOfWeek, [1, 2, 3, 4, 5]);
});

Deno.test('weekly avec daysOfWeek vide → rejeté (une règle hebdomadaire sans jour n’a pas de sens)', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'weekly', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: 'chaque semaine',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('weekly avec daysOfWeek absent → rejeté (équivalent à vide)', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'weekly', occurrenceCount: null, untilDate: null, heardExpression: 'chaque semaine',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('weekly avec un jour hors 0-6 → rejeté', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'weekly', daysOfWeek: [7], occurrenceCount: null, untilDate: null, heardExpression: 'chaque X',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('weekly avec un jour dupliqué → rejeté (jours "uniques" exigé, jamais dédupliqué silencieusement)', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'weekly', daysOfWeek: [1, 1], occurrenceCount: null, untilDate: null, heardExpression: 'chaque lundi',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('unclear avec daysOfWeek=null → accepté ("tous les jours de la semaine", portée ambiguë)', () => {
  const outcome = reminderWithRecurrence({
    detected: true,
    frequency: 'unclear',
    daysOfWeek: null,
    occurrenceCount: null,
    untilDate: null,
    heardExpression: 'tous les jours de la semaine',
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    const r = outcome.pensees[0].reminder.recurrence;
    assertEquals(r?.frequency, 'unclear');
    assertEquals(r?.daysOfWeek, null);
    assertEquals(r?.occurrenceCount, null);
    assertEquals(r?.untilDate, null);
    assertEquals(r?.heardExpression, 'tous les jours de la semaine');
  }
});

Deno.test('unclear avec daysOfWeek rempli → rejeté (une portée "non déterminable" ne peut pas porter de jours)', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'unclear', daysOfWeek: [1, 2], occurrenceCount: null, untilDate: null, heardExpression: 'tous les jours de la semaine',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('frequency inconnue → rejeté', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'monthly', daysOfWeek: null, occurrenceCount: null, untilDate: null, heardExpression: 'x',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('occurrenceCount entier >=1 → accepté ; 0/négatif/non-entier → rejeté', () => {
  const ok = reminderWithRecurrence({ detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 5, untilDate: null, heardExpression: 'pendant 5 jours' });
  if (ok.ok) assertEquals(ok.pensees[0].reminder.recurrence?.occurrenceCount, 5);

  for (const bad of [0, -3, 2.5]) {
    const outcome = reminderWithRecurrence({ detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: bad, untilDate: null, heardExpression: 'x' });
    if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null, `occurrenceCount=${bad} devrait rejeter`);
  }
});

Deno.test('untilDate ISO locale valide → accepté ; mal formée/calendaire inexistante → rejeté', () => {
  const ok = reminderWithRecurrence({ detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: '2026-09-25', heardExpression: 'jusqu’au 25 septembre' });
  if (ok.ok) assertEquals(ok.pensees[0].reminder.recurrence?.untilDate, '2026-09-25');

  for (const bad of ['25/09/2026', '2026-13-01', '2026-02-30']) {
    const outcome = reminderWithRecurrence({ detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: bad, heardExpression: 'x' });
    if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null, `untilDate="${bad}" devrait rejeter`);
  }
});

Deno.test('occurrenceCount ET untilDate peuvent coexister (décision documentée, même contrat que le module client incrément 1)', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: 10, untilDate: '2026-12-31', heardExpression: 'x',
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].reminder.recurrence?.occurrenceCount, 10);
    assertEquals(outcome.pensees[0].reminder.recurrence?.untilDate, '2026-12-31');
  }
});

Deno.test('heardExpression manquant alors que detected=true → rejeté (obligatoire, jamais vide)', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null,
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);

  const outcome2 = reminderWithRecurrence({
    detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: '   ',
  });
  if (outcome2.ok) assertEquals(outcome2.pensees[0].reminder.recurrence, null);
});

Deno.test('recurrence rejetée n’affecte JAMAIS hasReminder/date/time (complète le reminder, ne le conditionne pas)', () => {
  const outcome = reminderWithRecurrence({ detected: true, frequency: 'bogus', daysOfWeek: null, occurrenceCount: null, untilDate: null, heardExpression: 'x' });
  assertEquals(outcome.ok, true);
  if (outcome.ok) {
    assertEquals(outcome.pensees[0].reminder.recurrence, null);
    assertEquals(outcome.pensees[0].reminder.hasReminder, true);
    assertEquals(outcome.pensees[0].reminder.date, '2026-09-19');
    assertEquals(outcome.pensees[0].reminder.time, '21:40');
  }
});

// --- CHANTIER RAPPELS RÉCURRENTS — incrément 2B (2026-09-18), canonicalisation daysOfWeek ---------

Deno.test('weekly — daysOfWeek trié par ordre croissant après validation, jamais l’ordre d’entrée du LLM', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'weekly', daysOfWeek: [6, 0], occurrenceCount: null, untilDate: null, heardExpression: 'samedi et dimanche',
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence?.daysOfWeek, [0, 6]);
});

Deno.test('weekly — tri canonique n’ajoute/supprime/interprète jamais un jour, seulement l’ordre', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'weekly', daysOfWeek: [5, 1, 3], occurrenceCount: null, untilDate: null, heardExpression: 'x',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence?.daysOfWeek, [1, 3, 5]);
});

Deno.test('weekly déjà trié en entrée → reste identique (idempotent)', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'weekly', daysOfWeek: [0, 3, 6], occurrenceCount: null, untilDate: null, heardExpression: 'x',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence?.daysOfWeek, [0, 3, 6]);
});

Deno.test('canonicalisation n’affecte pas daily ([]) ni unclear (null)', () => {
  const daily = reminderWithRecurrence({ detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: 'x' });
  if (daily.ok) assertEquals(daily.pensees[0].reminder.recurrence?.daysOfWeek, []);

  const unclear = reminderWithRecurrence({ detected: true, frequency: 'unclear', daysOfWeek: null, occurrenceCount: null, untilDate: null, heardExpression: 'x' });
  if (unclear.ok) assertEquals(unclear.pensees[0].reminder.recurrence?.daysOfWeek, null);
});

Deno.test('doublon toujours rejeté même dans le désordre (le tri n’intervient qu’APRÈS le rejet)', () => {
  const outcome = reminderWithRecurrence({
    detected: true, frequency: 'weekly', daysOfWeek: [6, 0, 6], occurrenceCount: null, untilDate: null, heardExpression: 'x',
  });
  if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null);
});

Deno.test('recurrence non-objet (string/number/array) → null, jamais une exception', () => {
  for (const bad of ['daily', 42, [1, 2, 3]]) {
    const outcome = reminderWithRecurrence(bad);
    if (outcome.ok) assertEquals(outcome.pensees[0].reminder.recurrence, null, `raw=${JSON.stringify(bad)} devrait donner null`);
  }
});
