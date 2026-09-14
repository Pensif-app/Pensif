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

/**
 * Résout les listes définitives à afficher au démarrage. Comportement cible :
 * 1. le cache local, déjà lu avant tout appel réseau, constitue TOUJOURS un repli disponible ;
 * 2. si `remote` est fourni (Supabase configuré ET l'appel a réussi), il fait AUTORITÉ SEUL — le
 *    cache n'est PLUS jamais mélangé par-dessus dans ce cas (voir CHANTIER SUPPRESSION/INTÉGRITÉ,
 *    2026-09-15 : l'ancien `mergeCachedExtras` réinjectait aveuglément toute entrée présente en
 *    cache mais absente du distant — censé protéger une création locale pas encore synchronisée,
 *    mais incapable de distinguer ce cas d'une entité RÉELLEMENT supprimée côté serveur par un autre
 *    device, ou directement en base — ce qui pouvait la faire réapparaître indéfiniment après un
 *    boot en ligne). Une création locale réellement en attente n'a pas besoin de ce filet : elle a
 *    TOUJOURS un op `upsert` dans l'outbox (voir `store.tsx`, `enqueueAndDrain` appelé de façon
 *    synchrone à chaque création), et c'est l'étape 4 ci-dessous qui la protège, correctement ciblée
 *    par id plutôt que par une simple différence cache/distant ;
 * 3. si `remote` est `null` (Supabase non configuré OU en échec), le cache local est utilisé tel
 *    quel — jamais les seeds, jamais un état vide alors que le cache contient des données réelles ;
 * 4. dans tous les cas, l'outbox est appliquée EN DERNIER : un upsert en attente gagne contre la
 *    version distante (pas encore confirmée), un delete en attente empêche toute résurrection.
 */
export function resolveBootData({ cachedContacts, cachedPensees, outbox, remote }: BootInput): BootResult {
  const baseContacts = remote ? remote.contacts : cachedContacts;
  const basePensees = remote ? remote.pensees : cachedPensees;
  return {
    contacts: applyPendingToContacts(baseContacts, outbox),
    pensees: applyPendingToPensees(basePensees, outbox),
  };
}
