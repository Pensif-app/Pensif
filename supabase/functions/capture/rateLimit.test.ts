// Tests purs (aucun réseau) du module de protection serveur — couvre le mapping résultat→code
// structuré exposé au client, et l'absence de fuite de valeurs internes (seuils, mot "quota") dans
// ces codes. `defaultRegisterCaptureUsage` lui-même (appel RPC réel) n'est PAS testé ici : il
// nécessite une vraie instance Postgres avec la fonction `register_capture_usage` (voir schema.sql)
// — couvert par les tests d'orchestration injectés dans index.test.ts, et par la revue de la
// fonction SQL elle-même (verrou consultatif, fenêtres glissantes, mois civil).
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { CAPTURE_USAGE_ERROR_CODE } from './rateLimit.ts';

Deno.test('CAPTURE_USAGE_ERROR_CODE — un code structuré par résultat de blocage, exactement ceux demandés', () => {
  assertEquals(CAPTURE_USAGE_ERROR_CODE.rate_limit_minute, 'CAPTURE_RATE_LIMIT_MINUTE');
  assertEquals(CAPTURE_USAGE_ERROR_CODE.rate_limit_hour, 'CAPTURE_RATE_LIMIT_HOUR');
  assertEquals(CAPTURE_USAGE_ERROR_CODE.monthly_cap, 'CAPTURE_MONTHLY_CAP');
});

Deno.test('CAPTURE_USAGE_ERROR_CODE — aucune valeur ne révèle un seuil numérique ou le mot "quota"', () => {
  for (const code of Object.values(CAPTURE_USAGE_ERROR_CODE)) {
    assert(!/\d/.test(code), `le code "${code}" ne doit contenir aucun chiffre`);
    assert(!code.toLowerCase().includes('quota'), `le code "${code}" ne doit pas contenir "quota"`);
  }
});
