// CHANTIER SUPPRESSION/INTÉGRITÉ (2026-09-15) — texte de confirmation avant suppression d'un proche.
// Décision produit VALIDÉE : supprimer un proche NE supprime JAMAIS ses pensées liées, elles sont
// conservées avec `contactId: null` (voir store.tsx `deleteContact`, schema.sql `on delete set
// null`) — ce module ne fait qu'informer clairement l'utilisateur de ce comportement avant qu'il ne
// confirme, jamais qu'il ne le change. Pur, testable sans React Native (voir FicheScreen.tsx pour
// l'unique appelant).
export function contactDeletionMessage(linkedPenseeCount: number): string {
  if (linkedPenseeCount === 0) return 'Cette fiche et son quiz seront définitivement supprimés.';
  if (linkedPenseeCount === 1) {
    return 'Cette fiche et son quiz seront définitivement supprimés. La pensée liée sera conservée sans proche.';
  }
  return `Cette fiche et son quiz seront définitivement supprimés. Les ${linkedPenseeCount} pensées liées seront conservées sans proche.`;
}
