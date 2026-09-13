// CHANTIER CAPTURE INTELLIGENTE — écran de validation (CaptureReviewScreen, à venir) : transforme
// un CaptureResult (contrat backend) en cartes éditables, décide de leur validité et du calcul
// "à vérifier", et construit la Pensee finale via le flux normal de création (jamais d'écriture
// Supabase directe). Pur (aucun import react-native/expo/AsyncStorage), testable sous ts-node.
import { Contact, Pensee } from './types';
import { CaptureResult, ExtractedPensee } from './captureTypes';
import { ContactMatchResult } from './contactMatching';

export type CaptureCardStatus = 'pending' | 'saving' | 'saved' | 'failed';

export type LocalDate = { year: number; month: number; day: number };
export type LocalTime = { hour: number; minute: number };

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
  /** Purement informatif — jamais écrit dans Pensee.date/endDate (voir captureTypes.ts). */
  eventHint: { date: string | null; heardExpression: string | null } | null;
  reminderEnabled: boolean;
  reminderDate: LocalDate | null;
  reminderTime: LocalTime | null;
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
    eventHint: extracted.event.hasDate ? { date: extracted.event.date, heardExpression: extracted.event.heardExpression } : null,
    reminderEnabled: extracted.reminder.hasReminder,
    reminderDate: parseIsoDate(extracted.reminder.date),
    reminderTime: parseTime(extracted.reminder.time),
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
 * "À vérifier" (mise en évidence visuelle uniquement, ne bloque jamais l'enregistrement) : confiance
 * LLM basse, proche ambigu/non résolu, ou rappel voulu mais heure manquante.
 */
export function needsReview(card: CaptureCard): boolean {
  if (card.confidence < LOW_CONFIDENCE_THRESHOLD) return true;
  // Un fuzzy_high_confidence est pré-sélectionné (voir buildCardFromExtracted) mais reste TOUJOURS
  // à confirmer explicitement par l'utilisateur — jamais traité comme une certitude silencieuse.
  if (card.contactMatch.kind === 'fuzzy_high_confidence') return true;
  if ((card.contactMatch.kind === 'ambiguous' || card.contactMatch.kind === 'exact_ambiguous') && card.contactId === null) return true;
  if (card.reminderEnabled && !card.reminderTime) return true;
  return false;
}

/**
 * Validité réelle (bloque l'enregistrement, individuel ou "Tout enregistrer") :
 * - texte non vide ;
 * - si un rappel est activé, date ET heure doivent être toutes les deux présentes (jamais l'une
 *   sans l'autre — même règle que PenseeDetailScreen) ;
 * - un rappel activé doit rester dans le futur (même règle que PenseeDetailScreen, `isFutureReminder`
 *   n'est pas réimportée ici pour rester indépendante de la date d'exécution du test — voir
 *   buildPenseeFromCard qui fait la même construction que l'écran de détail).
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
 *  d'`endDate` en Capture V1 (pas de notion de période entendue à l'oral). */
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
  return {
    texte: card.texte.trim(),
    contactId: card.contactId,
    reminderAt,
    createdAt: new Date().toISOString(),
    date: card.eventHint?.date ?? null,
    endDate: null,
  };
}

function updateCard(cards: CaptureCard[], cardId: string, patch: Partial<CaptureCard>): CaptureCard[] {
  return cards.map((c) => (c.cardId === cardId ? { ...c, ...patch } : c));
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
