// CHANTIER RÉPONSES INTELLIGENTES — identité + forme des brouillons de message (2026-09-16). Pur,
// zéro dépendance react-native (contrairement à messageDraftStorage.ts, qui importe AsyncStorage) —
// testable sous `npx tsx`, comme messageSuggestion.ts/searchText.ts.
import { MessageOccasion, MessageTone } from './messageSuggestion';

export type MessageDraftEntry = { text: string; aiGenerated: boolean };

/** Un ton ABSENT de cet objet = "aucun brouillon pour ce ton", jamais une entrée avec un texte vide
 *  par défaut — c'est ce qui garantit qu'un template jamais modifié n'est jamais persisté (voir
 *  messageDraftStorage.ts : on n'écrit que si cet objet a au moins une clé). */
export type MessageDrafts = Partial<Record<MessageTone, MessageDraftEntry>>;

/** Identité minimale d'un brouillon : contact + occasion (+ pensée pour `event`, qui peut différer
 *  d'un événement à l'autre pour un même contact — deux `penseeId` distincts = deux brouillons
 *  totalement indépendants, jamais partagés). */
export function messageDraftStorageKey(contactId: string, occasion: MessageOccasion, penseeId?: string): string {
  if (occasion === 'event') return `pensif.messageDraft.${contactId}.event.${penseeId}`;
  return `pensif.messageDraft.${contactId}.${occasion}`;
}

/** Préfixe commun à TOUTES les clés d'un contact (birthday/thinking_of_you/event confondus) — utilisé
 *  par clearMessageDraftsForContact (messageDraftStorage.ts) pour un scan par préfixe au moment de
 *  supprimer un contact, seul cas où l'on ne connaît pas à l'avance tous les `penseeId` concernés. */
export function messageDraftStorageKeyPrefix(contactId: string): string {
  return `pensif.messageDraft.${contactId}.`;
}
