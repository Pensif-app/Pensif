// CHANTIER "Capture — heure sans date + erreur de rappel incomplète" (2026-09-24). Retour terrain :
// "Rappelle-moi de pointer à 15h40" → heure extraite, date absente, card invalide sans explication.
// Déduction "aujourd'hui" DÉTERMINISTE côté client (jamais via le prompt), jamais "demain" silencieux,
// message d'erreur visible au tap "Faire confiance à Pensif". Fonctions RÉELLES exécutées avec `now`
// injecté ; le câblage CaptureScreen (react-native) est vérifié par source-grep.
//
// Usage : npx tsx scripts/test-regression-capture-time-without-date.ts

import * as fs from 'fs';
import * as path from 'path';
import { CaptureResult, ExtractedPensee } from '../src/data/captureTypes';
import { ContactMatchResult } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';
import {
  buildInitialCards,
  buildPenseeFromCard,
  canSaveAll,
  isCardValid,
  reminderIncompleteMessage,
  reminderPickerSeedParts,
  resolveReminderDateForToday,
} from '../src/data/captureReview';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const noMatch = (): ContactMatchResult => ({ kind: 'none' });
const NO_CONTACTS: Contact[] = [];

function extracted(reminder: Partial<ExtractedPensee['reminder']>, texte = 'Pointer'): ExtractedPensee {
  return {
    texte,
    heardContactName: null,
    event: { hasDate: false, date: null, heardExpression: null, confidence: 1 },
    reminder: { hasReminder: true, date: null, time: null, heardExpression: null, confidence: 1, ...reminder },
    confidence: 0.9,
  };
}
function cardFor(reminder: Partial<ExtractedPensee['reminder']>, now: Date) {
  const result: CaptureResult = { transcript: 'x', pensees: [extracted(reminder)], parseError: null };
  return buildInitialCards(result, noMatch, NO_CONTACTS, now)[0];
}
const at = (h: number, m: number, s = 0) => new Date(2026, 8, 24, h, m, s, 0);
const isToday = (d: { year: number; month: number; day: number } | null) => d !== null && d.year === 2026 && d.month === 8 && d.day === 24;

console.log('\n["Rappelle-moi de pointer à 15h40"] rappel explicite + heure + AUCUNE date');
{
  const before = cardFor({ time: '15:40' }, at(14, 0));
  check('now 14:00 → reminderDate = aujourd’hui', isToday(before.reminderDate));
  check('now 14:00 → reminderTime = 15:40', before.reminderTime?.hour === 15 && before.reminderTime?.minute === 40);
  check('now 14:00 → carte valide', isCardValid(before, at(14, 0)));
  check('now 14:00 → sauvegardable (canSaveAll)', canSaveAll([before], at(14, 0)));
  const p = buildPenseeFromCard(before);
  check('now 14:00 → reminderAt = aujourd’hui 15:40 (schedulable)', p.reminderAt === new Date(2026, 8, 24, 15, 40, 0, 0).toISOString(), String(p.reminderAt));

  const justBefore = cardFor({ time: '15:40' }, at(15, 39, 59));
  check('now 15:39:59 → aujourd’hui (candidateToday > now strict)', isToday(justBefore.reminderDate));

  const exactly = cardFor({ time: '15:40' }, at(15, 40, 0));
  check('now 15:40:00 pile → date reste null (candidat pas strictement futur)', exactly.reminderDate === null);
  const sameMinute = cardFor({ time: '15:40' }, at(15, 40, 30));
  check('now 15:40:30 (même minute, instant passé) → date reste null', sameMinute.reminderDate === null);

  const after = cardFor({ time: '15:40' }, at(16, 0));
  check('now 16:00 → reminderDate reste NULL (jamais "demain" silencieux)', after.reminderDate === null);
  check('now 16:00 → reminderTime conservé (15:40)', after.reminderTime?.hour === 15 && after.reminderTime?.minute === 40);
  check('now 16:00 → carte INVALIDE', !isCardValid(after, at(16, 0)));
  check('now 16:00 → non sauvegardable (le tap "Faire confiance" est bloqué)', !canSaveAll([after], at(16, 0)));
  check('now 16:00 → pas de reminderAt fabriqué', buildPenseeFromCard(after).reminderAt === null);
}

console.log('\n["Rappelle-moi à 8h"] avant/après l’heure');
{
  check('now 07:00 → aujourd’hui 08:00', isToday(cardFor({ time: '08:00' }, at(7, 0)).reminderDate));
  check('now 07:59 → aujourd’hui 08:00', isToday(cardFor({ time: '08:00' }, at(7, 59)).reminderDate));
  check('now 09:00 → null (pas demain)', cardFor({ time: '08:00' }, at(9, 0)).reminderDate === null);
}

console.log('\n[Ne jamais écraser / inventer]');
{
  const tomorrow = cardFor({ date: '2026-09-25', time: '15:40' }, at(14, 0));
  check('date explicite "demain" conservée (jamais écrasée par aujourd’hui)', tomorrow.reminderDate?.day === 25 && tomorrow.reminderDate?.month === 8);
  const pastExplicit = cardFor({ date: '2026-09-20', time: '15:40' }, at(14, 0));
  check('date explicite (même passée) jamais modifiée', pastExplicit.reminderDate?.day === 20);
  const noTime = cardFor({ time: null }, at(14, 0));
  check('rappel sans heure → aucune heure inventée', noTime.reminderTime === null);
  check('rappel sans heure ni date → aucune date inventée', noTime.reminderDate === null);
  const dateOnly = cardFor({ date: '2026-09-25', time: null }, at(14, 0));
  check('date sans heure → heure non inventée', dateOnly.reminderTime === null && dateOnly.reminderDate?.day === 25);
  const noReminder = cardFor({ hasReminder: false, time: '15:40' }, at(14, 0));
  check('capture sans rappel (hasReminder=false) → aucune date déduite', noReminder.reminderDate === null && noReminder.reminderEnabled === false);
  const recurring = cardFor({ time: '21:40', recurrence: { detected: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: 'tous les jours' } }, at(14, 0));
  check('récurrence sans date → date reste null (règle du prompt : jamais "aujourd’hui" arbitraire)', recurring.reminderDate === null);
  check('helper pur : reminder désactivé → inchangé', resolveReminderDateForToday(false, false, null, { hour: 15, minute: 40 }, at(14, 0)) === null);
}

console.log('\n[Picker seed] jamais présenté comme une date comprise');
{
  const after = cardFor({ time: '15:40' }, at(16, 0));
  const seed = reminderPickerSeedParts(after, at(16, 0));
  check('le seed technique (demain) existe seulement pour ouvrir le picker — card.reminderDate reste null', after.reminderDate === null && seed.date.day === 25);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'CaptureScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  check('l’UI n’affiche la date/heure combinée que si card.reminderDate !== null, sinon "Choisir une date et une heure"', /const showsReminderDate = card\.reminderDate !== null;/.test(src) && src.includes(": 'Choisir une date et une heure'"));
}

console.log('\n[Message d’erreur] reminderIncompleteMessage + câblage "Faire confiance à Pensif"');
{
  const both = cardFor({ time: null }, at(14, 0));
  check('date ET heure manquantes → "Choisis une date et une heure pour programmer ce rappel."', reminderIncompleteMessage(both) === 'Choisis une date et une heure pour programmer ce rappel.');
  const dateMissing = cardFor({ time: '15:40' }, at(16, 0));
  check('date manquante → "Choisis une date pour programmer ce rappel."', reminderIncompleteMessage(dateMissing) === 'Choisis une date pour programmer ce rappel.');
  const timeMissing = cardFor({ date: '2026-09-25', time: null }, at(14, 0));
  check('heure manquante → "Choisis une heure pour programmer ce rappel."', reminderIncompleteMessage(timeMissing) === 'Choisis une heure pour programmer ce rappel.');
  check('rappel complet → aucun message', reminderIncompleteMessage(cardFor({ time: '15:40' }, at(14, 0))) === null);
  check('rappel désactivé → aucun message', reminderIncompleteMessage(cardFor({ hasReminder: false }, at(14, 0))) === null);

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'CaptureScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  check('CaptureScreen importe reminderIncompleteMessage', /reminderIncompleteMessage,/.test(src));
  check('message affiché seulement après une tentative (saveAttempted), couleur theme.plum, dans le bloc rappel', /\{saveAttempted && reminderIncompleteMessage\(card\) \? \(\s*<Text style=\{\[styles\.warnHint, \{ color: theme\.plum, fontWeight: '700' \}\]\}>\{reminderIncompleteMessage\(card\)\}<\/Text>/.test(src));
  check('handleSaveAll : tap bloqué → setSaveAttempted(true) (déclenche le message)', /if \(!canSaveAll\(cards\)\) \{\s*setSaveAttempted\(true\);\s*return;\s*\}/.test(src));
  check('ancien hint "Choisis une heure pour activer ce rappel." masqué quand le nouveau message est affiché (pas de doublon)', src.includes('!(saveAttempted && reminderIncompleteMessage(card))'));
}

console.log('\n[Non-régression] prompt/scheduler/notifications non touchés');
{
  const prompt = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'capture', 'providers', 'llm', 'prompt.ts'), 'utf8');
  check('prompt.ts ne référence aucun mécanisme de ce chantier', !prompt.includes('resolveReminderDateForToday') && !prompt.includes('heure sans date'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
