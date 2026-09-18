// Template de prompt PARTAGÉ entre tous les adaptateurs LLM — un seul endroit qui encode les
// règles du contrat (event/reminder séparés, heure jamais inventée, pas de matching de proche,
// jamais de datetime ISO/UTC construit par le LLM). Un adaptateur ne fait que transporter ce texte
// vers l'API de son fournisseur ; il ne doit jamais reformuler ces règles lui-même.
import { TemporalContext } from '../../../_shared/captureContract.ts';

const JSON_SHAPE_DESCRIPTION = `{
  "pensees": [
    {
      "texte": string,                    // contenu SÉMANTIQUE de la pensée — voir règle 2 (concis quand reminder.hasReminder=true et/ou event.hasDate=true, inchangé sinon)
      "heardContactName": string | null,   // prénom entendu, TEL QUEL — jamais un id, jamais devine si absent
      "event": {
        "hasDate": boolean,
        "date": string | null,             // "YYYY-MM-DD" UNIQUEMENT si hasDate est vrai, sinon null
        "time": string | null,             // "HH:mm" (24h) SEULEMENT si une heure appartient explicitement à CET événement — voir règle 3, jamais copiée depuis/vers reminder.time
        "heardExpression": string | null,  // ex. "le 20 septembre", "vendredi prochain"
        "confidence": number                // 0 à 1
      },
      "reminder": {
        "hasReminder": boolean,             // vrai seulement si un rappel/notification est explicitement voulu
        "date": string | null,              // "YYYY-MM-DD", résolu à partir du contexte temporel fourni — pour une récurrence, la date de la PREMIÈRE occurrence
        "time": string | null,              // "HH:mm" (24h) SEULEMENT si une heure a été explicitement entendue — sinon null, JAMAIS une heure par défaut
        "heardExpression": string | null,
        "confidence": number,
        "recurrence": {                     // null SAUF si une répétition est EXPLICITEMENT exprimée ("tous les jours", "chaque lundi"...) — jamais déduit de deux dates isolées
          "detected": boolean,
          "frequency": "daily" | "weekly" | "unclear",  // "unclear" si la répétition est certaine mais sa PORTÉE exacte (jours concernés, fin) ne l'est pas
          "daysOfWeek": number[] | null,    // 0=dimanche..6=samedi. [] pour "daily", null pour "unclear", jours EXACTS et UNIQUES pour "weekly"
          "occurrenceCount": number | null, // nombre total d'occurrences si un compte est explicitement donné ("pendant 5 jours"), sinon null
          "untilDate": string | null,       // "YYYY-MM-DD" si une date de fin est explicitement donnée, sinon null
          "heardExpression": string | null  // OBLIGATOIRE (non vide) dès que detected=true — l'expression de récurrence entendue, telle quelle
        } | null
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
1. Si la dictée contient plusieurs informations SÉMANTIQUEMENT INDÉPENDANTES que l'utilisateur voudrait retrouver comme des pensées distinctes (par exemple un fait sur quelqu'un ET une demande de rappel sans lien entre eux, ou deux actions différentes reliées par "et"), retourne PLUSIEURS entrées dans "pensees" (une par information). Ne crée en revanche JAMAIS plusieurs entrées pour représenter plusieurs interprétations concurrentes d'une seule et même expression ambiguë (par exemple une date qui pourrait se rattacher soit au rappel, soit au contenu de la pensée) : une ambiguïté n'est PAS un second contenu séparable. Dans ce cas, une seule pensée, en conservant prudemment l'expression ambiguë dans "texte" (voir règle 2).
2. "texte" — CONTENU SÉMANTIQUE de la pensée, pas une commande adressée à Pensif NI une répétition de métadonnées déjà structurées. Quand "reminder.hasReminder" est vrai, retire de "texte" la formulation qui sert UNIQUEMENT à programmer le rappel : le verbe/la locution adressée à Pensif ("Rappelle-moi", "Pense à", "N'oublie pas de"...), ainsi que la date, l'heure, l'expression de récurrence et sa borne/durée du rappel — mais UNIQUEMENT quand leur rattachement au déclenchement du rappel (plutôt qu'au contenu de la pensée lui-même) est certain. Ces informations retirées restent de toute façon disponibles dans "reminder"/"reminder.recurrence", jamais perdues pour l'application.
   ÉVÉNEMENTS — MÊME logique, appliquée à "event" : quand "event.hasDate" est vrai, retire de "texte" la date de l'événement UNIQUEMENT si son rattachement à CET événement est certain, et son heure UNIQUEMENT si elle a été correctement extraite dans "event.time" (si aucune heure d'événement n'a pu être extraite, ne retire RIEN — une information temporelle sans destination structurée ne doit JAMAIS disparaître de "texte"). Si la dictée est scindée en plusieurs pensées (règle 1), applique cette règle INDÉPENDAMMENT à CHAQUE pensée : une expression temporelle ne peut être retirée du "texte" d'UNE pensée que si CETTE pensée porte elle-même la structure qui la représente (son propre event.date/event.time ou reminder.date/reminder.time) — jamais parce qu'une AUTRE pensée du même lot la représente déjà.
   En cas de doute sur le rattachement d'une expression temporelle (paramètre du rappel ou de l'événement vs. contenu sémantique), NE LA RETIRE PAS : la perte d'une information est plus grave qu'une redondance. Quand ni "reminder.hasReminder" ni "event.hasDate" ne sont vrais, "texte" reste tel quel (comportement inchangé, ne raccourcis jamais un fait/goût).
   Exemple : "Rappelle-moi tous les jours à 18h30 de sortir le chien" → "texte":"Sortir le chien" (verbe déclencheur + heure + récurrence tous certainement rattachés au rappel, retirés).
   Exemple : "Rappelle-moi demain de demander à Nora si elle est libre samedi" → "texte":"Demander à Nora si elle est libre samedi" (reminder.date="demain" concerne le rappel, retiré ; "samedi" fait partie de la question posée à Nora, donc du contenu — conservé).
   Exemple : "Concert de Nova Ellipse à Rennes le 12 mai 2027 à 21h" (aucun rappel) → "texte":"Concert de Nova Ellipse à Rennes" (date ET heure certainement rattachées à cet unique événement, toutes deux extraites dans event.date/event.time, retirées).
   Exemple : "J'ai un spectacle jeudi à 20h. Préviens-moi la veille à 18h." → "texte":"Spectacle" (date+heure de l'événement ET date+heure du rappel toutes extraites séparément et avec certitude, chacune dans sa propre structure, toutes retirées).
   Exemple : "Marc a un rendez-vous jeudi" → "texte" inchangé si "jeudi" n'est structurellement représenté que par event.date (l'heure n'existe pas dans la dictée, rien d'autre à retirer) — mais si la dictée ne permet PAS d'extraire "jeudi" dans event.date avec certitude (rattachement ambigu), "texte" reste également inchangé.
   Exemple : "Acheter un cadeau pour l'anniversaire de Léa samedi" (sans rappel) → "texte" INCHANGÉ si le rattachement de "samedi" (date de l'anniversaire, ou simple échéance de l'achat) reste ambigu — ne jamais retirer un mot uniquement pour raccourcir "texte".
3. "event" (une date mentionnée à propos du contenu) et "reminder" (une notification explicitement demandée) sont deux notions INDÉPENDANTES. Une pensée peut être datée sans qu'aucun rappel ne soit voulu, et inversement. "event.time" suit la MÊME discipline que "reminder.time" (règle 5) : renseigne-le UNIQUEMENT quand une heure appartient explicitement à CET événement (rattachement certain), sinon null — n'invente jamais une heure d'événement. "event.time" et "reminder.time" restent STRICTEMENT INDÉPENDANTS : ne copie JAMAIS l'heure de l'un vers l'autre, même si un seul horaire est prononcé dans toute la dictée.
   Exemple : "Concert à Lyon le 7 mars 2027 à 20h" (aucun rappel) → event.date="2027-03-07", event.time="20:00", reminder.hasReminder=false, reminder.time=null.
   Exemple : "J'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h." → event.time="20:00" (heure du concert) ET reminder.time="18:00" (heure du rappel, dite séparément) — les deux coexistent, jamais confondues.
   Exemple : "J'ai un concert vendredi à 20h. Rappelle-moi la veille." (aucune heure de rappel dite) → event.time="20:00", reminder.time=null — ne recopie JAMAIS 20h dans reminder.time au seul motif qu'aucune autre heure n'est disponible.
   Exemple : "Train samedi à 7h12, rappelle-moi vendredi à 20h de préparer ma valise" → event.time="07:12" (heure du train), reminder.time="20:00" (heure du rappel) — deux heures distinctes dans la même dictée, chacune rattachée à sa propre notion, jamais interverties.
4. Ne choisis JAMAIS d'identifiant de contact. Retourne uniquement le prénom tel qu'entendu dans "heardContactName" (ou null si aucun proche n'est mentionné) — le rapprochement avec les contacts existants se fait ailleurs, pas par toi.
5. N'invente JAMAIS une heure absente. Si aucune heure n'a été explicitement dite, "time" doit être null — ne mets jamais une heure par défaut (comme "09:00").
6. Ne construis JAMAIS de date/heure combinée (pas de format ISO avec fuseau, pas de "Z"). Retourne uniquement des composants séparés : "date" au format "YYYY-MM-DD", "time" au format "HH:mm" (24h) ou null.
7. RÉCURRENCE — "reminder.recurrence" reste null SAUF si une répétition est EXPLICITEMENT exprimée dans la dictée ("tous les jours", "chaque lundi", "du lundi au vendredi"...). Ne déduis JAMAIS une récurrence de la simple mention de deux jours/dates isolés dans la même phrase (ex. "lundi et jeudi j'ai une réunion" n'est PAS une récurrence si aucune répétition n'est dite explicitement).
   - "daysOfWeek" utilise 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi, 5=vendredi, 6=samedi.
   - Si la répétition est certaine mais que sa PORTÉE exacte est ambiguë (quels jours précisément, jusqu'à quand), mets "frequency":"unclear", "daysOfWeek":null, "occurrenceCount":null, "untilDate":null — NE CHOISIS JAMAIS entre plusieurs interprétations possibles. "heardExpression" doit alors contenir l'expression entendue TELLE QUELLE.
     Exemple : "tous les jours de la semaine à 21h40" est ambigu (7j/7 ? lundi-vendredi ? jusqu'à la fin de la semaine ?) → "frequency":"unclear", "heardExpression":"tous les jours de la semaine".
   - "reminder.date" représente la date de la PREMIÈRE occurrence de la récurrence, mais UNIQUEMENT quand cette première occurrence est EXPLICITEMENT déterminable à partir de ce qui est dit — jamais inventée, et surtout JAMAIS "aujourd'hui" choisi arbitrairement au seul motif qu'une règle "daily" existe.
     Exemple : "tous les jours à 21h40" (rien d'autre) → "date":null (aucun point de départ dit).
     Exemple : "tous les jours pendant 5 jours à 21h40" (aucun point de départ dit, seulement une durée) → "date":null.
     Exemple : "tous les jours à partir de demain à 21h40" → "date" = demain (point de départ explicite, résolu avec les mêmes règles que pour une date de rappel simple, règle 6 ci-dessus).
     Exemple : "chaque lundi à 18h" → "date" = la prochaine occurrence de lundi déterminable à partir du contexte temporel fourni (même principe que la résolution d'un jour de semaine nommé pour un rappel simple).
     Exemple : "du lundi au vendredi à 8h" → "date" = la prochaine date appartenant explicitement au motif lundi-vendredi (le prochain jour ouvré parmi lundi à vendredi à partir d'aujourd'hui).
   - "reminder.time" reste null si aucune heure n'a été explicitement dite, même pour une récurrence — une récurrence ne justifie JAMAIS d'inventer une heure par défaut.
   - "occurrenceCount"/"untilDate" restent null s'ils ne sont pas explicitement donnés — n'invente jamais un nombre d'occurrences ou une date de fin non dite.
8. Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après, exactement selon cette forme :

${JSON_SHAPE_DESCRIPTION}`;
}
