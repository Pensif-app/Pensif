// CHANTIER CAPTURE INTELLIGENTE — push-to-talk : logique pure du seuil minimal de maintien,
// extraite de CaptureScreen.tsx (qui importe ces valeurs telles quelles, jamais une copie
// parallèle) pour rester testable sans dépendance native/React (expo-audio, Pressable).

/** Seuil minimal de maintien avant qu'un relâchement ne déclenche réellement une analyse — en
 *  dessous, c'est un tap accidentel : annulation propre, aucun envoi au backend. Choisi dans la
 *  fourchette demandée (300-500ms) : assez court pour ne jamais gêner une vraie dictée courte,
 *  assez long pour filtrer un tap involontaire. */
export const MIN_HOLD_MS = 400;

/** Un maintien plus court que MIN_HOLD_MS doit être annulé (voir handlePressOut,
 *  CaptureScreen.tsx) : pas de recording envoyé, retour direct à l'état repos. */
export function isPressTooShort(heldMs: number): boolean {
  return heldMs < MIN_HOLD_MS;
}
