// CHANTIER "persistance reminderRecurrence" — correctif dépendance circulaire (2026-09-18). Module
// BAS NIVEAU, sans aucune dépendance vers `calendar.ts` ni `reminderRecurrence.ts` (ni vers aucun
// autre fichier de ce projet) : primitives de date/heure LOCALES pures, extraites de `calendar.ts`
// pour que `reminderRecurrence.ts` puisse les importer directement sans jamais dépendre de
// `calendar.ts` — c'est cette dépendance (reminderRecurrence.ts → calendar.ts) qui empêchait
// `calendar.ts` d'importer en retour `normalizeReminderRecurrence` (reminderRecurrence.ts) sans créer
// un cycle. Sémantique STRICTEMENT inchangée par ce déplacement — copie verbatim des définitions
// existantes, aucune reformulation de comportement date/calendrier.
//
// `calendar.ts` réexporte ces mêmes primitives (`export { addDays, isoOf } from './dateLocal'`) pour
// que les nombreux consommateurs existants qui les importent depuis `./calendar` (CalendarScreen.tsx,
// homeAttention.ts, notificationPlanning.ts, captureReview.ts, penseesView.ts...) n'aient RIEN à
// changer — un seul point d'entrée public inchangé, une seule source de vérité pour l'implémentation.

export const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** 'YYYY-MM-DD' à partir de composants LOCAUX (jamais UTC) — voir calendar.ts pour l'usage historique. */
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** Ajoute `n` jours à une date en LOCAL (jamais un décalage UTC) — voir calendar.ts pour l'usage historique. */
export function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
