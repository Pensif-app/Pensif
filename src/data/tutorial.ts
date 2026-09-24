// CHANTIER "Mini tutoriel onboarding global" (2026-09-24), version SIMPLIFIÉE : le tutoriel est une suite d'images
// statiques finales (assets/tutorial/tuto-<id>.png, déjà annotées), affichées en `contain` au-dessus d'une bande
// de navigation fixe. Aucune bulle, aucun hotspot, aucun placement calculé. Module PUR (aucune dépendance
// react-native) : ordre des images, navigation séquentielle et règle d'affichage one-shot.

export const TUTORIAL_SEEN_KEY = 'pensif.tutorialSeen';

/** Ids des images (assets/tutorial/tuto-<id>.png), dans l'ordre d'affichage. */
export type TutorialImageId = 'accueil' | 'proches' | 'nouveau-proche' | 'pensees' | 'capture' | 'calendrier-mois' | 'calendrier-semaine';

export const TUTORIAL_IMAGES: TutorialImageId[] = ['accueil', 'proches', 'nouveau-proche', 'pensees', 'capture', 'calendrier-mois', 'calendrier-semaine'];

export const TUTORIAL_IMAGE_COUNT = TUTORIAL_IMAGES.length;

/** `Continuer` : index de l'image suivante, ou `null` si on est sur la dernière (→ fin du tutoriel). */
export function nextTutorialIndex(index: number, total: number = TUTORIAL_IMAGE_COUNT): number | null {
  return index + 1 < total ? index + 1 : null;
}

export function isLastTutorialImage(index: number, total: number = TUTORIAL_IMAGE_COUNT): boolean {
  return index >= total - 1;
}

/** Libellé du bouton de droite : « Continuer » partout, « Terminer » sur la dernière image. */
export function tutorialContinueLabel(index: number, total: number = TUTORIAL_IMAGE_COUNT): string {
  return isLastTutorialImage(index, total) ? 'Terminer' : 'Continuer';
}

/**
 * Le tutoriel ne s'affiche qu'UNE fois, pour un NOUVEL utilisateur : flag jamais posé (`seen === false`,
 * `null` = pas encore lu → jamais affiché), store prêt, auth gate passé, prénom saisi (pas de tutoriel
 * par-dessus la modale prénom) et aucune donnée existante (un utilisateur déjà installé ne le voit pas).
 */
export function shouldShowTutorial(input: {
  seen: boolean | null;
  ready: boolean;
  authGateNone: boolean;
  hasUserName: boolean;
  namePromptOpen: boolean;
  hasData: boolean;
}): boolean {
  if (input.seen !== false) return false;
  if (!input.ready || !input.authGateNone) return false;
  if (!input.hasUserName || input.namePromptOpen) return false;
  return !input.hasData;
}
