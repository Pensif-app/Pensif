// Logique pure de résolution des données au démarrage — extraite de store.tsx pour être testable
// sous ts-node (voir scripts/test-regression-boot-data.ts) et pour qu'un seul endroit décide entre
// "distant" et "cache local", sans jamais retomber sur les seeds de démo par accident (voir
// CHANTIER PRÉ-BÊTA 1 §1 : le bug corrigé ici faisait perdre les vraies données locales au profit
// des seeds en cas d'échec réseau Supabase au démarrage).
//
// CHANTIER SYNC OFFLINE→SUPABASE : les anciennes listes `pendingDeleteContactIds`/
// `pendingDeletePenseeIds` et la détection implicite des créations non-synchronisées (diff d'ids)
// sont remplacées par l'outbox (`src/data/outbox.ts`), seule source de vérité sur ce qui n'est pas
// encore confirmé côté serveur — voir `applyPendingToContacts`/`applyPendingToPensees`.
import { Contact, Pensee } from './types';
import { Outbox, applyPendingToContacts, applyPendingToPensees } from './outbox';

/** `null` aussi bien quand Supabase n'est pas configuré que quand l'appel a échoué — dans les deux
 *  cas le cache local fait autorité, jamais les seeds. */
export type BootRemoteData = { contacts: Contact[]; pensees: Pensee[] } | null;

export type BootInput = {
  cachedContacts: Contact[];
  cachedPensees: Pensee[];
  outbox: Outbox;
  remote: BootRemoteData;
};

export type BootResult = {
  contacts: Contact[];
  pensees: Pensee[];
};

function mergeCachedExtras<T extends { id: string }>(remoteItems: T[], cachedItems: T[]): T[] {
  const remoteIds = new Set(remoteItems.map((i) => i.id));
  const extras = cachedItems.filter((i) => !remoteIds.has(i.id));
  return [...remoteItems, ...extras];
}

/**
 * Résout les listes définitives à afficher au démarrage. Comportement cible :
 * 1. le cache local, déjà lu avant tout appel réseau, constitue TOUJOURS un repli disponible ;
 * 2. si `remote` est fourni (Supabase configuré ET l'appel a réussi), il fait autorité, complété par
 *    ce qui n'existe que localement (filet de sécurité — normalement déjà représenté dans l'outbox,
 *    mais une entrée cache orpheline ne doit jamais disparaître silencieusement) ;
 * 3. si `remote` est `null` (Supabase non configuré OU en échec), le cache local est utilisé tel
 *    quel — jamais les seeds, jamais un état vide alors que le cache contient des données réelles ;
 * 4. dans tous les cas, l'outbox est appliquée EN DERNIER : un upsert en attente gagne contre la
 *    version distante (pas encore confirmée), un delete en attente empêche toute résurrection.
 */
export function resolveBootData({ cachedContacts, cachedPensees, outbox, remote }: BootInput): BootResult {
  const baseContacts = remote ? mergeCachedExtras(remote.contacts, cachedContacts) : cachedContacts;
  const basePensees = remote ? mergeCachedExtras(remote.pensees, cachedPensees) : cachedPensees;
  return {
    contacts: applyPendingToContacts(baseContacts, outbox),
    pensees: applyPendingToPensees(basePensees, outbox),
  };
}
