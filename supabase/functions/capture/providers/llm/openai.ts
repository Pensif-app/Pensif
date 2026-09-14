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
import { LlmOptions, LlmProvider } from './types.ts';
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
            texte: { type: 'string', description: 'Contenu de la pensée, tel quel.' },
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
                heardExpression: { type: ['string', 'null'] },
                confidence: { type: 'number' },
              },
              required: ['hasDate', 'date', 'heardExpression', 'confidence'],
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
                    '"YYYY-MM-DD" si une date a été explicitement dite (ou une expression relative résolue), sinon null. NE JAMAIS recopier la date actuelle du contexte comme valeur par défaut.',
                },
                time: {
                  type: ['string', 'null'],
                  description:
                    '"HH:mm" (24h) SEULEMENT si une heure a été explicitement dite, sinon null. NE JAMAIS recopier l’heure actuelle du contexte, et jamais une heure par défaut comme "09:00".',
                },
                heardExpression: { type: ['string', 'null'] },
                confidence: { type: 'number' },
              },
              required: ['hasReminder', 'date', 'time', 'heardExpression', 'confidence'],
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

1. SPLIT — Si la dictée contient plusieurs informations ou intentions distinctes et séparables (par exemple un fait/goût sur quelqu'un ET une demande de rappel, ou plusieurs faits indépendants reliés par "et"), retourne une entrée dans "pensees" SÉPARÉE pour chacune. Ne fusionne jamais deux intentions différentes dans une seule entrée.
   Exemple : "Léa adore la randonnée et rappelle-moi de l'appeler mardi à 17h" → DEUX pensées : une sur le goût de Léa (event.hasDate=false, reminder.hasReminder=false), une avec reminder.hasReminder=true, reminder.date=mardi résolu, reminder.time="17:00".

2. EVENT ≠ REMINDER — Une date mentionnée à propos d'un fait ou d'un événement RÉEL vécu par quelqu'un (rendez-vous, entretien, examen, anniversaire, permis...) doit être capturée dans "event" (hasDate=true, date résolue), MÊME SI aucun rappel n'est demandé. Ne mets reminder.hasReminder=true QUE si l'utilisateur exprime explicitement vouloir être notifié/rappelé — jamais déduit automatiquement d'une date d'événement.
   Exemple : "Paul passe son permis mardi" → event.hasDate=true avec la date de mardi résolue ; reminder.hasReminder=false.

3. RÉSOLUTION D'UN JOUR DE SEMAINE NOMMÉ — Pour "lundi", "mardi", ..., "dimanche" : résous vers la PROCHAINE occurrence de ce jour, EN COMPTANT AUJOURD'HUI si le jour actuel donné dans le contexte correspond exactement à ce nom. N'ajoute PAS une semaine par défaut par prudence. N'ajoute une semaine que si "prochain"/"prochaine" est dit explicitement (ex. "mardi prochain").

4. NE JAMAIS RECOPIER LE CONTEXTE COMME VALEUR PAR DÉFAUT — Le contexte temporel (date/heure actuelle) sert UNIQUEMENT à calculer une date relative EXPLICITEMENT mentionnée ("demain", "dans 3 jours", "mardi"...). Si l'utilisateur exprime un rappel SANS dire aucune date ni heure, "date" ET "time" du reminder doivent être null tous les deux — ne mets JAMAIS la date ou l'heure actuelle du contexte à la place d'une valeur absente, et n'invente jamais une heure comme "09:00".
   Exemple : "Rappelle-moi d'écrire à Paul" (rien d'autre n'est dit) → reminder.hasReminder=true, reminder.date=null, reminder.time=null.

5. DATE + HEURE ENSEMBLE — Si une expression de rappel contient à la fois une date/un jour ET une heure, conserve les deux dans reminder (ne perds ni l'une ni l'autre).

6. PRÉNOM ENTENDU — Dès qu'un prénom de personne est prononcé dans la dictée, quel que soit le type de phrase (simple fait, goût, événement, rappel), reporte-le dans "heardContactName" tel qu'entendu. Ne le laisse à null que si aucun prénom n'est prononcé dans la dictée.

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

export const openaiLlmProvider: LlmProvider = {
  name: 'openai',
  async extract(transcript: string, context: TemporalContext, options: LlmOptions): Promise<unknown> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY manquant (secret Supabase requis pour LLM_PROVIDER=openai)');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildOpenaiRequestBody(transcript, context, options.model)),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`OpenAI LLM a échoué (${response.status}): ${errBody}`);
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Réponse OpenAI inattendue (aucun contenu message)');
    }
    try {
      return JSON.parse(content);
    } catch {
      // Un JSON illisible n'est PAS une erreur réseau/API — c'est une sortie invalide, à faire
      // gérer par validate.ts (repli transcript brut), pas une exception qui casserait la requête.
      return null;
    }
  },
};
