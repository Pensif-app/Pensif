// Tests purs (aucun réseau) — résolution des clés Supabase modernes (dictionnaire JSON) avec repli
// sur les variables legacy à valeur unique. Voir https://supabase.com/docs/guides/functions/secrets.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveSupabasePublishableKey, resolveSupabaseSecretKey } from './supabaseEnv.ts';

const ENV_KEYS = ['SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'];

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) previous[key] = Deno.env.get(key);
  try {
    for (const key of ENV_KEYS) {
      const value = vars[key];
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[key]!);
    }
  }
}

Deno.test('resolveSupabaseSecretKey — préfère SUPABASE_SECRET_KEYS["default"] quand présent', () => {
  withEnv({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_new' }), SUPABASE_SERVICE_ROLE_KEY: 'legacy-role-key' }, () => {
    assertEquals(resolveSupabaseSecretKey(), 'sb_secret_new');
  });
});

Deno.test('resolveSupabaseSecretKey — retombe sur SUPABASE_SERVICE_ROLE_KEY (legacy) si SUPABASE_SECRET_KEYS absent', () => {
  withEnv({ SUPABASE_SECRET_KEYS: undefined, SUPABASE_SERVICE_ROLE_KEY: 'legacy-role-key' }, () => {
    assertEquals(resolveSupabaseSecretKey(), 'legacy-role-key');
  });
});

Deno.test('resolveSupabaseSecretKey — SUPABASE_SECRET_KEYS malformé (pas du JSON) → repli sur legacy, jamais un crash', () => {
  withEnv({ SUPABASE_SECRET_KEYS: 'pas-du-json', SUPABASE_SERVICE_ROLE_KEY: 'legacy-role-key' }, () => {
    assertEquals(resolveSupabaseSecretKey(), 'legacy-role-key');
  });
});

Deno.test('resolveSupabaseSecretKey — ni l’un ni l’autre présent → null (jamais une chaîne vide)', () => {
  withEnv({ SUPABASE_SECRET_KEYS: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }, () => {
    assertEquals(resolveSupabaseSecretKey(), null);
  });
});

Deno.test('resolveSupabasePublishableKey — préfère SUPABASE_PUBLISHABLE_KEYS["default"] quand présent', () => {
  withEnv({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_new' }), SUPABASE_ANON_KEY: 'legacy-anon-key' }, () => {
    assertEquals(resolveSupabasePublishableKey(), 'sb_publishable_new');
  });
});

Deno.test('resolveSupabasePublishableKey — retombe sur SUPABASE_ANON_KEY (legacy) si SUPABASE_PUBLISHABLE_KEYS absent', () => {
  withEnv({ SUPABASE_PUBLISHABLE_KEYS: undefined, SUPABASE_ANON_KEY: 'legacy-anon-key' }, () => {
    assertEquals(resolveSupabasePublishableKey(), 'legacy-anon-key');
  });
});
