// CHANTIER CAPTURE INTELLIGENTE — types du contrat JSON entre le backend (Edge Function,
// provider-agnostic STT+LLM) et l'app. Le LLM ne choisit JAMAIS un `contactId` (voir
// contactMatching.ts, matching déterministe côté app) et n'invente JAMAIS une heure absente
// (`time: null` est un état valide et attendu). `event` et `reminder` sont volontairement deux
// objets indépendants : une pensée peut être datée (info entendue) sans qu'aucune notification ne
// soit voulue.

/** Date/heure entendues pour un ÉVÉNEMENT mentionné (ex. "le mariage de Sofia le 20 septembre") —
 *  purement informatif : n'est jamais écrit dans `Pensee.date`/`endDate` (ces champs restent
 *  exclusivement pilotés par le Calendrier, voir CHANTIER PENSÉES V2). Sert de contexte affiché sur
 *  la carte de validation, et de suggestion de pré-remplissage si l'utilisateur active un rappel. */
// CHANTIER CAPTURE — EVENT TIME, incrément 1 (2026-09-18). `time` est déclaré OPTIONNEL (`?`) ICI,
// contrairement au backend où il est toujours présent : ce fichier n'a AUCUNE couche de validation
// runtime des payloads reçus (`captureApi.ts` caste directement la réponse réseau en `CaptureResult`)
// — une réponse produite par une version du backend antérieure à cet incrément n'aura pas ce champ du
// tout. Tout code lisant `event.time` doit donc traiter `undefined` exactement comme `null` (même
// discipline que `reminder.recurrence`, voir ci-dessous). Cet incrément n'introduit ENCORE aucun
// lecteur de ce champ (ni Capture Review, ni pré-remplissage de rappel, ni notifications) — seul le
// type existe pour que la réponse backend soit correctement représentée.
export type CaptureEventInfo = {
  hasDate: boolean;
  /** Format 'YYYY-MM-DD', ou `null` si `hasDate` est faux. */
  date: string | null;
  /** Format 'HH:mm' (24h), ou `null`/`undefined` si non explicitement entendue pour CET événement —
   *  jamais copiée depuis/vers `reminder.time` (deux notions strictement indépendantes). */
  time?: string | null;
  heardExpression: string | null;
  confidence: number;
};

// CHANTIER RAPPELS RÉCURRENTS — incrément 3 (2026-09-18). Miroir du backend
// (_shared/captureContract.ts, CaptureRecurrenceInfo) — complète `reminder`, ne le remplace jamais.
// Représentation canonique de "aucune récurrence" = `null` (même choix que le backend, voir
// validate.ts côté serveur). `recurrence` est déclaré OPTIONNEL (`?`) ICI, contrairement au backend
// où il est toujours présent : ce fichier n'a AUCUNE couche de validation runtime des payloads reçus
// (`captureApi.ts` caste directement la réponse réseau en `CaptureResult`) — une réponse produite par
// une version du backend antérieure à cet incrément (ou tout simplement Capture pas encore
// redéployée, voir consigne) n'aura pas ce champ du tout. Tout code lisant `reminder.recurrence` doit
// donc traiter `undefined` exactement comme `null` (voir `?? null` dans captureReview.ts) — jamais
// supposer sa présence.
export type CaptureRecurrenceInfo = {
  detected: boolean;
  frequency: 'daily' | 'weekly' | 'unclear';
  /** 0=dimanche..6=samedi. `null` pour 'unclear', `[]` pour 'daily', jours uniques triés croissant
   *  pour 'weekly' (mêmes garanties que le contrat backend validé, voir validate.ts). */
  daysOfWeek: number[] | null;
  occurrenceCount: number | null;
  /** 'YYYY-MM-DD', inclusif. */
  untilDate: string | null;
  heardExpression: string | null;
};

/** Rappel éventuellement voulu — totalement indépendant de `event`. `time` reste `null` tant
 *  qu'aucune heure n'a été explicitement entendue, jamais une heure par défaut inventée. */
export type CaptureReminderInfo = {
  hasReminder: boolean;
  /** Format 'YYYY-MM-DD', ou `null`. */
  date: string | null;
  /** Format 'HH:mm' (24h), ou `null` si non entendu. */
  time: string | null;
  heardExpression: string | null;
  confidence: number;
  /** Absent (backend pas encore redéployé) ou `null` (aucune récurrence détectée) doivent être
   *  traités de façon strictement identique — voir note ci-dessus. */
  recurrence?: CaptureRecurrenceInfo | null;
};

export type ExtractedPensee = {
  texte: string;
  /** Nom brut tel qu'entendu, jamais un id — voir contactMatching.ts. */
  heardContactName: string | null;
  event: CaptureEventInfo;
  reminder: CaptureReminderInfo;
  /** Confiance globale de cette extraction (0-1), donnée par le LLM. */
  confidence: number;
};

export type CaptureResult = {
  transcript: string;
  /** Informationnel/debug uniquement — jamais lu par la logique de l'app. */
  meta?: { sttProvider?: string; llmProvider?: string };
  pensees: ExtractedPensee[];
  /** Non nul si le backend n'a pas pu produire une extraction exploitable (JSON invalide, réponse
   *  LLM incohérente, etc.) — dans ce cas `pensees` est vide et l'app doit replier sur le transcript
   *  brut (voir buildInitialCards, captureReview.ts) : rien n'est jamais perdu. */
  parseError: string | null;
};
