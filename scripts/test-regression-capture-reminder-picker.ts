// Tests de non-régression — CORRECTIF picker iOS rappel (2026-09-17), écran de review Capture
// intelligente (CaptureScreen.tsx). Couvre le toggle explicite (ouvrir/refermer au clic) et le
// fait qu'une modification dans la roulette (jour/heure/minute) ne referme JAMAIS le picker,
// contrairement au bug initial. Pur (src/data/captureReview.ts uniquement), aucun rendu React
// Native/DateTimePicker natif — ne teste pas Android (comportement inchangé, hors périmètre).
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-capture-reminder-picker.ts

import { ContactMatchResult } from '../src/data/contactMatching';
import {
  CaptureCard,
  OpenPicker,
  applyReminderDateTimeChange,
  toggleReminderDateTimePicker,
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

const noMatch: ContactMatchResult = { kind: 'none' };
function makeCard(cardId: string): CaptureCard {
  return {
    cardId,
    texte: `Pensée ${cardId}`,
    contactId: null,
    contactMatch: noMatch,
    heardContactName: null,
    currentContactNameInText: null,
    originalContactMatchKind: 'none',
    eventHint: null,
    reminderEnabled: true,
    reminderDate: null,
    reminderTime: null,
    confidence: 0.9,
    status: 'pending',
    saveError: null,
  };
}

console.log('\n[toggle] ouvrir → retaper le même champ → fermer');
{
  let open: OpenPicker = null;
  open = toggleReminderDateTimePicker(open, 'a');
  check('premier tap sur la carte a → ouvre son picker', open?.cardId === 'a' && open.kind === 'reminderDateTime');
  open = toggleReminderDateTimePicker(open, 'a');
  check('second tap sur LE MÊME champ → referme (open = null)', open === null);
}

console.log('\n[modifications successives] changer jour puis heure puis minutes → le picker reste ouvert à chaque fois');
{
  let cards: CaptureCard[] = [makeCard('a')];
  let open: OpenPicker = toggleReminderDateTimePicker(null, 'a');
  check('picker ouvert avant toute modification', open?.cardId === 'a');

  // Changer le JOUR (23 sept, 9h00 par défaut du picker) — rien dans applyReminderDateTimeChange
  // ne touche `open` : c'est structurellement impossible de le refermer depuis cette fonction.
  cards = applyReminderDateTimeChange(cards, 'a', new Date(2026, 8, 23, 9, 0));
  check('jour appliqué à la carte', cards[0].reminderDate?.day === 23 && cards[0].reminderDate?.month === 8);
  check('picker TOUJOURS ouvert après le changement de jour', open !== null && open.cardId === 'a');

  // Changer l'HEURE (même jour, 14h)
  cards = applyReminderDateTimeChange(cards, 'a', new Date(2026, 8, 23, 14, 0));
  check('heure appliquée à la carte', cards[0].reminderTime?.hour === 14);
  check('jour précédent conservé (pas écrasé par le changement d’heure)', cards[0].reminderDate?.day === 23);
  check('picker TOUJOURS ouvert après le changement d’heure', open !== null && open.cardId === 'a');

  // Changer les MINUTES (même jour/heure, 45 min)
  cards = applyReminderDateTimeChange(cards, 'a', new Date(2026, 8, 23, 14, 45));
  check('minutes appliquées à la carte', cards[0].reminderTime?.minute === 45);
  check('heure précédente conservée (pas écrasée par le changement de minutes)', cards[0].reminderTime?.hour === 14);
  check('picker TOUJOURS ouvert après le changement de minutes', open !== null && open.cardId === 'a');

  // Seul un nouveau tap sur le champ peut le refermer.
  open = toggleReminderDateTimePicker(open, 'a');
  check('un tap explicite referme bien le picker', open === null);
}

console.log('\n[plusieurs cartes] picker et modifications associés à la bonne carte uniquement');
{
  let cards: CaptureCard[] = [makeCard('a'), makeCard('b')];
  let open: OpenPicker = toggleReminderDateTimePicker(null, 'a');
  check('picker de la carte a ouvert', open?.cardId === 'a');

  cards = applyReminderDateTimeChange(cards, 'a', new Date(2026, 8, 10, 9, 30));
  const aAfterFirstEdit = cards.find((c) => c.cardId === 'a')!;
  const bAfterFirstEdit = cards.find((c) => c.cardId === 'b')!;
  check('carte a modifiée', aAfterFirstEdit.reminderDate?.day === 10 && aAfterFirstEdit.reminderTime?.hour === 9);
  check('carte b non affectée par la modification de a', bAfterFirstEdit.reminderDate === null && bAfterFirstEdit.reminderTime === null);

  // Clique sur le champ de la carte b : ferme implicitement a (un seul `openPicker` possible),
  // ouvre b.
  open = toggleReminderDateTimePicker(open, 'b');
  check('picker bascule vers la carte b (a implicitement fermé)', open?.cardId === 'b');

  cards = applyReminderDateTimeChange(cards, 'b', new Date(2026, 8, 20, 18, 0));
  const aAfterSecondEdit = cards.find((c) => c.cardId === 'a')!;
  const bAfterSecondEdit = cards.find((c) => c.cardId === 'b')!;
  check('carte b modifiée', bAfterSecondEdit.reminderDate?.day === 20 && bAfterSecondEdit.reminderTime?.hour === 18);
  check(
    'carte a INCHANGÉE par la modification de b (conserve sa propre valeur précédente)',
    aAfterSecondEdit.reminderDate?.day === 10 && aAfterSecondEdit.reminderTime?.hour === 9,
  );
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
