// Adaptateur LLM — API Chat Completions d'OpenAI (gpt-5-nano et modèles compatibles Structured
// Outputs). Ajouté pour BENCHMARKER contre Anthropic avant de choisir un fournisseur de prod — voir
// consigne du chantier : même contrat JSON, même règles métier, seul l'appel réseau (et le renfort
// ci-dessous) change. Le modèle vient de LLM_MODEL, jamais hardcodé ici.
//
// PASSE D'OPTIMISATION GPT-5 NANO (benchmark #1 : 3/10, contre 9/10 pour Claude) — analyse des 7 cas
// échoués :
//   - heardContactName parfois laissé à null alors qu'un prénom est bien prononcé (cas simples,
//     sans event/reminder).
//   - "vendredi" prononcé un vendredi résolu à +7 jours au lieu d'aujourd'hui (résolution de jour de
//     semaine trop prudente).
//   - une date d'ÉVÉNEMENT réel ("X a un entretien vendredi") non capturée dans event.hasDate,
//     confusion event/reminder.
//   - un rappel SANS date/heure prononcée reçoit la date/heure ACTUELLE recopiée depuis le contexte
//     temporel (violation directe de la règle "jamais d'heure par défaut").
//   - dictées à plusieurs intentions non splittées en plusieurs "pensees".
// PASSE #2 (reasoning_effort=low, benchmark #2 : 9/10, à parité avec Claude) — reasoning_effort
// relevé de "minimal" à "low" (measured : 3/10 → 9/10, coût/latence toujours très inférieurs).
//
// FIGÉ depuis benchmark #2 (9/10) : une tentative de renfort supplémentaire de la règle 5
// (date+heure) a été essayée après ce résultat pour corriger le seul cas restant, mais a RÉGRESSÉ
// (8/10, benchmark #3) sans corriger le cas visé — reformulation annulée, on reste sur le texte
// exact de la V2 ci-dessous. Prochaine étape : test réel sur iPhone avec des formulations nouvelles,
// pas une nouvelle passe de prompt sur ce même corpus de 10 phrases.
// Le prompt métier partagé (prompt.ts) reste inchangé (Anthropic ne doit pas changer de
// comportement) — on ajoute ICI un message "system" dédié qui insiste sur ces règles de façon
// GÉNÉRALE (aucune règle propre aux 10 phrases du benchmark, seulement des reformulations/exemples
// génériques avec des noms différents), plus des descriptions de champs dans le schéma JSON.
import { TemporalContext } from '../../../_shared/captureContract.ts';
import { LlmExtractionError, LlmFailureCategory, LlmOptions, LlmProvider } from './types.ts';
import { buildExtractionPrompt } from './prompt.ts';

// Schéma JSON strict (OpenAI Structured Outputs) — reflète EXACTEMENT la forme décrite en prose dans
// prompt.ts (JSON_SHAPE_DESCRIPTION). Toute évolution du contrat doit mettre à jour les deux en même
// temps. "strict: true" impose additionalProperties:false et required sur toutes les clés déclarées ;
// les champs nullable utilisent ["type", "null"] (seule syntaxe supportée en mode strict). Les
// "description" ci-dessous sont un renfort supplémentaire (lu par le modèle au même titre que le
// prompt) — elles ne changent PAS la structure/le contrat, seulement la qualité d'extraction.
export const PENSEE_JSON_SCHEMA = {
  name: 'capture_pensif',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      pensees: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            texte: {
              type: 'string',
              description:
                'Contenu SÉMANTIQUE de la pensée. Si reminder.hasReminder=true, retire le verbe/la locution adressée à Pensif ("Rappelle-moi", "Pense à"...) et la date/heure/récurrence du rappel UNIQUEMENT quand leur rattachement au rappel est certain (elles restent de toute façon dans "reminder"). Si event.hasDate=true, retire de même la date de l’événement UNIQUEMENT si son rattachement est certain, et son heure UNIQUEMENT si elle a été correctement extraite dans event.time — sinon (heure non extraite, rattachement douteux) ne retire rien. En cas de doute sur le rattachement d’une expression temporelle, conserve-la dans "texte" — une information sans destination structurée ne doit jamais disparaître. Si ni reminder.hasReminder ni event.hasDate ne sont vrais, "texte" reste tel quel, inchangé.',
            },
            heardContactName: {
              type: ['string', 'null'],
              description:
                'Prénom d’une personne prononcé dans la dictée, TEL QUEL, dès qu’un prénom est mentionné — même dans une simple phrase de goût/fait sans date ni rappel. null UNIQUEMENT si aucun prénom n’est prononcé.',
            },
            event: {
              type: 'object',
              properties: {
                hasDate: {
                  type: 'boolean',
                  description:
                    'true si une date réelle (explicite ou relative : nom de jour, "demain", "dans N jours", date calendaire) est associée à un fait ou événement vécu par quelqu’un — indépendamment de toute demande de rappel.',
                },
                date: {
                  type: ['string', 'null'],
                  description: '"YYYY-MM-DD" si hasDate=true, sinon null. Jamais la date actuelle du contexte si aucune date n’a été dite.',
                },
                time: {
                  type: ['string', 'null'],
                  description:
                    '"HH:mm" (24h) UNIQUEMENT si une heure appartient explicitement à CET événement, sinon null — jamais inventée. STRICTEMENT INDÉPENDANT de reminder.time : ne copie jamais l’heure de l’un vers l’autre, même si une seule heure est prononcée dans toute la dictée.',
                },
                heardExpression: { type: ['string', 'null'] },
                confidence: { type: 'number' },
              },
              required: ['hasDate', 'date', 'time', 'heardExpression', 'confidence'],
              additionalProperties: false,
            },
            reminder: {
              type: 'object',
              properties: {
                hasReminder: {
                  type: 'boolean',
                  description: 'true UNIQUEMENT si l’utilisateur exprime explicitement vouloir être rappelé/notifié — jamais déduit d’une simple date d’événement.',
                },
                date: {
                  type: ['string', 'null'],
                  description:
                    '"YYYY-MM-DD" si une date a été explicitement dite (ou une expression relative résolue), sinon null. Pour une récurrence, la date de la PREMIÈRE occurrence UNIQUEMENT si elle est explicitement déterminable (ex. "à partir de demain", "chaque lundi") — sinon null, jamais "aujourd\'hui" choisi arbitrairement juste parce qu\'une règle "daily" existe. NE JAMAIS recopier la date actuelle du contexte comme valeur par défaut.',
                },
                time: {
                  type: ['string', 'null'],
                  description:
                    '"HH:mm" (24h) SEULEMENT si une heure a été explicitement dite, sinon null. NE JAMAIS recopier l’heure actuelle du contexte, et jamais une heure par défaut comme "09:00" — même pour une récurrence.',
                },
                heardExpression: { type: ['string', 'null'] },
                confidence: { type: 'number' },
                recurrence: {
                  type: ['object', 'null'],
                  description:
                    'null SAUF si une répétition est EXPLICITEMENT exprimée ("tous les jours", "chaque lundi"...) — jamais déduit de deux dates/jours isolés mentionnés dans la même phrase.',
                  properties: {
                    detected: { type: 'boolean' },
                    frequency: {
                      type: 'string',
                      enum: ['daily', 'weekly', 'unclear'],
                      description:
                        '"unclear" si la répétition est certaine mais que sa PORTÉE (jours exacts, fin) ne l’est pas — ex. "tous les jours de la semaine" (7j/7 ? lundi-vendredi ? jusqu’à la fin de la semaine ?). Ne choisis jamais entre les interprétations possibles.',
                    },
                    daysOfWeek: {
                      type: ['array', 'null'],
                      items: { type: 'integer', minimum: 0, maximum: 6 },
                      description:
                        '0=dimanche..6=samedi. Tableau vide [] pour "daily" (implicite), null pour "unclear" (portée non déterminable), jours EXACTS et UNIQUES explicitement entendus pour "weekly".',
                    },
                    occurrenceCount: {
                      type: ['integer', 'null'],
                      description: 'Nombre total d’occurrences si explicitement donné ("pendant 5 jours"), sinon null — jamais inventé.',
                    },
                    untilDate: {
                      type: ['string', 'null'],
                      description: '"YYYY-MM-DD" si une date de fin est explicitement donnée, sinon null — jamais inventée.',
                    },
                    heardExpression: {
                      type: ['string', 'null'],
                      description: 'OBLIGATOIRE et non vide dès que detected=true — l’expression de récurrence entendue, TELLE QUELLE.',
                    },
                  },
                  required: ['detected', 'frequency', 'daysOfWeek', 'occurrenceCount', 'untilDate', 'heardExpression'],
                  additionalProperties: false,
                },
              },
              required: ['hasReminder', 'date', 'time', 'heardExpression', 'confidence', 'recurrence'],
              additionalProperties: false,
            },
            confidence: { type: 'number' },
          },
          required: ['texte', 'heardContactName', 'event', 'reminder', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['pensees'],
    additionalProperties: false,
  },
} as const;

/** Message "system" ajouté UNIQUEMENT pour OpenAI — le prompt métier partagé (prompt.ts, utilisé
 *  tel quel par Anthropic) n'est pas modifié. Reformule les règles déjà présentes dans le prompt
 *  partagé de façon plus explicite/répétée pour un modèle plus petit, avec des exemples GÉNÉRIQUES
 *  (noms et phrases différents des 10 cas du benchmark, pour ne jamais mémoriser des réponses plutôt
 *  que d'appliquer une règle générale). */
export const OPENAI_REINFORCEMENT_SYSTEM_PROMPT = `Applique ces règles de façon GÉNÉRALE, quelle que soit la formulation exacte de la dictée — ce sont des règles, pas des réponses à mémoriser :

1. SPLIT — Si la dictée contient plusieurs informations ou intentions SÉMANTIQUEMENT INDÉPENDANTES et séparables (par exemple un fait/goût sur quelqu'un ET une demande de rappel sans lien, ou plusieurs actions différentes reliées par "et"), retourne une entrée dans "pensees" SÉPARÉE pour chacune. Ne fusionne jamais deux intentions différentes dans une seule entrée.
   Exemple : "Léa adore la randonnée et rappelle-moi de l'appeler mardi à 17h" → DEUX pensées : une sur le goût de Léa (event.hasDate=false, reminder.hasReminder=false), une avec reminder.hasReminder=true, reminder.date=mardi résolu, reminder.time="17:00".
   INTERDIT — ne crée JAMAIS plusieurs pensées pour représenter plusieurs INTERPRÉTATIONS possibles d'une seule et même expression ambiguë (par exemple une date qui pourrait se rattacher soit au rappel, soit au contenu). Une ambiguïté reste une seule pensée, jamais deux hypothèses concurrentes.
   Exemple : "Rappelle-moi d'acheter des fleurs pour l'anniversaire de Tom samedi" → UNE seule pensée, même si "samedi" pourrait être la date du rappel ou celle de l'anniversaire de Tom — ne fabrique jamais deux pensées pour représenter ces deux hypothèses (voir règle 2 pour le traitement de "texte" dans ce cas).

2. TEXTE CONCIS, PAS UNE COMMANDE NI UNE RÉPÉTITION DE MÉTADONNÉES — "texte" doit contenir le contenu SÉMANTIQUE utile, pas la formulation servant à programmer le rappel, ni une date/heure déjà portée ailleurs par la structure. Quand reminder.hasReminder=true, retire de "texte" le verbe/la locution adressée à Pensif ("Rappelle-moi", "Pense à", "N'oublie pas de"...) ainsi que la date/l'heure/la récurrence du rappel — mais UNIQUEMENT quand leur rattachement au déclenchement du rappel (et non au contenu lui-même) est certain. Ces informations restent de toute façon dans "reminder"/"reminder.recurrence", jamais perdues.
   ÉVÉNEMENTS — MÊME logique pour "event" : quand event.hasDate=true, retire de "texte" la date de l'événement UNIQUEMENT si son rattachement à CET événement est certain, et son heure UNIQUEMENT si elle a été correctement extraite dans event.time. Si aucune heure d'événement n'a pu être extraite avec certitude, NE RETIRE RIEN — une information temporelle sans destination structurée (ni event.date/event.time, ni reminder.date/reminder.time) ne doit JAMAIS disparaître de "texte". Si la dictée produit plusieurs pensées (règle 1), applique cette règle INDÉPENDAMMENT à CHACUNE : une expression temporelle n'est retirable du "texte" d'une pensée que si CETTE pensée porte elle-même la structure qui la représente — jamais parce qu'une AUTRE pensée du lot la représente déjà.
   En cas de doute sur le rattachement d'une expression temporelle (paramètre du rappel/événement vs. contenu), NE LA RETIRE PAS de "texte" — une redondance vaut toujours mieux qu'une perte d'information. Quand ni reminder.hasReminder ni event.hasDate ne sont vrais, "texte" reste tel quel, sans raccourcissement.
   Exemple : "Pense à arroser les plantes tous les mardis à 8h" → "texte":"Arroser les plantes" (verbe + heure + récurrence certainement rattachés au rappel, retirés).
   Exemple : "Rappelle-moi demain de demander à Sami s'il est disponible jeudi" → "texte":"Demander à Sami s'il est disponible jeudi" (reminder.date="demain" retiré ; "jeudi" appartient à la question posée à Sami, conservé).
   Exemple : "Rappelle-moi d'acheter des fleurs pour l'anniversaire de Tom samedi" → "texte":"Acheter des fleurs pour l'anniversaire de Tom samedi" (le verbe déclencheur est retiré avec certitude ; "samedi" reste car son rattachement — rappel ou anniversaire — est ambigu).
   Exemple : "Nadia a un entretien jeudi" → "texte" inchangé, aucun verbe déclencheur de rappel présent, "jeudi" seulement représenté par event.date (rien d'autre à retirer, aucune heure dans la dictée).
   Exemple : "Spectacle de Lumen Fracture à Nantes le 3 avril 2027 à 21h30" (aucun rappel) → "texte":"Spectacle de Lumen Fracture à Nantes" (date ET heure certainement rattachées à cet unique événement, toutes deux extraites dans event.date/event.time).
   Exemple : "J'ai un match samedi à 15h. Préviens-moi la veille à 10h." → "texte":"Match" (date+heure de l'événement ET date+heure du rappel toutes deux extraites séparément avec certitude, chacune dans sa propre structure).

3. EVENT ≠ REMINDER — Une date mentionnée à propos d'un fait ou d'un événement RÉEL vécu par quelqu'un (rendez-vous, entretien, examen, anniversaire, permis...) doit être capturée dans "event" (hasDate=true, date résolue), MÊME SI aucun rappel n'est demandé. Ne mets reminder.hasReminder=true QUE si l'utilisateur exprime explicitement vouloir être notifié/rappelé — jamais déduit automatiquement d'une date d'événement.
   Exemple : "Paul passe son permis mardi" → event.hasDate=true avec la date de mardi résolue ; reminder.hasReminder=false.
   EVENT.TIME ≠ REMINDER.TIME — même discipline que ci-dessus, appliquée à l'heure : "event.time" reçoit une heure UNIQUEMENT quand elle appartient explicitement à CET événement (jamais inventée, même règle que reminder.time, règle 5). "event.time" et "reminder.time" sont deux champs STRICTEMENT INDÉPENDANTS — ne copie JAMAIS l'heure de l'un vers l'autre, même quand une seule heure est prononcée dans toute la dictée et que l'autre champ en semble "orphelin".
   Exemple : "Réunion jeudi à 14h, préviens-moi la veille de préparer les documents" (aucune heure de rappel dite) → event.time="14:00" (heure de la réunion), reminder.time=null (ne recopie jamais 14h ici).
   Exemple : "Bus dimanche à 9h05, rappelle-moi samedi à 19h de faire mon sac" → event.time="09:05" (heure du bus), reminder.time="19:00" (heure du rappel) — deux heures distinctes dans la même dictée, chacune rattachée à sa propre notion.

4. RÉSOLUTION D'UN JOUR DE SEMAINE NOMMÉ — Pour "lundi", "mardi", ..., "dimanche" : résous vers la PROCHAINE occurrence de ce jour, EN COMPTANT AUJOURD'HUI si le jour actuel donné dans le contexte correspond exactement à ce nom. N'ajoute PAS une semaine par défaut par prudence. N'ajoute une semaine que si "prochain"/"prochaine" est dit explicitement (ex. "mardi prochain").

5. NE JAMAIS RECOPIER LE CONTEXTE COMME VALEUR PAR DÉFAUT — Le contexte temporel (date/heure actuelle) sert UNIQUEMENT à calculer une date relative EXPLICITEMENT mentionnée ("demain", "dans 3 jours", "mardi"...). Si l'utilisateur exprime un rappel SANS dire aucune date ni heure, "date" ET "time" du reminder doivent être null tous les deux — ne mets JAMAIS la date ou l'heure actuelle du contexte à la place d'une valeur absente, et n'invente jamais une heure comme "09:00".
   Exemple : "Rappelle-moi d'écrire à Paul" (rien d'autre n'est dit) → reminder.hasReminder=true, reminder.date=null, reminder.time=null.

6. DATE + HEURE ENSEMBLE — Si une expression de rappel contient à la fois une date/un jour ET une heure, conserve les deux dans reminder (ne perds ni l'une ni l'autre).

7. PRÉNOM ENTENDU — Dès qu'un prénom de personne est prononcé dans la dictée, quel que soit le type de phrase (simple fait, goût, événement, rappel), reporte-le dans "heardContactName" tel qu'entendu. Ne le laisse à null que si aucun prénom n'est prononcé dans la dictée.

8. RÉCURRENCE (reminder.recurrence) — null SAUF si une répétition est EXPLICITEMENT exprimée ("tous les jours", "chaque lundi", "du lundi au vendredi"...). Ne déduis JAMAIS une récurrence de deux jours/dates isolés simplement mentionnés dans la même phrase. Si la répétition est certaine mais que sa PORTÉE exacte (quels jours, jusqu'à quand) est ambiguë, mets frequency="unclear", daysOfWeek=null, occurrenceCount=null, untilDate=null — ne choisis JAMAIS entre plusieurs interprétations possibles, et reporte l'expression entendue telle quelle dans recurrence.heardExpression (jamais vide dès que detected=true).
   Exemple : "Rappelle-moi tous les jours de la semaine à 21h40 de faire mes exercices" → frequency="unclear", heardExpression="tous les jours de la semaine" (jamais 7j/7 ni lundi-vendredi choisi arbitrairement).
   Exemple : "Rappelle-moi chaque lundi à 18h d'appeler Léa" → frequency="weekly", daysOfWeek=[1], heardExpression="chaque lundi".
   reminder.date reste la date de la PREMIÈRE occurrence, mais UNIQUEMENT si elle est EXPLICITEMENT déterminable — jamais "aujourd'hui" choisi arbitrairement juste parce qu'une règle "daily" existe. "tous les jours à 21h40" seul → date=null. "tous les jours pendant 5 jours à 21h40" (durée seule, aucun point de départ dit) → date=null. "tous les jours à partir de demain à 21h40" → date=demain. "chaque lundi à 18h" → date=la prochaine occurrence de lundi. "du lundi au vendredi à 8h" → date=la prochaine date appartenant au motif lundi-vendredi. reminder.time reste null si aucune heure n'est explicitement dite, même pour une récurrence.

Règle générale : n'invente JAMAIS une information absente (date, heure, prénom) — une absence reste une absence (null), jamais une valeur par défaut ou une valeur copiée du contexte.`;

/** gpt-5* expose un contrôle d'effort de raisonnement ; les autres modèles (ex. gpt-4o) n'acceptent
 *  pas ce paramètre — on ne l'ajoute donc que pour gpt-5*. Configurable via OPENAI_REASONING_EFFORT,
 *  défaut "low" — mesuré au benchmark : "minimal" plafonnait à 3/10, "low" atteint 9/10 (à parité
 *  avec Claude) pour un coût/une latence toujours très inférieurs ; reste ajustable sans redéploiement
 *  de code si un futur test justifie de revenir à "minimal" ou de monter à "medium". */
function isGpt5Family(model: string): boolean {
  return model.toLowerCase().startsWith('gpt-5');
}

function resolveReasoningEffort(): string {
  return Deno.env.get('OPENAI_REASONING_EFFORT') ?? 'low';
}

/** Construit le corps de requête Chat Completions — extrait pour être réutilisé TEL QUEL par le
 *  script de benchmark (scripts/benchmark-capture-llm-providers.ts), afin qu'aucune divergence ne
 *  puisse exister entre ce qui est mesuré et ce qui tourne réellement en production. */
export function buildOpenaiRequestBody(transcript: string, context: TemporalContext, model: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: OPENAI_REINFORCEMENT_SYSTEM_PROMPT },
      { role: 'user', content: buildExtractionPrompt(transcript, context) },
    ],
    response_format: { type: 'json_schema', json_schema: PENSEE_JSON_SCHEMA },
    // Sortie strictement structurée + concise : pas de texte libre à borner, mais on plafonne quand
    // même pour éviter qu'un modèle mal configuré ne parte en dérive coûteuse.
    max_completion_tokens: 2048,
  };
  if (isGpt5Family(model)) {
    body.reasoning_effort = resolveReasoningEffort();
  }
  return body;
}

// --- CHANTIER "Capture robustness — retry LLM ciblé + observabilité minimale" (2026-09-18) --------
// Diagnostic préalable (classification D, voir audit dédié) : le benchmark réel rejoue le pipeline
// EXACT (même buildOpenaiRequestBody, même modèle/reasoning_effort par défaut) et réussit 12/12 pour
// la phrase iPhone qui avait échoué en production — l'échec était un incident TRANSITOIRE côté
// provider/réseau, jamais un problème de prompt/schéma/validation. AUCUNE tentative de "réparer" en
// changeant le prompt/le modèle/max_completion_tokens ici — seulement une tolérance à UN incident
// isolé, par une seconde tentative INDÉPENDANTE (voir consigne : "une seconde génération indépendante
// peut produire un JSON valide"), jamais plus de 2 appels OpenAI au total pour une extraction.

/** Une seule constante explicite pour le délai entre les deux tentatives — jamais un exponential
 *  backoff pour seulement 2 appels (voir consigne "pas de grosse infrastructure"). 400ms = milieu de
 *  la fourchette 300–500ms demandée. */
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 2;

/** AUDIT Retry-After (consigne "auditer sans complexifier") : une réponse 429 d'OpenAI peut exposer un
 *  en-tête `Retry-After`, mais pour UN SEUL retry avec un délai déjà court (300-500ms), l'exploiter
 *  ajouterait une branche de complexité (parsing, clamping, unités secondes/date HTTP) pour un
 *  bénéfice marginal — décision : ne PAS le lire, garder `RETRY_DELAY_MS` fixe et unique, comme
 *  demandé explicitement. Rien à implémenter au-delà de ce commentaire d'audit.
 */

/** Catégorie d'échec — voir consigne §"Observabilité serveur", jamais une donnée utilisateur. */
type FailureStage = 'http' | 'network' | 'empty_content' | 'json_parse';

/** CHANTIER "Capture bloquante — diagnostic parseError" (2026-09-18), priorité 3. Traduit la
 *  catégorie INTERNE de ce fichier (`FailureStage`) vers la catégorie PARTAGÉE exposée jusqu'au
 *  client (`LlmFailureCategory`, types.ts) — seuls les libellés `http`/`network` sont renommés
 *  (`llm_http`/`llm_network`, pour rester non ambigus une fois sortis du contexte de ce fichier),
 *  `empty_content`/`json_parse` restent identiques. Fonction PURE, aucun effet de bord. */
function toLlmFailureCategory(stage: FailureStage): LlmFailureCategory {
  if (stage === 'http') return 'llm_http';
  if (stage === 'network') return 'llm_network';
  return stage;
}

/** Un échec de CETTE catégorie mérite-t-il l'unique retry autorisé ? Volontairement STRICT : un 4xx
 *  hors 429 (mauvaise requête/config) n'est jamais retenté (répéter ne réparera rien) ; un JSON valide
 *  mais sémantiquement imparfait n'atteint même jamais cette fonction (ce n'est pas un `FailureStage`,
 *  voir plus bas — comportement existant conservé à l'identique, `validateLlmOutput` reste seul juge). */
function isRetryableFailure(stage: FailureStage, httpStatus: number | null): boolean {
  if (stage === 'network' || stage === 'empty_content' || stage === 'json_parse') return true;
  if (stage === 'http') return httpStatus === 429 || (httpStatus !== null && httpStatus >= 500);
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Log structuré JSON, une ligne par tentative — voir consigne : AUCUNE donnée utilisateur (jamais le
 *  transcript, le prompt, le texte de pensée, le contenu brut du LLM, des données contacts). Seuls des
 *  métadonnées techniques (compteurs, statuts, catégories) — `requestId` généré ici (non sensible,
 *  sert uniquement à relier les lignes d'une même extraction dans les logs). */
function logCaptureLlmAttempt(fields: {
  requestId: string;
  provider: string;
  model: string;
  attempt: number;
  success: boolean;
  failureStage?: FailureStage;
  httpStatus?: number;
  finishReason?: string;
  contentPresent?: boolean;
  contentLength?: number;
  retrying: boolean;
}): void {
  console.log(JSON.stringify({ event: 'capture_llm_attempt', ...fields }));
}

type AttemptOutcome =
  | { ok: true; parsed: unknown; httpStatus: number; finishReason: string | null; contentPresent: boolean; contentLength: number }
  | {
      ok: false;
      failureStage: FailureStage;
      httpStatus: number | null;
      finishReason: string | null;
      contentPresent: boolean;
      contentLength: number;
      error: unknown;
    };

/** UNE tentative d'appel — jamais de retry ici, uniquement la classification du résultat. Le retry
 *  lui-même vit dans `extract` ci-dessous, seul endroit qui décide d'une deuxième tentative. */
async function attemptOpenaiExtraction(transcript: string, context: TemporalContext, model: string, apiKey: string): Promise<AttemptOutcome> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildOpenaiRequestBody(transcript, context, model)),
    });
  } catch (e) {
    // Erreur réseau/fetch (connexion interrompue, DNS, etc.) — jamais de httpStatus, voir consigne.
    return { ok: false, failureStage: 'network', httpStatus: null, finishReason: null, contentPresent: false, contentLength: 0, error: e };
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    return {
      ok: false,
      failureStage: 'http',
      httpStatus: response.status,
      finishReason: null,
      contentPresent: false,
      contentLength: 0,
      error: new Error(`OpenAI LLM a échoué (${response.status}): ${errBody}`),
    };
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  };
  const content = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason ?? null;
  const contentPresent = typeof content === 'string' && content.length > 0;
  const contentLength = typeof content === 'string' ? content.length : 0;

  if (!contentPresent) {
    return {
      ok: false,
      failureStage: 'empty_content',
      httpStatus: response.status,
      finishReason,
      contentPresent,
      contentLength,
      error: new Error('Réponse OpenAI inattendue (aucun contenu message)'),
    };
  }

  try {
    const parsed = JSON.parse(content as string);
    return { ok: true, parsed, httpStatus: response.status, finishReason, contentPresent, contentLength };
  } catch (e) {
    return { ok: false, failureStage: 'json_parse', httpStatus: response.status, finishReason, contentPresent, contentLength, error: e };
  }
}

export const openaiLlmProvider: LlmProvider = {
  name: 'openai',
  async extract(transcript: string, context: TemporalContext, options: LlmOptions): Promise<unknown> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY manquant (secret Supabase requis pour LLM_PROVIDER=openai)');

    const requestId = crypto.randomUUID();
    let lastFailure: Extract<AttemptOutcome, { ok: false }> | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const outcome = await attemptOpenaiExtraction(transcript, context, options.model, apiKey);

      if (outcome.ok) {
        logCaptureLlmAttempt({
          requestId,
          provider: 'openai',
          model: options.model,
          attempt,
          success: true,
          httpStatus: outcome.httpStatus,
          finishReason: outcome.finishReason ?? undefined,
          contentPresent: outcome.contentPresent,
          contentLength: outcome.contentLength,
          retrying: false,
        });
        // Succès (éventuellement au 2e essai) — le client reçoit la réponse normale, SANS trace du
        // retry : le fait qu'une tentative ait échoué avant ne doit jamais modifier le contrat API
        // (voir consigne "le client doit recevoir strictement la réponse normale réussie").
        return outcome.parsed;
      }

      const isLastAttempt = attempt >= MAX_ATTEMPTS;
      const retrying = !isLastAttempt && isRetryableFailure(outcome.failureStage, outcome.httpStatus);

      logCaptureLlmAttempt({
        requestId,
        provider: 'openai',
        model: options.model,
        attempt,
        success: false,
        failureStage: outcome.failureStage,
        httpStatus: outcome.httpStatus ?? undefined,
        finishReason: outcome.finishReason ?? undefined,
        contentPresent: outcome.contentPresent,
        contentLength: outcome.contentLength,
        retrying,
      });

      lastFailure = outcome;
      if (!retrying) {
        const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
        throw new LlmExtractionError(message, toLlmFailureCategory(outcome.failureStage));
      }

      await sleep(RETRY_DELAY_MS);
    }

    // Structurellement inatteignable (la boucle throw toujours avant si !retrying, et retrying est
    // toujours faux au dernier tour) — uniquement pour satisfaire le typeur, jamais exécuté en pratique.
    if (lastFailure) {
      const message = lastFailure.error instanceof Error ? lastFailure.error.message : String(lastFailure.error);
      throw new LlmExtractionError(message, toLlmFailureCategory(lastFailure.failureStage));
    }
    throw new Error('Échec extraction LLM (retries épuisés)');
  },
};
