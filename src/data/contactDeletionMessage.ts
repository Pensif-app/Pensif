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

// CHANTIER UX §6 (2026-09-16) — variantes multi-sélection (onglet Proches) : même décision produit,
// même comportement (`deleteContact` appelé une fois par proche, jamais de suppression en cascade
// des pensées), juste le texte de confirmation qui doit couvrir 1..N proches à la fois.
export function contactsDeletionTitle(contactCount: number): string {
  return contactCount === 1 ? 'Supprimer ce proche ?' : `Supprimer ${contactCount} proches ?`;
}

export function contactsDeletionMessage(contactCount: number, linkedPenseeCount: number): string {
  const contactsPart = contactCount === 1 ? 'Cette fiche et son quiz seront' : 'Ces fiches et leurs quiz seront';
  if (linkedPenseeCount === 0) return `${contactsPart} définitivement supprimés.`;
  const penseesPart =
    linkedPenseeCount === 1
      ? 'La pensée liée sera conservée sans proche.'
      : `Les ${linkedPenseeCount} pensées liées seront conservées sans proche.`;
  return `${contactsPart} définitivement supprimés. ${penseesPart}`;
}
