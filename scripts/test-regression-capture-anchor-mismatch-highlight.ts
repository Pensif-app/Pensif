// Tests de non-régression — CHANTIER "Cohérence Capture / création manuelle + erreur récurrence
// visible" (2026-09-20). Couvre `cardHasAnchorMismatch` (captureReview.ts, nouveau) — signal DISTINCT
// de `cardHasPendingReminderSeedConfirmation` (voir scripts/test-regression-capture-pending-
// confirmation-highlight.ts, inchangé) — et, par lecture de source (CaptureScreen.tsx importe
// react-native, non chargeable sous tsx — même méthode que le reste de ce projet), le câblage du
// contour corail DATE DE DÉBUT/RÉPÉTITION et du message inline, sur les deux points d'entrée
// (Capture Review et PenseeDetailScreen).
//
// Usage : npx tsx scripts/test-regression-capture-anchor-mismatch-highlight.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  CaptureCard,
  DEFAULT_RECURRENCE_DRAFT,
  LocalDate,
  RecurrenceDraft,
  cardHasAnchorMismatch,
  cardHasPendingReminderSeedConfirmation,
} from '../src/data/captureReview';

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

function baseCard(overrides: Partial<CaptureCard> = {}): CaptureCard {
  return {
    cardId: 'card-1',
    texte: 'texte',
    contactId: null,
    contactMatch: { kind: 'none' },
    heardContactName: null,
    currentContactNameInText: null,
    originalContactMatchKind: 'none',
    eventHint: null,
    reminderEnabled: true,
    reminderDate: null,
    reminderTime: { hour: 9, minute: 0 },
    recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
    confidence: 1,
    status: 'pending',
    saveError: null,
    analysisFailed: false,
    ...overrides,
  };
}

function dailyDraft(): RecurrenceDraft {
  return { enabled: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null };
}

function weeklyDraft(daysOfWeek: number[]): RecurrenceDraft {
  return { enabled: true, frequency: 'weekly', daysOfWeek, occurrenceCount: null, untilDate: null, heardExpression: null };
}

// 2026-09-21 = lundi (weekday=1), 2026-09-22 = mardi (weekday=2) — vérifié.
const MONDAY: LocalDate = { year: 2026, month: 8, day: 21 };
const TUESDAY: LocalDate = { year: 2026, month: 8, day: 22 };

console.log('\n[1] Capture daily → jamais anchor mismatch (aucune notion de jour incompatible)');
{
  const card = baseCard({ reminderDate: TUESDAY, recurrenceDraft: dailyDraft() });
  check('daily + n’importe quelle date → false', cardHasAnchorMismatch(card) === false);
}

console.log('\n[2] Capture weekly avec date compatible → false');
{
  const card = baseCard({ reminderDate: MONDAY, recurrenceDraft: weeklyDraft([1, 3, 5]) });
  check('lundi ∈ [lun,mer,ven] → false', cardHasAnchorMismatch(card) === false);
}

console.log('\n[3] Capture weekly avec date incompatible → true');
{
  const card = baseCard({ reminderDate: TUESDAY, recurrenceDraft: weeklyDraft([1, 3, 5]) });
  check('mardi ∉ [lun,mer,ven] → true', cardHasAnchorMismatch(card) === true);
}

console.log('\n[4] weekly sans jours → ne pas masquer le problème en anchor mismatch (problème DIFFÉRENT, déjà signalé par needsRecurrenceFrequency)');
{
  const card = baseCard({ reminderDate: MONDAY, recurrenceDraft: weeklyDraft([]) });
  check(
    'weekly vide → false (toReminderRecurrenceRule retourne null, pas un anchor mismatch)',
    cardHasAnchorMismatch(card) === false,
  );
}

console.log('\n[5] rappel OFF → false');
{
  const card = baseCard({ reminderEnabled: false, reminderDate: TUESDAY, recurrenceDraft: weeklyDraft([1, 3, 5]) });
  check('reminderEnabled=false → false', cardHasAnchorMismatch(card) === false);
}

console.log('\n[6] récurrence désactivée → false (même avec une date "incompatible" résiduelle)');
{
  const card = baseCard({ reminderDate: TUESDAY, recurrenceDraft: DEFAULT_RECURRENCE_DRAFT });
  check('recurrenceDraft.enabled=false → false', cardHasAnchorMismatch(card) === false);
}

console.log('\n[7] reminderDate absente (seed non confirmée) → false (pas ce signal-ci — voir cardHasPendingReminderSeedConfirmation)');
{
  const card = baseCard({ reminderDate: null, recurrenceDraft: weeklyDraft([1, 3, 5]) });
  check('reminderDate=null → false (cardHasAnchorMismatch)', cardHasAnchorMismatch(card) === false);
  check(
    'les deux signaux restent mutuellement exclusifs sur ce cas (jamais vrais en même temps)',
    !(cardHasAnchorMismatch(card) && cardHasPendingReminderSeedConfirmation(card, new Date(2026, 8, 18))),
  );
}

console.log('\n[§CaptureScreen.tsx — câblage source] contour corail + message inline branchés sur cardHasAnchorMismatch');
{
  const src = readSrc('src', 'screens', 'CaptureScreen.tsx');
  check('cardHasAnchorMismatch importé depuis captureReview.ts', /cardHasAnchorMismatch/.test(src));
  check('anchorMismatchCardIds calculé (gardé par saveAttempted, comme pendingReminderSeedCardIds)', /anchorMismatchCardIds\s*=\s*saveAttempted/.test(src));
  check('cardAnchorMismatch dérivé par carte', /cardAnchorMismatch\s*=\s*anchorMismatchCardIds\.has/.test(src));
  check(
    'DATE DE DÉBUT réagit à cardAnchorMismatch (en plus de cardPendingHighlight, jamais à la place)',
    /cardPendingHighlight \|\| cardAnchorMismatch/.test(src),
  );
  check('message inline exact présent', src.includes('La date de début ne correspond pas aux jours sélectionnés.'));
  check('texte de suite exact présent', src.includes('Choisis une date correspondant à l’un des jours de répétition.'));
  check(
    'jamais mélangé à pendingConfirmationHelpText/pendingHelp (textes de seeds, cause différente)',
    !/pendingHelp[\s\S]{0,80}correspond pas aux jours/.test(src),
  );
}

console.log('\n[§PenseeDetailScreen.tsx — câblage source] DATE DE DÉBUT / HEURE / RÉPÉTITION / FIN + corail + message');
{
  const src = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  check('DATE DE DÉBUT affichée en ligne labellisée (toujours, pas seulement en récurrence)', src.includes('DATE DE DÉBUT'));
  check('HEURE affichée en ligne labellisée séparée', /<Text[^>]*>HEURE<\/Text>/.test(src));
  check('RÉPÉTITION toujours présente', src.includes('RÉPÉTITION'));
  check('FIN conditionnée à recurrenceDraft.enabled', /recurrenceDraft\.enabled \? \(/.test(src));
  check('state anchorMismatchHighlight présent', /anchorMismatchHighlight/.test(src));
  check('effet qui efface le highlight dès que reminderDate/recurrenceDraft changent', /\[reminderDate, recurrenceDraft\]/.test(src));
  check('save() active le highlight UNIQUEMENT sur anchor_not_matching_weekly', /validation\.reason === 'anchor_not_matching_weekly'/.test(src));
  check('message inline exact identique à Capture', src.includes('La date de début ne correspond pas aux jours sélectionnés.'));
  check('Alert existant conservé (pas remplacé par le seul highlight)', /Alert\.alert\('Répétition incomplète'/.test(src));
  // Le bloc de validation (entre "if (!validation.ok)" et son "return;") ne doit JAMAIS appeler
  // setReminderDate/setRecurrenceDraft — uniquement setAnchorMismatchHighlight + Alert, jamais une
  // correction automatique de la date ou des jours à la place de l'utilisateur.
  const validationBlockMatch = src.match(/if \(!validation\.ok\) \{([\s\S]*?)return;\s*\}/);
  check('bloc de validation trouvé', !!validationBlockMatch);
  if (validationBlockMatch) {
    const block = validationBlockMatch[1];
    check('aucun setReminderDate dans le bloc de validation (jamais un déplacement automatique)', !block.includes('setReminderDate'));
    check('aucun setRecurrenceDraft dans le bloc de validation (jamais un jour ajouté automatiquement)', !block.includes('setRecurrenceDraft'));
  }
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
