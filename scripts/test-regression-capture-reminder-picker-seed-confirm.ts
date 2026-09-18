/// <reference types="node" />
// Tests de non-régression — CORRECTIF picker iOS "seed non confirmée" (2026-09-18),
// CaptureScreen.tsx. Diagnostic : `display="spinner"` ne déclenche `onChange` qu'au mouvement réel
// d'une roulette, jamais au montage — une carte pouvait afficher "demain 09:00" sans que cette
// valeur n'existe encore dans `card.reminderDate`/`reminderTime`. Correctif : l'OUVERTURE explicite
// du picker (jamais la fermeture, jamais le montage, jamais buildInitialCards) écrit immédiatement
// la valeur affichée (`reminderPickerSeed`).
//
// CaptureScreen.tsx importe react-native — pas chargeable sous tsx (même méthode que tous les écrans
// de ce projet, voir test-regression-capture-processing-ux.ts et suivants) : vérification par lecture
// de source pour le CÂBLAGE, et par réimplémentation fidèle (vérifiée mot pour mot contre la source
// réelle) pour la LOGIQUE de seed elle-même, qui est pure TypeScript sans aucune dépendance RN.
//
// Usage : npx tsx scripts/test-regression-capture-reminder-picker-seed-confirm.ts

import * as fs from 'fs';
import * as path from 'path';
import { toLocalDateTimeParts } from '../src/data/reminderDate';
import { LocalDate, LocalTime } from '../src/data/captureReview';

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

console.log('\n[§A — source] reminderPickerSeed — texte EXACT inchangé (la logique mirée ci-dessous en dépend)');
const REMINDER_PICKER_SEED_SRC = `function reminderPickerSeed(card: CaptureCard): Date {
  const base = card.reminderDate ? localDateToJsDate(card.reminderDate) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  })();
  const hour = card.reminderTime?.hour ?? 9;
  const minute = card.reminderTime?.minute ?? 0;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
}`;
check('reminderPickerSeed non modifiée par ce correctif (texte identique)', screenSrc.includes(REMINDER_PICKER_SEED_SRC));

console.log('\n[§B — source] confirmReminderSeed — écrit reminderDate/reminderTime depuis reminderPickerSeed');
{
  const fnMatch = screenSrc.match(/function confirmReminderSeed\(cardId: string\) \{[\s\S]*?\n  \}/);
  const fnBody = fnMatch ? fnMatch[0] : '';
  check('confirmReminderSeed trouvée', fnBody.length > 0);
  check('utilise reminderPickerSeed(card) — jamais une nouvelle logique de seed dupliquée', fnBody.includes('reminderPickerSeed(card)'));
  check('convertit via toLocalDateTimeParts (même helper que le reste de l’écran, jamais un calcul UTC ad hoc)', fnBody.includes('toLocalDateTimeParts('));
  check('écrit reminderDate ET reminderTime via patchCard (une seule écriture atomique)', /patchCard\(cardId, \{\s*reminderDate: \{[\s\S]*?reminderTime: \{/.test(fnBody));
}

console.log('\n[§C — source] openReminderDateTimePicker — confirme la seed UNIQUEMENT à l’OUVERTURE, jamais à la fermeture');
{
  const fnMatch = screenSrc.match(/function openReminderDateTimePicker\(cardId: string\) \{[\s\S]*?\n  \}/);
  const fnBody = fnMatch ? fnMatch[0] : '';
  check('openReminderDateTimePicker trouvée', fnBody.length > 0);
  check(
    'calcule "next" via toggleReminderDateTimePicker AVANT toute décision (comportement de toggle inchangé)',
    fnBody.includes('const next = toggleReminderDateTimePicker(openPicker, cardId);'),
  );
  check(
    'confirmReminderSeed appelée SEULEMENT si next est non-null (ouverture) — jamais à la fermeture (next === null)',
    /if \(next\) confirmReminderSeed\(cardId\);/.test(fnBody),
  );
  check('setOpenPicker(next) reste la dernière étape — le toggle fonctionne exactement comme avant', fnBody.trim().endsWith('setOpenPicker(next);\n  }'));
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

console.log('\n[§E — source] jamais appelée au montage / dans buildInitialCards — uniquement sur une action explicite d’ouverture');
check('confirmReminderSeed jamais référencée dans captureReview.ts (buildInitialCards y vit, aucune dépendance croisée)', !readSrc('src', 'data', 'captureReview.ts').includes('confirmReminderSeed'));
{
  // Le seul effet qui charge un résultat de capture et appelle setCards(buildInitialCards(...)) —
  // confirmReminderSeed ne doit apparaître nulle part dans ce bloc.
  const effectMatch = screenSrc.match(/setCards\(buildInitialCards\([\s\S]{0,400}/);
  check('confirmReminderSeed absente du chargement initial des cartes (setCards(buildInitialCards(...)))', effectMatch !== null && !effectMatch[0].includes('confirmReminderSeed'));
}

// ====================================================================================================
// Logique de seed elle-même — réimplémentation FIDÈLE (vérifiée mot pour mot en §A contre la source
// réelle), pure TypeScript, testable sans react-native.
function localDateToJsDate(date: LocalDate): Date {
  return new Date(date.year, date.month, date.day);
}
function reminderPickerSeedMirror(reminderDate: LocalDate | null, reminderTime: LocalTime | null): Date {
  const base = reminderDate
    ? localDateToJsDate(reminderDate)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
      })();
  const hour = reminderTime?.hour ?? 9;
  const minute = reminderTime?.minute ?? 0;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
}

function tomorrowLocalDate(): LocalDate {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

console.log('\n[§F — logique] date manquante + heure présente → confirme demain à l’heure déjà connue');
{
  const time: LocalTime = { hour: 21, minute: 40 };
  const seed = reminderPickerSeedMirror(null, time);
  const parts = toLocalDateTimeParts(seed);
  const tomorrow = tomorrowLocalDate();
  check('date confirmée = demain', parts.year === tomorrow.year && parts.month === tomorrow.month && parts.day === tomorrow.day);
  check('heure confirmée = 21:40 (celle déjà connue, jamais inventée)', parts.hour === 21 && parts.minute === 40);
}

console.log('\n[§G — logique] heure manquante + date présente → confirme la date déjà connue à 09:00');
{
  const date: LocalDate = { year: 2026, month: 8, day: 25 };
  const seed = reminderPickerSeedMirror(date, null);
  const parts = toLocalDateTimeParts(seed);
  check('date confirmée = celle déjà connue (2026-09-25)', parts.year === 2026 && parts.month === 8 && parts.day === 25);
  check('heure confirmée = 09:00 (défaut visuel déjà utilisé par le picker, jamais une autre valeur)', parts.hour === 9 && parts.minute === 0);
}

console.log('\n[§H — logique] les deux manquants → confirme demain à 09:00');
{
  const seed = reminderPickerSeedMirror(null, null);
  const parts = toLocalDateTimeParts(seed);
  const tomorrow = tomorrowLocalDate();
  check('date confirmée = demain', parts.year === tomorrow.year && parts.month === tomorrow.month && parts.day === tomorrow.day);
  check('heure confirmée = 09:00', parts.hour === 9 && parts.minute === 0);
}

console.log('\n[§I — logique] les deux déjà présents → la confirmation est un NO-OP strict (aucune mutation de valeur)');
{
  const date: LocalDate = { year: 2026, month: 8, day: 25 };
  const time: LocalTime = { hour: 14, minute: 30 };
  const seed = reminderPickerSeedMirror(date, time);
  const parts = toLocalDateTimeParts(seed);
  check('date reconfirmée strictement identique', parts.year === date.year && parts.month === date.month && parts.day === date.day);
  check('heure reconfirmée strictement identique', parts.hour === time.hour && parts.minute === time.minute);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
