/// <reference types="node" />
// Tests de non-régression — CHANTIER CAPTURE, EVENT TIME incrément 3 (2026-09-18) : persistance de
// `Pensee.eventTime` de bout en bout (Capture Review → cache local → outbox → mapping Supabase →
// édition). Logique PURE (calendar.ts, captureReview.ts, outbox.ts) réellement exécutée ; les
// fichiers dépendant de react-native/Supabase (supabaseRepo.ts, PenseeDetailScreen.tsx) sont vérifiés
// par lecture de source pour le câblage, combinée à une réimplémentation fidèle (vérifiée mot pour
// mot contre la source réelle) pour la logique elle-même — même méthode que le reste de ce projet
// (voir test-regression-delete-idempotence.ts, test-regression-capture-reminder-picker-seed-confirm.ts).
//
// Usage : npx tsx scripts/test-regression-capture-event-time-persistence.ts

import * as fs from 'fs';
import * as path from 'path';
import { Pensee } from '../src/data/types';
import { normalizeEventTime, normalizePensee, postgresTimeToEventTime } from '../src/data/calendar';
import { CaptureResult } from '../src/data/captureTypes';
import { ContactMatchResult } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';
import { buildInitialCards, buildPenseeFromCard, CaptureCard, DEFAULT_RECURRENCE_DRAFT } from '../src/data/captureReview';
import { Outbox, enqueueUpsertPensee, applyPendingToPensees } from '../src/data/outbox';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

console.log('\n[§A — calendar.ts] normalizeEventTime — format canonique strict "HH:mm"');
{
  check('heure valide "20:30" → conservée', normalizeEventTime('20:30') === '20:30');
  check('heure valide "07:12" (zéro non significatif) → conservée', normalizeEventTime('07:12') === '07:12');
  check('absent (undefined) → null', normalizeEventTime(undefined) === null);
  check('null explicite → null', normalizeEventTime(null) === null);
  check('format invalide "20h30" → null, jamais "corrigée"', normalizeEventTime('20h30') === null);
  check('heure hors bornes "24:00" → null', normalizeEventTime('24:00') === null);
  check('minutes hors bornes "10:60" → null', normalizeEventTime('10:60') === null);
  check('déjà tronqué avec secondes "20:30:00" → null (REJETÉ, pas adapté — voir §B pour l’adaptation)', normalizeEventTime('20:30:00') === null);
  check('type non-string (nombre) → null', normalizeEventTime(2030 as unknown) === null);
}

console.log('\n[§B — calendar.ts] postgresTimeToEventTime — adaptation du format PostgREST "HH:mm:ss" → "HH:mm"');
{
  check('"20:30:00" → "20:30"', postgresTimeToEventTime('20:30:00') === '20:30');
  check('"07:12:00" → "07:12"', postgresTimeToEventTime('07:12:00') === '07:12');
  check('avec microsecondes "20:30:00.123456" → "20:30"', postgresTimeToEventTime('20:30:00.123456') === '20:30');
  check('null (colonne NULL) → null', postgresTimeToEventTime(null) === null);
  check('undefined (colonne absente, migration pas encore appliquée) → null', postgresTimeToEventTime(undefined) === null);
  check('chaîne vide → null', postgresTimeToEventTime('') === null);
  check('format totalement invalide → null, jamais une heure inventée', postgresTimeToEventTime('pas une heure') === null);
}

console.log('\n[§C — calendar.ts] normalizePensee — round-trip cache local / legacy');
{
  const base = { id: 'p1', texte: 'x', contactId: null, createdAt: '2026-01-01T00:00:00.000Z', date: '2026-09-20', reminderAt: null };
  check('eventTime valide préservé', normalizePensee({ ...base, eventTime: '20:30' }).eventTime === '20:30');
  check('eventTime absent (pensée créée avant cet incrément) → null, aucun crash', normalizePensee(base).eventTime === null);
  check('eventTime null explicite → null', normalizePensee({ ...base, eventTime: null }).eventTime === null);
  check('eventTime invalide en cache (corruption) → null, jamais "réparé" en une autre heure', normalizePensee({ ...base, eventTime: 'invalide' }).eventTime === null);

  // Round-trip JSON réel (AsyncStorage sérialise/désérialise littéralement, voir store.tsx).
  const pensee: Pensee = { ...base, eventTime: '20:30' };
  const roundTripped = normalizePensee(JSON.parse(JSON.stringify(pensee)));
  check('round-trip JSON.stringify/parse préserve eventTime à l’identique', roundTripped.eventTime === '20:30');

  // "Round-trip Supabase mapping" — composition PURE exacte utilisée par rowToPensee (supabaseRepo.ts,
  // vérifié par lecture de source en §F) : ligne Postgres "HH:mm:ss" → adaptation → normalisation.
  const fakeRow = { ...base, eventTime: postgresTimeToEventTime('20:30:00') };
  check('round-trip "row Postgres → Pensee" : "20:30:00" survit en "20:30"', normalizePensee(fakeRow).eventTime === '20:30');
  const fakeRowNull = { ...base, eventTime: postgresTimeToEventTime(null) };
  check('round-trip "row Postgres → Pensee" : colonne NULL → eventTime null', normalizePensee(fakeRowNull).eventTime === null);
}

console.log('\n[§D — captureReview.ts] Capture → CaptureCard → Pensee : transfert event.time, jamais de confusion avec reminder.time');
{
  const noMatch = (): ContactMatchResult => ({ kind: 'none' });
  const NO_CONTACTS: Contact[] = [];
  function makeResult(event: { hasDate: boolean; date: string | null; time: string | null; heardExpression: string | null; confidence: number }, reminder: {
    hasReminder: boolean; date: string | null; time: string | null; heardExpression: string | null; confidence: number;
  }): CaptureResult {
    return {
      transcript: 'x',
      pensees: [
        {
          texte: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand',
          heardContactName: null,
          event,
          reminder: { ...reminder, recurrence: null },
          confidence: 0.9,
        },
      ],
      parseError: null,
    };
  }

  {
    const result = makeResult(
      { hasDate: true, date: '2027-02-10', time: '20:30', heardExpression: 'le 10 février 2027 à 20h30', confidence: 0.95 },
      { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 0 },
    );
    const [card] = buildInitialCards(result, noMatch, NO_CONTACTS);
    check('event 20:30 → eventHint.time alimenté', card.eventHint?.time === '20:30');
    const pensee = buildPenseeFromCard(card);
    check('Capture event 20:30 → Pensee.eventTime = "20:30"', pensee.eventTime === '20:30');
    check('Pensee.date = "2027-02-10" (indépendant, inchangé)', pensee.date === '2027-02-10');
    check('reminderAt reste null (aucun rappel demandé)', pensee.reminderAt === null);
  }

  {
    const result = makeResult(
      { hasDate: true, date: '2026-09-18', time: null, heardExpression: 'vendredi', confidence: 0.9 },
      { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 0 },
    );
    const [card] = buildInitialCards(result, noMatch, NO_CONTACTS);
    check('event sans heure → eventHint.time = null', card.eventHint?.time === null);
    const pensee = buildPenseeFromCard(card);
    check('event sans heure → Pensee.eventTime = null (jamais inventée)', pensee.eventTime === null);
  }

  {
    // reminder 18:00 + event 20:00 — cas critique : aucune confusion entre les deux heures.
    const result = makeResult(
      { hasDate: true, date: '2026-09-18', time: '20:00', heardExpression: 'vendredi à 20h', confidence: 0.9 },
      { hasReminder: true, date: '2026-09-17', time: '18:00', heardExpression: 'la veille à 18h', confidence: 0.9 },
    );
    const [card] = buildInitialCards(result, noMatch, NO_CONTACTS);
    card.reminderEnabled = true; // needsReview/isCardValid non impliqués ici, on vérifie uniquement buildPenseeFromCard
    const pensee = buildPenseeFromCard(card);
    check('event.time (20:00) devient Pensee.eventTime, jamais reminderAt', pensee.eventTime === '20:00');
    check('reminder.time (18:00) devient l’heure de reminderAt (18:00 local), jamais eventTime', pensee.reminderAt !== null && new Date(pensee.reminderAt as string).getHours() === 18);
    check('les deux heures restent distinctes dans l’objet final', pensee.eventTime !== (pensee.reminderAt ? new Date(pensee.reminderAt).getHours() + ':00' : null));
  }

  {
    // Aucun événement du tout (pensée sans date) → eventHint null, eventTime null.
    const result = makeResult(
      { hasDate: false, date: null, time: null, heardExpression: null, confidence: 0.9 },
      { hasReminder: true, date: '2026-09-19', time: '18:00', heardExpression: 'demain à 18h', confidence: 0.95 },
    );
    const [card] = buildInitialCards(result, noMatch, NO_CONTACTS);
    check('aucun événement → eventHint null', card.eventHint === null);
    const pensee = buildPenseeFromCard(card);
    check('aucun événement → Pensee.eventTime = null', pensee.eventTime === null);
  }
}

console.log('\n[§E — captureReview.ts] carte de repli (parseError) — eventHint null, eventTime null, non-régression');
{
  const noMatch = (): ContactMatchResult => ({ kind: 'none' });
  const result: CaptureResult = { transcript: 'brut', pensees: [], parseError: 'test' };
  const [card] = buildInitialCards(result, noMatch, []);
  check('carte de repli : eventHint null', card.eventHint === null);
  const pensee = buildPenseeFromCard(card);
  check('carte de repli : Pensee.eventTime = null', pensee.eventTime === null);
}

console.log('\n[§F — supabaseRepo.ts] câblage event_time — lecture de source (RN/Supabase non chargeable sous tsx)');
{
  const repoSrc = readSrc('src', 'lib', 'supabaseRepo.ts');
  check('rowToPensee utilise postgresTimeToEventTime (adaptation "HH:mm:ss" → "HH:mm") avant normalizePensee', repoSrc.includes('eventTime: postgresTimeToEventTime(row.event_time)'));
  check('postgresTimeToEventTime importé depuis calendar.ts (réutilise la même fonction pure testée en §B)', /import\s*\{[^}]*postgresTimeToEventTime[^}]*\}\s*from\s*'\.\.\/data\/calendar'/.test(repoSrc));
  check('insertPenseeRemote envoie event_time (format client "HH:mm" direct, Postgres l’accepte tel quel)', /insertPenseeRemote[\s\S]{0,1200}event_time:\s*pensee\.eventTime\s*\?\?\s*null/.test(repoSrc));
  check('updatePenseeRemote envoie event_time', /updatePenseeRemote[\s\S]{0,1200}event_time:\s*pensee\.eventTime\s*\?\?\s*null/.test(repoSrc));
}

console.log('\n[§G — outbox.ts] création/modification offline avec eventTime — coalescing préserve la dernière valeur');
{
  const NOW = '2026-01-01T00:00:00.000Z';
  const basePensee: Pensee = { id: 'p1', texte: 'Concert', contactId: null, createdAt: NOW, date: '2027-02-10', reminderAt: null, eventTime: '20:30' };

  let outbox: Outbox = [];
  outbox = enqueueUpsertPensee(outbox, basePensee, true, 'op-1', NOW);
  check('création offline : eventTime présent dans le payload en attente', (outbox[0] as any).payload.eventTime === '20:30');

  // Modification offline AVANT toute confirmation réseau — la création reste "isNew:true" (voir
  // outbox.ts), mais le payload coalescé doit porter la DERNIÈRE valeur d’eventTime.
  const modified: Pensee = { ...basePensee, eventTime: '21:00' };
  outbox = enqueueUpsertPensee(outbox, modified, false, 'op-2', NOW);
  check('modification offline : un seul op coalescé (pas empilé)', outbox.length === 1);
  check('modification offline : eventTime mis à jour à la dernière valeur (21:00)', (outbox[0] as any).payload.eventTime === '21:00');
  check('modification offline : isNew reste true (création jamais confirmée)', (outbox[0] as any).isNew === true);
}

console.log('\n[§H — outbox.ts] merge remote/local (applyPendingToPensees) préserve eventTime en attente');
{
  const NOW = '2026-01-01T00:00:00.000Z';
  const remotePensees: Pensee[] = [{ id: 'p1', texte: 'Concert', contactId: null, createdAt: NOW, date: '2027-02-10', reminderAt: null, eventTime: null }];
  const localPending: Pensee = { ...remotePensees[0], eventTime: '20:30' };
  const outbox: Outbox = enqueueUpsertPensee([], localPending, false, 'op-1', NOW);

  const merged = applyPendingToPensees(remotePensees, outbox);
  check('merge remote/local : le payload local (avec eventTime) prévaut sur le remote pas encore confirmé (sans eventTime)', merged.find((p) => p.id === 'p1')?.eventTime === '20:30');

  // Coalescing outbox — une nouvelle création offline (jamais vue côté remote) doit aussi survivre.
  const brandNew: Pensee = { id: 'p2', texte: 'Train', contactId: null, createdAt: NOW, date: '2026-09-19', reminderAt: null, eventTime: '07:12' };
  const outbox2: Outbox = enqueueUpsertPensee(outbox, brandNew, true, 'op-2', NOW);
  const merged2 = applyPendingToPensees(remotePensees, outbox2);
  check('coalescing outbox : nouvelle pensée offline (jamais confirmée) apparaît avec son eventTime', merged2.find((p) => p.id === 'p2')?.eventTime === '07:12');
}

console.log('\n[§I — PenseeDetailScreen.tsx] eventTime — câblage de base (couverture approfondie dans test-regression-event-time-ui.ts, incrément 4)');
{
  const screenSrc = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  // CHANTIER CAPTURE EVENT TIME, incrément 4 (2026-09-18) — cet écran a désormais un véritable état
  // `eventTime` éditable (section "HEURE (FACULTATIF)") : "updated" reflète cet état, plus un repli
  // silencieux sur `existing.eventTime` (l'ancien comportement, incrément 3, avant que ce champ ne
  // soit éditable ici). Voir test-regression-event-time-ui.ts pour la couverture complète.
  check('"updated" utilise l’état eventTime (édition réelle), plus un simple repli sur existing', screenSrc.includes('eventTime: eventDate ? eventTime : null,'));
  check('state eventTime initialisé depuis existing.eventTime à l’ouverture (jamais réinventé)', /useState<string \| null>\(existing\?\.eventTime \?\? null\)/.test(screenSrc));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
