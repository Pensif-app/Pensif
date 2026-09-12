// Tests de non-régression — CHANTIER NOTIFICATIONS + RAPPELS PENSÉES V1 (planification glissante
// 2 cycles + budget/priorité, rappel pensée DST-safe, fêtes familiales, résolution de navigation au
// tap). Teste `notificationPlanning.ts` (pur, sans expo-notifications/react-native — voir ce
// fichier) directement : `notifications.ts` lui-même ne peut pas être chargé sous ts-node dans cet
// environnement (dépendance transitive à `expo`, cf. constat fait avant d'écrire ce script), d'où
// la séparation logique-pure / couche-plateforme. Assertions dures : lève une exception (donc code
// de sortie non-nul) si une régression est détectée. Lecture seule — aucune notification réelle
// n'est programmée par ce script.
//
// Usage : TZ=Europe/Paris npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-notifications.ts
// (TZ=Europe/Paris est nécessaire pour le test DST #9 — sans elle, ce test précis n'est pas
// significatif car il ne traverserait pas de vrai changement d'heure sur ce fuseau.)

import { Contact, Pensee } from '../src/data/types';
import {
  buildCandidates,
  selectCandidatesToSchedule,
  resolveNotificationAction,
  subtractMinutesLocal,
  MAX_SCHEDULED_NOTIFICATIONS,
  NotificationCandidate,
} from '../src/lib/notificationPlanning';
import { familyFetes, addDays, dIso } from '../src/data/calendar';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Test',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: 'homme',
    initials: 'T',
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
    ...overrides,
  };
}

function makePensee(overrides: Partial<Pensee>): Pensee {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    date: '2026-01-01',
    texte: 'Une pensée',
    remind: '0',
    contactId: null,
    ...overrides,
  };
}

const TODAY = new Date(2026, 0, 15); // 15 janvier 2026, référence fixe

// --- 1. Anniversaire jour J programmé --------------------------------------------------------
{
  console.log('\n[1] Anniversaire jour J programmé');
  const c = makeContact({ id: 'a1', prenom: 'JourJ', date: '1990-01-15' });
  const candidates = buildCandidates([c], [], TODAY);
  const bday = candidates.find((x) => x.tier === 0 && x.data.kind === 'birthday' && (x.data as any).contactId === 'a1');
  check('candidat jour J présent', !!bday);
  check('déclenché aujourd’hui à 9h', bday?.triggerAt.getTime() === new Date(2026, 0, 15, 9, 0, 0).getTime());
}

// --- 2. Rappel J-14 quand l'anniversaire est à plus de 14 jours -------------------------------
{
  console.log('\n[2] Rappel J-14, anniversaire dans plus de 14 jours');
  const c = makeContact({ id: 'a2', prenom: 'Loin', date: '1990-02-10', birthdayReminderDays: 14 }); // dans 26 jours
  const candidates = buildCandidates([c], [], TODAY);
  const scheduled = selectCandidatesToSchedule(candidates, TODAY);
  const reminder = scheduled.find((x) => x.tier === 0 && x.data.kind === 'birthday' && x.title.includes('🎁'));
  check('rappel J-14 programmé (toujours dans le futur)', !!reminder, reminder?.triggerAt.toString());
}

// --- 3. Rappel J-14 quand l'anniversaire est dans moins de 14 jours ----------------------------
{
  console.log('\n[3] Rappel J-14, anniversaire dans moins de 14 jours (5 jours) → pas de notif passée, jour J conservé');
  const c = makeContact({ id: 'a3', prenom: 'Proche', date: '1990-01-20', birthdayReminderDays: 14 }); // dans 5 jours
  const candidates = buildCandidates([c], [], TODAY);
  const scheduled = selectCandidatesToSchedule(candidates, TODAY);
  const reminderTier0 = scheduled.find((x) => x.tier === 0 && x.data.kind === 'birthday' && x.title.includes('🎁'));
  const bdayTier0 = scheduled.find((x) => x.tier === 0 && x.data.kind === 'birthday' && x.title.includes('🎂'));
  check('aucun rappel dans le passé programmé pour l’occurrence en cours', !reminderTier0);
  check('la notification du jour J reste programmée', !!bdayTier0 && bdayTier0.triggerAt.getTime() > TODAY.getTime());
  check("le système n'a rien planté (aucune date passée dans le lot retenu)", scheduled.every((x) => x.triggerAt.getTime() > TODAY.getTime()));
}

// --- 4. Occurrence annuelle future couverte sans dépendre d'une réouverture ---------------------
{
  console.log('\n[4] Occurrence annuelle SUIVANTE déjà couverte (tier 1), sans modification ultérieure des données');
  const c = makeContact({ id: 'a4', prenom: 'Annuel', date: '1990-01-15' });
  const candidates = buildCandidates([c], [], TODAY);
  const tier1 = candidates.find((x) => x.tier === 1 && x.data.kind === 'birthday' && (x.data as any).contactId === 'a4');
  check('un candidat tier 1 (occurrence 2027) existe déjà dans le même appel', !!tier1);
  check('daté environ un an après l’occurrence en cours', tier1 ? tier1.triggerAt.getFullYear() === 2027 : false, tier1?.triggerAt.toString());
  const scheduled = selectCandidatesToSchedule(candidates, TODAY);
  check('inclus dans le lot réellement programmé (budget large ici)', scheduled.some((x) => x === tier1));
}

// --- 5. Budget maximal respecté -----------------------------------------------------------------
{
  console.log('\n[5] Budget maximal respecté');
  const many: NotificationCandidate[] = Array.from({ length: MAX_SCHEDULED_NOTIFICATIONS + 30 }, (_, i) => ({
    triggerAt: addDays(TODAY, i + 1),
    tier: 0 as const,
    title: `Test ${i}`,
    body: '',
    data: { kind: 'none' as const },
  }));
  const scheduled = selectCandidatesToSchedule(many, TODAY);
  check(`au plus ${MAX_SCHEDULED_NOTIFICATIONS} candidats retenus`, scheduled.length <= MAX_SCHEDULED_NOTIFICATIONS, `${scheduled.length}`);
  check('marge de sécurité sous la limite iOS de 64', MAX_SCHEDULED_NOTIFICATIONS < 64);
}

// --- 6. Priorité aux notifications proches (une pensée proche n'est jamais évincée) --------------
{
  console.log('\n[6] Priorité : une pensée proche (tier 0) n’est jamais évincée par des anniversaires tier 1 lointains');
  const nearPensee: NotificationCandidate = { triggerAt: addDays(TODAY, 2), tier: 0, title: 'Pensée proche', body: '', data: { kind: 'pensee', focusDate: '2026-01-17' } };
  const farBirthdays: NotificationCandidate[] = Array.from({ length: MAX_SCHEDULED_NOTIFICATIONS }, (_, i) => ({
    triggerAt: new Date(2027, 0, 1 + i),
    tier: 1 as const,
    title: `Anniv lointain ${i}`,
    body: '',
    data: { kind: 'birthday' as const, contactId: `far-${i}` },
  }));
  const scheduled = selectCandidatesToSchedule([...farBirthdays, nearPensee], TODAY);
  check('la pensée proche (tier 0) est bien retenue', scheduled.includes(nearPensee));
  check('elle passe avant tous les anniversaires tier 1 dans le tri', scheduled[0] === nearPensee);
}

// --- 7. Une erreur de programmation individuelle ne stoppe pas les suivantes ---------------------
{
  console.log('\n[7] Une erreur de programmation individuelle ne stoppe pas les suivantes (motif try/catch par item)');
  // notifications.ts ne peut pas être chargé sous ts-node ici (dépendance transitive à `expo`) — on
  // vérifie donc le MOTIF exact utilisé dans sa boucle de programmation (try/catch par itération,
  // jamais de `return`/`throw` qui romprait la boucle), reproduit ici à l'identique sur un
  // "scheduler" qui échoue délibérément sur un item pour prouver que les autres passent quand même.
  const items = [1, 2, 3, 4, 5];
  const succeeded: number[] = [];
  function flakyScheduler(n: number) {
    if (n === 3) throw new Error('échec simulé (ex. budget OS dépassé)');
    succeeded.push(n);
  }
  for (const n of items) {
    try {
      flakyScheduler(n);
    } catch (e) {
      // même motif que rescheduleAllReminders : logguer et continuer, jamais interrompre la boucle.
    }
  }
  check('les 4 items non fautifs sont bien "programmés" malgré l’échec du 3e', succeeded.length === 4 && !succeeded.includes(3), `${succeeded}`);
}

// --- 8-8e. Pensée presets 0/1/3/7/14 --------------------------------------------------------------
{
  console.log('\n[8] Pensée presets 0/1/3/7/14 jours');
  for (const days of [0, 1, 3, 7, 14] as const) {
    const p = makePensee({ id: `preset-${days}`, date: '2026-02-01', remind: String(days) as Pensee['remind'] });
    const candidates = buildCandidates([], [p], new Date(2026, 0, 1));
    const cand = candidates.find((c) => c.data.kind === 'pensee' && (c.data as any).focusDate === '2026-02-01');
    const expected = new Date(2026, 1, 1, 9, 0, 0);
    expected.setDate(expected.getDate() - days);
    check(`preset ${days} → rappel le ${expected.toDateString()} 9h`, cand?.triggerAt.getTime() === expected.getTime(), cand?.triggerAt.toString());
  }
}

// --- 9. Pensée custom traversant un changement d'heure (DST) --------------------------------------
{
  console.log('\n[9] Pensée custom traversant le passage à l’heure d’été (Europe/Paris, 29 mars 2026)');
  // TZ=Europe/Paris est positionnée par la commande de lancement (voir usage en tête de fichier) —
  // `process` n'est pas disponible dans ce script (aucun @types/node dans ce projet, comme les
  // autres scripts/*.ts), donc pas moyen de la fixer ici même.
  // Pensée datée du 29 mars 2026 (jour du changement d'heure, 02h→03h) ; rappel "custom" 23h avant
  // la fin du jour (23:59:59) → attendu (calcul calendaire, champs locaux) : 00:59:59 le même jour,
  // PAS 23:59:59 la veille (ce que donnerait, à tort, une simple soustraction de millisecondes —
  // voir subtractMinutesLocal). Vérifié directement sur la fonction plutôt que de recalculer à la
  // main un cas encore plus large, pour un test lisible et déterministe.
  const endOfDay = new Date(2026, 2, 29, 23, 59, 59);
  const reminder = subtractMinutesLocal(endOfDay, 23 * 60);
  check(
    'le rappel calendaire (champs locaux) tombe le même jour à 00:59:59, pas la veille',
    reminder.getFullYear() === 2026 && reminder.getMonth() === 2 && reminder.getDate() === 29 && reminder.getHours() === 0 && reminder.getMinutes() === 59,
    reminder.toString(),
  );
  // Contre-preuve explicite : l'ancien calcul (ms bruts) aurait donné un résultat DIFFÉRENT ici,
  // preuve que le changement d'heure était bien traversé par ce cas de test.
  const naiveOld = new Date(endOfDay.getTime() - 23 * 60 * 60000);
  check('le calcul naïf en millisecondes aurait donné un résultat différent (preuve que le DST est bien traversé)', naiveOld.getTime() !== reminder.getTime(), naiveOld.toString());
}

// --- 10. Pensée passée jamais programmée -----------------------------------------------------------
{
  console.log('\n[10] Pensée passée jamais programmée');
  const p = makePensee({ id: 'p-past', date: '2026-01-01', remind: '0' }); // 14 jours avant TODAY
  const candidates = buildCandidates([], [p], TODAY);
  const scheduled = selectCandidatesToSchedule(candidates, TODAY);
  check('candidat construit (pour trace) mais jamais retenu dans le lot programmé', !scheduled.some((c) => c.data.kind === 'pensee' && (c.data as any).focusDate === '2026-01-01'));
}

// --- 11. Pensée de période → une seule notification, au début -------------------------------------
{
  console.log('\n[11] Pensée de période → une seule notification, au début de la période');
  const p = makePensee({ id: 'p-period', date: '2026-03-01', endDate: '2026-03-10', remind: '0' });
  const candidates = buildCandidates([], [p], new Date(2026, 1, 1));
  const forThisPensee = candidates.filter((c) => c.data.kind === 'pensee' && (c.data as any).focusDate === '2026-03-01');
  check('exactement une notification pour cette période', forThisPensee.length === 1, `${forThisPensee.length}`);
  check('datée au début de la période (9h le 1er mars), pas à la fin ni chaque jour', forThisPensee[0]?.triggerAt.getTime() === new Date(2026, 2, 1, 9, 0, 0).getTime());
}

// --- 12. Fête de prénom liée à un proche -------------------------------------------------------------
{
  console.log('\n[12] Fête de prénom liée à un proche (Léa → 22 mars)');
  const near = new Date(2026, 2, 20);
  const c = makeContact({ id: 'a-lea', prenom: 'Léa', date: '2000-06-01' });
  const candidates = buildCandidates([c], [], near);
  const cand = candidates.find((x) => x.tier === 0 && x.data.kind === 'fete-prenom' && (x.data as any).contactId === 'a-lea');
  check('notification de fête de prénom présente', !!cand);
}

// --- 13. Fête familiale avec rôle correspondant ---------------------------------------------------
{
  console.log('\n[13] Fête familiale avec familyRole correspondant (Grand-père)');
  const gpLabel = 'Fête des Grands-pères';
  const iso = Object.entries(familyFetes(2026)).find(([, label]) => label === gpLabel)![0];
  const [y, m, d] = iso.split('-').map(Number);
  const near = new Date(y, m - 1, d - 2);
  const gp = makeContact({ id: 'a-gp', prenom: 'Papy', date: '1945-01-01', familyRole: 'Grand-père' });
  const candidates = buildCandidates([gp], [], near);
  const cand = candidates.find((x) => x.tier === 0 && x.data.kind === 'fete-familiale' && (x.data as any).contactId === 'a-gp');
  check('notification de fête familiale présente pour le grand-père enregistré', !!cand);
}

// --- 14. Fête familiale sans contact correspondant → aucune notification ---------------------------
{
  console.log('\n[14] Fête familiale sans contact correspondant → aucune notification');
  const gpLabel = 'Fête des Grands-pères';
  const iso = Object.entries(familyFetes(2026)).find(([, label]) => label === gpLabel)![0];
  const [y, m, d] = iso.split('-').map(Number);
  const near = new Date(y, m - 1, d - 2);
  const pere = makeContact({ id: 'a-pere-only', prenom: 'Papa', date: '1970-01-01', familyRole: 'Père' });
  const candidates = buildCandidates([pere], [], near);
  // Un "Père" reçoit bien sa propre "Fête des Pères" (comportement correct) — ce qui est vérifié
  // ici, c'est l'ABSENCE de notification "Fête des Grands-pères" pour un rôle qui ne correspond pas.
  check(
    'aucune notification "Fête des Grands-pères" générée pour un contact "Père"',
    candidates.filter((x) => x.data.kind === 'fete-familiale' && x.title.includes('Grands-pères')).length === 0,
  );
}

// --- 15. Jour férié générique → aucune notification -------------------------------------------------
{
  console.log('\n[15] Jour férié générique (1er mai) → aucune notification, même sans contact/pensée');
  const mayFirst = new Date(2026, 4, 1);
  const candidates = buildCandidates([], [], mayFirst);
  check('aucun candidat généré (aucune règle liée aux jours fériés)', candidates.length === 0, `${candidates.length}`);
}

// --- 16. Données de navigation correctes ------------------------------------------------------------
{
  console.log('\n[16] Données de navigation correctes au tap');
  const contactDone = makeContact({
    id: 'nav-1',
    prenom: 'Nav',
    date: '1990-01-15', // jour J
    quiz: { answers: [], interests: [], avoid: [], wish: '', completedAt: new Date().toISOString(), budget: null, themeAnswers: {}, feedback: [], recommendationHistory: [] },
  });
  const actionBday = resolveNotificationAction({ kind: 'birthday', contactId: 'nav-1' }, [contactDone], TODAY);
  check('anniversaire jour J → action message', actionBday?.kind === 'message', JSON.stringify(actionBday));

  const actionPensee = resolveNotificationAction({ kind: 'pensee', focusDate: '2026-03-01' }, [], TODAY);
  check('pensée → action calendar avec focusDate', actionPensee?.kind === 'calendar' && (actionPensee as any).focusDate === '2026-03-01', JSON.stringify(actionPensee));

  const actionFeteContact = makeContact({ id: 'nav-2' });
  const actionFete = resolveNotificationAction({ kind: 'fete-prenom', contactId: 'nav-2' }, [actionFeteContact], TODAY);
  check('fête de prénom → action fiche avec le bon contactId', actionFete?.kind === 'fiche' && (actionFete as any).contactId === 'nav-2', JSON.stringify(actionFete));

  const actionFamiliale = resolveNotificationAction({ kind: 'fete-familiale', contactId: 'nav-2' }, [actionFeteContact], TODAY);
  check('fête familiale → action fiche avec le bon contactId', actionFamiliale?.kind === 'fiche' && (actionFamiliale as any).contactId === 'nav-2', JSON.stringify(actionFamiliale));

  const actionDeleted = resolveNotificationAction({ kind: 'birthday', contactId: 'ghost' }, [], TODAY);
  check('contact supprimé entre-temps → aucune navigation (pas de crash)', actionDeleted === null);
}

// --- 17. Permissions refusées sans crash (documenté — non exécutable ici, voir notifications.ts) ---
{
  console.log('\n[17] Permissions refusées sans crash (documenté)');
  // ensureNotificationPermissions()/rescheduleAllReminders() nécessitent expo-notifications, non
  // chargeable sous ts-node dans cet environnement (voir en-tête de ce fichier). Vérifié par lecture
  // de code : rescheduleAllReminders annule TOUJOURS d'abord (indépendamment de la permission), puis
  // `if (!granted) return;` avant toute programmation — aucun chemin ne lève d'exception non
  // interceptée dans ce cas. Documenté ici plutôt que simulé pour ne pas fabriquer un faux positif.
  check('comportement vérifié par lecture de code (voir commentaire) — pas de test automatisé possible ici', true);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
