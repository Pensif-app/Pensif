// Protection serveur INVISIBLE pour "Réponses intelligentes" — CHANTIER RÉPONSES INTELLIGENTES,
// incrément 1 (2026-09-16). TOTALEMENT séparée de Capture (`capture_events`/`register_capture_usage`,
// supabase/functions/capture/rateLimit.ts) : sa propre table `message_suggestion_events`, sa propre
// fonction RPC `register_message_suggestion_usage`, son propre espace de verrou consultatif (salt
// différent, voir schema.sql) — un abus/incident sur l'une des deux fonctionnalités ne peut jamais
// affecter le quota de l'autre.
//
// Décision produit explicite (2026-09-16) : UNIQUEMENT une protection anti-rafale courte
// (5/minute, 20/heure) — AUCUN plafond mensuel pour l'instant. On mesurera coût/usage réel avant de
// décider d'un éventuel quota mensuel (contrairement à Capture, qui en a un dès sa V1).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveSupabaseSecretKey } from '../_shared/supabaseEnv.ts';

export type MessageSuggestionUsageResult = 'ok' | 'rate_limit_minute' | 'rate_limit_hour';

const VALID_RESULTS: readonly MessageSuggestionUsageResult[] = ['ok', 'rate_limit_minute', 'rate_limit_hour'];

function isMessageSuggestionUsageResult(value: unknown): value is MessageSuggestionUsageResult {
  return typeof value === 'string' && (VALID_RESULTS as readonly string[]).includes(value);
}

/** Code STRUCTURÉ renvoyé au client — jamais un seuil/chiffre, jamais le texte affiché à
 *  l'utilisateur (voir src/data/messageSuggestionUsageMessages.ts côté app, incrément 2). Espace de
 *  noms distinct de CAPTURE_USAGE_ERROR_CODE (préfixe MESSAGE_SUGGESTION_, pas CAPTURE_). */
export const MESSAGE_SUGGESTION_USAGE_ERROR_CODE: Record<Exclude<MessageSuggestionUsageResult, 'ok'>, string> = {
  rate_limit_minute: 'MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE',
  rate_limit_hour: 'MESSAGE_SUGGESTION_RATE_LIMIT_HOUR',
};

/** Implémentation RÉELLE (réseau, `service_role`) — jamais appelée par les tests (voir index.test.ts,
 *  qui injecte une version factice via `MessageSuggestionDeps.registerMessageSuggestionUsage`). */
export async function defaultRegisterMessageSuggestionUsage(userId: string): Promise<MessageSuggestionUsageResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = resolveSupabaseSecretKey();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Clé secrète Supabase manquante — protection "Réponses intelligentes" indisponible');
  }
  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await client.rpc('register_message_suggestion_usage', { p_user_id: userId });
  if (error) throw new Error(`register_message_suggestion_usage a échoué : ${error.message}`);
  if (!isMessageSuggestionUsageResult(data)) {
    throw new Error(`register_message_suggestion_usage a renvoyé une valeur inattendue : ${JSON.stringify(data)}`);
  }
  return data;
}
