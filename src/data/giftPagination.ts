// Pagination de la liste d'idées cadeaux (build 9, lot A) : 3 idées au départ, « Voir 3 idées de plus »
// ajoute 3 cartes à chaque appui, plafond à 12. Module pur (aucune dépendance react-native/expo).
export const GIFT_PAGE_SIZE = 3;
export const GIFT_MAX_VISIBLE = 12;

/** Nombre de cartes affichables au maximum pour `total` candidats. */
export function giftVisibleLimit(total: number): number {
  return Math.min(total, GIFT_MAX_VISIBLE);
}

/** Nombre de cartes réellement affichées (jamais plus que le plafond ni que les candidats). */
export function clampVisibleCount(count: number, total: number): number {
  return Math.max(Math.min(GIFT_PAGE_SIZE, total), Math.min(count, giftVisibleLimit(total)));
}

/** Nouvelle valeur après « Voir 3 idées de plus ». */
export function nextVisibleCount(count: number, total: number): number {
  return Math.min(count + GIFT_PAGE_SIZE, giftVisibleLimit(total));
}

/** Le bouton « Voir 3 idées de plus » est proposé tant qu'il reste des idées sous le plafond. */
export function canShowMore(count: number, total: number): boolean {
  return count < giftVisibleLimit(total);
}

/** Plafond atteint alors que d'autres candidats existent : on invite à affiner plutôt qu'à continuer. */
export function atGiftCap(count: number, total: number): boolean {
  return count >= GIFT_MAX_VISIBLE && total > GIFT_MAX_VISIBLE;
}

/** « Réduire » n'a de sens que si plus que la première page est affichée. */
export function canCollapse(count: number): boolean {
  return count > GIFT_PAGE_SIZE;
}
