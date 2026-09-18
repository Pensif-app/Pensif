// Tests purs (aucun réseau) de l'adaptateur LLM OpenAI — couvre la construction du corps de requête
// (reasoning_effort par modèle/env) et le câblage du message system de renfort (figé depuis le
// benchmark #2, 9/10 — voir le commentaire d'en-tête d'openai.ts). Pas de test contre un vrai
// transcript ici : la validation sémantique réelle se fait via le benchmark
// (scripts/benchmark-capture-llm-providers.ts), qui nécessite un vrai appel réseau et donc une clé API.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildOpenaiRequestBody, OPENAI_REINFORCEMENT_SYSTEM_PROMPT, PENSEE_JSON_SCHEMA } from './openai.ts';
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
