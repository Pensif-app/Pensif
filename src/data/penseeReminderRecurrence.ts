// CHANTIER "Notifications récurrentes — correctif OFF→ON" (2026-09-19). Pur, aucune dépendance
// react-native/expo, testable sous ts-node — voir scripts/test-regression-pensee-detail-recurrence.ts.
//
// BUG CORRIGÉ (audit dédié) : PenseeDetailScreen.tsx n'a AUCUNE UI pour afficher/modifier
// `reminderRecurrence` (frequency/daysOfWeek/occurrenceCount/untilDate). Sans cette règle explicite,
// `save()` reconduisait cette valeur à l'identique via `{...existing, ...}` à CHAQUE sauvegarde — y
// compris juste après avoir désactivé le rappel (`reminderAt=null`) : réactiver ensuite le rappel
// avec une nouvelle date ressuscitait alors silencieusement l'ANCIENNE récurrence, invisible et non
// voulue par l'utilisateur.
import { Pensee, ReminderRecurrence } from './types';

/**
 * Détermine la valeur de `reminderRecurrence` à écrire lors d'une sauvegarde depuis
 * PenseeDetailScreen. Rappel désactivé → récurrence EXPLICITEMENT effacée avec lui (`null`, jamais
 * une valeur orpheline) ; rappel actif → récurrence existante préservée telle quelle (un simple
 * changement de date/heure ne doit jamais y toucher). N'introduit aucune UI d'édition de récurrence
 * — une réactivation crée donc un rappel ponctuel tant qu'elle n'existe pas.
 */
export function resolveReminderRecurrenceForSave(
  existing: Pensee | undefined,
  reminderEnabled: boolean,
): ReminderRecurrence | null {
  if (!reminderEnabled) return null;
  return existing?.reminderRecurrence ?? null;
}
