// Edge Function `delete-account` — CHANTIER "Suppression des données / du compte" (2026-09-26), durcie le
// même jour. Supprime DÉFINITIVEMENT l'utilisateur AUTHENTIFIÉ qui l'appelle — et lui seul :
//   JWT obligatoire → l'identifiant vient EXCLUSIVEMENT du JWT vérifié par Supabase Auth (jamais du corps de
//   la requête, qui est ignoré) → UNE SEULE opération destructrice : `auth.admin.deleteUser(userId)`.
//
// STRATÉGIE DESTRUCTIVE (pourquoi PAS de DELETE manuels préalables) : si des suppressions de tables réussissaient
// puis que `deleteUser` échouait, on obtiendrait un compte Auth encore vivant sans ses données — inacceptable.
// On s'appuie donc sur les clés étrangères `references auth.users(id) ON DELETE CASCADE` (voir schema.sql :
// contacts, pensees, capture_events, message_suggestion_events) : GoTrue exécute `DELETE FROM auth.users`, et
// PostgreSQL applique les cascades dans CETTE MÊME instruction, donc dans la même transaction — soit l'utilisateur
// ET ses données dépendantes disparaissent, soit rien. (Il n'existe pas de transaction possible ENTRE l'API Auth
// et Postgres ; la garantie vient du fait qu'il n'y a plus qu'un seul DELETE, côté Postgres.)
// HYPOTHÈSE À VÉRIFIER dans la vraie base (schema.sql est maintenu à la main) : que ces 4 clés étrangères
// existent bien avec ON DELETE CASCADE — voir la requête `pg_constraint` du rapport / du README de la passe.
// Si une cascade manquait, des lignes orphelines (inaccessibles via RLS, mais stockées) resteraient : c'est un
// défaut de schéma à corriger, pas quelque chose à masquer ici par des suppressions manuelles non atomiques.
//
// La clé secrète (`service_role`) n'existe QUE dans cet environnement serveur, jamais dans l'app mobile.
// Aucun log de contenu : ni e-mail, ni pensée, ni proche, ni jeton/JWT, ni identifiant utilisateur.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveSupabasePublishableKey, resolveSupabaseSecretKey } from '../_shared/supabaseEnv.ts';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export type DeleteAccountSession = { userId: string };

/** Vérification RÉELLE (réseau) — `auth.getUser(token)` interroge Supabase Auth (pas une simple lecture
 *  de signature) ; jamais appelée par les tests, qui injectent `DeleteAccountDeps.verifySession`. */
async function defaultVerifySession(req: Request): Promise<DeleteAccountSession | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = resolveSupabasePublishableKey();
  if (!supabaseUrl || !anonKey) return null;
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

/** Supprime le compte Supabase Auth (anonyme OU sécurisé par e-mail — même appel) ; les cascades Postgres
 *  suppriment les données dépendantes dans la même instruction. Un utilisateur DÉJÀ absent (course avec une
 *  tentative précédente) est traité comme une suppression réussie (idempotence). */
async function defaultDeleteAuthUser(userId: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const secretKey = resolveSupabaseSecretKey();
  if (!supabaseUrl || !secretKey) throw new Error('missing_server_key');
  const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && error.code !== 'user_not_found' && error.status !== 404) throw new Error('delete_auth_user_failed');
}

export type DeleteAccountDeps = {
  verifySession: (req: Request) => Promise<DeleteAccountSession | null>;
  deleteAuthUser: (userId: string) => Promise<void>;
};

const defaultDeps: DeleteAccountDeps = {
  verifySession: defaultVerifySession,
  deleteAuthUser: defaultDeleteAuthUser,
};

export async function handleRequest(req: Request, deps: DeleteAccountDeps = defaultDeps): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const session = await deps.verifySession(req);
  if (!session) return jsonResponse({ error: 'unauthorized' }, 401);

  // Le corps de la requête est volontairement IGNORÉ : jamais un `user_id` fourni par le client.
  try {
    await deps.deleteAuthUser(session.userId);
  } catch {
    // Échec AVANT confirmation : l'opération est atomique côté Postgres (voir en-tête), rien n'a été supprimé.
    console.error(JSON.stringify({ event: 'delete_account_failed', stage: 'auth' }));
    return jsonResponse({ error: 'delete_failed' }, 500);
  }
  return jsonResponse({ ok: true }, 200);
}

// Ne démarre le serveur QUE si ce fichier est exécuté directement (déploiement réel), jamais quand il
// est importé par les tests.
if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
