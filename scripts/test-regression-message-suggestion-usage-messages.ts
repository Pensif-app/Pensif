// Tests de non-régression — CHANTIER RÉPONSES INTELLIGENTES, plafond mensuel (2026-09-16) : traduction
// des codes internes de protection serveur (src/data/messageSuggestionUsageMessages.ts) en messages
// génériques affichés à l'utilisateur. Pur, sans dépendance réseau. Miroir de
// test-regression-capture-usage-messages.ts, espace de noms totalement distinct.
//
// Usage : npx tsx scripts/test-regression-message-suggestion-usage-messages.ts

import {
  MESSAGE_SUGGESTION_MONTHLY_CAP_MESSAGE,
  MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE,
  mapMessageSuggestionBlockedCodeToMessage,
} from '../src/data/messageSuggestionUsageMessages';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[mapping exact demandé — messages génériques, jamais de seuil/code exposé]');
check(
  'MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE → message rate-limit exact',
  mapMessageSuggestionBlockedCodeToMessage('MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE') === MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE,
);
check(
  'MESSAGE_SUGGESTION_RATE_LIMIT_HOUR → MÊME message générique que la minute',
  mapMessageSuggestionBlockedCodeToMessage('MESSAGE_SUGGESTION_RATE_LIMIT_HOUR') === MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE,
);
check(
  'MESSAGE_SUGGESTION_MONTHLY_CAP → message plafond exact, constante exportée (pas de duplication de chaîne)',
  mapMessageSuggestionBlockedCodeToMessage('MESSAGE_SUGGESTION_MONTHLY_CAP') === MESSAGE_SUGGESTION_MONTHLY_CAP_MESSAGE,
);

console.log('\n[jamais de fuite du code interne / seuil "250" / "quota" dans le message]');
for (const code of ['MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE', 'MESSAGE_SUGGESTION_RATE_LIMIT_HOUR', 'MESSAGE_SUGGESTION_MONTHLY_CAP']) {
  const message = mapMessageSuggestionBlockedCodeToMessage(code);
  check(`"${code}" → message ne contient aucun chiffre (jamais "250")`, !/\d/.test(message), message);
  check(`"${code}" → message ne contient pas le mot "quota"`, !message.toLowerCase().includes('quota'), message);
  check(`"${code}" → message ne contient pas le code brut lui-même`, !message.includes(code), message);
}

console.log('\n[message plafond mensuel distinct du message rate-limit — pas le même texte affiché]');
check(
  'MESSAGE_SUGGESTION_MONTHLY_CAP_MESSAGE !== MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE',
  (MESSAGE_SUGGESTION_MONTHLY_CAP_MESSAGE as string) !== (MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE as string),
);

console.log('\n[code inconnu/absent → repli générique, jamais une exception ni le code brut affiché]');
check('code undefined → repli générique (pas de crash)', typeof mapMessageSuggestionBlockedCodeToMessage(undefined) === 'string');
check('code null → repli générique', typeof mapMessageSuggestionBlockedCodeToMessage(null) === 'string');
check(
  'code inconnu ("FOO_BAR") → repli générique, jamais "FOO_BAR" affiché',
  !mapMessageSuggestionBlockedCodeToMessage('FOO_BAR').includes('FOO_BAR'),
);
check(
  'CAPTURE_MONTHLY_CAP (code de Capture) → repli générique, jamais confondu avec le plafond de suggest-message',
  mapMessageSuggestionBlockedCodeToMessage('CAPTURE_MONTHLY_CAP') !== MESSAGE_SUGGESTION_MONTHLY_CAP_MESSAGE,
);

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
