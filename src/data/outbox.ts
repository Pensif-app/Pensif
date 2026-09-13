// Outbox persistante — CHANTIER SYNC OFFLINE→SUPABASE. Logique pure (pas d'import react-native ni
// AsyncStorage) pour rester testable sous ts-node, comme le reste de src/data/*.ts. store.tsx est
// seul responsable de la persistance AsyncStorage et des appels Supabase réels (voir `executeOp`
// injecté dans `drainOutbox`) — ce fichier ne connaît que des structures en mémoire.
//
// Principe : une mutation utilisateur applique son état local optimiste (inchangé, voir store.tsx),
// PUIS enqueue/coalesce ici une opération dans l'outbox AVANT d'être considérée durable. L'outbox est
// la seule source de vérité sur "qu'est-ce qui n'est pas encore confirmé côté serveur" — elle
// remplace l'ancien duo pendingDeleteIds (explicite) / diff d'ids au boot (implicite, incapable de
// représenter une simple modification).
import { Contact, Pensee } from './types';

type OutboxOpBase = { opId: string; entityId: string; enqueuedAt: string };
export type ContactUpsertOp = OutboxOpBase & { kind: 'contact'; action: 'upsert'; isNew: boolean; payload: Contact };
export type ContactDeleteOp = OutboxOpBase & { kind: 'contact'; action: 'delete' };
export type PenseeUpsertOp = OutboxOpBase & { kind: 'pensee'; action: 'upsert'; isNew: boolean; payload: Pensee };
export type PenseeDeleteOp = OutboxOpBase & { kind: 'pensee'; action: 'delete' };
export type OutboxOp = ContactUpsertOp | ContactDeleteOp | PenseeUpsertOp | PenseeDeleteOp;
export type Outbox = OutboxOp[];

function key(kind: OutboxOp['kind'], entityId: string): string {
  return `${kind}:${entityId}`;
}

function findIndex(outbox: Outbox, kind: OutboxOp['kind'], entityId: string): number {
  return outbox.findIndex((op) => key(op.kind, op.entityId) === key(kind, entityId));
}

/**
 * Enqueue/coalesce un upsert (contact ou pensée — mêmes règles pour les deux, voir les wrappers
 * typés plus bas). Un upsert déjà en attente pour la même entité est REMPLACÉ (jamais empilé) : un
 * seul appel réseau rejoue directement l'état final, jamais une suite d'états intermédiaires
 * (scénarios D/E du chantier). `isNew` de l'entrée EXISTANTE est préservé si elle en a une — tant
 * qu'une création n'a jamais été confirmée côté serveur, toute modification suivante doit continuer
 * à être envoyée comme une création (INSERT), jamais comme une modification (UPDATE) qui échouerait
 * faute de ligne existante.
 */
function enqueueUpsert<Op extends ContactUpsertOp | PenseeUpsertOp>(
  outbox: Outbox,
  kind: Op['kind'],
  entityId: string,
  payload: Op['payload'],
  isNewIfFirstTime: boolean,
  opId: string,
  enqueuedAt: string,
): Outbox {
  const idx = findIndex(outbox, kind, entityId);
  const existing = idx >= 0 ? outbox[idx] : null;
  const isNew = existing && existing.action === 'upsert' ? existing.isNew : isNewIfFirstTime;
  const op = { opId, kind, entityId, action: 'upsert' as const, isNew, payload, enqueuedAt } as Op;
  if (idx < 0) return [...outbox, op];
  const next = outbox.slice();
  next[idx] = op;
  return next;
}

export function enqueueUpsertContact(
  outbox: Outbox,
  contact: Contact,
  isNewIfFirstTime: boolean,
  opId: string,
  enqueuedAt: string,
): Outbox {
  return enqueueUpsert<ContactUpsertOp>(outbox, 'contact', contact.id, contact, isNewIfFirstTime, opId, enqueuedAt);
}

export function enqueueUpsertPensee(
  outbox: Outbox,
  pensee: Pensee,
  isNewIfFirstTime: boolean,
  opId: string,
  enqueuedAt: string,
): Outbox {
  return enqueueUpsert<PenseeUpsertOp>(outbox, 'pensee', pensee.id, pensee, isNewIfFirstTime, opId, enqueuedAt);
}

/**
 * Enqueue/coalesce une suppression. Deux cas se simplifient (scénarios F/G) :
 * - un upsert `isNew:true` encore en attente pour cette entité (jamais confirmée côté serveur) est
 *   simplement RETIRÉ, sans ajouter de delete : il n'y a rien à supprimer côté serveur, l'entité n'y
 *   a jamais existé.
 * - un upsert `isNew:false` (modification d'une entité déjà distante) est REMPLACÉ par le delete :
 *   inutile d'envoyer une modification juste avant une suppression.
 */
function enqueueDelete(
  outbox: Outbox,
  kind: OutboxOp['kind'],
  entityId: string,
  opId: string,
  enqueuedAt: string,
): Outbox {
  const idx = findIndex(outbox, kind, entityId);
  const existing = idx >= 0 ? outbox[idx] : null;
  if (existing && existing.action === 'upsert' && existing.isNew) {
    return outbox.filter((_, i) => i !== idx);
  }
  const op = { opId, kind, entityId, action: 'delete' as const, enqueuedAt } as OutboxOp;
  if (idx < 0) return [...outbox, op];
  const next = outbox.slice();
  next[idx] = op;
  return next;
}

export function enqueueDeleteContact(outbox: Outbox, contactId: string, opId: string, enqueuedAt: string): Outbox {
  return enqueueDelete(outbox, 'contact', contactId, opId, enqueuedAt);
}

export function enqueueDeletePensee(outbox: Outbox, penseeId: string, opId: string, enqueuedAt: string): Outbox {
  return enqueueDelete(outbox, 'pensee', penseeId, opId, enqueuedAt);
}

/** Migration ponctuelle (CHANTIER SYNC) : les anciennes listes `pendingDelete*Ids` (avant l'outbox)
 *  deviennent des delete-ops, pour ne perdre aucune suppression déjà en attente. Idempotent — un id
 *  déjà représenté dans l'outbox n'est jamais dupliqué. */
export function migrateLegacyPendingDeletes(
  outbox: Outbox,
  legacyPendingDeleteContactIds: string[],
  legacyPendingDeletePenseeIds: string[],
  makeOpId: () => string,
  enqueuedAt: string,
): Outbox {
  let next = outbox;
  for (const id of legacyPendingDeleteContactIds) {
    next = enqueueDeleteContact(next, id, makeOpId(), enqueuedAt);
  }
  for (const id of legacyPendingDeletePenseeIds) {
    next = enqueueDeletePensee(next, id, makeOpId(), enqueuedAt);
  }
  return next;
}

/**
 * Patch une liste d'entités (déjà fusionnée remote+cache) avec l'état de l'outbox, pour le boot :
 * - une entité avec un upsert en attente affiche le payload LOCAL, jamais l'ancien payload distant
 *   (une modification pas encore confirmée ne doit jamais être visuellement écrasée) ;
 * - une entité avec un delete en attente n'est jamais réaffichée, même si le distant la connaît
 *   encore (la suppression n'a pas encore été confirmée, mais elle est déjà actée localement) ;
 * - un upsert `isNew:true` dont l'entité n'apparaît pas encore dans la liste de base (jamais vue
 *   côté distant) est ajouté.
 */
function applyPending<T extends { id: string }>(
  base: T[],
  outbox: Outbox,
  kind: OutboxOp['kind'],
): T[] {
  const pendingUpserts = new Map<string, T>();
  const pendingDeleteIds = new Set<string>();
  for (const op of outbox) {
    if (op.kind !== kind) continue;
    if (op.action === 'upsert') pendingUpserts.set(op.entityId, op.payload as unknown as T);
    else pendingDeleteIds.add(op.entityId);
  }
  const patched = base.filter((item) => !pendingDeleteIds.has(item.id)).map((item) => pendingUpserts.get(item.id) ?? item);
  const existingIds = new Set(patched.map((item) => item.id));
  const newFromOutbox = [...pendingUpserts.entries()]
    .filter(([id]) => !existingIds.has(id) && !pendingDeleteIds.has(id))
    .map(([, payload]) => payload);
  return [...patched, ...newFromOutbox];
}

export function applyPendingToContacts(contacts: Contact[], outbox: Outbox): Contact[] {
  return applyPending(contacts, outbox, 'contact');
}

export function applyPendingToPensees(pensees: Pensee[], outbox: Outbox): Pensee[] {
  return applyPending(pensees, outbox, 'pensee');
}

export type ExecuteOpResult = { ok: true } | { ok: false };

/**
 * Draine l'outbox dans l'ordre FIFO (ordre d'enqueue = ordre du tableau), séquentiellement.
 * `executeOp` est injecté par l'appelant (store.tsx en réel, un exécuteur factice dans les tests) —
 * cette fonction elle-même ne fait aucun I/O, ce qui la garde testable sous ts-node.
 * Politique volontairement simple : à la première opération en échec, on ARRÊTE le drain (on ne
 * saute jamais une opération pour tenter la suivante) et on conserve TOUT le reste tel quel — l'ordre
 * relatif des opérations n'est donc jamais perturbé par un échec partiel.
 */
export async function drainOutbox(
  outbox: Outbox,
  executeOp: (op: OutboxOp) => Promise<ExecuteOpResult>,
): Promise<{ outbox: Outbox; stoppedEarly: boolean }> {
  let remaining = outbox;
  for (const op of outbox) {
    const result = await executeOp(op);
    if (!result.ok) {
      return { outbox: remaining, stoppedEarly: true };
    }
    remaining = remaining.filter((o) => o.opId !== op.opId);
  }
  return { outbox: remaining, stoppedEarly: false };
}
