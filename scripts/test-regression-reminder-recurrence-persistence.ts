/// <reference types="node" />
// Tests de non-régression — CORRECTIF persistance `reminderRecurrence` (2026-09-18). L'audit précédent
// a confirmé le gap : `normalizePensee` perdait silencieusement `reminderRecurrence` à chaque lecture
// du cache local, et Supabase n'avait ni colonne ni mapping. Ce fichier vérifie le correctif : module
// `dateLocal.ts` (extraction sans dépendance circulaire), `normalizePensee` devenu point unique de
// normalisation, mapping Supabase symétrique (source lu par lecture, RN non chargeable sous tsx —
// même méthode que test-regression-capture-event-time-persistence.ts), et le scénario de régression
// principal (création offline → kill/restart offline → reconnexion → drain → kill/restart remote
// autoritaire → règle toujours identique).
//
// Usage : npx tsx scripts/test-regression-reminder-recurrence-persistence.ts

import * as fs from 'fs';
import * as path from 'path';
import { Pensee, ReminderRecurrence } from '../src/data/types';
import { normalizePensee } from '../src/data/calendar';
import { normalizeReminderRecurrence } from '../src/data/reminderRecurrence';
import { addDays, isoOf } from '../src/data/dateLocal';
import { resolveBootData } from '../src/data/storeInit';
import { Outbox, enqueueUpsertPensee, applyPendingToPensees, drainOutbox, OutboxOp } from '../src/data/outbox';

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

const NOW = '2026-01-01T00:00:00.000Z';
const VALID_WEEKLY: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1, 2, 3, 4, 5], occurrenceCount: 5, untilDate: null };
const VALID_DAILY: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };

// §H utilise `await drainOutbox` — pas de top-level await sous cette config tsx/cjs, tout le corps
// du script est donc exécuté depuis cette fonction async, appelée tout en bas.
async function main() {

console.log('\n[§A — dateLocal.ts] extraction — aucune dépendance circulaire, sémantique identique');
{
  // Import direct déjà réussi si ce script s'exécute (sinon erreur de module au chargement) — ce
  // test vérifie en plus l'ABSENCE de cycle par lecture de source des 3 fichiers concernés.
  const dateLocalSrc = readSrc('src', 'data', 'dateLocal.ts');
  const calendarSrc = readSrc('src', 'data', 'calendar.ts');
  const recurrenceSrc = readSrc('src', 'data', 'reminderRecurrence.ts');
  check('dateLocal.ts ne dépend ni de calendar.ts ni de reminderRecurrence.ts', !/from '\.\/calendar'|from '\.\/reminderRecurrence'/.test(dateLocalSrc));
  check('reminderRecurrence.ts importe addDays/isoOf depuis dateLocal.ts (plus depuis calendar.ts)', /import \{ addDays, isoOf \} from '\.\/dateLocal'/.test(recurrenceSrc));
  check('reminderRecurrence.ts n’importe plus rien de calendar.ts', !/from '\.\/calendar'/.test(recurrenceSrc));
  check('calendar.ts réexporte addDays/isoOf depuis dateLocal.ts (compatibilité des consommateurs existants)', /export \{ addDays, isoOf \} from '\.\/dateLocal'/.test(calendarSrc));
  // CHANTIER "P0 Récurrence Phase 1" (2026-09-21) — regex assouplie pour tolérer d'autres imports
  // nommés sur la même ligne (ex. `nextPenseeReminderOccurrence`, ajouté par ce chantier) : ce test
  // vérifie l'ABSENCE DE CYCLE (calendar.ts importe bien depuis reminderRecurrence.ts, jamais
  // l'inverse), pas la liste exacte et figée des noms importés.
  check('calendar.ts importe normalizeReminderRecurrence depuis reminderRecurrence.ts', /import \{[^}]*\bnormalizeReminderRecurrence\b[^}]*\} from '\.\/reminderRecurrence'/.test(calendarSrc));

  // Sémantique inchangée — mêmes résultats qu'avant le déplacement.
  check('isoOf(dateLocal) produit le même format que l’ancien calendar.ts', isoOf(2027, 1, 10) === '2027-02-10');
  const d = addDays(new Date(2026, 8, 18), 3);
  check('addDays(dateLocal) inchangé (arithmétique locale)', d.getFullYear() === 2026 && d.getMonth() === 8 && d.getDate() === 21);
}

console.log('\n[§B — calendar.ts] normalizePensee — normalisation legacy de reminderRecurrence (réutilise normalizeReminderRecurrence STRICTEMENT)');
{
  const base = { id: 'p1', texte: 'x', contactId: null, createdAt: NOW, date: null, reminderAt: null };
  check('absent → null', normalizePensee(base).reminderRecurrence === null);
  check('null explicite → null', normalizePensee({ ...base, reminderRecurrence: null }).reminderRecurrence === null);
  check('JSON structurellement invalide (string au lieu d’objet) → null', normalizePensee({ ...base, reminderRecurrence: 'pas un objet' }).reminderRecurrence === null);
  check('fréquence invalide → null', normalizePensee({ ...base, reminderRecurrence: { frequency: 'monthly', daysOfWeek: [], occurrenceCount: null, untilDate: null } }).reminderRecurrence === null);
  check('daysOfWeek invalides (weekly vide) → null', normalizePensee({ ...base, reminderRecurrence: { frequency: 'weekly', daysOfWeek: [], occurrenceCount: null, untilDate: null } }).reminderRecurrence === null);
  check('daysOfWeek invalides (jour hors 0-6) → null', normalizePensee({ ...base, reminderRecurrence: { frequency: 'weekly', daysOfWeek: [7], occurrenceCount: null, untilDate: null } }).reminderRecurrence === null);
  check('occurrenceCount invalide (0) → null', normalizePensee({ ...base, reminderRecurrence: { ...VALID_WEEKLY, occurrenceCount: 0 } }).reminderRecurrence === null);
  check('occurrenceCount invalide (non-entier) → null', normalizePensee({ ...base, reminderRecurrence: { ...VALID_WEEKLY, occurrenceCount: 2.5 } }).reminderRecurrence === null);
  check('untilDate invalide (format) → null', normalizePensee({ ...base, reminderRecurrence: { ...VALID_DAILY, occurrenceCount: null, untilDate: '25/09/2026' } }).reminderRecurrence === null);
  check('untilDate invalide (calendaire inexistante) → null', normalizePensee({ ...base, reminderRecurrence: { ...VALID_DAILY, occurrenceCount: null, untilDate: '2026-02-30' } }).reminderRecurrence === null);

  const dailyResult = normalizePensee({ ...base, reminderRecurrence: VALID_DAILY });
  check('règle daily valide → préservée', JSON.stringify(dailyResult.reminderRecurrence) === JSON.stringify(VALID_DAILY));

  const weeklyResult = normalizePensee({ ...base, reminderRecurrence: VALID_WEEKLY });
  check('règle weekly valide (occurrenceCount inclus) → préservée', JSON.stringify(weeklyResult.reminderRecurrence) === JSON.stringify(VALID_WEEKLY));

  const untilDateRule: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1], occurrenceCount: null, untilDate: '2026-12-31' };
  check('règle avec untilDate valide → préservée', JSON.stringify(normalizePensee({ ...base, reminderRecurrence: untilDateRule }).reminderRecurrence) === JSON.stringify(untilDateRule));

  // Canonicalisation déjà garantie par normalizeReminderRecurrence lui-même (pas dupliquée ici).
  const unsorted: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [5, 1, 3] as number[], occurrenceCount: null, untilDate: null };
  const canon = normalizePensee({ ...base, reminderRecurrence: unsorted }).reminderRecurrence;
  check('daysOfWeek désordonnés → triés canoniquement (comportement existant de normalizeReminderRecurrence, non dupliqué)', JSON.stringify(canon?.daysOfWeek) === JSON.stringify([1, 3, 5]));
}

console.log('\n[§C — calendar.ts] round-trip cache local (JSON.stringify/parse) — reminderRecurrence survit désormais');
{
  const pensee: Pensee = { id: 'p1', texte: 'Rappels vitamines', contactId: null, createdAt: NOW, date: null, reminderAt: '2026-09-19T09:00:00.000Z', reminderRecurrence: VALID_WEEKLY };
  const roundTripped = normalizePensee(JSON.parse(JSON.stringify(pensee)));
  check('round-trip JSON.stringify/parse préserve reminderRecurrence (CORRIGÉ — perdu avant ce chantier)', JSON.stringify(roundTripped.reminderRecurrence) === JSON.stringify(VALID_WEEKLY));
}

console.log('\n[§D — supabaseRepo.ts] mapping event_recurrence — lecture de source (RN/Supabase non chargeable sous tsx)');
{
  const repoSrc = readSrc('src', 'lib', 'supabaseRepo.ts');
  check('rowToPensee lit row.reminder_recurrence tel quel (jsonb, aucun JSON.parse manuel)', /reminderRecurrence: row\.reminder_recurrence \?\? null/.test(repoSrc));
  check('insertPenseeRemote envoie reminder_recurrence', /insertPenseeRemote[\s\S]{0,1400}reminder_recurrence:\s*pensee\.reminderRecurrence\s*\?\?\s*null/.test(repoSrc));
  check('updatePenseeRemote envoie reminder_recurrence', /updatePenseeRemote[\s\S]{0,1400}reminder_recurrence:\s*pensee\.reminderRecurrence\s*\?\?\s*null/.test(repoSrc));
  check('aucun JSON.stringify manuel autour de reminder_recurrence (objet JS transmis tel quel à supabase-js)', !/JSON\.stringify\(pensee\.reminderRecurrence/.test(repoSrc));

  // Round-trip Supabase pur : row jsonb → Pensee → (ré)envoyée telle quelle.
  const fakeRow = { id: 'p1', texte: 'x', contact_id: null, created_at: NOW, date_evenement: null, reminder_at: null, reminder_recurrence: VALID_WEEKLY };
  const asPensee = normalizePensee({
    id: fakeRow.id, texte: fakeRow.texte, contactId: fakeRow.contact_id, createdAt: fakeRow.created_at,
    date: fakeRow.date_evenement, reminderAt: fakeRow.reminder_at, reminderRecurrence: fakeRow.reminder_recurrence ?? null,
  });
  check('round-trip "row Supabase (jsonb) → Pensee" préserve la règle', JSON.stringify(asPensee.reminderRecurrence) === JSON.stringify(VALID_WEEKLY));
  const fakeRowNull = { ...fakeRow, reminder_recurrence: null };
  check('round-trip "row Supabase (jsonb NULL) → Pensee" → null', normalizePensee({ ...fakeRowNull, contactId: null }).reminderRecurrence === null);
}

console.log('\n[§E — outbox.ts] offline create — reminderRecurrence transporté correctement (générique, non modifié)');
{
  const pensee: Pensee = { id: 'p1', texte: 'Vitamines', contactId: null, createdAt: NOW, date: null, reminderAt: '2026-09-19T09:00:00.000Z', reminderRecurrence: VALID_WEEKLY };
  let outbox: Outbox = enqueueUpsertPensee([], pensee, true, 'op-1', NOW);
  check('création offline : reminderRecurrence présent dans le payload en attente', JSON.stringify((outbox[0] as any).payload.reminderRecurrence) === JSON.stringify(VALID_WEEKLY));
}

console.log('\n[§F — outbox.ts] offline update d’une récurrence existante — coalescing préserve la dernière règle');
{
  const original: Pensee = { id: 'p1', texte: 'Vitamines', contactId: null, createdAt: NOW, date: null, reminderAt: '2026-09-19T09:00:00.000Z', reminderRecurrence: VALID_DAILY };
  let outbox: Outbox = enqueueUpsertPensee([], original, false, 'op-1', NOW);
  const modified: Pensee = { ...original, reminderRecurrence: VALID_WEEKLY };
  outbox = enqueueUpsertPensee(outbox, modified, false, 'op-2', NOW);
  check('un seul op coalescé', outbox.length === 1);
  check('modification offline de la règle : dernière valeur (weekly) préservée', JSON.stringify((outbox[0] as any).payload.reminderRecurrence) === JSON.stringify(VALID_WEEKLY));

  // Désactivation (récurrence retirée → reminderRecurrence undefined/absent, voir buildPenseeFromCard).
  const { reminderRecurrence, ...withoutRecurrence } = modified;
  outbox = enqueueUpsertPensee(outbox, withoutRecurrence as Pensee, false, 'op-3', NOW);
  check('désactivation offline de la récurrence : payload coalescé sans reminderRecurrence', !('reminderRecurrence' in (outbox[0] as any).payload));
}

console.log('\n[§G — outbox.ts] merge remote/local avec outbox pending — reminderRecurrence local prévaut sur le remote pas encore confirmé');
{
  const remotePensees: Pensee[] = [{ id: 'p1', texte: 'Vitamines', contactId: null, createdAt: NOW, date: null, reminderAt: null, reminderRecurrence: null }];
  const localPending: Pensee = { ...remotePensees[0], reminderAt: '2026-09-19T09:00:00.000Z', reminderRecurrence: VALID_WEEKLY };
  const outbox: Outbox = enqueueUpsertPensee([], localPending, false, 'op-1', NOW);
  const merged = applyPendingToPensees(remotePensees, outbox);
  check('merge remote/local : reminderRecurrence en attente prévaut', JSON.stringify(merged.find((p) => p.id === 'p1')?.reminderRecurrence) === JSON.stringify(VALID_WEEKLY));
}

console.log('\n[§H — SCÉNARIO DE RÉGRESSION PRINCIPAL] création récurrente offline → cache → kill/restart offline → règle présente → reconnexion → drain → remote → outbox vide → kill/restart → chargement remote → règle IDENTIQUE');
{
  // Étape 1 : création offline (isNew:true) avec une règle weekly.
  const created: Pensee = { id: 'p1', texte: 'Vitamines', contactId: null, createdAt: NOW, date: null, reminderAt: '2026-09-19T09:00:00.000Z', reminderRecurrence: VALID_WEEKLY };
  let outbox: Outbox = enqueueUpsertPensee([], created, true, 'op-1', NOW);
  // "cache local" = ce que normalizePensee(JSON.parse(JSON.stringify(...))) produirait pour cette pensée.
  let cachedPensees: Pensee[] = [normalizePensee(JSON.parse(JSON.stringify(created)))];

  // Étape 2 : kill/restart OFFLINE (remote = null) — resolveBootData applique l'outbox EN DERNIER.
  let boot = resolveBootData({ cachedContacts: [], cachedPensees, outbox, remote: null });
  check(
    'kill/restart offline : la règle reste présente (masquée par l’outbox pending, PAS par le cache — voir audit)',
    JSON.stringify(boot.pensees.find((p) => p.id === 'p1')?.reminderRecurrence) === JSON.stringify(VALID_WEEKLY),
  );

  // Étape 3 : reconnexion → drain réussi → insertPenseeRemote simulé (accepte désormais reminder_recurrence,
  // voir §D) → op retiré de l'outbox.
  async function fakeExecuteOp(_op: OutboxOp): Promise<{ ok: true } | { ok: false }> {
    return { ok: true }; // simule insertPenseeRemote(userId, op.payload) réussi (payload envoie désormais reminder_recurrence)
  }
  const drainResult = await drainOutbox(outbox, fakeExecuteOp);
  outbox = drainResult.outbox;
  check('après drain réussi : outbox vide', outbox.length === 0);

  // Étape 4 : "remote" fait désormais autorité — simule ce que rowToPensee renverrait maintenant que
  // insertPenseeRemote a réellement transmis reminder_recurrence (voir §D pour la preuve du mapping).
  const remoteAfterSync: Pensee[] = [normalizePensee({
    id: 'p1', texte: 'Vitamines', contactId: null, createdAt: NOW, date: null,
    reminderAt: '2026-09-19T09:00:00.000Z', reminderRecurrence: VALID_WEEKLY, // ce que rowToPensee lirait (voir §D)
  })];

  // Étape 5 : kill/restart avec remote AUTORITAIRE, outbox vide.
  const finalBoot = resolveBootData({ cachedContacts: [], cachedPensees: remoteAfterSync, outbox, remote: { contacts: [], pensees: remoteAfterSync } });
  check(
    'kill/restart après sync, remote autoritaire, outbox vide : règle TOUJOURS IDENTIQUE (CORRIGÉ — disparaissait avant ce chantier)',
    JSON.stringify(finalBoot.pensees.find((p) => p.id === 'p1')?.reminderRecurrence) === JSON.stringify(VALID_WEEKLY),
  );
}

console.log('\n[§I — non-régression eventTime] round-trip avec les 4 dimensions temporelles simultanées (date, eventTime, reminderAt, reminderRecurrence)');
{
  const pensee: Pensee = {
    id: 'p1',
    texte: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand',
    contactId: null,
    createdAt: NOW,
    date: '2027-02-10',
    eventTime: '20:30',
    reminderAt: '2027-02-09T18:00:00.000Z',
    reminderRecurrence: VALID_DAILY,
  };
  const roundTripped = normalizePensee(JSON.parse(JSON.stringify(pensee)));
  check('date préservée (indépendante)', roundTripped.date === '2027-02-10');
  check('eventTime préservé (CHANTIER précédent, non touché par ce correctif)', roundTripped.eventTime === '20:30');
  check('reminderAt préservé (indépendant)', roundTripped.reminderAt === '2027-02-09T18:00:00.000Z');
  check('reminderRecurrence préservé (CE correctif)', JSON.stringify(roundTripped.reminderRecurrence) === JSON.stringify(VALID_DAILY));
  check('les 4 dimensions restent mutuellement indépendantes (aucune n’a écrasé une autre)', roundTripped.eventTime !== roundTripped.reminderAt && roundTripped.date !== roundTripped.eventTime);

  // Même vérification via le mapping Supabase simulé (row → Pensee), pour couvrir aussi ce chemin.
  const asFromRow = normalizePensee({
    id: 'p1', texte: pensee.texte, contactId: null, createdAt: NOW,
    date: '2027-02-10', eventTime: '20:30', reminderAt: '2027-02-09T18:00:00.000Z', reminderRecurrence: VALID_DAILY,
  });
  check('mapping "row → Pensee" : les 4 dimensions coexistent sans confusion', asFromRow.date === '2027-02-10' && asFromRow.eventTime === '20:30' && JSON.stringify(asFromRow.reminderRecurrence) === JSON.stringify(VALID_DAILY));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
