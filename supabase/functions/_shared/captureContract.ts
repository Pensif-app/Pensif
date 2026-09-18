// CHANTIER CAPTURE INTELLIGENTE — types du contrat de sortie de l'Edge Function `capture`.
// Copie miroir DÉLIBÉRÉE de src/data/captureTypes.ts (l'app RN) : Deno Edge Functions ne partagent
// pas de bundle avec l'app mobile, ce fichier est donc la source de vérité côté serveur — toute
// évolution du contrat doit être répercutée manuellement des deux côtés.

// CHANTIER CAPTURE — EVENT TIME, incrément 1 (2026-09-18). `time` complète `event`, ne le remplace
// jamais : `hasDate`/`date`/`heardExpression`/`confidence` restent EXACTEMENT ce qu'ils étaient. Une
// heure d'événement (ex. "20h" dans "concert à Lyon le 7 mars à 20h") est une notion STRICTEMENT
// séparée de l'heure d'un rappel (`reminder.time`) — jamais copiée automatiquement de l'une vers
// l'autre, ni par le LLM (voir prompt.ts/openai.ts) ni par ce contrat lui-même. `null` tant qu'aucune
// heure n'appartient explicitement à CET événement, jamais inventée (même discipline que
// `reminder.time`). Cet incrément ne modifie PAS `Pensee`/Capture Review/notifications — uniquement
// le pipeline d'extraction backend.
export type CaptureEventInfo = {
  hasDate: boolean;
  date: string | null; // 'YYYY-MM-DD'
  time: string | null; // 'HH:mm' (24h), local — null si non explicitement entendue pour CET événement
  heardExpression: string | null;
  confidence: number;
};

// CHANTIER RAPPELS RÉCURRENTS — incrément 2 (2026-09-18), Capture uniquement. Complète `reminder`,
// ne le remplace jamais : `hasReminder`/`date`/`time`/`heardExpression`/`confidence` restent
// EXACTEMENT ce qu'ils étaient — une capture sans récurrence continue de fonctionner à l'identique.
// `recurrence` porte UNIQUEMENT le motif de répétition ; `date` du reminder parent reste la date de
// la PREMIÈRE occurrence (jamais dupliquée ici).
//
// Représentation canonique de "aucune récurrence" : `null`, TOUJOURS — jamais un objet
// `{ detected: false, ... }` en sortie de validation (voir normalizeCaptureRecurrence, validate.ts,
// pour le raisonnement détaillé). `detected` reste dans le type ci-dessous uniquement parce qu'une
// entrée LLM brute (non encore validée) peut légitimement l'exprimer de cette façon avant
// normalisation — jamais dans une sortie déjà passée par validate.ts.
export type CaptureRecurrenceInfo = {
  detected: boolean;
  frequency: 'daily' | 'weekly' | 'unclear';
  /** 0=dimanche..6=samedi. `null` pour 'unclear' (portée non déterminable) ; `[]` pour 'daily'
   *  (implicitement les 7 jours, jamais ré-explicité) ; tableau non vide d'entiers UNIQUES 0-6,
   *  TRIÉS PAR ORDRE CROISSANT (canonicalisation incrément 2B, 2026-09-18 — voir validate.ts) pour
   *  'weekly'. Toute autre combinaison est une incohérence — voir validate.ts. */
  daysOfWeek: number[] | null;
  /** Entier >= 1 (première occurrence incluse), ou `null` = pas de limite par compte. */
  occurrenceCount: number | null;
  /** 'YYYY-MM-DD', INCLUSIF, ou `null` = pas de limite par date. */
  untilDate: string | null;
  /** OBLIGATOIRE et non vide dès que `detected=true` — trace verbatim de ce qui a été entendu,
   *  jamais une reformulation. Sert notamment à afficher l'expression brute pour 'unclear' (voir
   *  décision produit : jamais interpréter silencieusement une portée ambiguë). */
  heardExpression: string | null;
};

export type CaptureReminderInfo = {
  hasReminder: boolean;
  date: string | null; // 'YYYY-MM-DD'
  time: string | null; // 'HH:mm' (24h)
  heardExpression: string | null;
  confidence: number;
  recurrence: CaptureRecurrenceInfo | null;
};

export type ExtractedPensee = {
  texte: string;
  heardContactName: string | null;
  event: CaptureEventInfo;
  reminder: CaptureReminderInfo;
  confidence: number;
};

// CHANTIER "Capture bloquante — diagnostic parseError" (2026-09-18), priorité 3 : catégorie
// GROSSIÈRE et NON SENSIBLE de la cause d'un `parseError` — jamais un texte libre, jamais dérivée
// d'un transcript/prompt/contenu LLM/donnée contact. `null` tant que `parseError` l'est aussi (pas
// d'échec = pas de catégorie). Voir providers/llm/types.ts (LlmFailureCategory) pour les catégories
// d'échec LLM elles-mêmes ; `'validation'` (JSON du LLM syntaxiquement valide mais rejeté par
// validate.ts) et `'unknown'` (toute autre cause, ex. provider qui ne type pas encore son erreur)
// sont ajoutées ICI, au niveau du contrat, car elles ne concernent pas un provider LLM spécifique.
export type CaptureParseErrorCategory = 'llm_http' | 'llm_network' | 'empty_content' | 'json_parse' | 'validation' | 'unknown';

export type CaptureContract = {
  transcript: string;
  meta?: { sttProvider?: string; llmProvider?: string };
  pensees: ExtractedPensee[];
  parseError: string | null;
  /** UNIQUEMENT informatif/diagnostic (`__DEV__` côté client) — jamais utilisé pour une décision
   *  métier. `null` si `parseError` est `null`. */
  parseErrorCategory: CaptureParseErrorCategory | null;
};

/** Contexte temporel dérivé côté serveur (voir context.ts) — jamais fourni tel quel par le client
 *  au-delà de `timezone`/`localDateTime` (le client n'envoie plus `weekday`, pour éviter deux
 *  sources de vérité potentiellement contradictoires). */
export type TemporalContext = {
  timezone: string;
  localDateTime: string; // 'YYYY-MM-DDTHH:mm:ss', naïf, sans Z/offset
  weekday: string; // dérivé, un des 7 noms FR en minuscules
};
