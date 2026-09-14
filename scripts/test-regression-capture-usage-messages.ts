// Tests de non-régression — CHANTIER "sécuriser le cycle Capture" (2026-09-14), volet 2 : traduction
// des codes internes de protection serveur (src/data/captureUsageMessages.ts) en messages génériques
// affichés à l'utilisateur. Pur, sans dépendance réseau/IA. Lecture seule.
//
// Usage : npx tsx scripts/test-regression-capture-usage-messages.ts

import {
  CAPTURE_MONTHLY_CAP_MESSAGE,
  CAPTURE_RATE_LIMIT_MESSAGE,
  mapCaptureBlockedCodeToMessage,
} from '../src/data/captureUsageMessages';

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
  'CAPTURE_RATE_LIMIT_MINUTE → message rate-limit court exact',
  mapCaptureBlockedCodeToMessage('CAPTURE_RATE_LIMIT_MINUTE') === 'Vous allez un peu vite. Réessayez dans quelques instants.',
);
check(
  'CAPTURE_RATE_LIMIT_HOUR → MÊME message générique que la minute (le client ne distingue pas minute/heure)',
  mapCaptureBlockedCodeToMessage('CAPTURE_RATE_LIMIT_HOUR') === CAPTURE_RATE_LIMIT_MESSAGE,
);
check(
  'CAPTURE_MONTHLY_CAP → message plafond exact',
  mapCaptureBlockedCodeToMessage('CAPTURE_MONTHLY_CAP') === 'La capture vocale est temporairement indisponible pour ce compte.',
);
check('CAPTURE_MONTHLY_CAP === constante exportée (pas de duplication de chaîne)', mapCaptureBlockedCodeToMessage('CAPTURE_MONTHLY_CAP') === CAPTURE_MONTHLY_CAP_MESSAGE);

console.log('\n[jamais de fuite du code interne / seuil dans le message]');
for (const code of ['CAPTURE_RATE_LIMIT_MINUTE', 'CAPTURE_RATE_LIMIT_HOUR', 'CAPTURE_MONTHLY_CAP']) {
  const message = mapCaptureBlockedCodeToMessage(code);
  check(`"${code}" → message ne contient aucun chiffre`, !/\d/.test(message), message);
  check(`"${code}" → message ne contient pas le mot "quota"`, !message.toLowerCase().includes('quota'), message);
  check(`"${code}" → message ne contient pas le code brut lui-même`, !message.includes(code), message);
}

console.log('\n[code inconnu/absent → repli générique, jamais une exception ni le code brut affiché]');
check('code undefined → repli générique (pas de crash)', typeof mapCaptureBlockedCodeToMessage(undefined) === 'string');
check('code null → repli générique', typeof mapCaptureBlockedCodeToMessage(null) === 'string');
check('code inconnu ("FOO_BAR") → repli générique, jamais "FOO_BAR" affiché', !mapCaptureBlockedCodeToMessage('FOO_BAR').includes('FOO_BAR'));

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
