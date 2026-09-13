// Tests de non-régression — VÉRIFICATION FINALE NOTIFICATIONS (cold start) + CHANTIER NAVIGATION
// NOTIFICATION PENSÉES V2. Couvre les deux petits mécanismes purs ajoutés dans
// notificationPlanning.ts : déduplication par identifiant (consumeNotificationResponseOnce) et file
// d'attente d'une action jusqu'à ce que la navigation/le store soient prêts (createPendingOnce), et
// désormais aussi la résolution complète de la destination d'un tap sur une notification de pensée
// (resolveNotificationAction + navigateToAttention) : existante, sans date, supprimée entre-temps,
// et le scénario cold start bout en bout. `notifications.ts` lui-même
// (registerNotificationTapHandler) ne peut pas être chargé sous ts-node dans cet environnement
// (dépendance transitive à `expo`, déjà constaté lors du chantier précédent) — les mécanismes/
// fonctions qu'il orchestre sont donc testés directement, à l'identique de leur usage réel. Lecture
// seule. Assertions dures : lève une exception (code de sortie non-nul) si une régression est
// détectée.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-notification-tap.ts

import { Pensee } from '../src/data/types';
import { consumeNotificationResponseOnce, createPendingOnce, resolveNotificationAction } from '../src/lib/notificationPlanning';
import { navigateToAttention } from '../src/data/homeAttention';

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    texte: 'Une pensée',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    ...overrides,
  };
}

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

// --- CHANTIER NAVIGATION NOTIFICATION PENSÉES V2 ------------------------------------------------
// Tap sur une notification de pensée → PenseeDetailScreen (plus le Calendrier, qui n'est plus une
// destination fiable depuis qu'une pensée peut n'avoir aucune date/période, voir Pensee.reminderAt).

// --- 4. Pensée existante (avec date) → détail de la pensée --------------------------------------
{
  console.log('\n[4] Pensée existante (avec date) → action pensee-detail, PAS calendar');
  const p = makePensee({ id: 'p-avec-date', date: '2026-03-01', reminderAt: new Date(2026, 2, 1, 9, 0, 0).toISOString() });
  const action = resolveNotificationAction({ kind: 'pensee', penseeId: 'p-avec-date' }, [], [p], new Date(2026, 0, 1));
  check('action = pensee-detail', action?.kind === 'pensee-detail', JSON.stringify(action));
  check('penseeId correct', (action as any)?.penseeId === 'p-avec-date', JSON.stringify(action));

  const calls: { name: string; params?: object }[] = [];
  const navigate = (name: string, params?: object) => calls.push({ name, params });
  navigateToAttention(navigate, action!);
  check('navigue vers PenseeDetail avec le bon penseeId (pas Tabs/Calendrier)', calls.length === 1 && calls[0].name === 'PenseeDetail', JSON.stringify(calls));
  check('params corrects', JSON.stringify(calls[0].params) === JSON.stringify({ penseeId: 'p-avec-date' }), JSON.stringify(calls[0].params));
}

// --- 5. Pensée existante SANS aucune date (note générique) → détail de la pensée aussi ------------
{
  console.log('\n[5] Pensée sans date ni période (note générique) → même destination : action pensee-detail');
  const p = makePensee({ id: 'p-sans-date', date: null, endDate: null, reminderAt: new Date(2026, 0, 2, 9, 0, 0).toISOString() });
  const action = resolveNotificationAction({ kind: 'pensee', penseeId: 'p-sans-date' }, [], [p], new Date(2026, 0, 1));
  check('action = pensee-detail même sans date/endDate sur la pensée', action?.kind === 'pensee-detail', JSON.stringify(action));
  check('penseeId correct', (action as any)?.penseeId === 'p-sans-date', JSON.stringify(action));
}

// --- 6. Pensée supprimée avant le tap → fallback sûr, jamais de crash/écran vide -------------------
{
  console.log('\n[6] Pensée supprimée entre la programmation et le tap → aucune navigation (fallback sûr)');
  const action = resolveNotificationAction({ kind: 'pensee', penseeId: 'p-disparue' }, [], [], new Date(2026, 0, 1));
  check('aucune action résolue (pas de navigation vers une pensée qui n’existe plus)', action === null);

  const calls: { name: string; params?: object }[] = [];
  const navigate = (name: string, params?: object) => calls.push({ name, params });
  if (action) navigateToAttention(navigate, action);
  check('navigateToAttention jamais appelée dans ce cas (comportement de l’appelant réel, voir notifications.ts)', calls.length === 0);
}

// --- 7. Cold start : même résolution qu’à chaud, une fois store/navigation prêts -----------------
{
  console.log('\n[7] Cold start (app fermée → tap → boot → store pas prêt → puis prêt) → même destination pensee-detail');
  const pending = createPendingOnce<unknown>();
  const handled = new Set<string>();
  const penseesAtBoot: Pensee[] = []; // store pas encore chargé au moment du tap
  const penseesLive: Pensee[] = [makePensee({ id: 'p-cold-start', date: null, reminderAt: new Date(2026, 0, 2, 9, 0, 0).toISOString() })];

  const responseIdentifier = 'boot-notification-pensee';
  check('réponse de démarrage acceptée (première fois)', consumeNotificationResponseOnce(responseIdentifier, handled) === true);
  pending.set({ kind: 'pensee', penseeId: 'p-cold-start' });

  let storeReady = false;
  const isReady = () => storeReady;

  const tooEarly = pending.consumeIfReady(isReady);
  check('rien résolu tant que le store n’est pas prêt', tooEarly === undefined && pending.hasPending() === true);

  // Le store finit de charger — SEULEMENT MAINTENANT les pensées réelles sont disponibles : la
  // résolution doit utiliser get PENSÉES LIVE (penseesLive), jamais l'état vide figé au moment du tap.
  storeReady = true;
  const data = pending.consumeIfReady(isReady);
  const action = resolveNotificationAction(data, [], penseesLive, new Date(2026, 0, 1));
  check('action résolue avec les données LIVE (pas l’état vide du boot)', action?.kind === 'pensee-detail' && (action as any).penseeId === 'p-cold-start', JSON.stringify(action));

  const calls: { name: string; params?: object }[] = [];
  const navigate = (name: string, params?: object) => calls.push({ name, params });
  navigateToAttention(navigate, action!);
  check('même destination qu’à chaud : PenseeDetail avec le bon penseeId', calls.length === 1 && calls[0].name === 'PenseeDetail' && JSON.stringify(calls[0].params) === JSON.stringify({ penseeId: 'p-cold-start' }), JSON.stringify(calls));

  check('la même réponse ne sera pas retraitée à un lancement normal ultérieur', consumeNotificationResponseOnce(responseIdentifier, handled) === false);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
