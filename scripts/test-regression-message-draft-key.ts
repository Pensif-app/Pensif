/// <reference types="node" />
// Tests de non-régression — CHANTIER RÉPONSES INTELLIGENTES : identité des brouillons de message
// (messageDraftKey.ts, pur, 2026-09-16). Exécuté réellement.
//
// Usage : npx tsx scripts/test-regression-message-draft-key.ts

import { messageDraftStorageKey, messageDraftStorageKeyPrefix } from '../src/data/messageDraftKey';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] Clés distinctes par occasion, pour le même contact');
{
  const birthday = messageDraftStorageKey('yohan', 'birthday');
  const thinking = messageDraftStorageKey('yohan', 'thinking_of_you');
  check('birthday ≠ thinking_of_you', birthday !== thinking);
  check('birthday = "pensif.messageDraft.yohan.birthday"', birthday === 'pensif.messageDraft.yohan.birthday');
  check('thinking_of_you = "pensif.messageDraft.yohan.thinking_of_you"', thinking === 'pensif.messageDraft.yohan.thinking_of_you');
}

console.log('\n[2] event — inclut le penseeId, deux événements du même contact = deux clés distinctes');
{
  const event1 = messageDraftStorageKey('yohan', 'event', 'pensee-1');
  const event2 = messageDraftStorageKey('yohan', 'event', 'pensee-2');
  check('event1 ≠ event2 (penseeId différent)', event1 !== event2);
  check('event1 = "pensif.messageDraft.yohan.event.pensee-1"', event1 === 'pensif.messageDraft.yohan.event.pensee-1');
}

console.log('\n[3] Deux contacts différents — jamais la même clé, même occasion/ton identiques');
{
  const yohan = messageDraftStorageKey('yohan', 'birthday');
  const micka = messageDraftStorageKey('micka', 'birthday');
  check('clés distinctes par contact', yohan !== micka);
}

console.log('\n[4] Préfixe de contact — englobe toutes ses clés (birthday/thinking_of_you/event confondus)');
{
  const prefix = messageDraftStorageKeyPrefix('yohan');
  check('birthday commence par le préfixe', messageDraftStorageKey('yohan', 'birthday').startsWith(prefix));
  check('thinking_of_you commence par le préfixe', messageDraftStorageKey('yohan', 'thinking_of_you').startsWith(prefix));
  check('event commence par le préfixe', messageDraftStorageKey('yohan', 'event', 'pensee-1').startsWith(prefix));
  check('le préfixe d’un AUTRE contact ne matche jamais une clé de yohan', !messageDraftStorageKey('yohan', 'birthday').startsWith(messageDraftStorageKeyPrefix('micka')));
}

console.log('\n[5] Déterminisme — mêmes entrées → même clé, toujours');
{
  const a = messageDraftStorageKey('yohan', 'event', 'pensee-1');
  const b = messageDraftStorageKey('yohan', 'event', 'pensee-1');
  check('résultat strictement identique', a === b);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
