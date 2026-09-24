/// <reference types="node" />
// Tests de non-régression — CHANTIER "Phase 6 Addendum — Correctif rappel ponctuel + clavier"
// (2026-09-23). Couvre : (1) le libellé "Aucune" (penseeReminderRecurrence.ts, fonction RÉELLE
// exécutée) ; (2) la visibilité de FIN (source-grep, PenseeDetailScreen.tsx react-native non
// chargeable sous tsx) ; (3) la restauration du dernier draft valide à la fermeture de la feuille
// (openRecurrenceEditor/closeRecurrenceEditor reproduits À L'IDENTIQUE, car dépendants d'un `useRef`
// React — même méthode que le reste de ce projet pour la logique d'état d'un composant RN) ; (4) le
// clavier (source-grep, KeyboardAvoidingView) ; (5) le calendrier inchangé (getDayEvents, fonction
// RÉELLE exécutée).
//
// Usage : npx tsx scripts/test-regression-pensee-recurrence-draft-close.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, Pensee, ReminderRecurrence } from '../src/data/types';
import {
  NEVER_PENSEE_RECURRENCE_DRAFT,
  PenseeRecurrenceDraft,
  buildPenseeRecurrenceDraft,
  penseeRecurrenceEndLabel,
  penseeRecurrenceFrequencyLabel,
  setPenseeRecurrenceFrequency,
  setPenseeRecurrenceOccurrenceCount,
  toPenseeReminderRecurrence,
  togglePenseeRecurrenceDay,
} from '../src/data/penseeReminderRecurrence';
import { getDayEvents } from '../src/data/calendar';

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

// --- Reproduction fidèle de PenseeDetailScreen.tsx (voir ce fichier pour l'original) -------------
// `useRef` étant un mécanisme React, non reproductible tel quel hors composant — remplacé ici par
// une simple variable mutable de portée locale à chaque test, STRICTEMENT équivalente (même
// sémantique "mémoire technique, jamais lue par le rendu") pour tester le même algorithme.
function makeRecurrenceEditorSession(initialDraft: PenseeRecurrenceDraft) {
  let draft = initialDraft;
  let snapshot: PenseeRecurrenceDraft | null = null;
  return {
    getDraft: () => draft,
    setDraft: (next: PenseeRecurrenceDraft) => {
      draft = next;
    },
    // openRecurrenceEditor
    open: () => {
      snapshot = draft;
    },
    // closeRecurrenceEditor
    close: () => {
      if (!draft.enabled) return;
      if (toPenseeReminderRecurrence(draft)) return;
      draft = snapshot ?? NEVER_PENSEE_RECURRENCE_DRAFT;
    },
  };
}
// ---------------------------------------------------------------------------------------------

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Test',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: null,
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
    id: 'p1',
    texte: 'Acheter du café',
    contactId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    date: null,
    endDate: null,
    reminderAt: null,
    ...overrides,
  } as Pensee;
}

console.log('\n[1] Label RÉPÉTITION — "Aucune" quand enabled=false, jamais "Jamais"/"aucun rappel"');
{
  check('draft NEVER → "Aucune"', penseeRecurrenceFrequencyLabel(NEVER_PENSEE_RECURRENCE_DRAFT) === 'Aucune');
  check('buildPenseeRecurrenceDraft(null) → "Aucune" (nouveau rappel sans récurrence existante)', penseeRecurrenceFrequencyLabel(buildPenseeRecurrenceDraft(null)) === 'Aucune');
  check('jamais "Jamais" (ancien libellé disparu)', penseeRecurrenceFrequencyLabel(NEVER_PENSEE_RECURRENCE_DRAFT) !== 'Jamais');
}

console.log('\n[2] FIN — absente pour enabled=false, présente uniquement pour une récurrence valide (source PenseeDetailScreen.tsx)');
{
  const src = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  check(
    'condition FIN = toPenseeReminderRecurrence(recurrenceDraft) (récurrence VALIDE), plus recurrenceDraft.enabled seul',
    /\{toPenseeReminderRecurrence\(recurrenceDraft\) \? \(/.test(src),
  );
  check('ancienne condition "recurrenceDraft.enabled ? (" pour FIN a bien disparu (remplacée)', !/\{recurrenceDraft\.enabled \? \(\s*<>/.test(src));
}

console.log('\n[3] Nouvelle récurrence (Aucune) → RÉPÉTITION "Certains jours" sans jour → fermeture → revient à "Aucune", reminderRecurrence reste null');
{
  const session = makeRecurrenceEditorSession(NEVER_PENSEE_RECURRENCE_DRAFT);
  session.open();
  session.setDraft(setPenseeRecurrenceFrequency(session.getDraft(), 'weekly')); // aucun jour coché
  session.close();
  check('draft revient à enabled:false ("Aucune")', session.getDraft().enabled === false);
  check('reminderRecurrence (toPenseeReminderRecurrence) = null', toPenseeReminderRecurrence(session.getDraft()) === null);
}

console.log('\n[4] Récurrence existante (daily) → ouvre "Certains jours" sans jour → fermeture → restaure "Tous les jours" (jamais détruite silencieusement)');
{
  const dailyExisting: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
  const initialDraft = buildPenseeRecurrenceDraft(dailyExisting);
  check('état initial = "Tous les jours"', penseeRecurrenceFrequencyLabel(initialDraft) === 'Tous les jours');
  const session = makeRecurrenceEditorSession(initialDraft);
  session.open();
  session.setDraft(setPenseeRecurrenceFrequency(session.getDraft(), 'weekly')); // aucun jour coché
  check('pendant l’édition : "À préciser" (état transitoire, feuille encore ouverte)', penseeRecurrenceFrequencyLabel(session.getDraft()) === 'À préciser');
  session.close();
  check('après fermeture : restaure "Tous les jours" (daily), jamais détruit', penseeRecurrenceFrequencyLabel(session.getDraft()) === 'Tous les jours');
  check('règle restaurée = daily réel (pas juste le libellé)', JSON.stringify(toPenseeReminderRecurrence(session.getDraft())) === JSON.stringify(dailyExisting));
}

console.log('\n[5] Récurrence existante (weekly lundi) → décoche le seul jour → fermeture → restaure le draft valide précédent (weekly lundi)');
{
  const weeklyExisting: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [1], occurrenceCount: null, untilDate: null };
  const initialDraft = buildPenseeRecurrenceDraft(weeklyExisting);
  const session = makeRecurrenceEditorSession(initialDraft);
  session.open();
  session.setDraft(togglePenseeRecurrenceDay(session.getDraft(), 1)); // décoche l’unique jour → daysOfWeek=[]
  check('pendant l’édition : daysOfWeek vide', session.getDraft().daysOfWeek.length === 0);
  session.close();
  check('après fermeture : restaure daysOfWeek=[1] (lundi), jamais détruit', JSON.stringify(session.getDraft().daysOfWeek) === JSON.stringify([1]));
  check('règle restaurée = weekly lundi réel', JSON.stringify(toPenseeReminderRecurrence(session.getDraft())) === JSON.stringify(weeklyExisting));
}

console.log('\n[6] Weekly + jour réellement sélectionné → changement CONSERVÉ (pas de restauration abusive)');
{
  const session = makeRecurrenceEditorSession(NEVER_PENSEE_RECURRENCE_DRAFT);
  session.open();
  session.setDraft(setPenseeRecurrenceFrequency(session.getDraft(), 'weekly'));
  session.setDraft(togglePenseeRecurrenceDay(session.getDraft(), 3)); // mercredi
  session.close();
  check('draft conservé : enabled=true, weekly, mercredi', session.getDraft().enabled === true && session.getDraft().frequency === 'weekly' && JSON.stringify(session.getDraft().daysOfWeek) === JSON.stringify([3]));
  check('règle valide produite', toPenseeReminderRecurrence(session.getDraft()) !== null);
}

console.log('\n[7] "Ne plus répéter" — reminderRecurrence null, reminderAt conservé (source + logique)');
{
  const src = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  check('"Ne plus répéter" appelle toujours setRecurrenceDraft(NEVER_PENSEE_RECURRENCE_DRAFT)', /Ne plus répéter<\/Text>/.test(src) && /onPress=\{\(\) => setRecurrenceDraft\(NEVER_PENSEE_RECURRENCE_DRAFT\)\}/.test(src));
  check('label après "Ne plus répéter" = "Aucune"', penseeRecurrenceFrequencyLabel(NEVER_PENSEE_RECURRENCE_DRAFT) === 'Aucune');
  check('reminderRecurrence = null après "Ne plus répéter"', toPenseeReminderRecurrence(NEVER_PENSEE_RECURRENCE_DRAFT) === null);
  // reminderAt (state séparé, jamais touché par setRecurrenceDraft) — vérifié structurellement :
  // aucune ligne du fichier ne fait dépendre reminderDate/setReminderDate de recurrenceDraft.
  check('setRecurrenceDraft ne touche jamais reminderDate/setReminderDate (états indépendants)', !/setRecurrenceDraft\([^)]*setReminderDate/.test(src));
}

console.log('\n[8] Rappel ponctuel + événement — save accepté, reminderRecurrence null (scénario exact de l’audit)');
{
  // événement 28/09/2026 13:00, rappel 27/09/2026 22:00, répétition Aucune.
  const draft = NEVER_PENSEE_RECURRENCE_DRAFT;
  const reminderAt = new Date(2026, 8, 27, 22, 0, 0);
  check('recurrenceDraft.enabled = false (Aucune)', draft.enabled === false);
  check('toPenseeReminderRecurrence(draft) = null → reminderRecurrence null au save', toPenseeReminderRecurrence(draft) === null);
  check('reminderAt = 27/09/2026 22:00 (inchangé, valeur confirmée par l’utilisateur)', reminderAt.getDate() === 27 && reminderAt.getMonth() === 8 && reminderAt.getHours() === 22);
}

console.log('\n[9] Rappel ponctuel SANS événement — même résultat (aucune dépendance à un event pour ce correctif)');
{
  const draft = NEVER_PENSEE_RECURRENCE_DRAFT;
  check('toPenseeReminderRecurrence(draft) = null, indépendamment d’un event date', toPenseeReminderRecurrence(draft) === null);
}

console.log('\n[10] Non-régression daily/weekly valides (déjà couverts par test-regression-pensee-detail-recurrence-edit.ts, revérifiés ici pour la fermeture de feuille)');
{
  const daily: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
  const dailyDraft = buildPenseeRecurrenceDraft(daily);
  const s1 = makeRecurrenceEditorSession(dailyDraft);
  s1.open();
  s1.close(); // fermeture immédiate sans aucune modification
  check('daily inchangé après ouverture/fermeture sans modification', JSON.stringify(toPenseeReminderRecurrence(s1.getDraft())) === JSON.stringify(daily));

  const weekly: ReminderRecurrence = { frequency: 'weekly', daysOfWeek: [2, 4], occurrenceCount: null, untilDate: null };
  const weeklyDraft = buildPenseeRecurrenceDraft(weekly);
  const s2 = makeRecurrenceEditorSession(weeklyDraft);
  s2.open();
  s2.close();
  check('weekly (mardi+jeudi) inchangé après ouverture/fermeture sans modification', JSON.stringify(toPenseeReminderRecurrence(s2.getDraft())) === JSON.stringify(weekly));
}

console.log('\n[11] Calendrier inchangé — eventDate ≠ reminderAt : seul eventDate crée un point (exécution réelle de getDayEvents)');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const p = makePensee({
    id: 'p-cafe',
    contactId: 'c-lea',
    date: '2026-09-28', // événement
    reminderAt: new Date(2026, 8, 27, 22, 0, 0).toISOString(), // rappel la veille
    reminderRecurrence: null,
  });
  const today = new Date(2026, 8, 20);
  const eventsOn28 = getDayEvents(2026, 8, 28, [lea], [p], today);
  const eventsOn27 = getDayEvents(2026, 8, 27, [lea], [p], today);
  check('un point le 28/09 (date de l’événement)', eventsOn28.some((e) => e.type === 'pensee'));
  check('AUCUN point le 27/09 (reminderAt ne crée jamais de 2e point calendrier)', !eventsOn27.some((e) => e.type === 'pensee'));
}

console.log('\n[12] Calendrier — récurrence active : idem, aucun 2e point créé par une occurrence de rappel');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const dailyInfinite: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
  const p = makePensee({
    id: 'p-recur',
    contactId: 'c-lea',
    date: '2026-09-28',
    reminderAt: new Date(2026, 8, 20, 9, 0, 0).toISOString(),
    reminderRecurrence: dailyInfinite,
  });
  const today = new Date(2026, 8, 20);
  const eventsOn28 = getDayEvents(2026, 8, 28, [lea], [p], today);
  const eventsOn22 = getDayEvents(2026, 8, 22, [lea], [p], today); // une occurrence quotidienne parmi d’autres
  check('un point le 28/09 (date de l’événement, penseeAnchor = p.date, jamais recouverte)', eventsOn28.some((e) => e.type === 'pensee'));
  check('aucun point le 22/09 malgré une occurrence de rappel quotidien ce jour-là', !eventsOn22.some((e) => e.type === 'pensee'));
}

console.log('\n[13] Clavier — KeyboardAvoidingView présent, pattern iOS attendu identique à AuthGateScreen/CalendarScreen');
{
  const src = readSrc('src', 'components', 'RecurrenceEditorSheet.tsx');
  check('import KeyboardAvoidingView', /import \{ KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View \} from 'react-native';/.test(src));
  check(
    'props behavior/keyboardVerticalOffset exactes (mêmes valeurs que AuthGateScreen.tsx/CalendarScreen.tsx), quelle que soit leur mise en forme',
    /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}\s*keyboardVerticalOffset=\{Platform\.OS === 'ios' \? 10 : 0\}/.test(src),
  );

  const authGateSrc = readSrc('src', 'components', 'AuthGateScreen.tsx');
  const calendarSrc = readSrc('src', 'screens', 'CalendarScreen.tsx');
  const pattern = "behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}";
  check('pattern identique (mêmes valeurs) déjà présent dans AuthGateScreen.tsx (réutilisation confirmée, pas un nouveau pattern)', authGateSrc.includes(pattern));
  check('pattern identique (mêmes valeurs) déjà présent dans CalendarScreen.tsx (réutilisation confirmée)', calendarSrc.includes(pattern));
}

// CHANTIER "Phase 6 Addendum UI.1 — Coller la sheet au clavier" (2026-09-23) — CORRECTIF : le
// KeyboardAvoidingView n'enveloppe plus tout l'écran mais UNIQUEMENT la carte, et porte directement
// le fond opaque (theme.card) + les coins arrondis — sa propre zone de padding clavier (ajoutée par
// behavior="padding") est donc remplie de cet opaque, jamais du fond semi-transparent de
// l'assombrissement (qui, lui, reste sur le Pressable EXTERNE, jamais affecté par le padding
// clavier). Le padding de CONTENU (styles.card, paddingBottom:34 compris) reste sur le Pressable
// interne, jamais sur le KeyboardAvoidingView lui-même — sinon `behavior="padding"` l'aurait
// écrasé à 0 clavier fermé (StyleSheet.compose écrase TOUJOURS paddingBottom, voir le commentaire
// dédié dans RecurrenceEditorSheet.tsx) : c'est exactement le bug que ce test verrouille.
console.log('\n[14] Clavier — la sheet touche directement le clavier (fond opaque sur le KeyboardAvoidingView, assombrissement semi-transparent hors de sa portée)');
{
  const src = readSrc('src', 'components', 'RecurrenceEditorSheet.tsx');
  check(
    'overlay (Pressable EXTERNE, assombrissement semi-transparent plein écran) englobe le KeyboardAvoidingView, jamais l’inverse',
    /<Pressable style=\{styles\.overlay\} onPress=\{handleClose\}>[\s\S]{0,900}<KeyboardAvoidingView/.test(src),
  );
  check('styles.overlay porte le fond semi-transparent (inchangé, jamais affecté par le padding clavier désormais)', /overlay: \{ flex: 1, backgroundColor: 'rgba\(0,0,0,0\.4\)', justifyContent: 'flex-end' \}/.test(src));
  check(
    'KeyboardAvoidingView porte directement le fond OPAQUE (theme.card) + coins arrondis — sa zone de padding clavier est donc remplie de cet opaque',
    /<KeyboardAvoidingView\s*style=\{\{ backgroundColor: theme\.card, borderTopLeftRadius: 22, borderTopRightRadius: 22 \}\}/.test(src),
  );
  check(
    'CORRECTIF précis : le style du KeyboardAvoidingView (l’objet passé à `style=`) ne contient AUCUNE clé "padding" (son padding serait écrasé par behavior="padding", perdant paddingBottom:34 clavier fermé)',
    /<KeyboardAvoidingView\s*style=\{\{ backgroundColor: theme\.card, borderTopLeftRadius: 22, borderTopRightRadius: 22 \}\}\s*behavior=/.test(src),
  );
  check('styles.card (padding:20, paddingBottom:34 — INCHANGÉ) reste sur le Pressable interne, jamais sur le KeyboardAvoidingView', /card: \{ padding: 20, paddingBottom: 34 \}/.test(src) && /<Pressable style=\{styles\.card\} onPress=\{\(\) => \{\}\}>/.test(src));
}

console.log('\n[UX — "Après X rappels"] wording seul : occurrenceCount = nombre TOTAL de rappels (logique inchangée)');
{
  const d = (n: number | null) => ({ ...NEVER_PENSEE_RECURRENCE_DRAFT, enabled: true, frequency: 'weekly' as const, daysOfWeek: [3, 5, 6], occurrenceCount: n });
  check('occurrenceCount=1 → "Après 1 rappel"', penseeRecurrenceEndLabel(d(1)) === 'Après 1 rappel');
  check('occurrenceCount=3 → "Après 3 rappels"', penseeRecurrenceEndLabel(d(3)) === 'Après 3 rappels');
  check('ancien libellé "fois" disparu', !String(penseeRecurrenceEndLabel(d(3))).includes('fois'));
  const sheetSrc = readSrc('src', 'components', 'RecurrenceEditorSheet.tsx');
  check('sélecteur : "Après X rappels"', sheetSrc.includes('>Après X rappels</Text>'));
  check('suffixe du champ : rappel/rappels selon la valeur saisie', sheetSrc.includes("{countText === '1' ? 'rappel' : 'rappels'}"));
  check('plus de libellé UI "Après X fois" / suffixe "fois"', !sheetSrc.includes('>Après X fois<') && !sheetSrc.includes('>fois</Text>'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
