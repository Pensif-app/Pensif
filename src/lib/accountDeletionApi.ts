// CHANTIER "Suppression des données / du compte" (2026-09-26, durci le même jour) — appel réseau vers l'Edge
// Function `delete-account`. Aucune clé secrète ici : seul le JWT de la session courante est envoyé (attaché
// automatiquement par `supabase.functions.invoke`), le serveur en déduit l'utilisateur à supprimer.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { AccountDeletionError, InvokeFailure, classifyInvokeFailure } from '../data/accountDeletion';

async function toInvokeFailure(error: unknown): Promise<InvokeFailure> {
  if (error instanceof FunctionsHttpError) {
    let bodyError: string | null = null;
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') bodyError = body.error;
    } catch {
      // corps illisible : `bodyError` reste null (la classification traite alors un 5xx comme incertain)
    }
    return { source: 'http', status: error.context.status, bodyError };
  }
  if (error instanceof FunctionsRelayError) return { source: 'relay' };
  if (error instanceof FunctionsFetchError) return { source: 'fetch' };
  return { source: 'other' };
}

/**
 * Ne résout QUE si le serveur a répondu `{ ok: true }` (suppression confirmée). Sinon lève
 * `AccountDeletionError` avec la catégorie : SERVER_REJECTED (échec certain), SESSION_INVALID (401),
 * NETWORK_UNCERTAIN (résultat inconnu — coupure, timeout, relay, 5xx sans corps structuré, réponse 2xx illisible).
 */
export async function deleteAccountRemote(): Promise<void> {
  if (!supabase) throw new AccountDeletionError('SERVER_REJECTED');
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke('delete-account', { body: {} });
  } catch {
    throw new AccountDeletionError('NETWORK_UNCERTAIN');
  }
  if (result.error) throw new AccountDeletionError(classifyInvokeFailure(await toInvokeFailure(result.error)));
  // 2xx sans `{ ok: true }` : réponse inattendue — on ne peut pas affirmer que rien n'a été supprimé.
  if ((result.data as { ok?: unknown } | null)?.ok !== true) throw new AccountDeletionError('NETWORK_UNCERTAIN');
}
