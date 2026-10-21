// « Mes idées » et « Offrir celle-ci » (build 9, lot B). Module pur (aucune dépendance react-native/expo).
// Les idées aimées vivent déjà dans `quiz.recommendationHistory` (voir giftLikes.ts) : aucune liste
// supplémentaire n'est stockée. Seule l'idée choisie pour l'anniversaire en cours est ajoutée au profil
// (`quiz.chosenGift`), dans le même JSON déjà synchronisé : aucune colonne serveur.
import { occurrenceYear } from './calendar';
import { CuratedGift } from './giftCatalog';
import { withGiftUnliked, likedGiftIdSet } from './giftLikes';
import { normalizeQuizProfile } from './quiz';
import { giftById } from './recommendationEngine';
import { Contact } from './types';

/** Identifiants des idées aimées, la plus récente en premier, sans doublon. */
export function savedGiftIdsLatestFirst(history: ReturnType<typeof normalizeQuizProfile>['recommendationHistory']): string[] {
  const liked = likedGiftIdSet(history);
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const ids = history[i].likedGiftIds ?? [];
    for (let j = ids.length - 1; j >= 0; j--) {
      const id = ids[j];
      if (liked.has(id) && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Idées aimées résolues dans le catalogue ; une idée disparue du catalogue est ignorée, jamais une erreur. */
export function savedIdeasFor(contact: Contact): CuratedGift[] {
  if (!contact.quiz) return [];
  const history = normalizeQuizProfile(contact.quiz).recommendationHistory;
  return savedGiftIdsLatestFirst(history)
    .map((id) => giftById(id))
    .filter((g): g is CuratedGift => !!g);
}

/** Idée choisie pour l'anniversaire EN COURS (ignorée si l'année a changé ou si le cadeau n'est plus « prévu »). */
export function chosenGiftFor(contact: Contact, today: Date): CuratedGift | null {
  const chosen = contact.quiz?.chosenGift;
  if (!chosen) return null;
  const year = occurrenceYear(contact.date, today);
  if (chosen.year !== year || contact.giftPreparedYear !== year) return null;
  return giftById(chosen.giftId) ?? null;
}

/** « Offrir celle-ci » : cadeau prévu pour cette année + idée mémorisée (remplace la précédente). */
export function withChosenGift(contact: Contact, giftId: string, today: Date): Contact {
  if (!contact.quiz) return contact;
  const year = occurrenceYear(contact.date, today);
  return { ...contact, giftPreparedYear: year, quiz: { ...normalizeQuizProfile(contact.quiz), chosenGift: { giftId, year } } };
}

/** Annule le cadeau prévu et l'idée choisie. */
export function withoutChosenGift(contact: Contact): Contact {
  if (!contact.quiz) return { ...contact, giftPreparedYear: null };
  return { ...contact, giftPreparedYear: null, quiz: { ...normalizeQuizProfile(contact.quiz), chosenGift: null } };
}

/** Retire une idée de « Mes idées » ; si c'était l'idée choisie, le cadeau n'est plus « prévu ». */
export function withIdeaRemoved(contact: Contact, giftId: string): Contact {
  if (!contact.quiz) return contact;
  const quiz = normalizeQuizProfile(contact.quiz);
  const next: Contact = { ...contact, quiz: { ...quiz, recommendationHistory: withGiftUnliked(quiz.recommendationHistory, giftId) } };
  return quiz.chosenGift?.giftId === giftId ? withoutChosenGift(next) : next;
}
