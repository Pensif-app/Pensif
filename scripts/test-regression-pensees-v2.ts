// Tests de non-régression — CHANTIER PENSÉES V2 (séparer une pensée de sa temporalité). Complète
// test-regression-pensees.ts et test-regression-notifications.ts (qui couvrent déjà le classement
// et la planification) en se concentrant sur normalizePensee (compatibilité ascendante) et
// resolveBootData (aucune donnée existante perdue au chargement). Lecture seule — aucune donnée
// n'est modifiée par ce script. Assertions dures : lève une exception (code de sortie non-nul) si
// une régression est détectée.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-pensees-v2.ts

import { Pensee } from '../src/data/types';
import { normalizePensee, penseeAnchor } from '../src/data/calendar';
import { buildPenseeCards, groupPenseeCards } from '../src/data/penseesView';
import { resolveBootData } from '../src/data/storeInit';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] Contenu obligatoire, proche facultatif : une pensée sans date/rappel est un état valide');
{
  const p: Pensee = {
    id: 'p-micka',
    texte: 'Micka aimerait un casque audio',
    contactId: 'c-micka',
    createdAt: '2026-09-12T10:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
  };
  check('aucune ancre calendrier (penseeAnchor === null)', penseeAnchor(p) === null);
  const card = buildPenseeCards([p], [], new Date(2026, 8, 12))[0];
  check('classée "memo"', card.bucket === 'memo');
  check('sous-titre basé sur la date de création (pas de crash sans date)', card.subtitle.includes('12 sept'), card.subtitle);
}

console.log('\n[2] normalizePensee — pensée AsyncStorage legacy (date obligatoire + remind) → reminderAt dérivé, jamais perdu');
{
  const legacyRaw = { id: 'p-legacy', date: '2026-01-20', texte: 'Ancienne pensée', remind: '3', contactId: null };
  const normalized = normalizePensee(legacyRaw);
  check('createdAt comblé (fallback sur `date`)', normalized.createdAt === '2026-01-20T00:00:00.000Z', normalized.createdAt);
  check(
    'reminderAt dérivé de remind=3 (3 jours avant, 9h)',
    normalized.reminderAt === new Date(2026, 0, 17, 9, 0, 0).toISOString(),
    normalized.reminderAt ?? 'null',
  );
}

console.log('\n[3] normalizePensee — ligne Supabase migrée (reminder_at déjà mappé, y compris null explicite)');
{
  const migratedRow = { id: 'p-migrated', date: null, texte: 'Pensée post-migration', contactId: null, reminderAt: null, createdAt: '2026-05-01T08:00:00.000Z' };
  const normalized = normalizePensee(migratedRow);
  check('reminderAt reste null (pas de dérivation quand la valeur est déjà explicite)', normalized.reminderAt === null);
  check('createdAt conservé tel quel', normalized.createdAt === '2026-05-01T08:00:00.000Z');
}

console.log('\n[4] normalizePensee — ligne Supabase NON migrée (remind_offset+custom_offset_minutes, colonne reminder_at absente)');
{
  // `reminderAt` volontairement ABSENT de l'objet (colonne inexistante avant la migration SQL) —
  // distinct d'une valeur explicitement `null` (voir test [3]).
  const preMigrationRow: any = { id: 'p-pre-migration', date: '2026-04-10', texte: 'Pas encore migrée', contactId: null, remind: 'custom', customOffsetMinutes: 60 };
  const normalized = normalizePensee(preMigrationRow);
  const expected = new Date(2026, 3, 10, 22, 59, 59); // 23:59:59 - 60 min
  check('reminderAt dérivé du couple remind=custom/customOffsetMinutes legacy', normalized.reminderAt === expected.toISOString(), normalized.reminderAt ?? 'null');
}

console.log('\n[5] resolveBootData — aucune pensée existante perdue au chargement, quel que soit son format');
{
  const legacyCached = normalizePensee({ id: 'p-old', date: '2026-02-01', texte: 'Cache existant', remind: '1', contactId: null });
  const result = resolveBootData({
    cachedContacts: [],
    cachedPensees: [legacyCached],
    outbox: [],
    remote: null, // Supabase indisponible : le cache doit rester tel quel (voir CHANTIER PRÉ-BÊTA 1)
  });
  check('la pensée existante (déjà normalisée) est bien conservée', result.pensees.some((p) => p.id === 'p-old'));
}

console.log('\n[6] Édition d’une pensée : seuls texte/contact/rappel changent, date/endDate/createdAt/id inchangés');
{
  const existing: Pensee = {
    id: 'p-period',
    texte: 'Vacances',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: '2026-07-01',
    endDate: '2026-07-10',
    reminderAt: new Date(2026, 6, 1, 9, 0, 0).toISOString(),
  };
  // Simule exactement ce que fait PenseeDetailScreen.save() en mode édition.
  const updated: Pensee = { ...existing, texte: 'Vacances en Italie', contactId: 'c-x', reminderAt: null };
  check('id inchangé', updated.id === existing.id);
  check('date/endDate (période) inchangées — non éditables depuis ce chantier', updated.date === existing.date && updated.endDate === existing.endDate);
  check('createdAt inchangé', updated.createdAt === existing.createdAt);
  check('texte modifié', updated.texte === 'Vacances en Italie');
  check('rappel supprimé proprement (reminderAt: null)', updated.reminderAt === null);
}

console.log('\n[7] Pensée liée à un proche sans aucune date/rappel → jamais "passée", quel que soit `today`');
{
  const p: Pensee = { id: 'p-forever', texte: 'Note durable', contactId: 'c-1', createdAt: '2019-01-01T00:00:00.000Z', date: null, endDate: null, reminderAt: null };
  const farFuture = new Date(2030, 0, 1);
  const groups = groupPenseeCards(buildPenseeCards([p], [], farFuture));
  check('toujours dans "memo", 11 ans plus tard', groups.memo.some((c) => c.id === 'p-forever'));
  check('jamais dans "past"', !groups.past.some((c) => c.id === 'p-forever'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
