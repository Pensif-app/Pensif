// Protection serveur INVISIBLE pour Capture Intelligente (§2 du chantier "sécuriser le cycle
// Capture", 2026-09-14) — limites de débit + plafond mensuel, contrôlées AVANT tout appel payant
// Groq/OpenAI (voir index.ts). Le client n'est JAMAIS la source de vérité : ce module appelle la
// fonction RPC Postgres `register_capture_usage` (voir schema.sql), qui compte ET enregistre
// l'événement de façon ATOMIQUE (verrou consultatif par utilisateur, voir commentaire de la fonction
// SQL) — ce fichier ne fait qu'appeler cette fonction et normaliser son résultat ; aucune logique de
// seuil n'est dupliquée ici.
//
// Seuils actuels (fixés côté SQL, rappelés ici pour mémoire — ne JAMAIS les exposer au client) :
// 5 captures/minute (fenêtre glissante), 20/heure (fenêtre glissante), 100/mois (mois civil).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveSupabaseSecretKey } from '../_shared/supabaseEnv.ts';

export type CaptureUsageResult = 'ok' | 'rate_limit_minute' | 'rate_limit_hour' | 'monthly_cap';

const VALID_RESULTS: readonly CaptureUsageResult[] = ['ok', 'rate_limit_minute', 'rate_limit_hour', 'monthly_cap'];

function isCaptureUsageResult(value: unknown): value is CaptureUsageResult {
  return typeof value === 'string' && (VALID_RESULTS as readonly string[]).includes(value);
}

/** Code interne STRUCTURÉ renvoyé au client pour chaque résultat de blocage — jamais un seuil/chiffre,
 *  jamais le texte affiché à l'utilisateur (voir src/data/captureUsageMessages.ts côté app, qui
 *  traduit ces codes en messages génériques sans jamais révéler les seuils). */
export const CAPTURE_USAGE_ERROR_CODE: Record<Exclude<CaptureUsageResult, 'ok'>, string> = {
  rate_limit_minute: 'CAPTURE_RATE_LIMIT_MINUTE',
  rate_limit_hour: 'CAPTURE_RATE_LIMIT_HOUR',
  monthly_cap: 'CAPTURE_MONTHLY_CAP',
};

/** Implémentation RÉELLE (réseau, `service_role`) — n'est jamais appelée par les tests, qui injectent
 *  une version factice via `CaptureDeps.registerCaptureUsage` (voir index.test.ts), exactement comme
 *  `defaultVerifySession`. Utilise un client Supabase distinct authentifié en `service_role` (jamais
 *  le client anon+JWT utilisateur de `defaultVerifySession`) : seul `service_role` a le droit
 *  d'exécuter `register_capture_usage` côté SQL (`grant execute ... to service_role` uniquement,
 *  voir schema.sql) — le client mobile ne voit jamais ce secret ni cette fonction. */
export async function defaultRegisterCaptureUsage(userId: string): Promise<CaptureUsageResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // Préfère SUPABASE_SECRET_KEYS (moderne, dictionnaire JSON — voir supabaseEnv.ts) ; retombe sur
  // SUPABASE_SERVICE_ROLE_KEY (legacy) pour un projet pas encore migré.
  const serviceRoleKey = resolveSupabaseSecretKey();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Clé secrète Supabase manquante (SUPABASE_SECRET_KEYS ou SUPABASE_SERVICE_ROLE_KEY) — protection Capture indisponible');
  }
  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await client.rpc('register_capture_usage', { p_user_id: userId });
  if (error) throw new Error(`register_capture_usage a échoué : ${error.message}`);
  if (!isCaptureUsageResult(data)) {
    throw new Error(`register_capture_usage a renvoyé une valeur inattendue : ${JSON.stringify(data)}`);
  }
  return data;
}
