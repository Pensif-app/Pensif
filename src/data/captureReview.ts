// CHANTIER CAPTURE INTELLIGENTE — écran de validation (CaptureReviewScreen, à venir) : transforme
// un CaptureResult (contrat backend) en cartes éditables, décide de leur validité et du calcul
// "à vérifier", et construit la Pensee finale via le flux normal de création (jamais d'écriture
// Supabase directe). Pur (aucun import react-native/expo/AsyncStorage), testable sous ts-node.
import { Contact, Pensee, ReminderRecurrence } from './types';
import { CaptureRecurrenceInfo, CaptureResult, ExtractedPensee } from './captureTypes';
import { ContactMatchResult } from './contactMatching';
import { toLocalDateTimeParts } from './reminderDate';
import { isoOf, monthFull } from './calendar';
import { normalizeReminderRecurrence, reminderRecurrenceMatchesDate } from './reminderRecurrence';

export type CaptureCardStatus = 'pending' | 'saving' | 'saved' | 'failed';

export type LocalDate = { year: number; month: number; day: number };
export type LocalTime = { hour: number; minute: number };

// CHANTIER RAPPELS RÉCURRENTS — incrément 3 (2026-09-18). Brouillon de récurrence éditable d'une
// carte de Review — pas encore d'écran (voir consigne), uniquement le modèle + les actions pures qui
// le manipuleront. `frequency: null` représente DEUX situations distinctes qui se comportent pareil
// pour needsReview/isCardValid : (a) la récurrence vient d'être activée sans choix encore fait, (b)
// une récurrence 'unclear' (voir CaptureRecurrenceInfo) pas encore résolue par l'utilisateur — dans
// les deux cas, ne JAMAIS deviner 'daily' ou 'weekly' à la place de l'utilisateur.
export type RecurrenceDraftFrequency = 'daily' | 'weekly';

export type RecurrenceDraft = {
  enabled: boolean;
  /** `null` = pas encore choisi (récurrence tout juste activée, ou 'unclear' non résolu) — jamais un
   *  choix par défaut silencieux. Non pertinent si `enabled` est faux. */
  frequency: RecurrenceDraftFrequency | null;
  /** Pertinent uniquement si `frequency === 'weekly'` — toujours `[]` pour 'daily' ou `null`
   *  frequency (voir setRecurrenceFrequency, qui vide ce tableau au changement de fréquence). */
  daysOfWeek: number[];
  occurrenceCount: number | null;
  untilDate: LocalDate | null;
  /** Trace de ce qui a été entendu (Capture) — affichage seulement, jamais réinterprété. `null` si la
   *  récurrence n'a pas été détectée par Capture (créée manuellement par l'utilisateur, future UI). */
  heardExpression: string | null;
};

/** Représentation canonique d'une carte SANS récurrence — jamais un objet partiellement rempli qui
 *  laisserait un résidu de règle une fois désactivée (voir toggleRecurrence, exigence explicite du
 *  chantier "sans résidu"). */
export const DEFAULT_RECURRENCE_DRAFT: RecurrenceDraft = {
  enabled: false,
  frequency: null,
  daysOfWeek: [],
  occurrenceCount: null,
  untilDate: null,
  heardExpression: null,
};

/**
 * Construit le brouillon initial à partir de ce que Capture a extrait — `recurrence` peut être
 * `undefined` (backend pas encore redéployé) ou `null` (aucune récurrence détectée) : les deux sont
 * traités de façon strictement identique (voir captureTypes.ts). 'daily'/'weekly' sont ACTIVÉS
 * AUTOMATIQUEMENT (aucune ambiguïté à résoudre) ; 'unclear' est activé mais SANS fréquence choisie
 * (voir RecurrenceDraft.frequency) — jamais un motif deviné à la place de l'utilisateur.
 */
function buildRecurrenceDraftFromExtracted(recurrence: CaptureRecurrenceInfo | null | undefined): RecurrenceDraft {
  if (!recurrence || !recurrence.detected) return DEFAULT_RECURRENCE_DRAFT;
  if (recurrence.frequency === 'unclear') {
    return { ...DEFAULT_RECURRENCE_DRAFT, enabled: true, heardExpression: recurrence.heardExpression };
  }
  return {
    enabled: true,
    frequency: recurrence.frequency,
    daysOfWeek: recurrence.frequency === 'weekly' ? recurrence.daysOfWeek ?? [] : [],
    occurrenceCount: recurrence.occurrenceCount,
    untilDate: parseIsoDate(recurrence.untilDate),
    heardExpression: recurrence.heardExpression,
  };
}

export type CaptureCard = {
  cardId: string;
  texte: string;
  contactId: string | null;
  /** Hint d'affichage seulement (résultat du matching au moment de l'extraction) — jamais revalidé
   *  après une édition manuelle de `contactId` par l'utilisateur. */
  contactMatch: ContactMatchResult;
  /** Nom brut tel qu'entendu par le LLM (voir captureTypes.ts) — conservé À L'IDENTIQUE, jamais
   *  modifié après coup : sert uniquement de trace/historique (débogage, tests). Ce n'est PAS ce
   *  champ qui pilote les remplacements successifs (voir `currentContactNameInText`) : après un
   *  premier remplacement, `heardContactName` ne se retrouve plus dans `texte`, et le rechercher à
   *  nouveau ne trouverait donc plus rien — c'est exactement le bug qui bloquait un second
   *  changement de contact. */
  heardContactName: string | null;
  /** Nom ACTUELLEMENT présent dans `texte` à la place du proche — initialisé à `heardContactName`,
   *  puis mis à jour au prénom canonique après CHAQUE remplacement réussi (voir
   *  replaceContactNameOccurrence). C'est CE champ (pas `heardContactName`) que
   *  confirmContactForCard recherche pour savoir quelle occurrence corriger : permet de changer de
   *  contact autant de fois que nécessaire (Joanne → Yohan → Léa → Micka...), chaque remplacement
   *  ciblant l'occurrence laissée par le précédent. `null` si aucun nom n'a jamais pu être identifié
   *  dans le texte (rien à suivre). */
  currentContactNameInText: string | null;
  /** Classification ORIGINALE du matching (avant toute action utilisateur) — `contactMatch.kind`
   *  est réécrit à `'exact'` dès qu'un contact est confirmé/choisi (voir confirmContactForCard),
   *  donc ce champ est le seul moyen fiable de savoir si la normalisation du texte est autorisée
   *  pour cette carte : 'exact' et 'fuzzy_high_confidence' seulement (voir §RÈGLES) — jamais pour
   *  'ambiguous'/'exact_ambiguous'/'unmatched'/'none', même si l'utilisateur choisit ensuite un
   *  contact précis pour ces cas-là. */
  originalContactMatchKind: ContactMatchResult['kind'];
  /** CHANTIER CAPTURE — EVENT TIME, incrément 3 (2026-09-18) : `time` complète `date` (voir
   *  buildPenseeFromCard, qui transfère les deux vers `Pensee.date`/`Pensee.eventTime`) — jamais
   *  copié depuis/vers `reminderTime` (deux notions strictement indépendantes, voir types.ts). */
  eventHint: { date: string | null; time: string | null; heardExpression: string | null } | null;
  reminderEnabled: boolean;
  reminderDate: LocalDate | null;
  reminderTime: LocalTime | null;
  /** CHANTIER RAPPELS RÉCURRENTS — incrément 3 (2026-09-18). Toujours présent (jamais `null`) —
   *  `DEFAULT_RECURRENCE_DRAFT` (enabled:false) représente l'absence de récurrence, exactement comme
   *  `reminderRecurrence` absent sur une `Pensee` classique. */
  recurrenceDraft: RecurrenceDraft;
  /** Confiance globale donnée par le LLM pour cette pensée. */
  confidence: number;
  status: CaptureCardStatus;
  /** Message d'erreur de la dernière tentative de sauvegarde, si `status === 'failed'`. */
  saveError: string | null;
};

const LOW_CONFIDENCE_THRESHOLD = 0.6;

function parseIsoDate(value: string | null): LocalDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1; // LocalDate suit la convention JS Date (mois 0-indexé)
  const day = Number(match[3]);
  return { year, month, day };
}

function parseTime(value: string | null): LocalTime | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

let cardIdCounter = 0;
function nextCardId(): string {
  cardIdCounter += 1;
  return `capture-card-${Date.now()}-${cardIdCounter}`;
}

/**
 * Remplace, dans `texte`, la SEULE occurrence de `nameToReplace` par `canonicalFirstName` — jamais
 * un replace global naïf : `\b...\b` limite la recherche à un mot entier (n'altère jamais un mot
 * qui contiendrait la chaîne en substring, ex. "Mikael" quand on cherche "Mika"), insensible à la
 * casse (une transcription STT peut différer en casse), et `String.replace` sans flag `g` ne
 * touche que la PREMIÈRE occurrence — jamais les autres mots de la phrase. `replaced` indique si
 * une occurrence a réellement été trouvée (sert à savoir si `currentContactNameInText` doit
 * avancer, voir buildCardFromExtracted/confirmContactForCard) — sans quoi rien n'est modifié.
 */
function replaceContactNameOccurrence(
  texte: string,
  nameToReplace: string | null,
  canonicalFirstName: string,
): { texte: string; replaced: boolean } {
  if (!nameToReplace || !nameToReplace.trim()) return { texte, replaced: false };
  const escaped = nameToReplace.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
  if (!pattern.test(texte)) return { texte, replaced: false };
  return { texte: texte.replace(pattern, canonicalFirstName), replaced: true };
}

/**
 * Version simple (chaîne uniquement) de `replaceContactNameOccurrence`, exportée pour les appelants
 * qui n'ont pas besoin de savoir si un remplacement a eu lieu (tests, usages ponctuels). La logique
 * de carte (buildCardFromExtracted/confirmContactForCard) utilise directement
 * `replaceContactNameOccurrence` pour faire avancer `currentContactNameInText`.
 */
export function normalizeHeardContactName(texte: string, heardContactName: string | null, canonicalFirstName: string): string {
  return replaceContactNameOccurrence(texte, heardContactName, canonicalFirstName).texte;
}

function buildCardFromExtracted(extracted: ExtractedPensee, contactMatch: ContactMatchResult, contacts: Contact[]): CaptureCard {
  // CHANTIER MATCHING V2 : 'exact' ET 'fuzzy_high_confidence' pré-sélectionnent le proche — la
  // distinction (confirmation nécessaire ou non) est portée par `needsReview`, pas par ce choix
  // de pré-remplissage. 'exact_ambiguous'/'ambiguous'/'unmatched' ne pré-sélectionnent jamais rien.
  const matchedContactId =
    contactMatch.kind === 'exact' || contactMatch.kind === 'fuzzy_high_confidence' ? contactMatch.contactId : null;
  // Cohérence texte/contact (voir §RÈGLES) : un match 'exact' est déjà suffisamment sûr pour
  // corriger tout de suite le prénom entendu par le prénom canonique — 'fuzzy_high_confidence'
  // attend une confirmation explicite de l'utilisateur (voir confirmContactForCard), jamais
  // automatique ici.
  let texte = extracted.texte;
  let currentContactNameInText = extracted.heardContactName;
  if (contactMatch.kind === 'exact') {
    const contact = contacts.find((c) => c.id === contactMatch.contactId);
    if (contact) {
      const result = replaceContactNameOccurrence(texte, currentContactNameInText, contact.prenom);
      if (result.replaced) {
        texte = result.texte;
        currentContactNameInText = contact.prenom;
      }
    }
  }
  return {
    cardId: nextCardId(),
    texte,
    contactId: matchedContactId,
    contactMatch,
    heardContactName: extracted.heardContactName,
    currentContactNameInText,
    originalContactMatchKind: contactMatch.kind,
    // `?? null` — traite `undefined` (backend pas encore redéployé, voir captureTypes.ts) exactement
    // comme `null` (aucune heure d'événement connue), même discipline que `recurrence` plus bas.
    eventHint: extracted.event.hasDate
      ? { date: extracted.event.date, time: extracted.event.time ?? null, heardExpression: extracted.event.heardExpression }
      : null,
    reminderEnabled: extracted.reminder.hasReminder,
    reminderDate: parseIsoDate(extracted.reminder.date),
    reminderTime: parseTime(extracted.reminder.time),
    // `?? null` — traite `undefined` (backend pas encore redéployé) exactement comme `null` (aucune
    // récurrence détectée), voir captureTypes.ts.
    recurrenceDraft: buildRecurrenceDraftFromExtracted(extracted.reminder.recurrence ?? null),
    confidence: extracted.confidence,
    status: 'pending',
    saveError: null,
  };
}

/**
 * Point d'entrée principal : construit les cartes initiales à partir du contrat backend.
 * `parseError` non nul (ou `pensees` vide) → repli total sur le transcript brut, une seule carte
 * sans aucune extraction — rien n'est jamais perdu même si le backend n'a rien pu structurer.
 */
export function buildInitialCards(
  result: CaptureResult,
  matchContact: (heardContactName: string | null) => ContactMatchResult,
  contacts: Contact[],
): CaptureCard[] {
  if (result.parseError || result.pensees.length === 0) {
    return [
      {
        cardId: nextCardId(),
        texte: result.transcript,
        contactId: null,
        contactMatch: { kind: 'none' },
        heardContactName: null,
        currentContactNameInText: null,
        originalContactMatchKind: 'none',
        eventHint: null,
        reminderEnabled: false,
        reminderDate: null,
        reminderTime: null,
        recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
        confidence: 0,
        status: 'pending',
        saveError: null,
      },
    ];
  }
  return result.pensees.map((extracted) => buildCardFromExtracted(extracted, matchContact(extracted.heardContactName), contacts));
}

/**
 * Sélection/confirmation explicite d'un contact par l'utilisateur sur une carte (chip "Aucun" ou
 * un proche précis) — centralise à la fois la mise à jour de `contactId`/`contactMatch` (déjà
 * fait avant dans CaptureScreen.tsx) ET la normalisation du texte (§RÈGLES) :
 *
 * - `contactId === null` ("Aucun") → jamais de normalisation, rien à corriger (juste le lien
 *   contact qui disparaît) — `currentContactNameInText` n'est PAS remis à zéro : si l'utilisateur
 *   choisit un autre contact juste après, il doit encore pouvoir corriger la même occurrence.
 * - Un contact choisi EXPLICITEMENT par l'utilisateur (peu importe `originalContactMatchKind` —
 *   exact, fuzzy_high_confidence, ambiguous, exact_ambiguous, unmatched) est une confirmation
 *   FORTE : corrige l'occurrence de `currentContactNameInText` (PAS `heardContactName` — voir le
 *   champ, c'est ce qui permet de changer de contact plusieurs fois de suite : Joanne → Yohan →
 *   Léa → Micka, chaque remplacement ciblant l'occurrence laissée par le précédent) par le prénom
 *   canonique du contact désormais choisi, et fait avancer `currentContactNameInText` à ce nouveau
 *   prénom UNIQUEMENT si une occurrence a réellement été trouvée et remplacée.
 * - Exception : `originalContactMatchKind === 'none'` (carte de repli sans aucune extraction, voir
 *   buildInitialCards) OU `currentContactNameInText` absent/vide → JAMAIS de réécriture, on ne sait
 *   alors deviner aucun mot précis à remplacer.
 *
 * `replaceContactNameOccurrence` reste la seule fonction qui touche au texte : jamais de replace
 * global, jamais de fuzzy matching dans le texte lui-même — uniquement l'occurrence exacte de
 * `currentContactNameInText` (limite de mot, insensible à la casse).
 */
/**
 * CORRECTIF UX (2026-09-16) — filet de sécurité appelé juste AVANT sauvegarde (CaptureScreen.tsx,
 * `saveOne`/`handleSaveAll`), pas à chaque frappe/rendu : couvre le cas réel où une pensée est
 * enregistrée avec un contact `fuzzy_high_confidence` encore pré-sélectionné par
 * `buildCardFromExtracted` (§RÈGLES ci-dessus) mais JAMAIS explicitement confirmé via
 * `confirmContactForCard` (l'utilisateur tape directement "Enregistrer") — sans ce filet, la pensée
 * persistée aurait `contactId = Yohan` mais `texte` encore "Johan" (incohérence texte/contact
 * réellement observée). Déterministe, AUCUN appel réseau/LLM/matching supplémentaire : réutilise
 * EXACTEMENT `replaceContactNameOccurrence`, les mêmes données déjà calculées
 * (`currentContactNameInText`/`originalContactMatchKind`) — jamais un replace global, jamais un mot
 * approximatif. Idempotent : si le texte est déjà normalisé (confirmation explicite déjà faite, ou
 * "Aucun" choisi), ne fait rien.
 *
 * Ne s'applique JAMAIS quand :
 * - `contactId` est `null` ("Aucun" explicitement choisi, §RÈGLES du chantier précédent) ;
 * - `originalContactMatchKind === 'none'` (rien de fiable à identifier) ;
 * - `currentContactNameInText` est absent (rien à corriger) ;
 * - le contact ciblé n'existe plus (référence orpheline — jamais de crash).
 * Ne touche JAMAIS le reste du texte : une édition manuelle de l'utilisateur ailleurs dans la phrase
 * est intégralement préservée (seule l'occurrence exacte du nom suivie par `currentContactNameInText`
 * est concernée, comme `confirmContactForCard`).
 */
export function finalizeCardTextForSave(card: CaptureCard, contacts: Contact[]): CaptureCard {
  if (!card.contactId) return card;
  if (card.originalContactMatchKind === 'none') return card;
  if (!card.currentContactNameInText) return card;
  const contact = contacts.find((c) => c.id === card.contactId);
  if (!contact) return card;
  const result = replaceContactNameOccurrence(card.texte, card.currentContactNameInText, contact.prenom);
  if (!result.replaced) return card;
  return { ...card, texte: result.texte, currentContactNameInText: contact.prenom };
}

export function confirmContactForCard(card: CaptureCard, contactId: string | null, contacts: Contact[]): CaptureCard {
  if (!contactId) {
    return { ...card, contactId: null, contactMatch: { kind: 'none' } };
  }
  let texte = card.texte;
  let currentContactNameInText = card.currentContactNameInText;
  if (card.originalContactMatchKind !== 'none' && currentContactNameInText) {
    const contact = contacts.find((c) => c.id === contactId);
    if (contact) {
      const result = replaceContactNameOccurrence(texte, currentContactNameInText, contact.prenom);
      if (result.replaced) {
        texte = result.texte;
        currentContactNameInText = contact.prenom;
      }
    }
  }
  return { ...card, contactId, contactMatch: { kind: 'exact', contactId }, texte, currentContactNameInText };
}

/**
 * Construit la règle de récurrence NORMALISÉE (voir reminderRecurrence.ts, incrément 1) à partir d'un
 * brouillon — réutilise `normalizeReminderRecurrence` plutôt que de dupliquer sa logique de
 * validation structurelle (weekly non vide, occurrenceCount entier >=1, untilDate calendaire valide).
 * `null` si `frequency` n'est pas encore choisie (récurrence 'unclear' non résolue, ou tout juste
 * activée) OU si la structure est incohérente — jamais une règle partiellement reconstruite.
 */
function toReminderRecurrenceRule(draft: RecurrenceDraft): ReminderRecurrence | null {
  if (!draft.enabled || draft.frequency === null) return null;
  return normalizeReminderRecurrence({
    frequency: draft.frequency,
    daysOfWeek: draft.daysOfWeek,
    occurrenceCount: draft.occurrenceCount,
    untilDate: draft.untilDate ? isoOf(draft.untilDate.year, draft.untilDate.month, draft.untilDate.day) : null,
  });
}

/**
 * "À vérifier" (mise en évidence visuelle uniquement, ne bloque jamais l'enregistrement) : confiance
 * LLM basse, proche ambigu/non résolu, rappel voulu mais heure manquante, ou récurrence comprise mais
 * incomplète (CHANTIER RAPPELS RÉCURRENTS, incrément 3, 2026-09-18) — une récurrence ne doit JAMAIS
 * disparaître silencieusement faute de date/heure/fréquence, elle reste signalée jusqu'à complétion.
 */
export function needsReview(card: CaptureCard): boolean {
  if (card.confidence < LOW_CONFIDENCE_THRESHOLD) return true;
  // Un fuzzy_high_confidence est pré-sélectionné (voir buildCardFromExtracted) mais reste TOUJOURS
  // à confirmer explicitement par l'utilisateur — jamais traité comme une certitude silencieuse.
  if (card.contactMatch.kind === 'fuzzy_high_confidence') return true;
  if ((card.contactMatch.kind === 'ambiguous' || card.contactMatch.kind === 'exact_ambiguous') && card.contactId === null) return true;
  if (card.reminderEnabled && !card.reminderTime) return true;
  if (card.recurrenceDraft.enabled) {
    // 'unclear' (Capture) non résolu par l'utilisateur — jamais un motif deviné à sa place.
    if (card.recurrenceDraft.frequency === null) return true;
    // CHANTIER UX RÉCURRENCE — incrément 4 (2026-09-18) : 'weekly' choisi (ex. juste après avoir
    // résolu un 'unclear') mais aucun jour encore coché — même besoin de signalement que 'unclear'
    // lui-même, jamais un jour deviné à la place de l'utilisateur.
    if (card.recurrenceDraft.frequency === 'weekly' && card.recurrenceDraft.daysOfWeek.length === 0) return true;
    // Ex. "tous les jours à 21h40" : récurrence parfaitement comprise, mais aucune date de départ
    // déterminable — la règle reste "daily", jamais perdue, seulement signalée.
    if (!card.reminderDate) return true;
    // Ex. "tous les jours" (sans heure) : même principe, l'heure manque encore.
    if (!card.reminderTime) return true;
  }
  return false;
}

// --- CHANTIER UX RÉCURRENCE — incrément 4 (2026-09-18). Formatage d'affichage PUR (aucun
// react-native, aucune dépendance à un composant) — la logique de validité reste entièrement dans
// needsReview/isCardValid ci-dessus ; ces fonctions ne font QUE traduire un RecurrenceDraft déjà
// valide/invalide en texte, jamais une décision de validité elles-mêmes. ------------------------

/** Ordre d'affichage FRANÇAIS (lundi → dimanche) — jamais l'ordre de stockage interne
 *  (0=dimanche..6=samedi, convention `Date.getDay()`, voir ReminderRecurrence/types.ts). */
const FRENCH_WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_SHORT_FR: Record<number, string> = { 0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam' };

/** 'YYYY-MM-DD' ou LocalDate → "18 septembre" (mois en toutes lettres, réutilise `monthFull` de
 *  calendar.ts plutôt que dupliquer la liste des mois — même principe que MessageScreen.tsx). */
export function recurrenceDateLabel(date: LocalDate): string {
  return `${date.day} ${monthFull[date.month]}`;
}

/** Libellé de la ligne "Date de début" — jamais "aujourd'hui" ni aucune date silencieusement
 *  choisie : "À définir" tant qu'aucune date n'a été explicitement posée. */
export function recurrenceStartDateLabel(date: LocalDate | null): string {
  return date ? recurrenceDateLabel(date) : 'À définir';
}

/** Libellé de la ligne "Heure". */
export function recurrenceTimeLabel(time: LocalTime | null): string {
  return time ? `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : 'À définir';
}

/** Libellé de la ligne "Répétition" — "À préciser" pour une récurrence 'unclear' non résolue OU un
 *  'weekly' sans aucun jour encore coché (les deux sont des états "compris mais incomplets",
 *  jamais un motif deviné à la place de l'utilisateur). */
export function recurrenceFrequencyLabel(draft: RecurrenceDraft): string {
  if (draft.frequency === null) return 'À préciser';
  if (draft.frequency === 'daily') return 'Tous les jours';
  if (draft.daysOfWeek.length === 0) return 'À préciser';
  return FRENCH_WEEK_DISPLAY_ORDER.filter((d) => draft.daysOfWeek.includes(d))
    .map((d) => WEEKDAY_SHORT_FR[d])
    .join(', ');
}

/** Libellé de la ligne "Fin" — `null` = ligne à ne PAS afficher du tout ("Jamais" n'a pas de ligne
 *  "Fin" propre, voir consigne explicite : "éventuellement Fin, uniquement lorsqu'une borne
 *  existe"). Ne présuppose jamais laquelle des deux bornes prévaut : `RecurrenceDraft` garantit déjà
 *  qu'au plus une seule est réellement éditée à la fois côté UI (voir setRecurrenceOccurrenceCount/
 *  setRecurrenceUntilDate, à appeler en paire pour nettoyer l'autre borne). */
export function recurrenceEndLabel(draft: RecurrenceDraft): string | null {
  if (draft.occurrenceCount !== null) {
    return draft.occurrenceCount === 1 ? 'Après 1 fois' : `Après ${draft.occurrenceCount} fois`;
  }
  if (draft.untilDate) return `Jusqu'au ${recurrenceDateLabel(draft.untilDate)}`;
  return null;
}

/**
 * Validité réelle (bloque l'enregistrement, individuel ou "Tout enregistrer") :
 * - texte non vide ;
 * - si un rappel est activé, date ET heure doivent être toutes les deux présentes (jamais l'une
 *   sans l'autre — même règle que PenseeDetailScreen) ;
 * - un rappel activé doit rester dans le futur (même règle que PenseeDetailScreen, `isFutureReminder`
 *   n'est pas réimportée ici pour rester indépendante de la date d'exécution du test — voir
 *   buildPenseeFromCard qui fait la même construction que l'écran de détail).
 * - CHANTIER RAPPELS RÉCURRENTS, incrément 3 (2026-09-18) : une récurrence active applique une
 *   cohérence STRICTE À L'ÉCRITURE, volontairement plus exigeante que reminderRecurrence.ts
 *   (incrément 1), qui reste tolérant face à une donnée déjà existante — ici on écrit une donnée
 *   NEUVE, toute pièce manquante ou incohérente bloque explicitement la sauvegarde plutôt que de
 *   laisser une règle bancale être persistée :
 *   - récurrence active → reminder actif (jamais l'un sans l'autre) ;
 *   - date de première occurrence ET heure présentes ;
 *   - fréquence choisie (jamais 'unclear' non résolu — voir toReminderRecurrenceRule) ;
 *   - structure cohérente (weekly avec au moins un jour valide, occurrenceCount entier >=1 si
 *     présent, untilDate calendaire valide si présente — délégué à normalizeReminderRecurrence) ;
 *   - la date de première occurrence appartient RÉELLEMENT au motif choisi (ex. "weekly" sur un jour
 *     qui n'en fait pas partie est invalide — vérifié via reminderRecurrenceMatchesDate,
 *     reminderRecurrence.ts) ;
 *   - untilDate (si présente) n'est jamais antérieure à la date de première occurrence.
 * Un proche ambigu laissé sur "Aucun" (contactId === null, choix explicite) NE bloque PAS —
 * uniquement signalé par `needsReview`.
 */
export function isCardValid(card: CaptureCard, now: Date = new Date()): boolean {
  if (!card.texte.trim()) return false;
  if (card.reminderEnabled) {
    if (!card.reminderDate || !card.reminderTime) return false;
    const reminderInstant = new Date(
      card.reminderDate.year,
      card.reminderDate.month,
      card.reminderDate.day,
      card.reminderTime.hour,
      card.reminderTime.minute,
      0,
      0,
    );
    if (reminderInstant.getTime() <= now.getTime()) return false;
  }
  if (card.recurrenceDraft.enabled) {
    if (!card.reminderEnabled) return false; // récurrence active → reminder actif, jamais l'un sans l'autre
    // Redondant avec le bloc `reminderEnabled` ci-dessus EN PRATIQUE (déjà garanti si on atteint ce
    // point), mais explicite ici pour que ce bloc reste correct par lui-même si l'ordre des
    // vérifications venait à changer un jour.
    if (!card.reminderDate || !card.reminderTime) return false;
    const rule = toReminderRecurrenceRule(card.recurrenceDraft);
    if (!rule) return false; // fréquence non choisie, ou structure incohérente
    if (!reminderRecurrenceMatchesDate(rule, card.reminderDate)) return false; // la date de départ doit appartenir au motif
    if (rule.untilDate) {
      const startIso = isoOf(card.reminderDate.year, card.reminderDate.month, card.reminderDate.day);
      if (rule.untilDate < startIso) return false; // une fin avant le départ n'a pas de sens
    }
  }
  return true;
}

/** "Tout enregistrer" n'est activé que si au moins une carte reste à traiter (`pending`) ET que
 *  TOUTES les cartes `pending` sont valides — une carte déjà `saved`/`saving`/`failed` ne bloque ni
 *  ne compte, elle a déjà son propre état géré individuellement. */
export function canSaveAll(cards: CaptureCard[], now: Date = new Date()): boolean {
  const pending = cards.filter((c) => c.status === 'pending');
  if (pending.length === 0) return false;
  return pending.every((c) => isCardValid(c, now));
}

/** Construit la Pensee à sauvegarder via le flux normal (`addPensee`, voir store.tsx) — jamais
 *  d'écriture Supabase directe depuis cet écran.
 *
 *  DÉCISION CAPTURE V1 (remplace l'ancien comportement où `eventHint` restait purement informatif) :
 *  `event.hasDate=true` écrit désormais `Pensee.date` — `eventHint` porte cette date (voir
 *  buildCardFromExtracted). `event` et `reminder` restent deux notions totalement indépendantes :
 *  une pensée peut avoir une date d'événement, un rappel, les deux, ou ni l'un ni l'autre. Jamais
 *  d'`endDate` en Capture V1 (pas de notion de période entendue à l'oral).
 *
 *  CHANTIER RAPPELS RÉCURRENTS, incrément 3 (2026-09-18) : `reminderAt` reste STRICTEMENT le même
 *  calcul qu'avant (comportement historique inchangé pour un rappel ponctuel). `reminderRecurrence`
 *  n'est ajouté à l'objet retourné QUE si une règle valide existe — jamais la clé présente à `null`
 *  pour un rappel ponctuel, afin que sa forme reste identique à avant ce chantier. Cette fonction
 *  suppose que la carte a déjà passé `isCardValid` (appelée par CaptureScreen.tsx avant sauvegarde) ;
 *  si elle est appelée sur une carte incomplète malgré tout, `toReminderRecurrenceRule` renvoie
 *  `null` plutôt que de construire une règle bancale — jamais un crash. */
export function buildPenseeFromCard(card: CaptureCard): Omit<Pensee, 'id'> {
  const reminderAt =
    card.reminderEnabled && card.reminderDate && card.reminderTime
      ? new Date(
          card.reminderDate.year,
          card.reminderDate.month,
          card.reminderDate.day,
          card.reminderTime.hour,
          card.reminderTime.minute,
          0,
          0,
        ).toISOString()
      : null;
  const reminderRecurrence = card.recurrenceDraft.enabled ? toReminderRecurrenceRule(card.recurrenceDraft) : null;
  return {
    texte: card.texte.trim(),
    contactId: card.contactId,
    reminderAt,
    createdAt: new Date().toISOString(),
    date: card.eventHint?.date ?? null,
    endDate: null,
    // CHANTIER CAPTURE — EVENT TIME, incrément 3 (2026-09-18) : transfère `eventHint.time` UNIQUEMENT
    // quand une date d'événement valide existe (`eventHint` est déjà `null` sinon, voir
    // buildCardFromExtracted) — jamais copié depuis/vers `reminderAt`/`reminderTime` (deux notions
    // strictement indépendantes, voir types.ts).
    eventTime: card.eventHint?.time ?? null,
    ...(reminderRecurrence ? { reminderRecurrence } : {}),
  };
}

function updateCard(cards: CaptureCard[], cardId: string, patch: Partial<CaptureCard>): CaptureCard[] {
  return cards.map((c) => (c.cardId === cardId ? { ...c, ...patch } : c));
}

function updateRecurrenceDraft(cards: CaptureCard[], cardId: string, patch: Partial<RecurrenceDraft>): CaptureCard[] {
  return cards.map((c) => (c.cardId === cardId ? { ...c, recurrenceDraft: { ...c.recurrenceDraft, ...patch } } : c));
}

// --- CHANTIER RAPPELS RÉCURRENTS, incrément 3 (2026-09-18) — manipulations PURES du brouillon de
// récurrence, préparées pour un futur écran (pas de composant visuel dans cet incrément). Chacune ne
// touche QU'UNE SEULE carte, comme le reste des actions de ce fichier. ------------------------------

/** Active/désactive la récurrence d'une carte. Désactiver remet le brouillon à
 *  `DEFAULT_RECURRENCE_DRAFT` — "sans résidu de règle" (consigne explicite) : jamais un jour/une
 *  borne qui resterait en mémoire, prêt à ressurgir si l'utilisateur réactive plus tard. Le rappel
 *  ponctuel (reminderEnabled/reminderDate/reminderTime) n'est JAMAIS touché ici — désactiver la
 *  récurrence ramène simplement la carte à un rappel classique, sans rien perdre d'autre. */
export function toggleRecurrence(cards: CaptureCard[], cardId: string, enabled: boolean): CaptureCard[] {
  if (!enabled) return updateCard(cards, cardId, { recurrenceDraft: DEFAULT_RECURRENCE_DRAFT });
  return updateRecurrenceDraft(cards, cardId, { enabled: true });
}

/** Choisit 'daily'/'weekly' — sert AUSSI à résoudre une récurrence 'unclear' (même opération :
 *  `frequency` passe de `null` à une valeur choisie explicitement par l'utilisateur, jamais devinée).
 *  Changer de fréquence VIDE toujours `daysOfWeek` : un jour choisi pour 'weekly' n'a aucun sens pour
 *  'daily', et repartir de zéro évite qu'un ancien choix ne resurgisse après un aller-retour entre
 *  les deux fréquences. */
export function setRecurrenceFrequency(cards: CaptureCard[], cardId: string, frequency: RecurrenceDraftFrequency): CaptureCard[] {
  return updateRecurrenceDraft(cards, cardId, { frequency, daysOfWeek: [] });
}

/** Coche/décoche un jour pour une récurrence 'weekly' — sans effet si la fréquence actuelle n'est
 *  pas 'weekly' (ex. 'daily', ou pas encore choisie), pour ne jamais construire un état incohérent. */
export function toggleRecurrenceDay(cards: CaptureCard[], cardId: string, day: number): CaptureCard[] {
  const card = cards.find((c) => c.cardId === cardId);
  if (!card || card.recurrenceDraft.frequency !== 'weekly') return cards;
  const has = card.recurrenceDraft.daysOfWeek.includes(day);
  const daysOfWeek = has ? card.recurrenceDraft.daysOfWeek.filter((d) => d !== day) : [...card.recurrenceDraft.daysOfWeek, day];
  return updateRecurrenceDraft(cards, cardId, { daysOfWeek });
}

/** Définit ou retire (`null`) le nombre d'occurrences. */
export function setRecurrenceOccurrenceCount(cards: CaptureCard[], cardId: string, occurrenceCount: number | null): CaptureCard[] {
  return updateRecurrenceDraft(cards, cardId, { occurrenceCount });
}

/** Définit ou retire (`null`) la date de fin. */
export function setRecurrenceUntilDate(cards: CaptureCard[], cardId: string, untilDate: LocalDate | null): CaptureCard[] {
  return updateRecurrenceDraft(cards, cardId, { untilDate });
}

export function discardCard(cards: CaptureCard[], cardId: string): CaptureCard[] {
  return cards.filter((c) => c.cardId !== cardId);
}

export function markSaving(cards: CaptureCard[], cardId: string): CaptureCard[] {
  return updateCard(cards, cardId, { status: 'saving', saveError: null });
}

/** Une sauvegarde réussie ne retire PAS la carte de la liste — elle passe en `saved` et reste
 *  visible (affichage confirmé), l'utilisateur ferme l'écran quand il le souhaite. */
export function markSaved(cards: CaptureCard[], cardId: string): CaptureCard[] {
  return updateCard(cards, cardId, { status: 'saved', saveError: null });
}

/** Un échec reste visible avec son message — ne masque jamais l'échec, et ne touche à AUCUNE autre
 *  carte (chaque sauvegarde est indépendante, voir la consigne du chantier). */
export function markFailed(cards: CaptureCard[], cardId: string, error: string): CaptureCard[] {
  return updateCard(cards, cardId, { status: 'failed', saveError: error });
}

/** Les pickers natifs possibles dans la review Capture (CaptureScreen.tsx) : rappel iOS combiné
 *  (date+heure en un seul spinner), rappel Android en 2 champs séparés, événement iOS combiné
 *  (`event` — CHANTIER UNIFICATION UX PICKERS iOS, incrément 5, 2026-09-18 : un seul contrôle
 *  date+heure, mode "datetime" si une heure existe déjà, "date" sinon — ne jamais inventer une heure
 *  silencieusement), et `eventDate`/`eventTime` Android séparés (aucun mode "datetime" natif Android
 *  dans ce composant) — strictement indépendants de `reminderTime`. */
export type PickerKind = 'reminderDate' | 'reminderTime' | 'reminderDateTime' | 'event' | 'eventDate' | 'eventTime';

/** Carte + type de picker actuellement ouvert dans la review — `null` si aucun. Un seul picker
 *  actif à la fois par construction (une seule valeur possible pour tout l'écran). */
export type OpenPicker = { cardId: string; kind: PickerKind } | null;

/**
 * CORRECTIF picker iOS review Capture (2026-09-17, généralisé au champ ÉVÉNEMENT le 2026-09-18) —
 * décide si un tap sur un champ date/heure d'une carte doit OUVRIR son picker ou le REFERMER, de
 * façon pure et testable sans monter de composant React Native ni de DateTimePicker natif :
 * - la carte ciblée a déjà SON picker de CE `kind` ouvert → referme (permet de refermer une
 *   roulette ouverte par erreur, sur un second tap du même champ) ;
 * - sinon (aucun picker ouvert, ou picker d'une AUTRE carte/kind ouvert) → ouvre celui de la carte
 *   ciblée. Comme il n'existe qu'une seule valeur `openPicker` possible à la fois pour tout
 *   l'écran, ouvrir celui d'une nouvelle carte ferme implicitement celui de la précédente —
 *   jamais deux ouverts ensemble, quels que soient leurs `kind` respectifs.
 */
function toggleOpenPicker(current: OpenPicker, cardId: string, kind: PickerKind): OpenPicker {
  if (current && current.cardId === cardId && current.kind === kind) return null;
  return { cardId, kind };
}

/** Toggle du picker de rappel iOS (spinner date+heure combiné) — voir `toggleOpenPicker`. */
export function toggleReminderDateTimePicker(current: OpenPicker, cardId: string): OpenPicker {
  return toggleOpenPicker(current, cardId, 'reminderDateTime');
}

/** Toggle du picker de date d'événement iOS — même règle que le rappel, voir `toggleOpenPicker`. */
export function toggleEventDatePicker(current: OpenPicker, cardId: string): OpenPicker {
  return toggleOpenPicker(current, cardId, 'eventDate');
}

/** Toggle du picker d'HEURE d'événement iOS/Android séparé (CHANTIER CAPTURE EVENT TIME, incrément 4,
 *  2026-09-18) — conservé pour Android (voir `toggleEventPicker` ci-dessous pour le contrôle iOS
 *  UNIFIÉ date+heure, incrément 5) et pour l'action secondaire "+ Ajouter une heure"/"Retirer
 *  l'heure" partagée par les deux plateformes. Même règle que les autres, voir `toggleOpenPicker`. */
export function toggleEventTimePicker(current: OpenPicker, cardId: string): OpenPicker {
  return toggleOpenPicker(current, cardId, 'eventTime');
}

/**
 * CHANTIER UNIFICATION UX PICKERS iOS, incrément 5 (2026-09-18) — toggle du contrôle ÉVÉNEMENT
 * UNIQUE iOS (remplace les deux contrôles séparés `eventDate`/`eventTime` sur cette plateforme,
 * voir `applyEventChange` ci-dessous pour la logique associée). Même règle que les autres, voir
 * `toggleOpenPicker`.
 */
export function toggleEventPicker(current: OpenPicker, cardId: string): OpenPicker {
  return toggleOpenPicker(current, cardId, 'event');
}

/**
 * Applique une date/heure de rappel choisie dans la roulette iOS à LA SEULE carte concernée
 * (`updateCard` ne touche jamais les autres, voir plus haut) — factorise exactement ce que fait
 * `setReminderDateTime` dans CaptureScreen.tsx pour le rendre testable isolément.
 * IMPORTANT (2026-09-17) — ne décide JAMAIS de fermer un picker : la roulette iOS `display=
 * "spinner"` déclenche `onChange` à chaque segment tourné (jour, heure, minute séparément), pas
 * seulement en fin de sélection. Fermer ici casserait les modifications successives dans une même
 * ouverture — c'est au seul tap sur le champ (`toggleReminderDateTimePicker`) de fermer.
 */
export function applyReminderDateTimeChange(cards: CaptureCard[], cardId: string, date: Date): CaptureCard[] {
  const parts = toLocalDateTimeParts(date);
  return updateCard(cards, cardId, {
    reminderDate: { year: parts.year, month: parts.month, day: parts.day },
    reminderTime: { hour: parts.hour, minute: parts.minute },
  });
}

/**
 * Applique une date d'événement choisie dans la roulette iOS à LA SEULE carte concernée — même
 * discipline que `applyReminderDateTimeChange` (2026-09-18) : ne ferme jamais le picker, ne touche
 * jamais les autres cartes. Conserve `heardExpression` ET `time` déjà présents — ce picker ne modifie
 * QUE la date, jamais réinterprétés ici (voir `applyEventTimeChange` pour son symétrique heure,
 * CHANTIER CAPTURE EVENT TIME incrément 4, 2026-09-18).
 */
export function applyEventDateChange(cards: CaptureCard[], cardId: string, date: Date): CaptureCard[] {
  const parts = toLocalDateTimeParts(date);
  const iso = `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const card = cards.find((c) => c.cardId === cardId);
  return updateCard(cards, cardId, {
    eventHint: { date: iso, time: card?.eventHint?.time ?? null, heardExpression: card?.eventHint?.heardExpression ?? null },
  });
}

/**
 * CHANTIER CAPTURE EVENT TIME, incrément 4 (2026-09-18) — symétrique de `applyEventDateChange` pour
 * l'heure : applique une heure d'événement choisie dans la roulette à LA SEULE carte concernée,
 * conserve `date`/`heardExpression` déjà présents. No-op strict si `eventHint` est `null` (aucune
 * date d'événement — une heure sans date n'a pas de sens, voir types.ts/`Pensee.eventTime`) : ce cas
 * ne devrait jamais survenir en pratique (le picker n'est rendu que si `eventHint.date` existe, voir
 * CaptureScreen.tsx), mais reste géré ici plutôt que de supposer silencieusement sa présence.
 * STRICTEMENT INDÉPENDANTE de `applyReminderDateTimeChange`/`reminderTime` — ne les touche jamais.
 */
export function applyEventTimeChange(cards: CaptureCard[], cardId: string, date: Date): CaptureCard[] {
  const card = cards.find((c) => c.cardId === cardId);
  if (!card?.eventHint) return cards;
  const parts = toLocalDateTimeParts(date);
  const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  return updateCard(cards, cardId, { eventHint: { ...card.eventHint, time } });
}

/** Retire UNIQUEMENT l'heure d'événement d'une carte (conserve `date`/`heardExpression`) — le pendant
 *  de `clearEventDate` (CaptureScreen.tsx, qui retire l'événement ENTIER) mais limité à l'heure seule.
 *  No-op si `eventHint` est déjà `null`. */
export function clearEventTime(cards: CaptureCard[], cardId: string): CaptureCard[] {
  const card = cards.find((c) => c.cardId === cardId);
  if (!card?.eventHint) return cards;
  return updateCard(cards, cardId, { eventHint: { ...card.eventHint, time: null } });
}

/**
 * CHANTIER UNIFICATION UX PICKERS iOS, incrément 5 (2026-09-18) — logique du contrôle ÉVÉNEMENT
 * UNIQUE iOS : un seul appel gère À LA FOIS le cas "date seule" et "date+heure", SANS jamais inventer
 * une heure. Le mode du picker (`date` vs `datetime`, décidé dans CaptureScreen.tsx à partir de
 * `card.eventHint.time`) détermine ce qui doit être lu dans `date` :
 * - si `eventHint.time` était `null` AVANT cet appel (picker en mode "date" — aucun cadran d'heure
 *   visible), seule la partie DATE de `date` est exploitable (iOS ne modifie pas l'heure d'un
 *   UIDatePicker en mode date-only, mais on ignore explicitement cette partie plutôt que de lui faire
 *   confiance) — `time` reste `null`, jamais silencieusement réglé à "00:00" ou toute autre valeur.
 * - si `eventHint.time` était déjà renseignée (picker en mode "datetime"), DATE et HEURE sont toutes
 *   deux mises à jour depuis `date`.
 * No-op strict si `eventHint` est `null` (aucun événement à modifier — le contrôle n'est rendu que si
 * une date existe déjà, voir CaptureScreen.tsx ; pour AJOUTER un tout premier événement, voir
 * `applyEventDateChange`, toujours utilisé pour ce cas précis).
 */
export function applyEventChange(cards: CaptureCard[], cardId: string, date: Date): CaptureCard[] {
  const card = cards.find((c) => c.cardId === cardId);
  if (!card?.eventHint) return cards;
  const parts = toLocalDateTimeParts(date);
  const iso = `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const hadTime = card.eventHint.time !== null;
  const time = hadTime ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` : null;
  return updateCard(cards, cardId, { eventHint: { date: iso, time, heardExpression: card.eventHint.heardExpression } });
}
