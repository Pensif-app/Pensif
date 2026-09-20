// CHANTIER RÉPONSES INTELLIGENTES — persistance locale des brouillons de message (2026-09-16). Même
// principe que le brouillon de quiz (QuizScreen.tsx, `quiz-draft-${contact.id}`) : AsyncStorage
// direct, hors du store global (`store.tsx`), hors sync/outbox — un pur confort d'écran par device,
// jamais une donnée synchronisée avec Supabase. Best-effort partout (mêmes `.catch`/try-catch que le
// reste de la persistance locale de l'app) : un échec de lecture/écriture ne doit jamais faire
// planter l'écran, juste retomber sur le comportement par défaut (template/vide).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MessageOccasion } from './messageSuggestion';
import { MessageDrafts, messageDraftStorageKey, messageDraftStorageKeyPrefix } from './messageDraftKey';

export async function loadMessageDrafts(contactId: string, occasion: MessageOccasion, penseeId?: string): Promise<MessageDrafts> {
  try {
    const raw = await AsyncStorage.getItem(messageDraftStorageKey(contactId, occasion, penseeId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** L'appelant ne doit invoquer cette fonction que lorsque `drafts` contient au moins une entrée —
 *  voir MessageScreen.tsx : jamais d'écriture pour un objet vide (un template jamais modifié ne doit
 *  jamais être persisté). */
export async function saveMessageDrafts(
  contactId: string,
  occasion: MessageOccasion,
  drafts: MessageDrafts,
  penseeId?: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(messageDraftStorageKey(contactId, occasion, penseeId), JSON.stringify(drafts));
  } catch {
    // best-effort — voir en-tête de fichier
  }
}

/** Appelée par `deleteContact` (store.tsx) — effet purement LOCAL, ne touche ni l'outbox ni la
 *  sémantique de suppression existante. Scan par préfixe : seul moyen de retrouver d'éventuels
 *  brouillons `event.<penseeId>` sans connaître à l'avance tous les `penseeId` de ce contact. */
export async function clearMessageDraftsForContact(contactId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = messageDraftStorageKeyPrefix(contactId);
    const toRemove = keys.filter((k) => k.startsWith(prefix));
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // best-effort
  }
}

/** Appelée par `deletePensee` (store.tsx) — clé exacte connue (pas de scan nécessaire), no-op
 *  silencieux si aucun brouillon n'existait pour cette pensée. */
export async function clearMessageDraftForEvent(contactId: string, penseeId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(messageDraftStorageKey(contactId, 'event', penseeId));
  } catch {
    // best-effort
  }
}

/** CHANTIER "Data Safety P0-1" (2026-09-20) — purge TOTALE des brouillons locaux (message ET quiz,
 *  voir `quiz-draft-${contact.id}`, QuizScreen.tsx — brouillon local distinct, même risque). Appelée
 *  UNIQUEMENT lors d'un changement de `cacheOwnerUserId` (store.tsx, `initializeForSession`) : un
 *  brouillon de message/quiz peut révéler le contenu (prénom, réponses) d'un contact appartenant au
 *  compte PRÉCÉDENT sur cet appareil — jamais laissé visible pour le nouveau compte. Scan par préfixe
 *  (mêmes préfixes que `clearMessageDraftsForContact`, plus `quiz-draft-`) — best-effort comme le
 *  reste de ce fichier. */
export async function clearAllLocalDrafts(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((k) => k.startsWith('pensif.messageDraft.') || k.startsWith('quiz-draft-'));
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // best-effort
  }
}
