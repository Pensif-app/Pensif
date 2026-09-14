// Résolution des clés Supabase injectées automatiquement dans chaque Edge Function — gère la
// migration en cours chez Supabase : les anciennes variables à valeur unique (`SUPABASE_ANON_KEY`,
// `SUPABASE_SERVICE_ROLE_KEY`) sont dépréciées au profit de dictionnaires JSON multi-clés
// (`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`), chacun exposant une entrée `"default"` —
// voir https://supabase.com/docs/guides/functions/secrets. Toujours préférer la variable moderne
// quand elle est présente ; ne retomber sur l'ancienne que pour un projet pas encore migré (les
// deux restent listées comme "Default secrets" disponibles dans tout projet au moment où ce
// commentaire est écrit — la dépréciée n'a pas encore été retirée).
function resolveDictionaryKey(dictionaryEnvVar: string): string | null {
  const raw = Deno.env.get(dictionaryEnvVar);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed.default;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    // Format inattendu (ne devrait pas arriver pour une variable injectée par Supabase lui-même) —
    // on retombe sur la variable legacy plutôt que de faire échouer toute la requête pour ça.
    return null;
  }
}

/** Clé "service_role" (ou équivalent moderne) — contourne RLS, jamais exposée au client mobile. */
export function resolveSupabaseSecretKey(): string | null {
  return resolveDictionaryKey('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
}

/** Clé "anon" (ou équivalent moderne) — utilisée pour vérifier le JWT d'un utilisateur, jamais pour
 *  contourner RLS. */
export function resolveSupabasePublishableKey(): string | null {
  return resolveDictionaryKey('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? null;
}
