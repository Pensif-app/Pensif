// Tests de non-régression — VÉRIFICATION FINALE NOTIFICATIONS (cold start). Couvre les deux petits
// mécanismes purs ajoutés dans notificationPlanning.ts : déduplication par identifiant
// (consumeNotificationResponseOnce) et file d'attente d'une action jusqu'à ce que la navigation/le
// store soient prêts (createPendingOnce). `notifications.ts` lui-même (registerNotificationTapHandler)
// ne peut pas être chargé sous ts-node dans cet environnement (dépendance transitive à `expo`, déjà
// constaté lors du chantier précédent) — les deux mécanismes qu'il utilise sont donc testés
// directement, à l'identique de leur usage réel. Lecture seule. Assertions dures : lève une
// exception (code de sortie non-nul) si une régression est détectée.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-notification-tap.ts

import { consumeNotificationResponseOnce, createPendingOnce } from '../src/lib/notificationPlanning';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- consumeNotificationResponseOnce ------------------------------------------------------------
{
  console.log('\n[1] Déduplication par identifiant (Q2/Q5 de l’audit)');
  const handled = new Set<string>();
  check('première fois qu’on voit cet identifiant → à traiter', consumeNotificationResponseOnce('notif-1', handled) === true);
  check(
    'même identifiant revu (ex. getLastNotificationResponseAsync + listener sur la même interaction) → ignoré',
    consumeNotificationResponseOnce('notif-1', handled) === false,
  );
  check('un identifiant différent reste bien traité normalement', consumeNotificationResponseOnce('notif-2', handled) === true);
  check('sans identifiant, on laisse passer plutôt que de bloquer une navigation légitime', consumeNotificationResponseOnce(null, handled) === true);
  check('deux appels sans identifiant ne se bloquent pas mutuellement', consumeNotificationResponseOnce(undefined, handled) === true);
}

// --- createPendingOnce : navigation reçue avant que tout ne soit prêt --------------------------
{
  console.log('\n[2] Navigation reçue trop tôt : mise en attente, pas perdue (Q3/Q4 de l’audit)');
  const pending = createPendingOnce<{ contactId: string }>();
  let ready = false;

  check('rien en attente au départ', pending.hasPending() === false);
  pending.set({ contactId: 'live-contact' });
  check('la valeur est bien mémorisée en attente', pending.hasPending() === true);

  const consumedTooEarly = pending.consumeIfReady(() => ready);
  check('tant que isReady() est faux, rien n’est consommé (ni perdu)', consumedTooEarly === undefined && pending.hasPending() === true);

  ready = true;
  const consumedOnceReady = pending.consumeIfReady(() => ready);
  check('dès que isReady() devient vrai, la valeur en attente est bien renvoyée', consumedOnceReady?.contactId === 'live-contact');
  check('elle est retirée de la file après consommation (consommation unique)', pending.hasPending() === false);

  const consumedTwice = pending.consumeIfReady(() => ready);
  check('un second essai après consommation ne renvoie plus rien (jamais rejouée)', consumedTwice === undefined);
}

// --- Scénario complet : cold start, données vides au départ, live une fois prêtes ---------------
{
  console.log('\n[3] Scénario cold start : app fermée → tap → boot → store pas prêt → puis prêt');
  const pending = createPendingOnce<{ contactId: string }>();
  const handled = new Set<string>();

  // Simule handle(response) tel qu'appelé par getLastNotificationResponseAsync très tôt au boot.
  const responseIdentifier = 'boot-notification';
  const shouldProcess = consumeNotificationResponseOnce(responseIdentifier, handled);
  check('la réponse de démarrage est bien acceptée (première fois)', shouldProcess === true);
  pending.set({ contactId: 'real-contact-42' });

  // Store et navigation pas encore prêts au moment du tap — simulate: seedContacts vides / navRef non prêt.
  let storeReady = false;
  let navReady = false;
  const isReady = () => storeReady && navReady;

  const attempt1 = pending.consumeIfReady(isReady);
  check('rien résolu tant que le store/la navigation ne sont pas prêts (pas de données vides utilisées)', attempt1 === undefined);
  check('l’action reste en attente, pas perdue', pending.hasPending() === true);

  // La navigation devient prête en premier — toujours pas assez.
  navReady = true;
  const attempt2 = pending.consumeIfReady(isReady);
  check('navigation prête mais store pas encore prêt → toujours en attente', attempt2 === undefined && pending.hasPending() === true);

  // Puis le store finit de charger les données réelles.
  storeReady = true;
  const attempt3 = pending.consumeIfReady(isReady);
  check('les deux prêts → l’action en attente est enfin résolue, avec le bon contactId (données live)', attempt3?.contactId === 'real-contact-42');

  // Un lancement normal ULTÉRIEUR ne doit jamais rejouer cette même réponse (voir Q1 — le rôle réel
  // de clearLastNotificationResponseAsync() côté notifications.ts n'est pas testable ici, mais la
  // déduplication par identifiant, elle, l'est directement).
  const shouldProcessAgainLater = consumeNotificationResponseOnce(responseIdentifier, handled);
  check('la même réponse relue plus tard (identifiant identique) n’est pas retraitée une 2e fois', shouldProcessAgainLater === false);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
