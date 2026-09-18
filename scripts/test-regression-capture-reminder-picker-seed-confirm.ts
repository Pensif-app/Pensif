/// <reference types="node" />
// Tests de non-régression — CORRECTIF picker iOS "seed non confirmée" (2026-09-18, révisé CHANTIER
// SEEDS TEMPORELS 1, 2026-09-18), CaptureScreen.tsx.
//
// Diagnostic ORIGINAL : `display="spinner"` ne déclenche `onChange` qu'au mouvement réel d'une
// roulette, jamais au montage — une carte pouvait afficher "demain 09:00" sans que cette valeur
// n'existe encore dans `card.reminderDate`/`reminderTime`.
//
// CORRECTIF ORIGINAL (2026-09-18, maintenant remplacé) : confirmer À L'OUVERTURE. Problème identifié
// par l'audit "Seeds temporels intelligents" : cela transformait l'OUVERTURE elle-même en
// confirmation implicite (PROPOSÉ → CONFIRMÉ sans aucun geste explicite de l'utilisateur), bien avant
// que la roulette n'ait bougé ou qu'un bouton de fermeture n'ait été pressé.
//
// CORRECTIF RÉVISÉ (CHANTIER SEEDS TEMPORELS 1, 2026-09-18) : confirmer À LA FERMETURE (retap sur le
// champ déjà ouvert, OU tap sur "Terminé") — jamais à l'ouverture. Idempotent si `onChange` a déjà eu
// lieu (la roulette a bougé) : `reminderPickerSeed` retourne alors déjà la vraie valeur, réécrire ne
// change rien, jamais un retour vers le fallback "demain 9h"/"9h00" par défaut.
//
// CaptureScreen.tsx importe react-native — pas chargeable sous tsx (même méthode que tous les écrans
// de ce projet) : vérification par lecture de source pour le CÂBLAGE, et par réimplémentation fidèle
// (vérifiée mot pour mot contre la source réelle) pour la LOGIQUE de seed elle-même, qui est pure
// TypeScript sans aucune dépendance RN.
//
// Usage : npx tsx scripts/test-regression-capture-reminder-picker-seed-confirm.ts

import * as fs from 'fs';
import * as path from 'path';
import { CaptureCard, DEFAULT_RECURRENCE_DRAFT, LocalDate, LocalTime, reminderPickerSeedParts } from '../src/data/captureReview';

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

const screenSrc = readSrc('src', 'screens', 'CaptureScreen.tsx');

console.log('\n[§A — source] reminderPickerSeed — CHANTIER SEEDS TEMPORELS 2 : délègue tout le calcul à reminderPickerSeedParts (captureReview.ts, PURE), reste elle-même une seed jamais écrite');
const REMINDER_PICKER_SEED_SRC = `function reminderPickerSeed(card: CaptureCard): Date {
  const { date, time } = reminderPickerSeedParts(card, new Date());
  return new Date(date.year, date.month, date.day, time.hour, time.minute, 0, 0);
}`;
check('reminderPickerSeed délègue à reminderPickerSeedParts(card, new Date()) — aucune deuxième logique de seed dans l’écran', screenSrc.includes(REMINDER_PICKER_SEED_SRC));
check('reminderPickerSeedParts importée depuis captureReview.ts', /import \{[\s\S]*?reminderPickerSeedParts[\s\S]*?\} from '\.\.\/data\/captureReview';/.test(screenSrc));

console.log('\n[§B — source] confirmReminderSeed — écrit reminderDate/reminderTime depuis reminderPickerSeed');
{
  const fnMatch = screenSrc.match(/function confirmReminderSeed\(cardId: string\) \{[\s\S]*?\n  \}/);
  const fnBody = fnMatch ? fnMatch[0] : '';
  check('confirmReminderSeed trouvée', fnBody.length > 0);
  check('utilise reminderPickerSeed(card) — jamais une nouvelle logique de seed dupliquée', fnBody.includes('reminderPickerSeed(card)'));
  check('convertit via toLocalDateTimeParts (même helper que le reste de l’écran, jamais un calcul UTC ad hoc)', fnBody.includes('toLocalDateTimeParts('));
  check('écrit reminderDate ET reminderTime via patchCard (une seule écriture atomique)', /patchCard\(cardId, \{\s*reminderDate: \{[\s\S]*?reminderTime: \{/.test(fnBody));
}

console.log('\n[§C — source] openReminderDateTimePicker — CHANTIER SEEDS TEMPORELS 1 : confirme désormais à la FERMETURE (retap), jamais à l’ouverture');
{
  const fnMatch = screenSrc.match(/function openReminderDateTimePicker\(cardId: string\) \{[\s\S]*?\n  \}/);
  const fnBody = fnMatch ? fnMatch[0] : '';
  check('openReminderDateTimePicker trouvée', fnBody.length > 0);
  check(
    'calcule "next" via toggleReminderDateTimePicker AVANT toute décision (comportement de toggle inchangé)',
    fnBody.includes('const next = toggleReminderDateTimePicker(openPicker, cardId);'),
  );
  check(
    'confirmReminderSeed appelée SEULEMENT si next est null (FERMETURE par retap) — plus jamais à l’ouverture',
    /if \(!next\) confirmReminderSeed\(cardId\);/.test(fnBody),
  );
  check('AUCUNE confirmation sur "if (next)" (ancienne règle "confirme à l’ouverture") ne subsiste', !/if \(next\) confirmReminderSeed\(cardId\);/.test(fnBody));
  check('setOpenPicker(next) reste la dernière étape — le toggle fonctionne exactement comme avant', fnBody.trim().endsWith('setOpenPicker(next);\n  }'));
}

console.log('\n[§C bis — source] bouton "Terminé" (2 occurrences, rappel ponctuel + récurrent) confirme AVANT de fermer — même sémantique que le retap');
{
  const terminéReminderMatches = screenSrc.match(/onPress=\{\(\) => \{\s*confirmReminderSeed\(card\.cardId\);\s*setOpenPicker\(null\);\s*\}\}\s*style=\{styles\.pickerDoneBtn\}/g) ?? [];
  check('2 boutons "Terminé" du rappel appellent confirmReminderSeed(card.cardId) PUIS setOpenPicker(null), dans cet ordre', terminéReminderMatches.length === 2);
}

console.log('\n[§D — source] les 3 points d’entrée iOS (rappel ponctuel + 2 lignes récurrentes) utilisent tous openReminderDateTimePicker');
check(
  '3 usages de openReminderDateTimePicker(card.cardId) dans le JSX (Date de début, Heure, chip combiné ponctuel)',
  (screenSrc.match(/openReminderDateTimePicker\(card\.cardId\)/g) ?? []).length === 3,
);
check(
  'plus AUCUN ancien câblage direct "setOpenPicker(...toggleReminderDateTimePicker(openPicker, card.cardId))" resté en place',
  !/setOpenPicker\([^)]*toggleReminderDateTimePicker\(openPicker, card\.cardId\)/.test(screenSrc),
);

console.log('\n[§E — source] jamais appelée au montage / dans buildInitialCards — uniquement sur une action explicite de fermeture (retap ou "Terminé")');
check('confirmReminderSeed jamais référencée dans captureReview.ts (buildInitialCards y vit, aucune dépendance croisée)', !readSrc('src', 'data', 'captureReview.ts').includes('confirmReminderSeed'));
{
  // Le seul effet qui charge un résultat de capture et appelle setCards(buildInitialCards(...)) —
  // confirmReminderSeed ne doit apparaître nulle part dans ce bloc.
  const effectMatch = screenSrc.match(/setCards\(buildInitialCards\([\s\S]{0,400}/);
  check('confirmReminderSeed absente du chargement initial des cartes (setCards(buildInitialCards(...)))', effectMatch !== null && !effectMatch[0].includes('confirmReminderSeed'));
}

console.log('\n[§E bis — source] Android inchangé — DateTimePickerHost (dialog natif) ne connaît pas confirmReminderSeed, OK confirme/Cancel n’écrit rien (comportement natif, non modifié)');
{
  const hostStart = screenSrc.indexOf('function DateTimePickerHost(');
  const hostEnd = screenSrc.indexOf('\nfunction ', hostStart + 1); // prochaine fonction top-level après DateTimePickerHost
  const hostBody = hostStart >= 0 ? screenSrc.slice(hostStart, hostEnd > hostStart ? hostEnd : undefined) : '';
  check('DateTimePickerHost trouvé', hostBody.length > 0);
  check('DateTimePickerHost n’appelle jamais confirmReminderSeed (mécanisme iOS uniquement)', !hostBody.includes('confirmReminderSeed'));
  check(
    'handleChange n’écrit QUE si `selected` est fourni (Android Cancel ne fournit rien à onChange → rien n’est écrit)',
    /function handleChange\(_: unknown, selected\?: Date\) \{\s*onClose\(\);\s*if \(!selected\) return;/.test(hostBody),
  );
}

// ====================================================================================================
// Logique de seed elle-même — désormais PURE et directement importable depuis captureReview.ts
// (CHANTIER SEEDS TEMPORELS 2 a déplacé le calcul hors de CaptureScreen.tsx) : plus besoin d'une
// réimplémentation mirée, on appelle la fonction réelle avec une carte minimale + un `now` fixe.
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
    reminderTime: null,
    recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
    confidence: 1,
    status: 'pending',
    saveError: null,
    ...overrides,
  };
}

function tomorrowLocalDate(now: Date): LocalDate {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

const FIXED_NOW = new Date(2026, 8, 18, 14, 0, 0, 0); // vendredi 18 septembre 2026, 14:00 — instant FIXE, jamais l'heure réelle

console.log('\n[§F — logique] fermeture SANS mouvement de roulette (date+heure manquantes) → confirme demain à l’heure déjà connue (rappel isolé)');
{
  const parts = reminderPickerSeedParts(baseCard({ reminderTime: { hour: 21, minute: 40 } }), FIXED_NOW);
  const tomorrow = tomorrowLocalDate(FIXED_NOW);
  check('date confirmée = demain', parts.date.year === tomorrow.year && parts.date.month === tomorrow.month && parts.date.day === tomorrow.day);
  check('heure confirmée = 21:40 (celle déjà connue, jamais inventée)', parts.time.hour === 21 && parts.time.minute === 40);
}

console.log('\n[§G — logique] fermeture SANS mouvement de roulette, heure manquante + date présente → confirme la date déjà connue à 09:00');
{
  const date: LocalDate = { year: 2026, month: 8, day: 25 };
  const parts = reminderPickerSeedParts(baseCard({ reminderDate: date }), FIXED_NOW);
  check('date confirmée = celle déjà connue (2026-09-25)', parts.date.year === 2026 && parts.date.month === 8 && parts.date.day === 25);
  check('heure confirmée = 09:00 (défaut visuel déjà utilisé par le picker, jamais une autre valeur)', parts.time.hour === 9 && parts.time.minute === 0);
}

console.log('\n[§H — logique] fermeture SANS mouvement de roulette, les deux manquants → rappel isolé, confirme demain à 09:00 (comportement conservé, PAS de nouvelle politique)');
{
  const parts = reminderPickerSeedParts(baseCard(), FIXED_NOW);
  const tomorrow = tomorrowLocalDate(FIXED_NOW);
  check('date confirmée = demain', parts.date.year === tomorrow.year && parts.date.month === tomorrow.month && parts.date.day === tomorrow.day);
  check('heure confirmée = 09:00', parts.time.hour === 9 && parts.time.minute === 0);
}

console.log('\n[§I — logique] fermeture APRÈS mouvement de roulette (les deux déjà présents) → IDEMPOTENT, aucun retour vers le fallback');
{
  const date: LocalDate = { year: 2026, month: 8, day: 25 };
  const time: LocalTime = { hour: 14, minute: 30 };
  const parts = reminderPickerSeedParts(baseCard({ reminderDate: date, reminderTime: time }), FIXED_NOW);
  check('date reconfirmée strictement identique (jamais réécrasée par "demain")', parts.date.year === date.year && parts.date.month === date.month && parts.date.day === date.day);
  check('heure reconfirmée strictement identique (jamais réécrasée par "09:00")', parts.time.hour === time.hour && parts.time.minute === time.minute);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
