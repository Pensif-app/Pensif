// Tests purs (aucun réseau) — même portée que capture/rateLimit.test.ts : mapping résultat→code
// structuré, aucune fuite de seuil/"quota". `defaultRegisterMessageSuggestionUsage` (RPC réel) n'est
// pas testé ici (nécessite une vraie instance Postgres), couvert par index.test.ts (injecté) et la
// revue de la fonction SQL elle-même.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { MESSAGE_SUGGESTION_USAGE_ERROR_CODE } from './rateLimit.ts';

Deno.test('MESSAGE_SUGGESTION_USAGE_ERROR_CODE — un code structuré par résultat, espace de noms distinct de Capture', () => {
  assertEquals(MESSAGE_SUGGESTION_USAGE_ERROR_CODE.rate_limit_minute, 'MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE');
  assertEquals(MESSAGE_SUGGESTION_USAGE_ERROR_CODE.rate_limit_hour, 'MESSAGE_SUGGESTION_RATE_LIMIT_HOUR');
  assertEquals(MESSAGE_SUGGESTION_USAGE_ERROR_CODE.monthly_cap, 'MESSAGE_SUGGESTION_MONTHLY_CAP');
});

Deno.test('MESSAGE_SUGGESTION_USAGE_ERROR_CODE — aucun code ne révèle un seuil numérique ou le mot "quota"', () => {
  for (const code of Object.values(MESSAGE_SUGGESTION_USAGE_ERROR_CODE)) {
    assert(!/\d/.test(code), `le code "${code}" ne doit contenir aucun chiffre`);
    assert(!code.toLowerCase().includes('quota'), `le code "${code}" ne doit pas contenir "quota"`);
  }
});

Deno.test('plafond mensuel (2026-09-16) — code dédié distinct des codes minute/heure, espace de noms propre à suggest-message', () => {
  const keys = Object.keys(MESSAGE_SUGGESTION_USAGE_ERROR_CODE);
  assertEquals(keys.length, 3);
  assert(keys.includes('monthly_cap'), 'la clé "monthly_cap" doit exister depuis la décision produit du 2026-09-16 (250/mois civil)');
  assert(
    MESSAGE_SUGGESTION_USAGE_ERROR_CODE.monthly_cap !== 'CAPTURE_MONTHLY_CAP',
    'le code ne doit jamais réutiliser le code de Capture — espaces de noms distincts',
  );
});
