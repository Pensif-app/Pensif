// CHANTIER CAPTURE INTELLIGENTE — écran de validation (CaptureReviewScreen, à venir) : transforme
// un CaptureResult (contrat backend) en cartes éditables, décide de leur validité et du calcul
// "à vérifier", et construit la Pensee finale via le flux normal de création (jamais d'écriture
// Supabase directe). Pur (aucun import react-native/expo/AsyncStorage), testable sous ts-node.
import { Pensee } from './types';
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

function buildCardFromExtracted(extracted: ExtractedPensee, contactMatch: ContactMatchResult): CaptureCard {
  // CHANTIER MATCHING V2 : 'exact' ET 'fuzzy_high_confidence' pré-sélectionnent le proche — la
  // distinction (confirmation nécessaire ou non) est portée par `needsReview`, pas par ce choix
  // de pré-remplissage. 'exact_ambiguous'/'ambiguous'/'unmatched' ne pré-sélectionnent jamais rien.
  const matchedContactId =
    contactMatch.kind === 'exact' || contactMatch.kind === 'fuzzy_high_confidence' ? contactMatch.contactId : null;
  return {
    cardId: nextCardId(),
    texte: extracted.texte,
    contactId: matchedContactId,
    contactMatch,
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
): CaptureCard[] {
  if (result.parseError || result.pensees.length === 0) {
    return [
      {
        cardId: nextCardId(),
        texte: result.transcript,
        contactId: null,
        contactMatch: { kind: 'none' },
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
  return result.pensees.map((extracted) => buildCardFromExtracted(extracted, matchContact(extracted.heardContactName)));
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
