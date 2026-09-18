// Tests purs (aucun réseau) de l'adaptateur LLM OpenAI — couvre la construction du corps de requête
// (reasoning_effort par modèle/env) et le câblage du message system de renfort (figé depuis le
// benchmark #2, 9/10 — voir le commentaire d'en-tête d'openai.ts). Pas de test contre un vrai
// transcript ici : la validation sémantique réelle se fait via le benchmark
// (scripts/benchmark-capture-llm-providers.ts), qui nécessite un vrai appel réseau et donc une clé API.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildOpenaiRequestBody, OPENAI_REINFORCEMENT_SYSTEM_PROMPT, openaiLlmProvider, PENSEE_JSON_SCHEMA } from './openai.ts';
import { TemporalContext } from '../../../_shared/captureContract.ts';

const CONTEXT: TemporalContext = { timezone: 'Europe/Paris', localDateTime: '2026-09-18T10:00:00', weekday: 'vendredi' };

Deno.test('buildOpenaiRequestBody — ajoute reasoning_effort pour un modèle gpt-5*', () => {
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano');
  assert('reasoning_effort' in body, 'reasoning_effort doit être présent pour gpt-5*');
});

Deno.test('buildOpenaiRequestBody — reasoning_effort défaut à "low" (confirmé par benchmark : minimal=3/10, low=9/10)', () => {
  Deno.env.delete('OPENAI_REASONING_EFFORT');
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano');
  assertEquals(body.reasoning_effort, 'low');
});

Deno.test('buildOpenaiRequestBody — OPENAI_REASONING_EFFORT surcharge le défaut sans redéploiement', () => {
  Deno.env.set('OPENAI_REASONING_EFFORT', 'medium');
  try {
    const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano');
    assertEquals(body.reasoning_effort, 'medium');
  } finally {
    Deno.env.delete('OPENAI_REASONING_EFFORT');
  }
});

Deno.test('buildOpenaiRequestBody — pas de reasoning_effort pour un modèle non gpt-5*', () => {
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-4o');
  assert(!('reasoning_effort' in body), 'reasoning_effort ne doit pas être envoyé à un modèle qui ne le supporte pas');
});

Deno.test('buildOpenaiRequestBody — inclut le message system de renfort AVANT le prompt métier partagé', () => {
  const body = buildOpenaiRequestBody('mon transcript', CONTEXT, 'gpt-5-nano') as { messages: { role: string; content: string }[] };
  assertEquals(body.messages[0].role, 'system');
  assertEquals(body.messages[0].content, OPENAI_REINFORCEMENT_SYSTEM_PROMPT);
  assertEquals(body.messages[1].role, 'user');
  assert(body.messages[1].content.includes('mon transcript'), 'le prompt métier partagé doit contenir le transcript');
});

Deno.test('buildOpenaiRequestBody — utilise le schéma JSON strict Structured Outputs attendu', () => {
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano') as { response_format: { json_schema: unknown } };
  assertEquals(body.response_format.json_schema, PENSEE_JSON_SCHEMA);
});

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — règle DATE + HEURE ENSEMBLE au texte V2 figé (9/10) — une tentative de renfort post-benchmark a régressé et a été annulée', () => {
  assert(
    OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes(
      "6. DATE + HEURE ENSEMBLE — Si une expression de rappel contient à la fois une date/un jour ET une heure, conserve les deux dans reminder (ne perds ni l'une ni l'autre).",
    ),
    'le texte de cette règle doit rester exactement celui de la V2 (benchmark 9/10) — ne pas le reformuler sans nouveau benchmark (seul son numéro a changé, voir incrément "texte concis + anti-SPLIT")',
  );
});

// --- CHANTIER RAPPELS RÉCURRENTS — incrément 2 (2026-09-18) ----------------------------------------

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — règle RÉCURRENCE présente, règles historiques inchangées (renumérotées par l\'incrément "texte concis + anti-SPLIT")', () => {
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('8. RÉCURRENCE (reminder.recurrence)'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('Ne déduis JAMAIS une récurrence de deux jours/dates isolés'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('frequency="unclear"'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('ne choisis JAMAIS entre plusieurs interprétations possibles'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('tous les jours de la semaine'));
  // Les règles historiques restent présentes (aucune reformulation de leur contenu propre) — vérifie
  // juste leur en-tête ; la règle DATE + HEURE ENSEMBLE est déjà vérifiée mot pour mot ci-dessus.
  for (const heading of ['1. SPLIT', '3. EVENT ≠ REMINDER', '4. RÉSOLUTION', '5. NE JAMAIS RECOPIER', '6. DATE + HEURE ENSEMBLE', '7. PRÉNOM ENTENDU']) {
    assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes(heading), `règle manquante ou renommée : "${heading}"`);
  }
});

// --- CHANTIER "Capture — texte concis pour les rappels" (2026-09-18) ------------------------------
// texte concis (règle 2, nouvelle) + SPLIT ne doit jamais fabriquer plusieurs pensées pour représenter
// plusieurs interprétations d'une même ambiguïté (règle 1, corrigée). Aucun contrat JSON/type/
// validate.ts/recurrence/modèle/reasoning_effort touché par cet incrément — uniquement ce prompt.

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — règle 2 (TEXTE CONCIS) présente avec ses garde-fous', () => {
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('2. TEXTE CONCIS, PAS UNE COMMANDE'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('Rappelle-moi'), 'doit citer le verbe déclencheur à retirer');
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('Pense à'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes("N'oublie pas de"));
  assert(
    OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('NE LA RETIRE PAS de "texte"'),
    'le doute doit toujours faire pencher vers la conservation dans texte, jamais vers le retrait',
  );
  assert(
    OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('Quand ni reminder.hasReminder ni event.hasDate ne sont vrais, "texte" reste tel quel, sans raccourcissement'),
    'aucune concision hors reminder/event — comportement historique préservé pour les pensées sans structure temporelle',
  );
});

// --- CHANTIER CAPTURE — EVENT TIME, incrément 2 (2026-09-18) — extension TEXTE CONCIS aux événements

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — règle 2 étendue aux événements avec ses garde-fous propres', () => {
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('ÉVÉNEMENTS — MÊME logique pour "event"'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('event.hasDate=true'));
  assert(
    OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes(
      'Si aucune heure d\'événement n\'a pu être extraite avec certitude, NE RETIRE RIEN',
    ),
    'une info temporelle sans destination structurée ne doit jamais disparaître de texte',
  );
  assert(
    OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes(
      'une expression temporelle n\'est retirable du "texte" d\'une pensée que si CETTE pensée porte elle-même la structure qui la représente',
    ),
    'propriété temporelle par pensée — jamais retirée au nom d\'une AUTRE pensée du même lot',
  );
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('"texte":"Spectacle de Lumen Fracture à Nantes"'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('"texte":"Match"'));
});

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — règle 1 (SPLIT) interdit désormais la duplication par ambiguïté', () => {
  assert(
    OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes(
      "ne crée JAMAIS plusieurs pensées pour représenter plusieurs INTERPRÉTATIONS possibles d'une seule et même expression ambiguë",
    ),
  );
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('Une ambiguïté reste une seule pensée, jamais deux hypothèses concurrentes'));
  // Le comportement historique (vrai multi-pensées pour des intentions réellement indépendantes)
  // doit rester possible — l'exemple "Léa adore la randonnée..." (2 pensées) n'a pas été retiré.
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes("Léa adore la randonnée et rappelle-moi de l'appeler mardi à 17h"));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('DEUX pensées'));
});

Deno.test('PENSEE_JSON_SCHEMA — description de texte reflète la règle de concision (rappel + événement) sans changer le contrat (toujours string, requis)', () => {
  const itemSchema = (PENSEE_JSON_SCHEMA.schema.properties.pensees.items.properties as Record<string, any>);
  assertEquals(itemSchema.texte.type, 'string');
  assert(itemSchema.texte.description.includes('SÉMANTIQUE'));
  assert(itemSchema.texte.description.includes('reminder.hasReminder=true'));
  assert(itemSchema.texte.description.includes('event.hasDate=true'));
  assert(itemSchema.texte.description.includes('Si ni reminder.hasReminder ni event.hasDate ne sont vrais'));
  assert([...PENSEE_JSON_SCHEMA.schema.properties.pensees.items.required].includes('texte'), 'texte reste requis — contrat JSON non modifié par cet incrément');
});

Deno.test('PENSEE_JSON_SCHEMA — reminder.recurrence présent, nullable, schéma imbriqué strict', () => {
  const reminderSchema = (PENSEE_JSON_SCHEMA.schema.properties.pensees.items.properties as Record<string, any>).reminder;
  assert(reminderSchema.required.includes('recurrence'), 'recurrence doit être listé dans required (mode strict OpenAI)');
  const recurrenceSchema = reminderSchema.properties.recurrence;
  assertEquals(recurrenceSchema.type, ['object', 'null']);
  assertEquals(recurrenceSchema.additionalProperties, false);
  assertEquals(
    [...recurrenceSchema.required].sort(),
    ['daysOfWeek', 'detected', 'frequency', 'heardExpression', 'occurrenceCount', 'untilDate'],
  );
  assertEquals(recurrenceSchema.properties.frequency.enum, ['daily', 'weekly', 'unclear']);
  assertEquals(recurrenceSchema.properties.daysOfWeek.type, ['array', 'null']);
});

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — incrément 2B (2026-09-18) : reminder.date jamais "aujourd\'hui" par défaut pour une récurrence', () => {
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('jamais "aujourd\'hui" choisi arbitrairement juste parce qu\'une règle "daily" existe'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('"tous les jours à 21h40" seul → date=null'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('"tous les jours à partir de demain à 21h40" → date=demain'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('"chaque lundi à 18h" → date=la prochaine occurrence de lundi'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('"du lundi au vendredi à 8h" → date=la prochaine date appartenant au motif lundi-vendredi'));
});

Deno.test('PENSEE_JSON_SCHEMA — description de reminder.date mentionne la nuance "jamais aujourd\'hui par défaut"', () => {
  const reminderSchema = (PENSEE_JSON_SCHEMA.schema.properties.pensees.items.properties as Record<string, any>).reminder;
  assert(reminderSchema.properties.date.description.includes('jamais "aujourd\'hui" choisi arbitrairement'));
});

Deno.test('buildOpenaiRequestBody — hasReminder/date/time/heardExpression/confidence toujours requis (compatibilité intégrale, recurrence en plus jamais à la place)', () => {
  const body = buildOpenaiRequestBody('x', CONTEXT, 'gpt-5-nano') as {
    response_format: { json_schema: { schema: { properties: { pensees: { items: { properties: { reminder: { required: string[] } } } } } } } };
  };
  const required = body.response_format.json_schema.schema.properties.pensees.items.properties.reminder.required;
  assertEquals([...required].sort(), ['confidence', 'date', 'hasReminder', 'heardExpression', 'recurrence', 'time']);
});

// --- CHANTIER CAPTURE — EVENT TIME, incrément 1 (2026-09-18) ---------------------------------------
// Aucun changement de Pensee/Capture Review/notifications — uniquement le pipeline d'extraction.

Deno.test('PENSEE_JSON_SCHEMA — event.time présent, nullable string, requis (mode strict OpenAI)', () => {
  const eventSchema = (PENSEE_JSON_SCHEMA.schema.properties.pensees.items.properties as Record<string, any>).event;
  assertEquals(eventSchema.properties.time.type, ['string', 'null']);
  assert(eventSchema.required.includes('time'), 'time doit être listé dans required (mode strict OpenAI)');
  assertEquals([...eventSchema.required].sort(), ['confidence', 'date', 'hasDate', 'heardExpression', 'time']);
});

Deno.test('PENSEE_JSON_SCHEMA — description de event.time insiste sur l\'indépendance stricte avec reminder.time', () => {
  const eventSchema = (PENSEE_JSON_SCHEMA.schema.properties.pensees.items.properties as Record<string, any>).event;
  assert(eventSchema.properties.time.description.includes('UNIQUEMENT si une heure appartient explicitement à CET événement'));
  assert(eventSchema.properties.time.description.includes('STRICTEMENT INDÉPENDANT de reminder.time'));
  assert(eventSchema.properties.time.description.includes('jamais'));
});

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — règle EVENT.TIME ≠ REMINDER.TIME présente avec ses 2 exemples génériques', () => {
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('EVENT.TIME ≠ REMINDER.TIME'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('ne copie JAMAIS l\'heure de l\'un vers l\'autre'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('event.time="14:00" (heure de la réunion), reminder.time=null'));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('event.time="09:05" (heure du bus), reminder.time="19:00" (heure du rappel)'));
});

Deno.test('OPENAI_REINFORCEMENT_SYSTEM_PROMPT — règle 3 (EVENT ≠ REMINDER) historique inchangée au-delà de l\'ajout EVENT.TIME', () => {
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes("3. EVENT ≠ REMINDER — Une date mentionnée à propos d'un fait ou d'un événement RÉEL"));
  assert(OPENAI_REINFORCEMENT_SYSTEM_PROMPT.includes('Paul passe son permis mardi'));
});

// --- CHANTIER "Capture robustness — retry LLM ciblé + observabilité minimale" (2026-09-18) --------
// `openaiLlmProvider.extract` fait maintenant JUSQU'À 2 appels OpenAI (1 tentative + 1 retry ciblé) —
// couvert ici avec un `fetch` mocké (aucun réseau réel, aucune clé nécessaire). Aucun test ne dépend
// de `buildOpenaiRequestBody`/du prompt/du modèle — cible exclusivement la logique de retry/logging.

const OPTIONS = { model: 'gpt-5-mini' };

/** Pensée JSON minimale, valide selon PENSEE_JSON_SCHEMA — le CONTENU exact n'importe pas pour ces
 *  tests (aucune assertion sur une valeur métier), seulement sa validité structurelle. */
function validPenseeeJson(texte = 'x'): string {
  return JSON.stringify({
    pensees: [
      {
        texte,
        heardContactName: null,
        event: { hasDate: false, date: null, time: null, heardExpression: null, confidence: 0 },
        reminder: { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 0, recurrence: null },
        confidence: 0.9,
      },
    ],
  });
}

function chatCompletionResponse(content: string | null, finishReason = 'stop', status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage: { prompt_tokens: 42, completion_tokens: 17 },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

function httpErrorResponse(status: number, body = 'erreur'): Response {
  return new Response(body, { status });
}

/** Remplace `globalThis.fetch` par une file de réponses/actions successives — la Nème réponse (ou la
 *  dernière si la file est plus courte que le nombre d'appels) sert pour le Nème appel. Compte les
 *  appels réellement effectués. Toujours restauré via `finally` par l'appelant. */
function installFetchMock(handlers: Array<() => Response | Promise<Response>>) {
  const original = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (() => {
    const handler = handlers[callCount] ?? handlers[handlers.length - 1];
    callCount += 1;
    return Promise.resolve(handler());
  }) as typeof fetch;
  return {
    callCount: () => callCount,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Capture les appels `console.log` pendant `run()` — sert à vérifier qu'aucune donnée utilisateur
 *  (transcript/contenu LLM brut) ne fuite dans les logs structurés (voir test dédié plus bas). */
async function captureConsoleLogs(run: () => Promise<void>): Promise<string[]> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  try {
    await run();
  } finally {
    console.log = original;
  }
  return lines;
}

Deno.test('extract — 1. premier appel réussi → exactement 1 fetch', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => chatCompletionResponse(validPenseeeJson())]);
  try {
    const result = await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(mock.callCount(), 1);
    assert(result !== null, 'doit retourner le JSON parsé');
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — CONTRAT DE RETOUR (2026-09-18, suite à "Capture réelle toujours cassée après v16") : retourne EXACTEMENT le JSON.parse(content) du LLM, jamais un wrapper {success,data,...} ni aucune enveloppe interne', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const rawContentString = validPenseeeJson('vérification du contrat exact');
  const expectedParsed = JSON.parse(rawContentString);
  const mock = installFetchMock([() => chatCompletionResponse(rawContentString)]);
  try {
    const result = await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    // Égalité STRUCTURELLE avec JSON.parse(content) — pas juste "non null" : si un futur refactor
    // enveloppait le résultat dans { success: true, data: ... } ou { outcome: ... }, cette assertion
    // échouerait immédiatement (ce test aurait attrapé exactement la régression suspectée sur v16).
    assertEquals(result, expectedParsed);
    // Vérifie EXPLICITEMENT l'ABSENCE des clés d'un wrapper plausible, pour que l'intention du test
    // reste lisible même si `assertEquals` ci-dessus venait à être affaibli par erreur plus tard.
    assert(typeof result === 'object' && result !== null);
    assert(!('success' in (result as Record<string, unknown>)), 'extract() ne doit jamais envelopper dans { success, ... }');
    assert(!('data' in (result as Record<string, unknown>)), 'extract() ne doit jamais envelopper dans { data, ... }');
    assert('pensees' in (result as Record<string, unknown>), 'le contrat attendu par validateLlmOutput est { pensees: [...] } directement, à la racine');
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — CONTRAT DE RETOUR après un retry réussi : identique à un succès direct (aucune trace du 1er échec dans la forme du résultat)', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const rawContentString = validPenseeeJson('après retry');
  const expectedParsed = JSON.parse(rawContentString);
  const mock = installFetchMock([() => httpErrorResponse(429, 'rate limited'), () => chatCompletionResponse(rawContentString)]);
  try {
    const result = await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(result, expectedParsed);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 2. HTTP 429 puis succès → exactement 2 fetch, retour normal (aucune trace de retry dans le résultat)', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => httpErrorResponse(429, 'rate limited'), () => chatCompletionResponse(validPenseeeJson())]);
  try {
    const result = await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(mock.callCount(), 2);
    assert(result !== null);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 3. HTTP 500 puis succès → exactement 2 fetch', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => httpErrorResponse(500, 'server error'), () => chatCompletionResponse(validPenseeeJson())]);
  try {
    await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(mock.callCount(), 2);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

// CHANTIER "Capture — standardisation GPT-5-mini, validation finale" (2026-09-19), point 5 :
// reproduction EXACTE demandée (tentative 1 = HTTP 500, tentative 2 = réponse valide) — vérifie à
// la fois le nombre d'appels ET l'égalité STRUCTURELLE avec un succès direct (le contrat renvoyé à
// validateLlmOutput ne doit jamais porter la moindre trace du 1er échec).
Deno.test('extract — 500 puis succès : pipeline final identique à un succès direct (aucune altération du contrat par le wrapper retry)', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const rawContentString = validPenseeeJson('reprise après 500');
  const expectedParsed = JSON.parse(rawContentString);
  const mock = installFetchMock([() => httpErrorResponse(500, 'server error'), () => chatCompletionResponse(rawContentString)]);
  try {
    const result = await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(mock.callCount(), 2);
    assertEquals(result, expectedParsed);
    assert(!('success' in (result as Record<string, unknown>)));
    assert(!('data' in (result as Record<string, unknown>)));
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 4. erreur réseau/fetch puis succès → exactement 2 fetch', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([
    () => {
      throw new TypeError('network error (simulé)');
    },
    () => chatCompletionResponse(validPenseeeJson()),
  ]);
  try {
    await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(mock.callCount(), 2);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 5. contenu vide puis succès → exactement 2 fetch', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => chatCompletionResponse(null, 'length'), () => chatCompletionResponse(validPenseeeJson())]);
  try {
    await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(mock.callCount(), 2);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 6. JSON invalide puis succès → exactement 2 fetch, réponse finale valide', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => chatCompletionResponse('{ ceci n’est pas du JSON'), () => chatCompletionResponse(validPenseeeJson())]);
  try {
    const result = await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(mock.callCount(), 2);
    assert(result !== null, 'le succès du 2e essai doit être retourné normalement');
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 7. HTTP 400 → exactement 1 fetch, jamais de retry, throw', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => httpErrorResponse(400, 'bad request')]);
  try {
    await assertRejects(() => openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS));
    assertEquals(mock.callCount(), 1);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 8. HTTP 401 → exactement 1 fetch, jamais de retry, throw', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => httpErrorResponse(401, 'unauthorized')]);
  try {
    await assertRejects(() => openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS));
    assertEquals(mock.callCount(), 1);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 9. deux HTTP 500 successifs → exactement 2 fetch puis échec (throw)', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => httpErrorResponse(500, 'server error 1'), () => httpErrorResponse(500, 'server error 2')]);
  try {
    await assertRejects(() => openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS));
    assertEquals(mock.callCount(), 2);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 10. deux JSON invalides successifs → exactement 2 fetch puis échec (comportement d’échec existant : throw, jamais un 3e essai)', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const mock = installFetchMock([() => chatCompletionResponse('{ pas valide 1'), () => chatCompletionResponse('{ pas valide 2')]);
  try {
    await assertRejects(() => openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS));
    assertEquals(mock.callCount(), 2);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 11. JSON valide mais sémantiquement "imparfait" (aucun rappel détecté) → PAS de retry artificiel (1 seul fetch)', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  // "imparfait" au sens métier (ex. reminder.hasReminder=false alors qu'un rappel était peut-être
  // voulu) reste un JSON PARFAITEMENT valide du point de vue de extract() — cette notion n'existe
  // même pas à ce niveau (seul validateLlmOutput, jamais appelé ici, pourrait en juger).
  const mock = installFetchMock([() => chatCompletionResponse(validPenseeeJson('pensée sans rappel'))]);
  try {
    const result = await openaiLlmProvider.extract('transcript', CONTEXT, OPTIONS);
    assertEquals(mock.callCount(), 1, 'un JSON structurellement valide ne déclenche jamais de 2e appel, quel que soit son contenu métier');
    assert(result !== null);
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});

Deno.test('extract — 12. logs structurés : aucun transcript/contenu utilisateur, uniquement des métadonnées techniques', async () => {
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  const secretTranscript = 'Rappelle-moi tous les jours à 20h39 de tester Pensif pendant 3 jours SECRET_MARKER_9F3A';
  const mock = installFetchMock([() => httpErrorResponse(429, 'rate limited'), () => chatCompletionResponse(validPenseeeJson('texte de pensée confidentiel SECRET_MARKER_9F3A'))]);
  try {
    const logs = await captureConsoleLogs(async () => {
      await openaiLlmProvider.extract(secretTranscript, CONTEXT, OPTIONS);
    });
    assert(logs.length >= 2, 'au moins une ligne de log par tentative (2 tentatives ici)');
    for (const line of logs) {
      assert(!line.includes('SECRET_MARKER_9F3A'), `une ligne de log contient une donnée utilisateur : ${line}`);
      assert(!line.includes(secretTranscript), 'le transcript ne doit jamais apparaître dans les logs');
    }
    // Vérifie que les logs contiennent bien les métadonnées ATTENDUES (structure exploitable), pas
    // juste "rien de sensible" — les deux propriétés comptent.
    const parsed = logs.map((l) => JSON.parse(l));
    assert(parsed.every((p) => p.event === 'capture_llm_attempt'));
    assert(parsed.some((p) => p.attempt === 1 && p.success === false && p.failureStage === 'http' && p.httpStatus === 429 && p.retrying === true));
    assert(parsed.some((p) => p.attempt === 2 && p.success === true));
  } finally {
    mock.restore();
    Deno.env.delete('OPENAI_API_KEY');
  }
});
