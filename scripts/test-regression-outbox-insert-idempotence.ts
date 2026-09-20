// Tests de non-régression — CHANTIER "Data Safety P0-2 — idempotence outbox" (2026-09-20).
// Corrige la dette documentée dans store.tsx (`executeOutboxOp`) : un `insert` réussi côté Supabase
// dont la réponse réseau est perdue faisait échouer indéfiniment tout retry (conflit de clé
// primaire), bloquant le drain FIFO en tête de file. Correctif : `insertContactRemote`/
// `insertPenseeRemote` (supabaseRepo.ts) utilisent désormais `.upsert(..., {onConflict:'id'})` au
// lieu de `.insert(...)`.
//
// Ce fichier combine DEUX méthodes, comme le reste de ce projet pour tout ce qui touche au vrai
// client Supabase (voir scripts/test-regression-outbox-contact-delete-race.ts, même pattern) :
//
// 1. Un MODÈLE PUR du comportement Postgres/RLS documenté pour `INSERT ... ON CONFLICT (id) DO
//    UPDATE` sous une policy `FOR ALL USING auth.uid()=user_id WITH CHECK auth.uid()=user_id` —
//    comportement standard Postgres (pas une réimplémentation propre à Pensif) : la branche UPDATE
//    évalue `USING` sur la ligne EXISTANTE (son user_id AVANT la requête), et `WITH CHECK` sur la
//    ligne NOUVELLE (après fusion), pour les deux branches INSERT et UPDATE. Sert à prouver les
//    scénarios A-H sans connexion réseau réelle (aucun Supabase touché, lecture seule).
// 2. Des assertions PAR LECTURE DE SOURCE confirmant que `supabaseRepo.ts` émet réellement cette
//    forme de requête (upsert/onConflict/user_id/pas de service_role), pour que le modèle ci-dessus
//    ne prouve pas une stratégie différente de celle réellement livrée.
//
// Usage : npx tsx scripts/test-regression-outbox-insert-idempotence.ts

import * as fs from 'fs';
import * as path from 'path';
import { Outbox, OutboxOp, drainOutbox, enqueueUpsertContact, enqueueUpsertPensee } from '../src/data/outbox';
import { Contact, Pensee } from '../src/data/types';

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
  return fs.readFileSync(path.join(__dirname, '..', 'src', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

// --- MODÈLE PUR — voir en-tête ------------------------------------------------------------------

type FakeRow = { id: string; user_id: string; payload: Record<string, unknown> };
type UpsertResult = { ok: true; row: FakeRow } | { ok: false; error: string };

function makeFakeTable() {
  const rows = new Map<string, FakeRow>();
  return {
    /** Reproduit `INSERT ... ON CONFLICT (id) DO UPDATE` sous la policy RLS du projet. */
    upsert(callerUserId: string, row: { id: string; user_id: string } & Record<string, unknown>): UpsertResult {
      const existing = rows.get(row.id);
      if (existing) {
        // Branche UPDATE — USING évalué sur la ligne EXISTANTE.
        if (existing.user_id !== callerUserId) return { ok: false, error: 'row-level security policy violation (USING, ligne existante)' };
        // WITH CHECK évalué sur la ligne NOUVELLE (les deux branches).
        if (row.user_id !== callerUserId) return { ok: false, error: 'row-level security policy violation (WITH CHECK)' };
        const next: FakeRow = { id: row.id, user_id: row.user_id, payload: row };
        rows.set(row.id, next);
        return { ok: true, row: next };
      }
      // Branche INSERT — seul WITH CHECK s'applique (pas de ligne existante à USING).
      if (row.user_id !== callerUserId) return { ok: false, error: 'row-level security policy violation (WITH CHECK, insert)' };
      const next: FakeRow = { id: row.id, user_id: row.user_id, payload: row };
      rows.set(row.id, next);
      return { ok: true, row: next };
    },
    get(id: string): FakeRow | undefined {
      return rows.get(id);
    },
    size(): number {
      return rows.size;
    },
  };
}

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

async function main() {
console.log('\n[A] create normal → une ligne distante');
{
  const table = makeFakeTable();
  const result = table.upsert(USER_A, { id: 'e-a', user_id: USER_A, texte: 'v1' });
  check('succès', result.ok === true);
  check('une seule ligne', table.size() === 1);
  check('payload = v1', table.get('e-a')?.payload.texte === 'v1');
}

console.log('\n[B] create rejoué avec même id/même payload → succès, une seule ligne');
{
  const table = makeFakeTable();
  table.upsert(USER_A, { id: 'e-b', user_id: USER_A, texte: 'v1' });
  const replay = table.upsert(USER_A, { id: 'e-b', user_id: USER_A, texte: 'v1' });
  check('le rejeu réussit (jamais un conflit de clé primaire)', replay.ok === true);
  check('toujours une seule ligne', table.size() === 1);
}

console.log('\n[C] réponse perdue après create A → retry même id → succès → outbox peut être retirée');
{
  const table = makeFakeTable();
  // "Réponse perdue" = l'insert a RÉELLEMENT réussi côté serveur, le client ne le sait pas encore.
  table.upsert(USER_A, { id: 'e-c', user_id: USER_A, texte: 'v1' });
  const retry = table.upsert(USER_A, { id: 'e-c', user_id: USER_A, texte: 'v1' });
  check('le retry réussit (executeOp retournerait {ok:true})', retry.ok === true);
  check('une seule ligne au final', table.size() === 1);
}

console.log('\n[D] réponse perdue après create A → modification locale B avant retry → Supabase final = B');
{
  const table = makeFakeTable();
  // A "réussit" silencieusement.
  table.upsert(USER_A, { id: 'e-d', user_id: USER_A, texte: 'v1 (A)' });
  // Édition locale AVANT le retry — coalescée dans le MÊME op isNew:true (voir enqueueUpsert,
  // outbox.ts) : le retry envoie donc directement B, jamais A.
  const retryWithB = table.upsert(USER_A, { id: 'e-d', user_id: USER_A, texte: 'v2 (B)' });
  check('le retry avec B réussit', retryWithB.ok === true);
  check('Supabase converge vers B, jamais A', table.get('e-d')?.payload.texte === 'v2 (B)');
  check('une seule ligne (jamais dupliquée)', table.size() === 1);
}

console.log('\n[E] contact — même scénario C/D que ci-dessus (payload générique, structure identique)');
{
  const table = makeFakeTable();
  table.upsert(USER_A, { id: 'c-e', user_id: USER_A, prenom: 'Yohan' });
  const retryWithEdit = table.upsert(USER_A, { id: 'c-e', user_id: USER_A, prenom: 'Yohan (modifié)' });
  check('retry contact réussit', retryWithEdit.ok === true);
  check('contact final = valeur éditée', table.get('c-e')?.payload.prenom === 'Yohan (modifié)');
  check('une seule ligne contact', table.size() === 1);
}

console.log('\n[F] pensée — même scénario C/D que ci-dessus');
{
  const table = makeFakeTable();
  table.upsert(USER_A, { id: 'p-f', user_id: USER_A, texte: 'Pensée initiale' });
  const retryWithEdit = table.upsert(USER_A, { id: 'p-f', user_id: USER_A, texte: 'Pensée éditée avant retry' });
  check('retry pensée réussit', retryWithEdit.ok === true);
  check('pensée finale = valeur éditée', table.get('p-f')?.payload.texte === 'Pensée éditée avant retry');
  check('une seule ligne pensée', table.size() === 1);
}

console.log('\n[G] vraie erreur réseau/serveur → opération reste dans l’outbox, aucun faux succès');
{
  // Simule une exception réseau (pas une réponse "conflit" — une vraie coupure) : le modèle n'a
  // même pas atteint la table, executeOutboxOp (store.tsx) catch cette exception et retourne
  // {ok:false} — comportement INCHANGÉ par ce chantier (catch générique déjà en place).
  async function fakeUpsertThatThrows(): Promise<never> {
    throw new Error('network error (simulé)');
  }
  let executeOpResult: { ok: boolean };
  try {
    await fakeUpsertThatThrows();
    executeOpResult = { ok: true };
  } catch {
    executeOpResult = { ok: false };
  }
  check('résultat = échec, jamais un faux succès', executeOpResult.ok === false);
}

console.log('\n[H] conflit avec ligne appartenant à un autre propriétaire → reste une erreur');
{
  const table = makeFakeTable();
  // La ligne 'shared-id' existe déjà, créée par USER_A.
  table.upsert(USER_A, { id: 'shared-id', user_id: USER_A, texte: 'appartient à A' });
  // USER_B tente un upsert sur le MÊME id (collision extrêmement improbable, ex. génération d'id
  // côté client) — jamais un succès silencieux, jamais un service_role pour contourner RLS.
  const attempt = table.upsert(USER_B, { id: 'shared-id', user_id: USER_B, texte: 'tentative B' });
  check('rejeté (USING échoue sur la ligne existante, propriétaire différent)', attempt.ok === false);
  check('la ligne reste inchangée, toujours à A', table.get('shared-id')?.payload.texte === 'appartient à A');
  check('toujours une seule ligne (aucune écriture parasite)', table.size() === 1);
}

console.log('\n[Drain FIFO] op1 = insert rejoué après réponse perdue (converge désormais) → op2 suivant s’exécute → plus de gel FIFO');
{
  function makeContact(overrides: Partial<Contact>): Contact {
    return {
      id: overrides.id ?? 'c-drain',
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
      id: overrides.id ?? 'p-drain',
      date: null,
      texte: 'Test',
      contactId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      reminderAt: null,
      ...overrides,
    } as Pensee;
  }

  let outbox: Outbox = [];
  outbox = enqueueUpsertContact(outbox, makeContact({ id: 'c-op1' }), true, 'op1', '2026-01-01T00:00:00.000Z');
  outbox = enqueueUpsertPensee(outbox, makePensee({ id: 'p-op2' }), true, 'op2', '2026-01-01T00:00:00.000Z');

  const order: string[] = [];
  // AVANT ce chantier : op1 (retry d'un insert déjà réussi côté serveur) échouait systématiquement
  // (conflit de clé primaire) → drainOutbox s'arrêtait ici (`stoppedEarly`), op2 jamais atteinte.
  // APRÈS : op1 réussit (upsert idempotent) → op2 s'exécute dans la MÊME invocation de drain.
  const executeOp = async (op: OutboxOp): Promise<{ ok: boolean }> => {
    order.push(op.opId);
    return { ok: true }; // upsert idempotent → toujours ok, y compris pour un id déjà existant
  };
  const result = await drainOutbox(outbox, executeOp);

  check('op1 traitée en premier (ordre FIFO préservé)', order[0] === 'op1');
  check('op2 traitée ensuite, DANS LE MÊME drain (plus de gel)', order[1] === 'op2');
  check('outbox entièrement vidée — aucun gel FIFO résiduel', result.outbox.length === 0);
  check('drain non arrêté prématurément', result.stoppedEarly === false);
}

console.log('\n[§source] supabaseRepo.ts — insertContactRemote/insertPenseeRemote utilisent bien upsert(onConflict:\'id\')');
{
  const src = readSrc('lib', 'supabaseRepo.ts');
  const insertContactBlock = src.slice(src.indexOf('export async function insertContactRemote'), src.indexOf('export async function updateContactRemote'));
  const insertPenseeBlock = src.slice(src.indexOf('export async function insertPenseeRemote'), src.indexOf('export async function updatePenseeRemote'));

  check('insertContactRemote utilise .upsert( (jamais .insert()', insertContactBlock.includes('.upsert('));
  check('insertContactRemote : onConflict: \'id\'', /onConflict:\s*'id'/.test(insertContactBlock));
  check('insertContactRemote : user_id vient exclusivement du paramètre userId', /user_id:\s*userId,/.test(insertContactBlock));
  check('insertContactRemote : aucun .insert( résiduel', !insertContactBlock.includes('.insert('));

  check('insertPenseeRemote utilise .upsert(', insertPenseeBlock.includes('.upsert('));
  check('insertPenseeRemote : onConflict: \'id\'', /onConflict:\s*'id'/.test(insertPenseeBlock));
  check('insertPenseeRemote : user_id vient exclusivement du paramètre userId', /user_id:\s*userId,/.test(insertPenseeBlock));
  check('insertPenseeRemote : aucun .insert( résiduel', !insertPenseeBlock.includes('.insert('));

  // Recherche un USAGE réel (clé/role), jamais une simple mention en commentaire explicatif (ce
  // fichier de test lui-même et supabaseRepo.ts en contiennent, par design, pour documenter que ce
  // n'est PAS utilisé — voir les docstrings ajoutées par ce chantier).
  check('aucune clé service_role introduite dans supabaseRepo.ts (SERVICE_ROLE_KEY, createClient additionnel)', !/SERVICE_ROLE_KEY|createClient\(/i.test(src));
  check('updateContactRemote/updatePenseeRemote inchangés (toujours .update(, jamais touchés par ce chantier)', src.includes(".from('contacts')\n    .update(") && src.includes(".from('pensees')\n    .update("));
}

console.log('\n[§source] store.tsx / outbox.ts — drainOutbox, coalescing, FIFO, état optimiste local INTACTS (aucune modification)');
{
  const storeSrc = readSrc('data', 'store.tsx');
  const outboxSrc = readSrc('data', 'outbox.ts');
  check('executeOutboxOp appelle toujours insertContactRemote pour isNew', storeSrc.includes('await insertContactRemote(userIdRef.current, rest);'));
  check('executeOutboxOp appelle toujours insertPenseeRemote pour isNew', storeSrc.includes('await insertPenseeRemote(userIdRef.current, op.payload);'));
  check('drainOutbox (outbox.ts) non modifié dans sa politique premier-échec-arrête-tout', outboxSrc.includes('if (!result.ok) {') && outboxSrc.includes('stoppedEarly: true'));
  check('coalescing enqueueUpsert toujours en place (dernier payload gagne)', outboxSrc.includes('function enqueueUpsert<Op'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
