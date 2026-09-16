// CHANTIER RÉPONSES INTELLIGENTES — appel réseau vers l'Edge Function `suggest-message`. Mirroring
// captureApi.ts (même discipline : aucune clé de fournisseur LLM ici, JWT attaché automatiquement par
// `supabase.functions.invoke`). Totalement indépendant de captureApi.ts — pas d'import croisé, pas de
// logique partagée au-delà du client `supabase` déjà utilisé partout ailleurs.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { MessageSuggestionContext, MessageTone } from '../data/messageSuggestion';
import { mapMessageSuggestionBlockedCodeToMessage } from '../data/messageSuggestionUsageMessages';

export class MessageSuggestionApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

/**
 * Envoie un contexte DÉJÀ construit et validé (voir messageSuggestion.ts,
 * buildMessageSuggestionContext) à l'Edge Function — cette fonction ne fait aucune validation
 * métier elle-même, uniquement le transport réseau et la traduction des erreurs.
 */
export async function requestMessageSuggestion(context: MessageSuggestionContext, tone: MessageTone): Promise<string> {
  if (!supabase) throw new MessageSuggestionApiError('Supabase non configuré');

  try {
    const { data, error } = await supabase.functions.invoke('suggest-message', { body: { context, tone } });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let message = 'Erreur du serveur de personnalisation';
        try {
          const body = await error.context.json();
          if (body?.error === 'message_suggestion_blocked') {
            // Protection serveur — traduit TOUJOURS en message générique, jamais le code interne.
            message = mapMessageSuggestionBlockedCodeToMessage(body.code);
          } else if (typeof body?.message === 'string') {
            message = body.message;
          }
        } catch {
          // corps non-JSON — on garde le message générique
        }
        throw new MessageSuggestionApiError(message, error.context.status);
      }
      throw new MessageSuggestionApiError(error.message ?? 'Échec de la personnalisation');
    }
    const responseMessage = (data as { message?: unknown } | null)?.message;
    if (typeof responseMessage !== 'string' || !responseMessage.trim()) {
      throw new MessageSuggestionApiError('Réponse du serveur de personnalisation invalide');
    }
    return responseMessage;
  } catch (e) {
    if (e instanceof MessageSuggestionApiError) throw e;
    throw new MessageSuggestionApiError(e instanceof Error ? e.message : String(e));
  }
}
