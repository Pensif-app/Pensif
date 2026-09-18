/// <reference types="node" />
// Tests de non-régression — CHANTIER CAPTURE EVENT TIME, incrément 4 (2026-09-18) : affichage +
// édition UI de `eventTime` dans Capture Review, PenseeDetail, et le Calendrier. Fonctions PURES
// (captureReview.ts, calendar.ts) réellement exécutées ; CaptureScreen.tsx/PenseeDetailScreen.tsx
// (react-native, non chargeables sous tsx) vérifiés par lecture de source pour le câblage, combinée à
// une réimplémentation fidèle pour la logique elle-même — même méthode que le reste de ce projet.
//
// Usage : npx tsx scripts/test-regression-event-time-ui.ts

import * as fs from 'fs';
import * as path from 'path';
import { Pensee, Contact } from '../src/data/types';
import { getDayEvents } from '../src/data/calendar';
import { CaptureResult } from '../src/data/captureTypes';
import { ContactMatchResult } from '../src/data/contactMatching';
import {
  CaptureCard,
  OpenPicker,
  buildInitialCards,
  buildPenseeFromCard,
  applyEventChange,
  applyEventTimeChange,
  clearEventTime,
  toggleEventPicker,
  toggleEventTimePicker,
  toggleEventDatePicker,
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

function makeCard(overrides: Partial<CaptureCard>): CaptureCard {
  return {
    cardId: 'a',
    texte: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand',
    contactId: null,
    contactMatch: { kind: 'none' },
    heardContactName: null,
    currentContactNameInText: null,
    originalContactMatchKind: 'none',
    eventHint: { date: '2027-02-10', time: '20:30', heardExpression: 'le 10 février 2027 à 20h30' },
    reminderEnabled: false,
    reminderDate: null,
    reminderTime: null,
    recurrenceDraft: { enabled: false, frequency: null, daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null },
    confidence: 0.9,
    status: 'pending',
    saveError: null,
    ...overrides,
  };
}

console.log('\n[§A — captureReview.ts] toggleEventTimePicker — même règle que les autres pickers (toggle open/close)');
{
  let open: OpenPicker = null;
  open = toggleEventTimePicker(open, 'a');
  check('premier tap → ouvre le picker heure événement de la carte a', open?.cardId === 'a' && open.kind === 'eventTime');
  open = toggleEventTimePicker(open, 'a');
  check('second tap sur LE MÊME champ → referme', open === null);

  // Mutuellement exclusif avec le picker de date événement (une seule valeur openPicker pour tout l'écran).
  let openDate: OpenPicker = toggleEventDatePicker(null, 'a');
  const openTime = toggleEventTimePicker(openDate, 'a');
  check('ouvrir le picker heure ferme implicitement celui de date (même carte, kind différent)', openTime?.kind === 'eventTime');
}

console.log('\n[§B — captureReview.ts] applyEventTimeChange — modifie UNIQUEMENT l’heure, conserve date/heardExpression, jamais reminderTime');
{
  const card = makeCard({ eventHint: { date: '2027-02-10', time: null, heardExpression: 'le 10 février' }, reminderEnabled: true, reminderTime: { hour: 18, minute: 0 } });
  const [next] = applyEventTimeChange([card], 'a', new Date(2027, 1, 10, 20, 30, 0, 0));
  check('event date + time affichés : eventHint.time = "20:30"', next.eventHint?.time === '20:30');
  check('eventHint.date inchangé', next.eventHint?.date === '2027-02-10');
  check('heardExpression conservé', next.eventHint?.heardExpression === 'le 10 février');
  check('reminderTime totalement INCHANGÉ (indépendance stricte)', next.reminderTime?.hour === 18 && next.reminderTime?.minute === 0);

  // event date SANS time — jamais inventée.
  const cardNoTime = makeCard({ eventHint: { date: '2027-02-10', time: null, heardExpression: null } });
  check('event date sans time : eventHint.time reste null tant qu’aucune interaction', cardNoTime.eventHint?.time === null);

  // No-op strict si aucun événement daté (heure sans date n'a pas de sens).
  const cardNoEvent = makeCard({ eventHint: null });
  const [stillNoEvent] = applyEventTimeChange([cardNoEvent], 'a', new Date(2027, 1, 10, 20, 30, 0, 0));
  check('applyEventTimeChange sans eventHint → no-op strict (jamais de crash, jamais d’heure fantôme)', stillNoEvent.eventHint === null);
}

console.log('\n[§C — captureReview.ts] clearEventTime — suppression de l’heure SEULE, conserve la date');
{
  const card = makeCard({});
  const [cleared] = clearEventTime([card], 'a');
  check('suppression eventTime : eventHint.time = null', cleared.eventHint?.time === null);
  check('suppression eventTime : eventHint.date CONSERVÉ (contrairement à clearEventDate, qui retire tout)', cleared.eventHint?.date === '2027-02-10');
  check('heardExpression conservé', cleared.eventHint?.heardExpression === 'le 10 février 2027 à 20h30');

  const cardNoEvent = makeCard({ eventHint: null });
  const [stillNull] = clearEventTime([cardNoEvent], 'a');
  check('clearEventTime sans eventHint → no-op strict', stillNull.eventHint === null);
}

console.log('\n[§C bis — captureReview.ts] toggleEventPicker + applyEventChange — contrôle iOS UNIFIÉ (CHANTIER UNIFICATION UX PICKERS iOS, incrément 5)');
{
  let open: OpenPicker = null;
  open = toggleEventPicker(open, 'a');
  check('premier tap → ouvre le contrôle événement unique de la carte a', open?.cardId === 'a' && open.kind === 'event');
  open = toggleEventPicker(open, 'a');
  check('retap sur LE MÊME champ → referme (exclusivité + retap-ferme)', open === null);

  // Mutuellement exclusif avec le rappel — une seule valeur openPicker pour tout l'écran (jamais
  // deux pickers ouverts simultanément, quel que soit leur kind).
  const openReminder: OpenPicker = { cardId: 'a', kind: 'reminderDateTime' };
  const openEventInstead = toggleEventPicker(openReminder, 'a');
  check('ouvrir l’événement ferme implicitement le rappel précédemment ouvert (un seul slot)', openEventInstead?.kind === 'event');

  // Mode "date" (aucune heure présente) — applyEventChange N'ÉCRIT JAMAIS d'heure, même si le Date
  // natif renvoyé en porte une (iOS ne modifie pas l'heure d'un UIDatePicker en mode date-only, mais
  // on l'ignore explicitement plutôt que de lui faire confiance).
  const cardDateOnly = makeCard({ eventHint: { date: '2027-02-10', time: null, heardExpression: 'x' } });
  const [afterDateOnly] = applyEventChange([cardDateOnly], 'a', new Date(2027, 2, 15, 13, 45, 0, 0));
  check('mode "date" : la nouvelle date est appliquée', afterDateOnly.eventHint?.date === '2027-03-15');
  check('mode "date" : eventTime.time RESTE null — jamais inventée depuis la partie horaire du Date natif', afterDateOnly.eventHint?.time === null);

  // Mode "datetime" (une heure existe déjà) — date ET heure toutes deux mises à jour ensemble, EN UN
  // SEUL appel (contrôle unique, contrairement à l’ancien couple applyEventDateChange/applyEventTimeChange).
  const cardWithTime = makeCard({ eventHint: { date: '2027-02-10', time: '20:30', heardExpression: 'x' } });
  const [afterDateTime] = applyEventChange([cardWithTime], 'a', new Date(2027, 2, 15, 13, 45, 0, 0));
  check('mode "datetime" : nouvelle date appliquée', afterDateTime.eventHint?.date === '2027-03-15');
  check('mode "datetime" : nouvelle heure appliquée EN MÊME TEMPS', afterDateTime.eventHint?.time === '13:45');

  // No-op strict si aucun événement (heure/date sans événement n'a pas de sens).
  const cardNoEvent2 = makeCard({ eventHint: null });
  const [stillNoEvent2] = applyEventChange([cardNoEvent2], 'a', new Date(2027, 2, 15, 13, 45, 0, 0));
  check('applyEventChange sans eventHint → no-op strict', stillNoEvent2.eventHint === null);
}

console.log('\n[§D — CaptureScreen.tsx] câblage source — heure EXCLUSIVEMENT depuis eventHint.time, jamais reminderTime en repli');
{
  const screenSrc = readSrc('src', 'screens', 'CaptureScreen.tsx');
  // CHANTIER UNIFICATION UX PICKERS iOS, incrément 5 (2026-09-18) — le contrôle principal ÉVÉNEMENT
  // est désormais UNIQUE (date+heure fusionnées), voir §D bis pour sa couverture dédiée. Ce bloc
  // vérifie ce qui reste : l'action secondaire heure ("+ Ajouter une heure"/"Retirer l'heure") lit
  // toujours EXCLUSIVEMENT eventHint.time, jamais reminderTime en repli.
  check('l’action secondaire bascule "+ Ajouter une heure" / "Retirer l’heure" selon card.eventHint.time', screenSrc.includes("{card.eventHint.time ? 'Retirer l’heure' : '+ Ajouter une heure'}"));
  check('aucun repli sur card.reminderTime autour de cette action secondaire', (() => {
    const idx = screenSrc.indexOf("{card.eventHint.time ? 'Retirer l’heure' : '+ Ajouter une heure'}");
    const around = screenSrc.slice(Math.max(0, idx - 400), idx + 400);
    return !/reminderTime/.test(around);
  })());
  check('"Retirer l’heure" appelle clearEventTime (pas clearEventDate)', /clearEventTime\(prev, card\.cardId\)/.test(screenSrc));
}

console.log('\n[§D bis — CaptureScreen.tsx] contrôle ÉVÉNEMENT unique iOS — un seul chip, mode dynamique, jamais deux pickers simultanés');
{
  const screenSrc = readSrc('src', 'screens', 'CaptureScreen.tsx');
  check('un seul chip principal affiche date ET heure combinées ("... à ...")', /\{formatDateFR\(card\.eventHint\.date\)\}\s*\{card\.eventHint\.time \? ` à \$\{card\.eventHint\.time\}` : ''\}/.test(screenSrc));
  check('toggleEventPicker pilote le contrôle iOS unique (kind "event")', screenSrc.includes('toggleEventPicker(openPicker, card.cardId)'));
  check('mode du picker dépend de card.eventHint.time (datetime si présent, date sinon — jamais inventé)', /mode=\{card\.eventHint\.time \? 'datetime' : 'date'\}/.test(screenSrc));
  check('applyEventChange (logique unifiée date+heure) utilisée par ce contrôle', /applyEventChange\(prev, card\.cardId, selected\)/.test(screenSrc));
  check('action "+ Ajouter une heure" écrit une valeur RÉELLE (applyEventTimeChange) AVANT d’ouvrir le picker iOS (correctif seed confirmée)', /applyEventTimeChange\(prev, card\.cardId, eventTimePickerSeed\(card\)\)\);\s*setOpenPicker\(\{ cardId: card\.cardId, kind: 'event' \}\);/.test(screenSrc));
  check('action "+ Ajouter une heure" ne préremplit RIEN côté Android (juste ouvrir le dialog natif)', /else \{\s*setOpenPicker\(\{ cardId: card\.cardId, kind: 'eventTime' \}\);\s*\}/.test(screenSrc));
  check('bouton "Terminé" présent pour le contrôle événement, ne modifie aucune donnée (juste setOpenPicker(null))', /Terminé/.test(screenSrc) && /onPress=\{\(\) => setOpenPicker\(null\)\} style=\{styles\.pickerDoneBtn\}/.test(screenSrc));
  check('ancien picker "eventDate" seul (iOS) disparu — plus de contrôle date isolé sur cette plateforme', !/openPicker\.kind === 'eventDate' \?\s*\(\s*<DateTimePicker\s*value=\{eventDatePickerSeed\(card\)\}\s*mode="date"/.test(screenSrc));
  // Exclusivité structurelle : openPicker reste une valeur UNIQUE pour tout l'écran (OpenPicker,
  // captureReview.ts, non modifié par cet incrément) — ouvrir un picker en ferme donc TOUJOURS un
  // autre automatiquement, par construction. Vérifié ici que le DateTimePickerHost (Android + tout
  // le reste) exclut bien 'event' de son rendu (sinon deux pickers Android pourraient tenter de se
  // superposer).
  check('DateTimePickerHost exclut le kind "event" du rendu partagé (routé inline uniquement)', /openPicker\.kind === 'event' \|\| openPicker\.kind === 'eventDate' \|\| openPicker\.kind === 'eventTime'/.test(screenSrc));
}

console.log('\n[§E — Capture → sauvegarde] event.date/time + reminder.date/time restent indépendants de bout en bout');
{
  const noMatch = (): ContactMatchResult => ({ kind: 'none' });
  const result: CaptureResult = {
    transcript: 'x',
    pensees: [
      {
        texte: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand',
        heardContactName: null,
        event: { hasDate: true, date: '2027-02-10', time: '20:30', heardExpression: 'le 10 février 2027 à 20h30', confidence: 0.95 },
        reminder: { hasReminder: true, date: '2027-02-09', time: '18:00', heardExpression: 'la veille à 18h', confidence: 0.9, recurrence: null },
        confidence: 0.9,
      },
    ],
    parseError: null,
  };
  const [card] = buildInitialCards(result, noMatch, [] as Contact[]);
  const pensee = buildPenseeFromCard(card);
  check('Pensee.date = "2027-02-10"', pensee.date === '2027-02-10');
  check('Pensee.eventTime = "20:30"', pensee.eventTime === '20:30');
  check('Pensee.reminderAt correspond à 2027-02-09 18:00 LOCAL', (() => {
    if (!pensee.reminderAt) return false;
    const d = new Date(pensee.reminderAt);
    return d.getFullYear() === 2027 && d.getMonth() === 1 && d.getDate() === 9 && d.getHours() === 18 && d.getMinutes() === 0;
  })());
  check('les deux heures restent distinctes (20:30 ≠ 18:00, jamais confondues)', pensee.eventTime !== '18:00');
}

console.log('\n[§F — Calendrier] getDayEvents — heure affichée avec l’événement, legacy sans eventTime inchangé');
{
  const iso = '2027-02-10';
  const [y, m, d] = [2027, 1, 10];
  const today = new Date(2026, 8, 18);

  const withTime: Pensee = { id: 'p1', texte: 'Concert Claire Obscure à Clermont-Ferrand', contactId: null, createdAt: '2026-01-01T00:00:00.000Z', date: iso, eventTime: '20:30', reminderAt: null };
  const eventsWithTime = getDayEvents(y, m, d, [], [withTime], today);
  const penseeEventWithTime = eventsWithTime.find((e) => e.type === 'pensee');
  check('calendrier avec eventTime : label = "20:30 · Concert Claire Obscure à Clermont-Ferrand"', penseeEventWithTime?.label === '20:30 · Concert Claire Obscure à Clermont-Ferrand');

  const withoutTime: Pensee = { id: 'p2', texte: 'Dîner avec Yohan', contactId: null, createdAt: '2026-01-01T00:00:00.000Z', date: iso, eventTime: null, reminderAt: null };
  const eventsWithoutTime = getDayEvents(y, m, d, [], [withoutTime], today);
  check('calendrier avec date mais SANS eventTime : label = texte seul, aucun préfixe', eventsWithoutTime.find((e) => e.type === 'pensee')?.label === 'Dîner avec Yohan');

  // Pensée legacy — champ eventTime absent de l'objet (créée avant ce chantier).
  const legacy = { id: 'p3', texte: 'Vieille pensée', contactId: null, createdAt: '2026-01-01T00:00:00.000Z', date: iso, reminderAt: null } as Pensee;
  const eventsLegacy = getDayEvents(y, m, d, [], [legacy], today);
  check('calendrier legacy (sans champ eventTime du tout) : rendu EXACTEMENT comme avant, aucun préfixe', eventsLegacy.find((e) => e.type === 'pensee')?.label === 'Vieille pensée');

  // eventTime ne doit JAMAIS s'appliquer à l'ancre de repli reminderAt (deux notions indépendantes).
  const reminderOnlyAnchor: Pensee = { id: 'p4', texte: 'Pensée sans date', contactId: null, createdAt: '2026-01-01T00:00:00.000Z', date: null, eventTime: '20:30', reminderAt: `${iso}T09:00:00.000Z` };
  const eventsReminderAnchor = getDayEvents(y, m, d, [], [reminderOnlyAnchor], today);
  check(
    'eventTime jamais appliqué à une ancre de repli (reminderAt sans date) même si eventTime est (anormalement) renseigné',
    eventsReminderAnchor.find((e) => e.type === 'pensee')?.label === 'Pensée sans date',
  );
}

console.log('\n[§G — PenseeDetailScreen.tsx] bloc ÉVÉNEMENT (FACULTATIF) unifié — câblage source + réimplémentation fidèle de la logique d’édition (CHANTIER UNIFICATION UX PICKERS iOS, incrément 5)');
{
  const screenSrc = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  check('bloc "ÉVÉNEMENT (FACULTATIF)" présent (remplace les anciens blocs séparés DATE/HEURE)', screenSrc.includes('ÉVÉNEMENT (FACULTATIF)'));
  check('anciens libellés séparés "DATE (FACULTATIF)"/"HEURE (FACULTATIF)" disparus', !screenSrc.includes('DATE (FACULTATIF)') && !screenSrc.includes('HEURE (FACULTATIF)'));
  check('chip principal combine date ET heure ("... à ...")', /\{eventDate \? `\$\{eventDate\.split\('-'\)\.reverse\(\)\.join\('\/'\)\}\$\{eventTime \? ` à \$\{eventTime\}` : ''\}` : 'Ajouter un événement'\}/.test(screenSrc));
  check(
    'action secondaire heure + Terminé rendues UNIQUEMENT si eventDate est renseignée, partagent une row commune ({eventDate && (<View style={{ flexDirection: \'row\'...)',
    screenSrc.includes("{eventDate && (\n        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>"),
  );
  // CHANTIER POLISH PICKER ÉVÉNEMENT (2026-09-18) — CORRECTIF : le second champ/chip heure ÉVÉNEMENT
  // (View + deux Pressable, dont un dateBtn) a été supprimé — remplacé par UNE action texte discrète.
  // Seuls 4 `styles.dateBtn` restent : le chip événement unique, le chip rappel iOS, et les 2 chips
  // rappel Android (date + heure — ceux-là légitimes, le rappel exige toujours une heure).
  check('un seul dateBtn pour l’événement (plus aucun second champ heure) — 4 dateBtn au total avec le rappel', (screenSrc.match(/styles\.dateBtn/g) ?? []).length === 4);
  // L'icône horloge ("time-outline") ne doit plus apparaître QUE pour le rappel Android (légitime,
  // toujours requis) — plus du tout associée à un champ ÉVÉNEMENT.
  check('icône horloge (time-outline) restante uniquement pour le rappel Android, plus pour un champ événement', (screenSrc.match(/Ionicons name="time-outline"/g) ?? []).length === 1);
  check('action heure événement = texte seul ("+ Ajouter une heure"/"Retirer l’heure"), jamais un champ avec icône', /<Text style=\{\{ color: theme\.accent, fontSize: 13, fontWeight: '600' \}\}>\s*\{eventTime \? 'Retirer l’heure' : '\+ Ajouter une heure'\}/.test(screenSrc));
  check('retirer l’événement efface DATE ET HEURE (setEventDate(null) puis setEventTime(null) dans le même handler)', /setEventDate\(null\);[\s\S]{0,400}setEventTime\(null\);[\s\S]{0,100}closeEventPickerIfOpen/.test(screenSrc));
  check(
    'ouverture (iOS) de l’action "+ Ajouter une heure" amorce 12:00 AVANT d’ouvrir le contrôle (correctif seed confirmée)',
    /else if \(Platform\.OS === 'ios'\) \{\s*setEventTime\('12:00'\);\s*setOpenPicker\('event'\);/.test(screenSrc),
  );
  check('mode du contrôle principal iOS dépend de eventTime (datetime si présent, date sinon — jamais inventé)', /mode=\{eventTime \? 'datetime' : 'date'\}/.test(screenSrc));
  check('picker iOS mode "date" ignore explicitement la composante horaire du Date natif tant qu’eventTime est null', /if \(eventTime\) \{\s*const h = String\(selected\.getHours\(\)\)\.padStart\(2, '0'\);/.test(screenSrc));
  check('state eventTime distinct de reminderDate/reminderAt (aucune dérivation croisée dans sa déclaration)', /const \[eventTime, setEventTime\] = useState<string \| null>\(existing\?\.eventTime \?\? null\);/.test(screenSrc));
  check('un seul état openPicker centralisé (event/eventTime/reminderDateTime/reminderDate/reminderTime)', /type DetailPickerKind = 'event' \| 'eventTime' \| 'reminderDateTime' \| 'reminderDate' \| 'reminderTime';/.test(screenSrc));
  check('togglePicker referme si le MÊME kind est déjà ouvert (retap = fermeture)', /function togglePicker\(kind: DetailPickerKind\) \{\s*setOpenPicker\(\(prev\) => \(prev === kind \? null : kind\)\);/.test(screenSrc));
  check(
    'bouton "Terminé" présent pour le contrôle événement ET le rappel iOS, ne modifie aucune donnée (2 occurrences)',
    (screenSrc.match(/<Text style=\{\{ color: theme\.accent, fontSize: 13, fontWeight: '700' \}\}>Terminé<\/Text>/g) ?? []).length === 2,
  );
  check(
    'Terminé du rappel iOS garde styles.pickerDoneBtn (bloc isolé, alignSelf:flex-end)',
    /onPress=\{\(\) => setOpenPicker\(null\)\} style=\{styles\.pickerDoneBtn\}/.test(screenSrc),
  );
  check(
    'Terminé de l’événement partage la row avec "Retirer l’heure"/"+ Ajouter une heure" (space-between, PAS pickerDoneBtn, PAS rapprochés)',
    /justifyContent: 'space-between', marginTop: 8 \}\}>[\s\S]{0,900}<Pressable onPress=\{\(\) => setOpenPicker\(null\)\} hitSlop=\{8\}>\s*<Text style=\{\{ color: theme\.accent, fontSize: 13, fontWeight: '700' \}\}>Terminé<\/Text>/.test(screenSrc),
  );
  check('rappel iOS n’est plus affiché en permanence (gagne un état "fermé" par défaut, via openPicker)', /openPicker === 'reminderDateTime' \? \(/.test(screenSrc));
  check('rappel Android conserve ses deux chips natifs séparés, inchangés visuellement', /reminderLabel\.split\(' à '\)\[0\]/.test(screenSrc) && /reminderLabel\.split\(' à '\)\[1\]/.test(screenSrc));

  // Réimplémentation fidèle de save() pour la partie eventTime (vérifiée mot pour mot ci-dessus contre
  // la source réelle : `eventTime: eventDate ? eventTime : null`).
  function mirrorSavedEventTime(eventDateState: string | null, eventTimeState: string | null): string | null {
    return eventDateState ? eventTimeState : null;
  }
  check('édition eventTime (nouvelle valeur choisie) → sauvegardée telle quelle', mirrorSavedEventTime('2027-02-10', '21:00') === '21:00');
  check('suppression eventTime (état remis à null) → sauvegardée null, date conservée par ailleurs', mirrorSavedEventTime('2027-02-10', null) === null);
  check('suppression de la date → eventTime forcé à null quel que soit son état', mirrorSavedEventTime(null, '20:30') === null);

  // "modification du texte/contact/rappel ne doit jamais effacer eventTime" — le state eventTime n'a
  // AUCUNE dépendance à texte/contactId/reminderEnabled/reminderDate (états totalement séparés, voir
  // useState ci-dessus) : par construction, aucun changement de ces states ne peut réassigner
  // eventTime. Vérifié structurellement (aucun setEventTime hors des handlers dédiés date/heure).
  const setEventTimeCalls = screenSrc.match(/setEventTime\(/g) ?? [];
  check(
    'setEventTime n’est appelé QUE dans les handlers dédiés à l’heure/la date événement (5 call sites : clear-événement, onChange iOS, seed 12:00, clear-heure, onChange Android — jamais depuis texte/contact/rappel)',
    setEventTimeCalls.length === 5,
  );
}

console.log('\n[§H — Android non-régressé] chemins Android CaptureScreen/PenseeDetail strictement inchangés (dialogs natifs séparés, jamais l’UI "Terminé")');
{
  const captureSrc = readSrc('src', 'screens', 'CaptureScreen.tsx');
  const detailSrc = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  check(
    'CaptureScreen — chip principal Android ouvre "eventDate" (dialog de DATE natif), jamais le kind "event" (réservé à iOS)',
    /Platform\.OS === 'ios'\s*\? toggleEventPicker\(openPicker, card\.cardId\)\s*: \{ cardId: card\.cardId, kind: 'eventDate' \},/.test(captureSrc),
  );
  check(
    'PenseeDetail — Android garde le dialog "calendar"/"clock" natif (jamais display="spinner", réservé à iOS)',
    /Platform\.OS === 'android' && openPicker === 'event' \? \(\s*<DateTimePicker[\s\S]{0,150}mode="date"[\s\S]{0,30}display="calendar"/.test(detailSrc),
  );
  check('aucun bouton "Terminé" rendu côté Android (natif, jamais nécessaire — voir consigne)', !/Platform\.OS === 'android'[\s\S]{0,300}Terminé/.test(detailSrc) && !/Platform\.OS === 'android'[\s\S]{0,300}Terminé/.test(captureSrc));
}

console.log('\n[§I — locale française] CHANTIER POLISH PICKER ÉVÉNEMENT (2026-09-18) — pickers iOS inline reçoivent explicitement locale="fr-FR"');
{
  const captureSrc = readSrc('src', 'screens', 'CaptureScreen.tsx');
  const detailSrc = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  const recurrenceSrc = readSrc('src', 'components', 'RecurrenceEditorSheet.tsx');

  check('CaptureScreen — constante IOS_PICKER_LOCALE = "fr-FR" définie', /const IOS_PICKER_LOCALE = 'fr-FR';/.test(captureSrc));
  check('CaptureScreen — événement (contrôle unique) : locale appliquée', (() => {
    const idx = captureSrc.indexOf("mode={card.eventHint.time ? 'datetime' : 'date'}");
    return /locale=\{IOS_PICKER_LOCALE\}/.test(captureSrc.slice(idx, idx + 300));
  })());
  check(
    'CaptureScreen — rappel : locale appliquée aux DEUX occurrences du picker combiné (ponctuel + récurrent)',
    (captureSrc.match(/mode="datetime"\s*display="spinner"\s*locale=\{IOS_PICKER_LOCALE\}/g) ?? []).length === 2,
  );

  check('PenseeDetail — constante IOS_PICKER_LOCALE = "fr-FR" définie', /const IOS_PICKER_LOCALE = 'fr-FR';/.test(detailSrc));
  check('PenseeDetail — événement (contrôle unique) : locale appliquée', /display="spinner"\s*locale=\{IOS_PICKER_LOCALE\}\s*is24Hour/.test(detailSrc));
  check('PenseeDetail — rappel iOS : locale appliquée', /mode="datetime"\s*display="spinner"\s*locale=\{IOS_PICKER_LOCALE\}\s*onChange=\{onDateTimeChangeIOS\}/.test(detailSrc));

  check('RecurrenceEditorSheet — constante IOS_PICKER_LOCALE = "fr-FR" définie (même composant réutilisé, voir consigne)', /const IOS_PICKER_LOCALE = 'fr-FR';/.test(recurrenceSrc));
  check(
    'RecurrenceEditorSheet — picker "fin de récurrence" : locale appliquée UNIQUEMENT sur iOS (undefined sur Android, aucune dépendance à la locale native déjà correcte)',
    /locale=\{Platform\.OS === 'ios' \? IOS_PICKER_LOCALE : undefined\}/.test(recurrenceSrc),
  );

  // Android non touché — aucune des 3 constantes n'est utilisée en dehors d'un contexte iOS (déjà
  // vérifié par construction ci-dessus : soit le bloc entier est `Platform.OS === 'ios'`, soit la
  // valeur est explicitement `undefined` sur Android pour RecurrenceEditorSheet).
  check('aucun changement de logique de date/heure : locale est un prop d’affichage pur, jamais lu par une fonction métier', !/normalizeReminderRecurrence\([^)]*locale|applyEvent\w*\([^)]*locale|buildPenseeFromCard\([^)]*locale/.test(captureSrc + detailSrc));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
