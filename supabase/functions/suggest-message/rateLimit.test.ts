// Tests purs (aucun réseau) — même portée que capture/rateLimit.test.ts : mapping résultat→code
// structuré, aucune fuite de seuil/"quota". `defaultRegisterMessageSuggestionUsage` (RPC réel) n'est
// pas testé ici (nécessite une vraie instance Postgres), couvert par index.test.ts (injecté) et la
// revue de la fonction SQL elle-même.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { MESSAGE_SUGGESTION_USAGE_ERROR_CODE } from './rateLimit.ts';

Deno.test('MESSAGE_SUGGESTION_USAGE_ERROR_CODE — un code structuré par résultat, espace de noms distinct de Capture', () => {
  assertEquals(MESSAGE_SUGGESTION_USAGE_ERROR_CODE.rate_limit_minute, 'MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE');
  assertEquals(MESSAGE_SUGGESTION_USAGE_ERROR_CODE.rate_limit_hour, 'MESSAGE_SUGGESTION_RATE_LIMIT_HOUR');
});

Deno.test('MESSAGE_SUGGESTION_USAGE_ERROR_CODE — aucun code ne révèle un seuil numérique ou le mot "quota"', () => {
  for (const code of Object.values(MESSAGE_SUGGESTION_USAGE_ERROR_CODE)) {
    assert(!/\d/.test(code), `le code "${code}" ne doit contenir aucun chiffre`);
    assert(!code.toLowerCase().includes('quota'), `le code "${code}" ne doit pas contenir "quota"`);
  }
});

Deno.test('aucun plafond mensuel dans ce module — seulement minute/hour (décision produit explicite)', () => {
  const keys = Object.keys(MESSAGE_SUGGESTION_USAGE_ERROR_CODE);
  assertEquals(keys.length, 2);
  assert(!keys.some((k) => k.toLowerCase().includes('month')), 'aucune clé ne doit référencer un plafond mensuel');
});
