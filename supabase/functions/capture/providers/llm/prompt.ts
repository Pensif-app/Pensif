// Template de prompt PARTAGÉ entre tous les adaptateurs LLM — un seul endroit qui encode les
// règles du contrat (event/reminder séparés, heure jamais inventée, pas de matching de proche,
// jamais de datetime ISO/UTC construit par le LLM). Un adaptateur ne fait que transporter ce texte
// vers l'API de son fournisseur ; il ne doit jamais reformuler ces règles lui-même.
import { TemporalContext } from '../../../_shared/captureContract.ts';

const JSON_SHAPE_DESCRIPTION = `{
  "pensees": [
    {
      "texte": string,                    // contenu de la pensée, tel quel
      "heardContactName": string | null,   // prénom entendu, TEL QUEL — jamais un id, jamais devine si absent
      "event": {
        "hasDate": boolean,
        "date": string | null,             // "YYYY-MM-DD" UNIQUEMENT si hasDate est vrai, sinon null
        "heardExpression": string | null,  // ex. "le 20 septembre", "vendredi prochain"
        "confidence": number                // 0 à 1
      },
      "reminder": {
        "hasReminder": boolean,             // vrai seulement si un rappel/notification est explicitement voulu
        "date": string | null,              // "YYYY-MM-DD", résolu à partir du contexte temporel fourni
        "time": string | null,              // "HH:mm" (24h) SEULEMENT si une heure a été explicitement entendue — sinon null, JAMAIS une heure par défaut
        "heardExpression": string | null,
        "confidence": number
      },
      "confidence": number                  // confiance globale de cette extraction, 0 à 1
    }
  ]
}`;

export function buildExtractionPrompt(transcript: string, context: TemporalContext): string {
  return `Tu extrais des informations structurées à partir d'une dictée vocale transcrite, pour une application de mémoire relationnelle (Pensif).

Contexte temporel actuel (à utiliser pour résoudre des expressions relatives comme "demain", "vendredi", "dans 3 jours") :
- Date/heure locale actuelle : ${context.localDateTime}
- Jour de la semaine actuel : ${context.weekday}
- Fuseau horaire de l'utilisateur : ${context.timezone}

Transcript à analyser :
"""
${transcript}
"""

Règles STRICTES :
1. Si la dictée contient plusieurs informations distinctes et séparables, retourne PLUSIEURS entrées dans "pensees" (une par information), plutôt qu'une seule entrée fourre-tout.
2. "event" (une date mentionnée à propos du contenu) et "reminder" (une notification explicitement demandée) sont deux notions INDÉPENDANTES. Une pensée peut être datée sans qu'aucun rappel ne soit voulu, et inversement.
3. Ne choisis JAMAIS d'identifiant de contact. Retourne uniquement le prénom tel qu'entendu dans "heardContactName" (ou null si aucun proche n'est mentionné) — le rapprochement avec les contacts existants se fait ailleurs, pas par toi.
4. N'invente JAMAIS une heure absente. Si aucune heure n'a été explicitement dite, "time" doit être null — ne mets jamais une heure par défaut (comme "09:00").
5. Ne construis JAMAIS de date/heure combinée (pas de format ISO avec fuseau, pas de "Z"). Retourne uniquement des composants séparés : "date" au format "YYYY-MM-DD", "time" au format "HH:mm" (24h) ou null.
6. Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après, exactement selon cette forme :

${JSON_SHAPE_DESCRIPTION}`;
}
