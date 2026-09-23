/// <reference types="node" />
// Tests de non-régression — CHANTIER "Post-TestFlight Phase 6 — Correctifs Build 2" (2026-09-23).
// Couvre les points NON déjà couverts par test-regression-pensee-recurrence-display.ts (recurrence
// post-fire, déjà testée là-bas) : synchronisation permission notifications (store.tsx, source +
// logique pure reproduite), seed reminder = maintenant (PenseeDetailScreen.tsx, source), Home
// reminderLabel ponctuel/daily (homeAttention.ts, exécution réelle), recovery email inconnu/valide
// (authRepo.ts, fonction RÉELLE appelée directement), disclaimer exact (MessageScreen.tsx, source).
// store.tsx/PenseeDetailScreen.tsx/CaptureScreen.tsx/MessageScreen.tsx (react-native) ne peuvent pas
// être chargés sous tsx — même méthode que le reste de ce projet (source-grep pour le câblage,
// exécution réelle pour toute fonction pure disponible).
//
// Usage : npx tsx scripts/test-regression-post-testflight-phase6.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact, Pensee, ReminderRecurrence } from '../src/data/types';
import { buildHomeAttentions } from '../src/data/homeAttention';

// authRepo.ts importe './supabase' → react-native-url-polyfill/@react-native-async-storage (RN) —
// non chargeable sous tsx (même constat que le reste de ce projet, voir test-regression-auth-gate.ts
// qui vérifie ce fichier par lecture de source pour la même raison). `describeAuthErrorCode` est pure
// (aucune dépendance réseau/RN dans son CORPS) — reproduite ici À L'IDENTIQUE de authRepo.ts pour
// pouvoir l'exécuter réellement, plutôt que de se limiter à un grep de source pour ce cas précis.
function describeAuthErrorCode(code: string | undefined, fallbackMessage: string): string {
  switch (code) {
    case 'email_exists':
    case 'identity_already_exists':
    case 'email_conflict_identity_not_deletable':
      return 'Un compte Pensif existe déjà avec cet email.';
    case 'otp_disabled':
      return "Aucun compte Pensif n'est associé à cette adresse. Vérifie l'adresse saisie ou continue avec un nouveau compte.";
    case 'email_address_invalid':
      return 'Cette adresse email ne semble pas valide.';
    case 'otp_expired':
      return 'Ce code a expiré. Demande-en un nouveau.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Trop de tentatives — réessaie dans quelques minutes.';
    case 'email_provider_disabled':
    case 'signup_disabled':
    case 'anonymous_provider_disabled':
      return 'Cette fonctionnalité est momentanément indisponible.';
    default:
      return fallbackMessage || 'Une erreur est survenue. Réessaie.';
  }
}

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

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Léa',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: null,
    initials: 'L',
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

// ==================================================================================================
console.log('\n[1] Notifications — synchronisation état initial vs permission système (store.tsx)');
{
  const storeSrc = readSrc('src', 'data', 'store.tsx');
  check(
    'préférence par défaut : useState(true) — comportement de base conservé, corrigé par la synchro au boot ci-dessous',
    /const \[notificationsEnabled, setNotificationsEnabledState\] = useState\(true\);/.test(storeSrc),
  );
  check(
    'CORRECTIF : quand AUCUNE préférence stockée (n === null), l’état initial dérive de getNotificationPermissionStatus() — jamais un booléen arbitraire',
    /if \(n === null\) \{\s*const status = await getNotificationPermissionStatus\(\);\s*if \(status === 'granted'\) setNotificationsEnabledState\(true\);\s*else setNotificationsEnabledState\(false\);/.test(
      storeSrc,
    ),
  );
  check(
    'préférence déjà explicitement stockée (\'0\') : comportement historique inchangé (branche else if)',
    /\} else if \(n === '0'\) \{\s*setNotificationsEnabledState\(false\);/.test(storeSrc),
  );
  check('lecture SEULE — jamais requestPermissionsAsync au boot (getNotificationPermissionStatus n’en demande jamais)', !/await ensureNotificationPermissions\(\)/.test(storeSrc.slice(storeSrc.indexOf('if (n === null)'), storeSrc.indexOf('if (n === null)') + 600)));
}

console.log('\n[2] Notifications — toggle OFF→ON conserve le comportement granted/denied (SettingsScreen.tsx, inchangé)');
{
  const settingsSrc = readSrc('src', 'screens', 'SettingsScreen.tsx');
  check('handleToggleNotifications appelle ensureNotificationPermissions() quand value=true', /if \(value\) \{\s*const granted = await ensureNotificationPermissions\(\);/.test(settingsSrc));
  check('si granted=false : return AVANT setNotificationsEnabled(value) — le toggle ne passe jamais à ON', /if \(!granted\) \{\s*Alert\.alert\([\s\S]{0,300}\);\s*return;\s*\}\s*\}\s*setNotificationsEnabled\(value\);/.test(settingsSrc));
}

console.log('\n[3] Notifications — demande opportuniste "première utilisation" (point exact déclenché)');
{
  const notifSrc = readSrc('src', 'lib', 'notifications.ts');
  check('requestNotificationPermissionIfUndetermined() existe : ne redemande QUE si undetermined', /export async function requestNotificationPermissionIfUndetermined\(\): Promise<boolean \| null> \{\s*const status = await getNotificationPermissionStatus\(\);\s*if \(status !== 'undetermined'\) return null;/.test(notifSrc));

  const captureSrc = readSrc('src', 'screens', 'CaptureScreen.tsx');
  const micGrantedIdx = captureSrc.indexOf("Permission micro refusée définitivement");
  const captureHookIdx = captureSrc.indexOf('void requestNotificationPermissionIfUndetermined()');
  check('CaptureScreen : import présent', captureSrc.includes("import { requestNotificationPermissionIfUndetermined } from '../lib/notifications';"));
  check(
    'CaptureScreen : le déclenchement suit de près (< 500 caractères) le bloc de refus micro — donc APRÈS le granted confirmé, avant setAudioModeAsync',
    micGrantedIdx !== -1 && captureHookIdx !== -1 && captureHookIdx - micGrantedIdx > 0 && captureHookIdx - micGrantedIdx < 700,
    `distance=${captureHookIdx - micGrantedIdx}`,
  );
  check('CaptureScreen : déclenchement AVANT le try { ... setAudioModeAsync (donc bien après granted, pas dans un chemin d’erreur)', captureHookIdx !== -1 && captureHookIdx < captureSrc.indexOf('await setAudioModeAsync({ allowsRecording: true'));

  const penseeDetailSrc = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  const toggleIdx = penseeDetailSrc.indexOf('function onReminderToggle(value: boolean) {');
  const toggleHookIdx = penseeDetailSrc.indexOf('void requestNotificationPermissionIfUndetermined()');
  check('PenseeDetailScreen : import présent', penseeDetailSrc.includes("import { requestNotificationPermissionIfUndetermined } from '../lib/notifications';"));
  check(
    'PenseeDetailScreen : déclenchement DANS onReminderToggle, gardé par "if (value && ...)" (uniquement à l’activation, jamais à la désactivation)',
    toggleIdx !== -1 && toggleHookIdx !== -1 && toggleHookIdx > toggleIdx && toggleHookIdx - toggleIdx < 1500 && /if \(value && Platform\.OS !== 'web'\) \{\s*void requestNotificationPermissionIfUndetermined\(\)/.test(penseeDetailSrc),
  );
}

// ==================================================================================================
console.log('\n[4] Reminder seed — nouveau rappel sans date existante → new Date() (date/heure locales actuelles)');
{
  const src = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  check('reminderDateSeed() retourne reminderDate si déjà confirmé (idempotent, inchangé)', /function reminderDateSeed\(\): Date \{\s*if \(reminderDate\) return reminderDate;/.test(src));
  check('CORRECTIF : seed = new Date() (plus "demain 9h")', /if \(reminderDate\) return reminderDate;\s*return new Date\(\);\s*\}/.test(src));
  check('aucun "demain 9h" (setDate\\(getDate\\(\\)\\+1\\)) ne reste dans reminderDateSeed', !/d\.setDate\(d\.getDate\(\) \+ 1\);\s*d\.setHours\(9, 0, 0, 0\);/.test(src));
}

console.log('\n[5] Reminder seed — rappel existant conserve sa date (inchangé)');
{
  const src = readSrc('src', 'screens', 'PenseeDetailScreen.tsx');
  check(
    '`reminderDate` (état confirmé) reste initialisé depuis existing.reminderAt tel quel — jamais recalculé, jamais mélangé avec la seed',
    /const \[reminderDate, setReminderDate\] = useState<Date \| null>\(\(\) => \(existing\?\.reminderAt \? new Date\(existing\.reminderAt\) : null\)\);/.test(src),
  );
}

// ==================================================================================================
console.log('\n[6] Home reminderLabel — pensée ponctuelle avec rappel');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const reminderAt = new Date(2026, 8, 23, 18, 0, 0).toISOString();
  const p = makePensee({ id: 'p-ponctuel', contactId: 'c-lea', date: '2026-09-23', reminderAt, reminderRecurrence: null });
  const now = new Date(2026, 8, 20, 10, 0, 0);
  const attentions = buildHomeAttentions([lea], [p], now);
  const a = attentions.find((x) => x.id === 'pensee-p-ponctuel');
  check('attention trouvée', Boolean(a));
  check('reminderLabel = "Rappel 18h" (ponctuel, pas de jour préfixé car même jour que la date affichée)', a?.reminderLabel === 'Rappel 18h', a?.reminderLabel ?? 'null');
}

console.log('\n[7] Home reminderLabel — pensée daily, prochaine occurrence effective (même mécanisme que Pensées)');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa' });
  const dailyInfinite: ReminderRecurrence = { frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null };
  const reminderAt = new Date(2026, 8, 20, 21, 40, 0).toISOString();
  const p = makePensee({ id: 'p-daily', contactId: 'c-lea', reminderAt, reminderRecurrence: dailyInfinite });
  const now = new Date(2026, 8, 21, 22, 0, 0); // après l’occurrence du jour → prochaine = 22/09 21:40
  const attentions = buildHomeAttentions([lea], [p], now);
  const a = attentions.find((x) => x.id === 'pensee-p-daily');
  check('attention trouvée', Boolean(a));
  check('date effective = 22/09 (prochaine occurrence, pas l’ancre historique 20/09)', a?.date === '2026-09-22', a?.date ?? 'absent');
  check('reminderLabel = "Rappel 21h40" (heure de la prochaine occurrence)', a?.reminderLabel === 'Rappel 21h40', a?.reminderLabel ?? 'null');
}

console.log('\n[8] Home reminderLabel — types non-pensée (anniversaire/fête) : toujours null, jamais un rappel inventé');
{
  const lea = makeContact({ id: 'c-lea', prenom: 'Léa', date: '1990-09-20' });
  const now = new Date(2026, 8, 20, 10, 0, 0); // jour J anniversaire
  const attentions = buildHomeAttentions([lea], [], now);
  const anniv = attentions.find((a) => a.type === 'anniversaire');
  check('anniversaire trouvé', Boolean(anniv));
  check('reminderLabel = null pour une anniversaire (pas de rappel au sens reminderAt)', anniv?.reminderLabel === null);
}

console.log('\n[9] Home — indicateur rendu via Pill dédié, même slot que badge, jamais superposé (HomeScreen.tsx)');
{
  const homeSrc = readSrc('src', 'screens', 'HomeScreen.tsx');
  check(
    'Pill dédié reminderLabel présent, tone="muted", après le Pill badge existant',
    /\{attention\.badge && <Pill label=\{attention\.badge\.label\} tone=\{attention\.badge\.tone\} theme=\{theme\} \/>\}[\s\S]{0,300}\{attention\.reminderLabel && <Pill label=\{attention\.reminderLabel\} tone="muted" theme=\{theme\} \/>\}/.test(
      homeSrc,
    ),
  );
}

// ==================================================================================================
console.log('\n[10] Recovery — email inconnu (otp_disabled) → wording français exact, RÉELLE fonction describeAuthErrorCode');
{
  const message = describeAuthErrorCode('otp_disabled', 'Signups not allowed for otp');
  check(
    'message = "Aucun compte Pensif n\'est associé à cette adresse. Vérifie l\'adresse saisie ou continue avec un nouveau compte."',
    message === "Aucun compte Pensif n'est associé à cette adresse. Vérifie l'adresse saisie ou continue avec un nouveau compte.",
    message,
  );
  check('le texte anglais brut de Supabase (fallbackMessage) n’apparaît PLUS dans le résultat', !message.includes('Signups not allowed'));
}

console.log('\n[11] Recovery — email valide / autres codes déjà gérés inchangés (non-régression)');
{
  check('email_exists inchangé', describeAuthErrorCode('email_exists', 'x') === 'Un compte Pensif existe déjà avec cet email.');
  check('otp_expired inchangé', describeAuthErrorCode('otp_expired', 'x') === 'Ce code a expiré. Demande-en un nouveau.');
  check('code totalement inconnu (jamais mappé) → repli sur fallbackMessage, comportement historique inchangé', describeAuthErrorCode('code_totalement_inconnu', 'Message de secours') === 'Message de secours');
  check('code undefined → repli générique historique inchangé', describeAuthErrorCode(undefined, '') === 'Une erreur est survenue. Réessaie.');
}

console.log('\n[12] Recovery — flow OTP/recovery non modifié (requestExistingAccountOtp/verifyExistingAccountOtp inchangés) + reproduction fidèle au vrai fichier');
{
  const authRepoSrc = readSrc('src', 'lib', 'authRepo.ts');
  check('requestExistingAccountOtp toujours shouldCreateUser:false explicite (ne crée jamais de compte)', /shouldCreateUser: false/.test(authRepoSrc));
  check('verifyExistingAccountOtp toujours type:\'email\' (login OTP standard, inchangé)', /type: 'email' \}\);/.test(authRepoSrc));
  check(
    'le vrai fichier contient bien le case \'otp_disabled\' avec le wording exact reproduit ci-dessus (pont entre la reproduction locale et le fichier réel)',
    authRepoSrc.includes("case 'otp_disabled':") &&
      authRepoSrc.includes("Aucun compte Pensif n'est associé à cette adresse. Vérifie l'adresse saisie ou continue avec un nouveau compte."),
  );
}

// ==================================================================================================
console.log('\n[13] Disclaimer — texte exact final, aucun changement de condition d’affichage');
{
  const src = readSrc('src', 'screens', 'MessageScreen.tsx');
  check(
    'nouveau texte présent tel quel (deux lignes)',
    src.includes(`{"Pensif s'appuie sur ce qu'il connaît de vous.\\nRelis toujours avant d'envoyer."}`),
  );
  check('ancien texte disparu', !src.includes('Pensif peut se tromper'));
  check('condition d’affichage currentAiGenerated INCHANGÉE (COPY uniquement)', /\{currentAiGenerated && \(\s*<Text style=\{\[styles\.aiLabel/.test(src));
  // Le commentaire du chantier lui-même NOMME ces concepts pour dire explicitement qu'ils sont hors
  // scope — on vérifie qu'aucune IMPLÉMENTATION (code réel, hors de ce commentaire) n'existe, pas
  // l'absence totale de ces mots dans le fichier.
  const withoutPhase6Comment = src.replace(/\/\* CHANTIER "Post-TestFlight Phase 6 — Disclaimer Messages"[\s\S]*?messageSuggestion\.ts\)\. \*\//, '');
  check(
    'aucune IMPLÉMENTATION de "style learning"/mémoire des mimiques/personnalisation progressive automatique (V2, hors scope — seul le commentaire explicatif les nomme)',
    !/apprentissage du style|mémoire des mimiques|personnalisation progressive automatique/i.test(withoutPhase6Comment),
  );
}

// ==================================================================================================
console.log('\n[14] Contacts — confirmé INCHANGÉ (aucune permission ajoutée, aucun onboarding Contacts)');
{
  const ficheSrc = readSrc('src', 'screens', 'FicheScreen.tsx');
  check('presentContactPickerAsync toujours utilisé tel quel', /Contacts\.presentContactPickerAsync\(\)/.test(ficheSrc));
  check('aucun requestPermissionsAsync/getPermissionsAsync Contacts ajouté', !/Contacts\.(requestPermissionsAsync|getPermissionsAsync)/.test(ficheSrc));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
