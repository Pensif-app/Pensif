// Tests de non-régression — CORRECTIF picker iOS ÉVÉNEMENT (2026-09-18), écran de review Capture
// intelligente (CaptureScreen.tsx). Même UX que le picker de rappel (voir
// test-regression-capture-reminder-picker.ts) : toggle explicite au clic, jamais fermé
// automatiquement par une sélection dans la roulette, et strictement associé au bon cardId. Pur
// (src/data/captureReview.ts uniquement), aucun rendu React Native/DateTimePicker natif — ne
// teste pas Android (comportement inchangé, hors périmètre).
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-capture-event-date-picker.ts

import { ContactMatchResult } from '../src/data/contactMatching';
import {
  CaptureCard,
  DEFAULT_RECURRENCE_DRAFT,
  OpenPicker,
  applyEventDateChange,
  toggleEventDatePicker,
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
function makeCard(cardId: string, eventDate: string | null = '2026-09-20'): CaptureCard {
  return {
    cardId,
    texte: `Pensée ${cardId}`,
    contactId: null,
    contactMatch: noMatch,
    heardContactName: null,
    currentContactNameInText: null,
    originalContactMatchKind: 'none',
    eventHint: eventDate ? { date: eventDate, time: null, heardExpression: null } : null,
    reminderEnabled: false,
    reminderDate: null,
    reminderTime: null,
    recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
    confidence: 0.9,
    status: 'pending',
    saveError: null,
    analysisFailed: false,
  };
}

console.log('\n[toggle] ouvrir → retaper le même champ événement → fermer');
{
  let open: OpenPicker = null;
  open = toggleEventDatePicker(open, 'a');
  check('premier tap sur la carte a → ouvre son picker événement', open?.cardId === 'a' && open.kind === 'eventDate');
  open = toggleEventDatePicker(open, 'a');
  check('second tap sur LE MÊME champ → referme (open = null)', open === null);
}

console.log('\n[modification] changer la date événement → le picker reste ouvert');
{
  let cards: CaptureCard[] = [makeCard('a')];
  let open: OpenPicker = toggleEventDatePicker(null, 'a');
  check('picker ouvert avant toute modification', open?.cardId === 'a');

  cards = applyEventDateChange(cards, 'a', new Date(2026, 9, 5)); // 5 octobre 2026
  check('date événement appliquée à la carte', cards[0].eventHint?.date === '2026-10-05');
  check('picker TOUJOURS ouvert après le changement de date', open !== null && open.cardId === 'a' && open.kind === 'eventDate');

  // Une seconde correction dans la même ouverture (l'utilisateur affine son choix).
  cards = applyEventDateChange(cards, 'a', new Date(2026, 9, 12)); // 12 octobre 2026
  check('deuxième correction appliquée', cards[0].eventHint?.date === '2026-10-12');
  check('picker encore ouvert après une deuxième correction', open !== null && open.cardId === 'a');

  open = toggleEventDatePicker(open, 'a');
  check('un tap explicite referme bien le picker', open === null);
}

console.log('\n[heardExpression préservé] la trace d’affichage originale n’est jamais réécrite par une correction de date');
{
  const cards: CaptureCard[] = [
    { ...makeCard('a', null), eventHint: { date: '2026-09-20', time: null, heardExpression: '20 septembre' } },
  ];
  const next = applyEventDateChange(cards, 'a', new Date(2026, 9, 1));
  check('date mise à jour', next[0].eventHint?.date === '2026-10-01');
  check('heardExpression conservé tel quel (simple trace, jamais réinterprété)', next[0].eventHint?.heardExpression === '20 septembre');
}

console.log('\n[plusieurs cartes] picker et modifications événement associés à la bonne carte uniquement');
{
  let cards: CaptureCard[] = [makeCard('a'), makeCard('b')];
  let open: OpenPicker = toggleEventDatePicker(null, 'a');
  check('picker événement de la carte a ouvert', open?.cardId === 'a');

  cards = applyEventDateChange(cards, 'a', new Date(2026, 10, 1)); // 1 nov 2026
  const aAfterFirstEdit = cards.find((c) => c.cardId === 'a')!;
  const bAfterFirstEdit = cards.find((c) => c.cardId === 'b')!;
  check('carte a modifiée', aAfterFirstEdit.eventHint?.date === '2026-11-01');
  check('carte b non affectée par la modification de a', bAfterFirstEdit.eventHint?.date === '2026-09-20');

  // Clique sur le champ événement de la carte b : ferme implicitement a, ouvre b.
  open = toggleEventDatePicker(open, 'b');
  check('picker bascule vers la carte b (a implicitement fermé)', open?.cardId === 'b');

  cards = applyEventDateChange(cards, 'b', new Date(2026, 11, 25)); // 25 déc 2026
  const aAfterSecondEdit = cards.find((c) => c.cardId === 'a')!;
  const bAfterSecondEdit = cards.find((c) => c.cardId === 'b')!;
  check('carte b modifiée', bAfterSecondEdit.eventHint?.date === '2026-12-25');
  check('carte a INCHANGÉE par la modification de b (conserve sa propre valeur précédente)', aAfterSecondEdit.eventHint?.date === '2026-11-01');
}

console.log('\n[cohabitation rappel / événement] les deux pickers restent mutuellement exclusifs, même sur la même carte');
{
  // Ouvrir le rappel de la carte a, puis l'événement de la MÊME carte : un seul `openPicker`
  // possible pour tout l'écran → doit basculer de kind, jamais empiler les deux.
  let open: OpenPicker = toggleReminderDateTimePicker(null, 'a');
  check('rappel de a ouvert', open?.cardId === 'a' && open.kind === 'reminderDateTime');

  open = toggleEventDatePicker(open, 'a');
  check('événement de a ouvert à la place (même carte, kind différent)', open?.cardId === 'a' && open.kind === 'eventDate');

  // Retaper sur le champ événement (déjà ouvert pour cette carte) le referme.
  open = toggleEventDatePicker(open, 'a');
  check('retaper le champ événement déjà ouvert le referme', open === null);
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
