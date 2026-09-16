// CHANTIER UX "ContactPicker commun" (2026-09-16) — logique de décision pure (aucun import React
// Native, pour rester testable sous ts-node, comme le reste de src/data/*.ts) pour la ligne
// compacte "contact associé" (voir src/components/ContactAssociationField.tsx, seul consommateur).
import { Contact } from './types';

export type ContactAssociationState =
  | { kind: 'selected'; contact: Contact }
  | { kind: 'orphaned' } // §10 — contactId renseigné mais le contact n'existe plus
  | { kind: 'suggested'; contact: Contact } // §3 — suggestion IA pas encore confirmée
  | { kind: 'empty' };

/** Un contact DÉJÀ associé prime toujours sur une suggestion (jamais écrasée silencieusement). Une
 *  suggestion référençant un contact introuvable retombe sur `empty`, jamais une erreur. */
export function resolveContactAssociationState(
  contacts: Contact[],
  selectedContactId: string | null,
  suggestedContactId?: string | null,
): ContactAssociationState {
  if (selectedContactId) {
    const selected = contacts.find((c) => c.id === selectedContactId);
    return selected ? { kind: 'selected', contact: selected } : { kind: 'orphaned' };
  }
  if (suggestedContactId) {
    const suggested = contacts.find((c) => c.id === suggestedContactId);
    if (suggested) return { kind: 'suggested', contact: suggested };
  }
  return { kind: 'empty' };
}
