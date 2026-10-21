// Idées aimées d'un proche (build 9, lot A). Module pur : tout vit dans `quiz.recommendationHistory`, déjà
// synchronisé, sans nouveau champ. Une idée est « aimée » si elle figure dans `likedGiftIds` d'une entrée de
// l'historique ; la retirer l'enlève de toutes les entrées (le moteur, qui lit cet historique, cesse alors de
// s'en servir). Les idées affichées (`shownGiftIds`) restent, pour ne pas les reproposer aussitôt.
import { QuizProfile } from './types';

type History = QuizProfile['recommendationHistory'];

/** Ensemble des idées actuellement aimées. */
export function likedGiftIdSet(history: History): Set<string> {
  const out = new Set<string>();
  for (const entry of history) for (const id of entry.likedGiftIds ?? []) out.add(id);
  return out;
}

/** Ajoute un « J'aime » (sans doublon : une idée déjà aimée ne crée jamais une seconde entrée). */
export function withGiftLiked(history: History, giftId: string, shownGiftIds: string[], nowIso: string): History {
  if (likedGiftIdSet(history).has(giftId)) return history;
  return [...history, { at: nowIso, shownGiftIds, likedGiftIds: [giftId] }];
}

/** Retire un « J'aime » de toutes les entrées ; une entrée vidée de ses idées aimées est conservée. */
export function withGiftUnliked(history: History, giftId: string): History {
  if (!likedGiftIdSet(history).has(giftId)) return history;
  return history.map((entry) =>
    entry.likedGiftIds && entry.likedGiftIds.includes(giftId)
      ? { ...entry, likedGiftIds: entry.likedGiftIds.filter((id) => id !== giftId) }
      : entry,
  );
}

/** Bascule : aimée → retirée, sinon aimée. */
export function toggleGiftLike(history: History, giftId: string, shownGiftIds: string[], nowIso: string): History {
  return likedGiftIdSet(history).has(giftId) ? withGiftUnliked(history, giftId) : withGiftLiked(history, giftId, shownGiftIds, nowIso);
}
